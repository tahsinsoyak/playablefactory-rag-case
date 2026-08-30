# Corpus RAG — semantic search and grounded answers

A TypeScript monorepo that indexes an internal document corpus into a vector store and
answers questions about it with grounded, cited answers — and says so plainly when the
corpus does not cover the question.

Built for the Playable Factory AI Software Engineer case study. `PROJECT.md` records the
plan and the reasoning behind each decision; `AI_USAGE.md` records how AI was used,
including where it was wrong.

## What it does

| Surface        | Who                  | What it does                                                                              |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| **Chat**       | any signed-in user   | ask in natural language, see the retrieved passages, get a grounded answer with citations |
| **Dashboard**  | admins only          | indexed documents, ingestion history, index health, search analytics, run ingestion       |
| **MCP server** | external MCP clients | the same search, exposed as a callable tool                                               |

Main features:

- **Hybrid retrieval** — semantic (vector) and keyword (BM25) search fused with Reciprocal
  Rank Fusion. Measured: it puts the expected document first on every sample question,
  where each half alone sometimes does not.
- **Grounded answers with citations** back to source documents, streamed token by token.
- **Honest refusal.** When nothing relevant is retrieved, the system says so and cites
  nothing, rather than assembling something plausible from unrelated passages.
- **Incremental ingestion.** Re-running ingestion detects new, changed, and deleted
  documents by content hash and re-embeds only the difference.
- **Role-based access.** Regular users can search; the dashboard, corpus management, and
  user administration are admin-only, enforced server-side.
- **A retrieval eval** that scores hit@k and MRR across the sample questions and checks
  that out-of-corpus questions are refused.

## Technology stack

| Area           | Choice                                                                       |
| -------------- | ---------------------------------------------------------------------------- |
| Language       | TypeScript 6 throughout, strict, no `any` (lint-enforced)                    |
| Monorepo       | npm workspaces + TypeScript project references                               |
| Frontend       | Next.js 16 (App Router), React 19, Tailwind CSS 4                            |
| Backend        | Fastify 5                                                                    |
| Database       | SQLite via `better-sqlite3`                                                  |
| Vector search  | `sqlite-vec` (`vec0` virtual table, 384 dimensions)                          |
| Keyword search | SQLite FTS5 with BM25                                                        |
| Embeddings     | `bge-small-en-v1.5` run locally via `@huggingface/transformers` — no API key |
| Answers        | `claude-opus-5` via `@anthropic-ai/sdk`, streaming                           |
| MCP            | `@modelcontextprotocol/sdk`, stdio transport                                 |
| Auth           | Own JWT (`jose`) + argon2id (`@node-rs/argon2`), httpOnly cookies            |
| Validation     | zod 4 — one schema set shared by API, web, and MCP                           |
| Tests          | `node:test` via `tsx`                                                        |

No Docker, no external database, and only one API key — see the design notes below for why.

## Requirements

- **Node.js 20.11+** (developed on 24)
- **npm 10+**
- An **Anthropic API key**, needed only to generate answers. Ingestion, search, the
  dashboard, and the MCP server all work without one.

Nothing else. No Docker, no database server, no second model provider.

## Installation

```bash
git clone <this repository>
cd playablefactory_ai_case
npm install
```

Then create your environment file:

```bash
cp .env.example .env
```

Open `.env` and set two things:

1. **`ANTHROPIC_API_KEY`** — your key. Leave it empty to run everything except answer
   generation.
2. **`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`** — these have no defaults on purpose; a
   fallback secret is a vulnerability that boots successfully. Generate them with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   The two must differ. If they matched, a refresh token could be replayed as an access
   token, and the API refuses to start.

### Seed the demo accounts and build the index

```bash
npm run seed      # creates the two demo users
npm run ingest    # indexes corpus/ — 142 documents, about 30 seconds
```

The first ingestion downloads the embedding model (~35 MB) and caches it in `.models/`.
After that everything runs offline, and a re-run with no changes finishes in well under a
second.

> **If `npm install` warns about blocked install scripts:** npm 12 blocks lifecycle scripts
> by default, so `onnxruntime-node`'s postinstall does not run. Everything still works —
> this was verified, not assumed — because the packages ship prebuilt binaries. No action
> needed.

## Running the application

Two servers. Either run both at once:

```bash
npm run dev
```

or in separate terminals, which gives cleaner logs:

```bash
npm run dev --workspace=@corpus/api   # http://localhost:4000
npm run dev --workspace=@corpus/web   # http://localhost:3000
```

Open **http://localhost:3000** and sign in.

### Demo credentials

| Role      | Email              | Password        | Can do                                       |
| --------- | ------------------ | --------------- | -------------------------------------------- |
| **User**  | `user@demo.local`  | `demo-user-pw`  | chat, search                                 |
| **Admin** | `admin@demo.local` | `demo-admin-pw` | everything, plus the dashboard and ingestion |

Sign in as the regular user first and try to reach `/dashboard` — you will get a 404, and
the API answers 403 to a direct call. Change the passwords via `SEED_*` in `.env` and
re-run `npm run seed`.

## Other commands

| Command                                 | What it does                                                       |
| --------------------------------------- | ------------------------------------------------------------------ |
| `npm run ingest`                        | Index the corpus; incremental after the first run                  |
| `npm run ingest -- --force`             | Re-embed everything (needed after a chunking change)               |
| `npm run eval`                          | Score retrieval, write `docs/eval-results.md` — no API key needed  |
| `npm run eval -- --answers`             | Also generate answers for each case (calls the model, costs money) |
| `npm test`                              | Run the test suites                                                |
| `npm run typecheck` / `lint` / `format` | The three checks every commit must pass                            |
| `npm run smoke --workspace=@corpus/mcp` | Connect an MCP client to the server and call the tool              |

## API documentation

The API runs on `http://localhost:4000`. Authentication is an httpOnly cookie set at login;
a `Authorization: Bearer <token>` header is also accepted for non-browser clients. All
responses share one error shape: `{ "error": { "code", "message", "details?" } }`.

### Authentication

| Method | Path            | Access | Description                                           |
| ------ | --------------- | ------ | ----------------------------------------------------- |
| `POST` | `/auth/login`   | public | Sign in; sets access and refresh cookies              |
| `POST` | `/auth/refresh` | cookie | Rotate the refresh token and reissue the access token |
| `POST` | `/auth/logout`  | public | Revoke the refresh token and clear cookies            |
| `GET`  | `/auth/session` | public | Current user, or `{ "user": null }` when signed out   |

```bash
curl -c jar.txt -X POST http://localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"user@demo.local","password":"demo-user-pw"}'
```

### Search and answers

| Method | Path      | Access    | Description                                     |
| ------ | --------- | --------- | ----------------------------------------------- |
| `POST` | `/search` | signed in | Retrieve passages. No model call, no key needed |
| `POST` | `/answer` | signed in | Grounded answer, streamed as server-sent events |

```bash
curl -b jar.txt -X POST http://localhost:4000/search \
  -H 'content-type: application/json' \
  -d '{"query":"maximum file size for an AppLovin playable","limit":5,"mode":"hybrid"}'
```

`mode` is `hybrid` (default), `vector`, or `keyword`. Each hit carries `score` (the fused
rank), `vectorScore` (cosine similarity), and the per-strategy ranks, so a result can be
explained rather than just trusted.

```bash
curl -b jar.txt -N -X POST http://localhost:4000/answer \
  -H 'content-type: application/json' \
  -d '{"question":"How do I initialize the current Lumen SDK?","mode":"hybrid","topK":8}'
```

The stream emits `retrieval` (the passages, first, so a UI can render them immediately),
then `delta` events as text arrives, then one `done` carrying either
`{ status: "answered", citations: [...] }` or `{ status: "refused", reason }`. `/answer`
accepts only `hybrid` and `vector` — see the design notes.

### Admin only

| Method  | Path                    | Description                                           |
| ------- | ----------------------- | ----------------------------------------------------- |
| `GET`   | `/documents`            | Indexed documents; filter by `docType`, `status`, `q` |
| `GET`   | `/documents/:id`        | One document with its chunks                          |
| `GET`   | `/ingestion/runs`       | The last 20 ingestion runs and their counts           |
| `POST`  | `/ingestion/run`        | Trigger ingestion; `{"force":true}` to rebuild        |
| `GET`   | `/index/health`         | Counts, embedder, and whether the index is stale      |
| `GET`   | `/analytics/search`     | Search volume, answered rate, latency, top queries    |
| `GET`   | `/admin/users`          | List users                                            |
| `PATCH` | `/admin/users/:id/role` | Change a role                                         |

`GET /health` is public and unauthenticated, for liveness checks.

## Connecting an MCP client

The server speaks stdio, which is what desktop MCP clients launch. Build first, then point
your client at it. For Claude Desktop or Claude Code, add:

```json
{
  "mcpServers": {
    "corpus-search": {
      "command": "node",
      "args": ["<absolute path to repo>/apps/mcp/dist/index.js"],
      "env": {
        "DATABASE_PATH": "<absolute path to repo>/data/corpus.db",
        "MODEL_CACHE_DIR": "<absolute path to repo>/.models"
      }
    }
  }
}
```

Build it with `npm run build --workspace=@corpus/mcp`, or point `command` at
`npx tsx <repo>/apps/mcp/src/index.ts` to skip the build step.

It exposes one tool, **`search_corpus`**, taking `query`, `limit`, `mode`, and an optional
`docType`. It returns readable passages with their source paths — a model needs to cite
them — plus `structuredContent` for programmatic clients. The index is opened **read-only**:
an MCP client can search the corpus and can never modify it.

Verify it without a client:

```bash
npm run smoke --workspace=@corpus/mcp
```

## Design notes

**Why SQLite + sqlite-vec, not pgvector.** The corpus is 142 files and 114 KB. A
server-class vector database would be infrastructure with nothing to manage, and it would
add a setup step to every fresh machine. SQLite is a single file with no daemon, so
`npm install` really is enough — and FTS5 lives in the same database, which makes hybrid
search nearly free and lets a document's text, vectors, and keyword index be written in one
transaction. `packages/rag` defines a `VectorStore` interface; pgvector would be an adapter,
not a rewrite.

**Why local embeddings.** `bge-small-en-v1.5` costs nothing, needs no key, runs offline, and
embeds this corpus in seconds. It keeps the reviewer's required setup to a single Anthropic
key rather than two accounts. Changing embedders invalidates the index — the vector space
and width both change — so `documents.embedder_id` is recorded and ingestion rebuilds
automatically when it differs.

**Chunking.** Markdown sections, split on headings, never crossing a document boundary, and
merged toward ~400 tokens. Most documents here are 400–1000 bytes and become one or two
chunks, which is correct: splitting a 600-byte postmortem would fracture its citations
without improving recall. Each chunk stores two texts — the passage verbatim for display,
and a copy prefixed with `Document title > Heading` for embedding. The corpus is full of
sections like `## Sign-off` whose subject exists only in the heading; unretrievable alone,
retrievable with its title attached.

**Why RRF, and why it is not the relevance threshold.** Cosine distance and BM25 are on
incomparable scales, so fusing _ranks_ avoids inventing a normalisation constant to tune.
But a rank-derived score says where a chunk placed, never whether it is any good —
something always ranks first. An early version of the refusal gate thresholded the fused
score, and every out-of-corpus probe sailed through it: "how much do senior developers get
paid?" scored identically to the best genuine question. The gate now reads cosine
similarity, which is absolute. The floor of **0.55** is measured, not chosen: answerable
questions score 0.621–0.827 and out-of-corpus probes 0.461–0.487, so 0.55 sits in the empty
band between them. `npm run eval` re-checks that separation.

That is also why `/answer` rejects `keyword` mode. BM25 scores are unbounded and
corpus-dependent, so a keyword-only answer has no calibrated number to gate on and would
quietly lose the grounding guarantee. Better to exclude the mode than to ship a weaker
promise under the same name.

**Refusal is structural, not linguistic.** Two independent guards. Before generating,
anything below the similarity floor is refused without a model call — cheaper, and the
model never gets the chance to construct something plausible from unrelated passages. After
generating, a response that cites nothing is reported as a refusal however confident it
reads, because an uncited answer is by definition not grounded. Citation numbers outside the
supplied range are discarded rather than turned into links.

**Superseded documents are reconciled, not filtered.** `sdk-notes-v2.md` is deprecated by
`v3`, and both match a question about SDK initialization. We deliberately retrieve both:
the documents state their own status, and the prompt asks the model to prefer the current
one and say what changed. Silently dropping v2 would produce a confident answer with no way
to explain that `lumen.track` now fails silently — which is usually the actual question.

**The FTS5 tokenizer is customised.** The default `unicode61` keeps `LumenSDK.init` as a
single token, so a keyword search for `lumen` could not match it. In a corpus this full of
identifiers (`lumen.track`, `first_interaction`, `cta_click`) that is a real recall gap, so
the index declares `tokenize = "unicode61 tokenchars '.-_'"`.

**Security.** Login answers identically for an unknown address and a wrong password, and
spends the same argon2 work on both by verifying against a decoy hash, so timing does not
enumerate accounts. Refresh tokens are opaque random strings stored as SHA-256 hashes — a
database read yields no working sessions — and they rotate on use; replaying a rotated
token is treated as a leak and revokes every session for that user. The access cookie is
httpOnly; the refresh cookie is additionally scoped to `/auth` so the long-lived credential
is not attached to ordinary requests. Role checks run server-side on every route, and page
guards run before any markup is generated. Hiding a nav link is a courtesy, not a control.

**One retrieval core.** `apps/api` and `apps/mcp` are thin transports over `packages/rag`.
Neither knows what an embedding is. That is what prevents the MCP tool and the web search
from becoming two implementations that drift apart.

## Evaluation results

`npm run eval` writes `docs/eval-results.md`. On the case's own sample questions plus
out-of-corpus probes:

| Mode       | hit@8 | MRR       | Out-of-corpus refused |
| ---------- | ----- | --------- | --------------------- |
| **hybrid** | 100%  | **1.000** | 3/3                   |
| vector     | 100%  | 0.900     | 3/3                   |
| keyword    | 100%  | 0.800     | 3/3                   |

Hybrid earns its place: it ranks the expected document first every time.

## Project layout

```
apps/
  api/        Fastify: auth, search, answers, corpus management, analytics
  web/        Next.js: login, chat, dashboard
  mcp/        MCP server over the same retriever
packages/
  shared/     zod schemas and inferred types — the contract all three share
  rag/        the retrieval core: load, chunk, embed, store, retrieve, answer
corpus/       the document corpus (142 markdown files)
docs/         sample questions and eval results
```

## Deployment

Not deployed — the case treats that as optional, and the effort went into retrieval quality
instead. How it would be done:

The **web app** is a standard Next.js build and would go to Vercel or any Node host. The
**API** is a single Node process; the constraint is that SQLite needs a persistent
filesystem, so it wants a host with a real disk or attached volume (Fly.io, Railway, a small
VM) rather than a serverless runtime with an ephemeral one. Set `NODE_ENV=production` — that
turns on `secure` cookies and proxy trust — point `WEB_ORIGIN` at the deployed frontend, and
supply the JWT secrets and API key from the platform's secret store, never from a committed
file.

Ingestion would run as a release step (`npm run seed && npm run ingest`) so the container
starts with a warm index, with the model cache baked into the image to avoid downloading it
on boot. If the corpus changed independently of deploys, the incremental pipeline is already
the right shape for a periodic job — it only re-embeds the difference.

At a corpus size where one process and one file stopped being enough, the `VectorStore`
interface is the seam: swap the SQLite adapter for pgvector, and the API becomes
horizontally scalable without touching retrieval, the routes, or the MCP server.

## What is not here

Stated plainly rather than half-built:

- **MCP authentication via OIDC.** The stdio transport is local and the client owns the
  process, so there is no network surface to protect in this configuration. Exposing the
  server over HTTP would need real authentication: an OIDC-protected HTTP transport
  validating a bearer JWT against the provider's JWKS, mapping the verified subject to a
  user, and reusing the same role checks the API already applies. That is the honest gap —
  the groundwork is there, the OIDC flow is not.
- **A live deployment.** See above for how.
- **Answer-quality scoring.** The eval measures retrieval quantitatively; answer quality is
  checked by reading the output of `npm run eval -- --answers`, not scored.
