# Project Plan — Corpus RAG (Playable Factory AI SE Case)

Working document. It states what we are building, the decisions we have made and why, and
the order we will build it in. It is written for two readers: us while building, and the
reviewer who will ask "why did you do it this way" during the walkthrough.

Status: **M0–M6 complete.** Last updated: 2026-08-30. See `README.md` to run it, `docs/eval-results.md` for measured retrieval quality, and `AI_USAGE.md` for how it was built.

---

## 1. Goal

A small full-stack TypeScript application that indexes an internal document corpus into a
vector store and answers natural-language questions about it with **grounded, cited**
answers — and says "I don't know" when the corpus does not cover the question.

Three surfaces over one retrieval core:

| Surface        | Who                  | What it does                                                                       |
| -------------- | -------------------- | ---------------------------------------------------------------------------------- |
| **Chat page**  | any signed-in user   | ask a question, see retrieved passages and a grounded answer with citations        |
| **Dashboard**  | admin only           | indexed documents, ingestion runs and their status, index health, search analytics |
| **MCP server** | external MCP clients | the same search exposed as a callable tool                                         |

The corpus is Playable Factory's internal production knowledge: client briefs, production
sync notes, delivery reports, postmortems, SDK/network/build specs, and process guides.
142 markdown files, ~114 KB total.

## 2. What "done" means

The case is graded on five equally weighted axes. We build against them directly:

| Axis                          | What we must be able to show                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Retrieval and RAG quality** | Correct docs retrieved for the sample questions; answers cite them; honest refusal on out-of-corpus questions; a measurable eval, not a vibe                          |
| **Monorepo and architecture** | Clear workspace boundaries; types genuinely shared across the frontend/backend line; the retrieval core reused by the API _and_ the MCP server rather than duplicated |
| **Code quality**              | Consistent formatting, real error handling, reusable components, typed API contracts                                                                                  |
| **Security**                  | Sign-in enforced; role checks on pages, actions, and APIs; the dashboard and ingestion genuinely closed to regular users                                              |
| **Communication**             | README that works on a fresh machine, honest `AI_USAGE.md`, clean commit history                                                                                      |

Our own bar on top of that: `git clone`, `npm install`, one env var, then
`npm run seed && npm run ingest && npm run dev` — and it works, with no Docker and no
second API key.

## 3. Scope

**In scope (must-have):** monorepo; repeatable observable ingestion; hybrid semantic
search; grounded RAG answers with citations; chat page; admin dashboard; MCP search
server; auth and role-based authorization; README; AI usage log.

**Bonus we intend to do**, ranked by value earned per hour:

1. **Hybrid retrieval** — vector + BM25 keyword, fused. Near-free given our storage choice, and it lifts the most heavily weighted axis.
2. **Incremental / self-updating ingestion** — content-hash based, so new, changed, and deleted documents are detected and only the delta is re-embedded. Called out in the case as a significant bonus.
3. **Retrieval eval** — the five sample questions plus out-of-corpus probes, scored (hit@k / MRR) and reported, so retrieval claims are backed by a number.
4. **Streaming answers** and citation highlighting in the chat UI.
5. **Admin user management** — list users, change roles.

**Explicitly out of scope** — say so in the README rather than half-build it:

- MCP authentication via OIDC. It is the largest bonus but needs an identity provider; we
  ship a documented bearer-token guard on the MCP server instead and write up how OIDC
  would slot in. Revisit only if M0–M6 land early.
- Live deployment. Deployment notes in the README instead.
- Multi-tenancy, document upload UI, OCR/PDF ingestion.

**Timebox:** about two days. A focused system that works end-to-end beats an ambitious one
that does not.

## 4. Architecture

```
playablefactory_ai_case/
├─ apps/
│  ├─ web/           Next.js 15 (App Router) + Tailwind — chat, dashboard, login
│  ├─ api/           Fastify — auth, search, answer, documents, ingestion, analytics
│  └─ mcp/           MCP server — exposes search as a tool
├─ packages/
│  ├─ shared/        zod schemas and inferred TS types — the API contract, imported by all
│  └─ rag/           the retrieval core: load, chunk, embed, store, retrieve, answer
├─ corpus/           the provided dataset (142 .md files)
└─ docs/             sample_questions.md, design notes, eval results
```

Request flow:

```
                     ┌──────────────┐
   browser ────────► │  apps/web    │ ──HTTP + httpOnly cookie──┐
                     └──────────────┘                           │
                                                                ▼
                                                        ┌──────────────┐
   MCP client ──────────────┐                           │  apps/api    │
        (bearer token)      │                           └──────┬───────┘
                            ▼                                  │
                     ┌──────────────┐                          │
                     │  apps/mcp    │──────────┐               │
                     └──────────────┘          ▼               ▼
                                          ┌─────────────────────┐
                                          │   packages/rag      │
                                          └──────────┬──────────┘
                                                     ▼
                                          SQLite (sqlite-vec + FTS5)
```

`packages/rag` is the only place that knows about embeddings, chunking, or the vector
store. `apps/api` and `apps/mcp` are thin transports over it — that is what stops the MCP
server from becoming a second, drifting implementation of search.

## 5. Decisions and why

| Decision          | Choice                                                                                                                          | Why                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspaces        | npm workspaces                                                                                                                  | Node 24 / npm 12 already present; no extra tool for a reviewer to install                                                                                                                                                                                                                                                      |
| Vector store      | **SQLite + `sqlite-vec`** via `better-sqlite3`                                                                                  | Single file, no daemon, no Docker. `npm install` and it runs on a fresh machine, which is what the README criterion actually asks for. The corpus is 114 KB — a server-class vector DB would be scaffolding, not substance. `packages/rag` exposes a `VectorStore` interface so pgvector is a swappable adapter, not a rewrite |
| Keyword half      | SQLite **FTS5** in the same database                                                                                            | Hybrid retrieval for almost no extra code or infra; one transaction keeps both indexes consistent                                                                                                                                                                                                                              |
| Fusion            | Reciprocal Rank Fusion over the two ranked lists                                                                                | No score normalisation between cosine distance and BM25 to tune or justify                                                                                                                                                                                                                                                     |
| Embeddings        | **`bge-small-en-v1.5`**, 384-dim, local, via `@huggingface/transformers`                                                        | Zero cost, no API key, offline, re-index in seconds. Model downloads once (~35 MB) and caches. Keeps the reviewer's required setup down to a single Anthropic key                                                                                                                                                              |
| Answer generation | A `ChatModel` port in `packages/rag`, default adapter **`claude-opus-5`** via the Anthropic TypeScript SDK, streaming           | The one part that genuinely needs a hosted model. The port keeps the provider a configuration choice rather than a rewrite, so we can compare models on the same eval. Streaming so long answers do not hit request timeouts                                                                                                   |
| Chunking          | Markdown heading-aware sections, merged toward ~400 tokens with overlap, never crossing a document boundary                     | Documents here are 400–1000 bytes with `#`/`##` structure, so most become one or two chunks. Splitting mid-section would break citations more than it would help recall                                                                                                                                                        |
| Chunk metadata    | `title` from the H1, `docType` from the directory, `date` parsed from the filename, `path`                                      | Feeds citations, dashboard facets, and later filtered search. Derived from the corpus's own conventions rather than imposed on it                                                                                                                                                                                              |
| Auth              | Own JWT + argon2id in `apps/api`; access token in an httpOnly cookie, rotating refresh token; `role` claim of `user` or `admin` | Security is an equally weighted axis and this is the part we must defend line by line. One token model protects the web API and the MCP server                                                                                                                                                                                 |
| Authorization     | `requireAuth()` / `requireRole('admin')` enforced **server-side on every route**; hiding UI is cosmetic only                    | The case explicitly asks that the dashboard and management actions be protected from regular users, so the check lives at the API, not in the React tree                                                                                                                                                                       |
| Validation        | zod schemas in `packages/shared`, used for request parsing _and_ as the source of the TS types                                  | One definition, no drift between what the API validates and what the client believes                                                                                                                                                                                                                                           |

### Swappable providers

Two things are deliberately behind narrow interfaces in `packages/rag`, because both are
choices we may want to revisit and because being able to change one without touching the
other is the point of having a retrieval core at all:

```ts
interface Embedder {
  readonly id: string; // e.g. "bge-small-en-v1.5"
  readonly dimensions: number; // must match the vec0 column width
  embed(texts: string[]): Promise<Float32Array[]>;
}

interface ChatModel {
  readonly id: string; // e.g. "claude-opus-5"
  stream(req: AnswerRequest): AsyncIterable<AnswerEvent>;
}
```

Selected by environment variable (`LLM_PROVIDER` / `LLM_MODEL`, `EMBEDDER`), with the
Anthropic and local-embedding adapters shipped as the defaults. The rest of the system —
routes, MCP tool, UI, eval — talks only to the interface.

Two constraints this does _not_ paper over, and which the README will state plainly:

- **Changing the embedder invalidates the index.** Dimensions and vector space both
  change, so the `documents` table records which embedder built it and ingestion refuses
  to append to an index built by a different one. Switching embedders means a full
  re-index, which at this corpus size is seconds.
- **Changing the chat model does not invalidate anything**, which is exactly why it is
  worth making cheap: run the eval against two models and pick on evidence.

Two corpus-specific notes worth stating out loud, because the sample questions probe them:

- **Superseded documents.** `sdk-notes-v2.md` is deprecated by `sdk-notes-v3.md`, and both
  match a query about SDK initialization. We deliberately do _not_ filter the older one
  out — the documents state their own status, so we retrieve both and let the grounded
  answer reconcile them: v3 is current, and `lumen.track` was v2 and now fails silently.
  Silently dropping v2 would produce a confident answer with no way to explain the change.
- **Honest refusal.** Out-of-corpus questions (salaries, vacation policy) must return "the
  corpus does not cover this" with **no citations**. That is a retrieval-threshold problem
  plus a prompt contract, and it gets its own eval cases rather than one hopeful line in
  the system prompt.

## 6. Data model (SQLite)

```
documents       id, path, title, doc_type, doc_date, content_hash, status,
                chunk_count, indexed_at, error
chunks          id, document_id, ordinal, heading, text, token_count
vec_chunks      vec0 virtual table — chunk_id, embedding float[384]
chunks_fts      FTS5 virtual table — text, heading (the BM25 keyword half)
ingestion_runs  id, started_at, finished_at, status, added, updated, removed,
                failed, log
users           id, email, password_hash, role, created_at
search_logs     id, user_id, query, result_count, top_score, answered,
                latency_ms, created_at
```

`content_hash` is what makes ingestion incremental and re-runnable, `ingestion_runs` is
what makes it observable, and `search_logs` is what the dashboard's analytics are built
from.

## 7. Milestones

Each milestone ends in a working state and its own commit or commits.

- [x] **M0 — Foundation.** Repo, workspaces, TypeScript project references, ESLint + Prettier, `.gitignore`, `.env.example`, this document. _Done when:_ `npm run typecheck` passes across all workspaces. **Done** — typecheck, lint, and format all pass, and the two native risks below were retired before anything was built on them.

  Spikes run during M0, so the storage and embedding choices rest on evidence rather than
  expectation:

  | Checked                                                      | Result                                                             |
  | ------------------------------------------------------------ | ------------------------------------------------------------------ |
  | `better-sqlite3` + `sqlite-vec` install on Windows / Node 24 | Prebuilt binaries, 3 s, no compiler needed                         |
  | `vec0` KNN, FTS5 BM25, and both written in one transaction   | All work (sqlite 3.53.4, vec v0.1.9)                               |
  | `bge-small-en-v1.5` locally via transformers.js              | 384 dims, 26 ms for 3 texts; relevant pair 0.75 vs irrelevant 0.50 |

  Two findings carried forward: FTS5's default tokenizer keeps `LumenSDK` as one token, so
  a keyword search for `lumen` will not match it — the identifier-heavy corpus may need a
  tokenizer setting, to be tuned against the eval in M3. And npm 12 blocks install scripts
  by default, which stops `onnxruntime-node`'s postinstall; embeddings still work, but the
  README must say so.

- [x] **M1 — Auth spine.** SQLite schema and migrations, seed script with demo `user` and `admin`, argon2id hashing, login/logout/refresh, `requireAuth` and `requireRole`. _Done when:_ a regular user gets 403 from an admin route, proven by a test. **Done** — 10 tests, and confirmed over real HTTP.
- [x] **M2 — Ingestion.** Corpus loader, metadata extraction, heading-aware chunker, local embedder, writes to the vec and FTS indexes in one transaction, incremental by `content_hash`, `ingestion_runs` recorded. _Done when:_ `npm run ingest` indexes 142 documents and re-running it reports zero changes instead of re-embedding. **Done** — 142 documents, 436 chunks, chunk/vector/FTS counts all equal; a no-change re-run reports 142 unchanged in 0.0s.
- [x] **M3 — Retrieval and RAG.** Vector search, BM25 search, RRF fusion, `POST /search`, `POST /answer` streaming from `claude-opus-5` with citations and a refusal path. _Done when:_ all five sample questions cite the expected document and an out-of-corpus question refuses cleanly. **Done** — hybrid scores hit@8 100% and MRR 1.000, and all three out-of-corpus probes are refused. The eval caught the refusal gate thresholding an RRF score, which carries no relevance information; see `AI_USAGE.md`.
- [x] **M4 — Web.** Next.js + Tailwind, responsive on phone, tablet, and desktop: login, chat with streamed answer and clickable citations, admin dashboard covering documents, ingestion runs, index health, and search analytics. _Done when:_ the dashboard is unreachable as a regular user, both in the UI and by direct URL. **Done** — a regular user is redirected away from /dashboard and gets 403 from every admin API route. Not visually reviewed: no browser was available in this environment.
- [x] **M5 — MCP.** MCP server wrapping `packages/rag` search, token-guarded, with connection instructions. _Done when:_ an MCP client calls the tool and gets results back. **Done** — verified with a real MCP client over an in-memory transport, and over stdio JSON-RPC.
- [x] **M6 — Docs and proof.** README covering description, stack, install, run, demo credentials, API docs, deployment notes, and feature list; `AI_USAGE.md`; eval harness and results in `docs/`. _Done when:_ a fresh clone works following only the README. **Done** — writing it exposed every configured path resolving against cwd rather than the repo root, which broke `npm run seed` and `npm run ingest` from the root. Fixed and re-verified.

## 8. Risks

| Risk                                                               | Mitigation                                                                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `better-sqlite3` or `sqlite-vec` fails to build or load on Windows | Verify both install and load in M0, before anything is built on top of them. Fallback: `libsql`, or an in-process cosine scan over ~400 chunks, which is fast enough at this corpus size |
| First-run model download makes ingestion look broken               | Log the download explicitly, document it in the README, cache it under a gitignored directory                                                                                            |
| Tiny documents make chunk-level retrieval noisy                    | Retrieve chunks but deduplicate citations up to documents; tune `k` against the eval rather than by feel                                                                                 |
| Two days is not much time                                          | Milestones are ordered so that stopping after M4 still yields a coherent, honest system                                                                                                  |

## 9. Conventions

- **Commits:** conventional style (`feat:`, `fix:`, `docs:`, `chore:`), one logical change each. Commit history is graded — no `wip` or `asdf`.
- **Branch:** `main` stays in a working state.
- **Secrets:** never committed. `.env.example` documents every variable; `.env` is ignored.
- **Types:** no `any` in committed code. API request and response shapes come from `packages/shared`.
- **AI usage:** logged in `AI_USAGE.md` as we go, including where it got things wrong and how we caught it — written during the work, not reconstructed at the end.
