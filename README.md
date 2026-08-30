# Corpus RAG: semantic search and grounded answers

A TypeScript monorepo that indexes an internal document corpus into a vector store and
answers questions about it with grounded, cited answers, and says so plainly when the
corpus does not cover the question.

Built for the Playable Factory AI Software Engineer case study. `PROJECT.md` records the
plan and the reasoning behind each decision; `AI_USAGE.md` records how AI was used,
including where it was wrong.

## What it does

| Surface        | Who                  | What it does                                                                             |
| -------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| **Chat**       | any signed-in user   | a conversation: ask, get a grounded answer with citations, expand the passages behind it |
| **Dashboard**  | admins only          | indexed documents, ingestion history, index health, search analytics, run ingestion      |
| **MCP server** | external MCP clients | the same search, exposed as a callable tool                                              |

Main features:

- **Hybrid retrieval**. Semantic (vector) and keyword (BM25) search fused with Reciprocal
  Rank Fusion. Measured: it puts the expected document first on every sample question,
  where each half alone sometimes does not.
- **Grounded answers with citations** back to source documents, streamed token by token, in a
  conversation you can scroll back through. Citation markers are clickable and reveal the
  exact passage they came from, with its similarity score and per-strategy ranks. Retrieval
  is inspectable rather than a black box.
- **Honest refusal.** When nothing relevant is retrieved, the system says so and cites
  nothing, rather than assembling something plausible from unrelated passages.
- **Incremental ingestion.** Re-running ingestion detects new, changed, and deleted
  documents by content hash and re-embeds only the difference.
- **Role-based access.** Regular users can search; the dashboard, corpus management, and
  user administration are admin-only, enforced server-side.
- **A retrieval eval** that scores hit@k and MRR across 26 cases and checks that
  out-of-corpus questions are refused.
- **An answer-quality eval** that scores citations, grounding, and the answer-or-refuse
  decision without a model, then asks a judge model the part that needs an opinion.
- **User management**. Admins can list users and change roles, with a guard against
  demoting yourself out of the last admin account.

## Technology stack

| Area           | Choice                                                                      |
| -------------- | --------------------------------------------------------------------------- |
| Language       | TypeScript 6 throughout, strict, no `any` (lint-enforced)                   |
| Monorepo       | npm workspaces + TypeScript project references                              |
| Frontend       | Next.js 16 (App Router), React 19, Tailwind CSS 4                           |
| Backend        | Fastify 5                                                                   |
| Database       | SQLite via `better-sqlite3`                                                 |
| Vector search  | `sqlite-vec` (`vec0` virtual table, 384 dimensions)                         |
| Keyword search | SQLite FTS5 with BM25                                                       |
| Embeddings     | `bge-small-en-v1.5` run locally via `@huggingface/transformers`, no API key |
| Answers        | Any model via OpenRouter (default) or Anthropic directly, streaming         |
| MCP            | `@modelcontextprotocol/sdk`, stdio transport                                |
| Auth           | Own JWT (`jose`) + argon2id (`@node-rs/argon2`), httpOnly cookies           |
| Validation     | zod 4. One schema set shared by API, web, and MCP                           |
| Tests          | `node:test` via `tsx`                                                       |

No Docker, no external database, and only one API key. See the design notes below for why.

## Requirements

- **Node.js 20.11+** (developed on 24)
- **npm 10+**
- An **LLM API key**, needed only to generate answers. Ingestion, search, the dashboard,
  and the MCP server all work without one.
  - **OpenRouter** (default). One key reaches Anthropic, OpenAI, Google, and open-weight
    models. Get one at <https://openrouter.ai/keys>.
  - **Anthropic** directly, if you prefer.

Nothing else. No Docker, no database server, and no embedding provider: embeddings run
locally.

## Installation

```bash
git clone <this repository>
cd playablefactory_ai_case
npm install
```

`npm install` also compiles the shared workspace packages, via npm's `prepare`
lifecycle. The API, web app, and MCP server all import `@corpus/shared` and
`@corpus/rag` by package name, so those have to be built before anything can run.
You should not need to think about it, but if you ever see
`Cannot find module '@corpus/rag'`, `npm run build` is the fix.

Then create your environment file:

```bash
cp .env.example .env
```

Open `.env` and set two things:

1. **`OPENROUTER_API_KEY`**. Your key from <https://openrouter.ai/keys>; they start with
   `sk-or-`. Leave it empty to run everything except answer generation. To use Anthropic
   directly instead, set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`.
2. **`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`**. These have no defaults on purpose; a
   fallback secret is a vulnerability that boots successfully. Generate them with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   The two must differ. If they matched, a refresh token could be replayed as an access
   token, and the API refuses to start.

### Seed the demo accounts and build the index

```bash
npm run seed      # creates the two demo users
npm run ingest    # indexes corpus/ (142 documents, about 30 seconds)
```

The first ingestion downloads the embedding model (~35 MB) and caches it in `.models/`.
After that everything runs offline, and a re-run with no changes finishes in well under a
second.

> **If `npm install` warns about blocked install scripts:** npm 12 blocks lifecycle scripts
> by default, so `onnxruntime-node`'s postinstall does not run. Everything still works.
> This was verified, not assumed, because the packages ship prebuilt binaries. No action
> needed.

## Running the application

Two servers. Either run both at once. Output from each is prefixed, and Ctrl+C stops both:

```bash
npm run dev
```

or in separate terminals, if you prefer unmixed logs:

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

The login page has **one-click buttons for both accounts**, so you never have to type them.
They are driven by `GET /auth/demo-accounts`, which returns an empty list when
`NODE_ENV=production`. The gate is server-side rather than a flag in the client, because a
client-side flag still ships the credentials inside the JavaScript bundle where anyone can
read them, whether the buttons render or not. Verified: a production build of the web app
contains neither address nor password. The endpoint reads the same `SEED_*` variables the
seed script does, so the buttons cannot drift from the accounts that actually exist.

Sign in as the regular user first and try to reach `/dashboard`. You will get a 404, and
the API answers 403 to a direct call. Change the passwords via `SEED_*` in `.env` and re-run
`npm run seed`.

## Other commands

| Command                                 | What it does                                                       |
| --------------------------------------- | ------------------------------------------------------------------ |
| `npm run ingest`                        | Index the corpus; incremental after the first run                  |
| `npm run ingest -- --force`             | Re-embed everything (needed after a chunking change)               |
| `npm run eval`                          | Score retrieval, write `docs/eval-results.md`, no API key needed   |
| `npm run eval -- --answers`             | Also generate answers for each case (calls the model, costs money) |
| `npm test`                              | Run the test suites (56 tests)                                     |
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
accepts only `hybrid` and `vector`, see the design notes.

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

There are two transports. Which one you want depends on where the client runs.

### stdio, for a desktop client on this machine

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
`docType`. It returns readable passages with their source paths, a model needs to cite
them. Plus `structuredContent` for programmatic clients. The index is opened **read-only**:
an MCP client can search the corpus and can never modify it.

Verify it without a client:

```bash
npm run smoke --workspace=@corpus/mcp
```

Or sign in as the admin and open **/mcp** in the web app. That page shows both transports and
whether each is reachable, gives you the client configuration to copy, and can run the real
tool call end to end. The token for that check is minted by the API, not the browser: putting
the client secret in the page to make a nicer demo would undo the reason the HTTP transport is
authenticated at all.

### HTTP, protected by OIDC

stdio needs no authentication: the client launches the process, owns its lifetime, and
nothing listens on a port. The moment the same tools are reachable over the network that
stops being true, so the HTTP transport requires an OAuth 2.0 access token.

```bash
npm run dev:mcp      # http://localhost:4100/mcp
```

The API doubles as the OpenID Provider. It publishes discovery and JWKS, and issues RS256
tokens through the `client_credentials` grant, which is the right flow here because the
thing being authorised is a program, not a person:

| Endpoint                                               | What it is                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `GET /.well-known/openid-configuration`                | Provider metadata: token endpoint, JWKS, grants, scopes          |
| `GET /.well-known/jwks.json`                           | Public keys. The private key never leaves the API                |
| `POST /oauth/token`                                    | `client_credentials` grant, secret in the body or via HTTP Basic |
| `GET /.well-known/oauth-protected-resource` (on :4100) | Tells a client which issuer to use                               |

Get a token and call the tool:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/oauth/token   -H 'content-type: application/json'   -d '{"grant_type":"client_credentials","client_id":"corpus-mcp","client_secret":"<MCP_CLIENT_SECRET>"}'   | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).access_token))")

curl -X POST http://localhost:4100/mcp   -H "Authorization: Bearer $TOKEN"   -H 'content-type: application/json'   -H 'Accept: application/json, text/event-stream'   -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

`npm run seed` registers the `corpus-mcp` client, using `MCP_CLIENT_SECRET` from `.env`. If
that variable is unset the client is skipped rather than created with a default secret,
because a default credential is worse than no credential.

**What the resource server checks.** Signature against the provider's JWKS, issuer,
audience, expiry, and scope. The audience check is RFC 8707 resource indicators: a token is
minted for `http://localhost:4100/mcp` specifically, so if it leaks it cannot be replayed
against the main API. The MCP server holds no key material at all, only the public keys it
fetches, so it can decide whether a token is genuine and cannot mint one.

**Using a real identity provider instead.** Nothing in the resource server knows who signed.
Point `OIDC_ISSUER` at Auth0, Keycloak, or Entra, register the resource as an audience
there, and it verifies against their JWKS with no code change.

## Choosing a model

The chat model sits behind a `ChatModel` port, so the provider is configuration rather than
code. With OpenRouter, changing models is one line in `.env`:

```bash
LLM_MODEL=qwen/qwen3.7-flash         # the default - $0.03/$0.13 per 1M tokens
LLM_MODEL=anthropic/claude-opus-5    # strongest, ~170x the input cost
LLM_MODEL=anthropic/claude-sonnet-5
LLM_MODEL=openai/gpt-4o-mini
LLM_MODEL=deepseek/deepseek-chat     # open weights
```

**The default is deliberately a cheap model.** Retrieval does the hard part here: by the
time the model is called it has been handed a handful of short, already-relevant passages
and asked to quote them with citations. That is extraction, not reasoning. Measured on the
case's own questions, `qwen3.7-flash` answers all five correctly with the right citations
and refuses all three out-of-corpus probes. The same result as a frontier model, at a
fraction of a cent. Spending more per token would buy eloquence, not accuracy, and the
grading criteria say retrieval quality matters more than answer eloquence.

Browse the full list at <https://openrouter.ai/models>, because retrieval is unchanged by
the choice, `npm run eval -- --answers` gives a like-for-like comparison across models on
the same passages, which is the point of putting the provider behind a port rather than
calling an SDK from the route handler.

Switching the _embedder_ is a different matter: it changes the vector space and invalidates
the index, so ingestion detects it and rebuilds. Switching the _chat model_ invalidates
nothing.

## Design notes

**Why SQLite + sqlite-vec, not pgvector.** The corpus is 142 files and 114 KB. A
server-class vector database would be infrastructure with nothing to manage, and it would
add a setup step to every fresh machine. SQLite is a single file with no daemon, so
`npm install` really is enough, and FTS5 lives in the same database, which makes hybrid
search nearly free and lets a document's text, vectors, and keyword index be written in one
transaction. `packages/rag` defines a `VectorStore` interface; pgvector would be an adapter,
not a rewrite.

**Why local embeddings.** `bge-small-en-v1.5` costs nothing, needs no key, runs offline, and
embeds this corpus in seconds. It keeps the reviewer's required setup to a single LLM key
rather than two accounts. Changing embedders invalidates the index, the vector space
and width both change, so `documents.embedder_id` is recorded and ingestion rebuilds
automatically when it differs.

**Chunking.** Markdown sections, split on headings, never crossing a document boundary, and
merged toward ~400 tokens. Most documents here are 400–1000 bytes and become one or two
chunks, which is correct: splitting a 600-byte postmortem would fracture its citations
without improving recall. Each chunk stores two texts. The passage verbatim for display,
and a copy prefixed with `Document title > Heading` for embedding. The corpus is full of
sections like `## Sign-off` whose subject exists only in the heading; unretrievable alone,
retrievable with its title attached.

**Why RRF, and why it is not the relevance threshold.** Cosine distance and BM25 are on
incomparable scales, so fusing _ranks_ avoids inventing a normalisation constant to tune.
But a rank-derived score says where a chunk placed, never whether it is any good.
Something always ranks first. An early version of the refusal gate thresholded the fused
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
anything below the similarity floor is refused without a model call, cheaper, and the
model never gets the chance to construct something plausible from unrelated passages. After
generating, a response that cites nothing is reported as a refusal however confident it
reads, because an uncited answer is by definition not grounded. Citation numbers outside the
supplied range are discarded rather than turned into links.

**Superseded documents are reconciled, not filtered.** `sdk-notes-v2.md` is deprecated by
`v3`, and both match a question about SDK initialization. We deliberately retrieve both:
the documents state their own status, and the prompt asks the model to prefer the current
one and say what changed. Silently dropping v2 would produce a confident answer with no way
to explain that `lumen.track` now fails silently, which is usually the actual question.

**The FTS5 tokenizer is customised.** The default `unicode61` keeps `LumenSDK.init` as a
single token, so a keyword search for `lumen` could not match it. In a corpus this full of
identifiers (`lumen.track`, `first_interaction`, `cta_click`) that is a real recall gap, so
the index declares `tokenize = "unicode61 tokenchars '.-_'"`.

**Security.** Login answers identically for an unknown address and a wrong password, and
spends the same argon2 work on both by verifying against a decoy hash, so timing does not
enumerate accounts. Refresh tokens are opaque random strings stored as SHA-256 hashes, a
database read yields no working sessions, and they rotate on use; replaying a rotated
token is treated as a leak and revokes every session for that user. The access cookie is
httpOnly; the refresh cookie is additionally scoped to `/auth` so the long-lived credential
is not attached to ordinary requests. Role checks run server-side on every route, and page
guards run before any markup is generated. Hiding a nav link is a courtesy, not a control.

**Why OpenRouter is the default.** Answer generation is the only part that needs a hosted
model, and one OpenRouter key reaches every provider, so a reviewer needs one account, and
comparing models is an `.env` edit rather than a new adapter. The Anthropic adapter is kept
for calling that API directly. Both use the same prompt and the same cited-or-refused
decision, which live in shared modules precisely so that changing provider cannot quietly
change what counts as a grounded answer.

**One retrieval core.** `apps/api` and `apps/mcp` are thin transports over `packages/rag`.
Neither knows what an embedding is. That is what prevents the MCP tool and the web search
from becoming two implementations that drift apart.

## Reranking

Answering runs the fused shortlist through a cross-encoder,
`ms-marco-MiniLM-L-6-v2`, before the passages reach the model. An embedder turns the query
and the passage into vectors independently and compares them, so it never sees the two
together. A cross-encoder reads them as one input, which lets it notice that a passage
_answers_ a question rather than merely sharing its subject.

Three configurations were measured on the 26-case eval, because the point of adding it was
to find out whether it earned its cost:

| Configuration                    | sample hit@8 | sample MRR | paraphrase hit@8 | paraphrase MRR |
| -------------------------------- | ------------ | ---------- | ---------------- | -------------- |
| Hybrid only                      | 93%          | 0.717      | 86%              | 0.518          |
| Reranker overrides the order     | 93%          | **0.893**  | 71%              | **0.592**      |
| Reranker fused as a third signal | **100%**     | 0.815      | 71%              | 0.529          |

Letting the reranker replace the ranking gave the best MRR and the worst hit rate: it lifted
some documents sharply and pushed others out of the window entirely, which on the answer
path is a false refusal. Fusing it in as a third ranking, by the same Reciprocal Rank Fusion
already used for vector and keyword, keeps what the retrievers knew. That is what ships:
sample questions reach 100% hit and MRR climbs from 0.717 to 0.815.

The remaining paraphrase loss is one question that sat at rank 8 of 8 to begin with, so any
reordering drops it. It is reported rather than tuned away.

**Applied to answering, not to plain search.** Reranking costs roughly a second per query
against about 25 ms without it. Answering already spends around three seconds in the model,
so a third more latency for materially better ordering is a good trade, and ordering is
exactly what a grounded answer depends on. Search is interactive and the user can see the
list themselves. Set `RERANKER=none` to disable it entirely.

## Evaluation results

`npm run eval` writes `docs/eval-results.md`. On the case's own sample questions plus
out-of-corpus probes:

| Mode       | hit@8 | MRR       | Out-of-corpus refused |
| ---------- | ----- | --------- | --------------------- |
| **hybrid** | 100%  | **1.000** | 3/3                   |
| vector     | 100%  | 0.900     | 3/3                   |
| keyword    | 100%  | 0.800     | 3/3                   |

Hybrid earns its place: it ranks the expected document first every time.

## Answer quality

Retrieval quality and answer quality are different questions, so they have different evals.
`npm run eval` asks whether the right passages come back. `npm run eval:answers` asks what
was done with them.

Deterministic checks run first, because they need no opinion and cost nothing:

| Measure                                   | Result                |
| ----------------------------------------- | --------------------- |
| Answer-or-refuse decision correct         | **100%** (26 cases)   |
| Citation recall (required document cited) | 90%                   |
| Citation precision                        | 79%                   |
| Figures traceable to the cited passages   | **100%** (17 checked) |

The grounding check pulls every number and identifier out of the answer and looks for it in
the passages that answer cited, not merely in everything retrieved. An answer citing document
A while taking its figures from document B is not grounded in what it claimed. Invented
figures are the most damaging failure and the easiest to catch mechanically, so no model is
asked about them.

Then a judge model scores the part that genuinely needs judgement:

| Measure                                          | Result       |
| ------------------------------------------------ | ------------ |
| Faithful (every claim traceable to the passages) | **26/26**    |
| Relevant (answers what was actually asked)       | **26/26**    |
| Mean score                                       | **4.92 / 5** |

Three constraints keep the verdicts meaningful. The judge never sees which document was
expected, so it scores support by the evidence rather than agreement with a label. It judges
only against the passages the answer cited. And the judge is never the answering model: the
eval **refuses to run** if `JUDGE_MODEL` equals `LLM_MODEL`, because a model grading its own
output rates it generously and the score would not mean what the report claims.

**Checked against a second judge.** Running the same answers past `openai/gpt-4o-mini`, a
different vendor and family, returns 5.00 of 5 where `anthropic/claude-sonnet-5` returns 4.92.
Both agree every answer is faithful, which is the result that matters. The gap is worth
knowing though: the cheaper judge deducted nothing at all, and a judge that never deducts
cannot detect a regression. The stricter one stays the default for that reason.

| Judge                                 | Vendor    | Mean score | Faithful |
| ------------------------------------- | --------- | ---------- | -------- |
| `anthropic/claude-sonnet-5` (default) | Anthropic | 4.92 / 5   | 26/26    |
| `openai/gpt-4o-mini`                  | OpenAI    | 5.00 / 5   | 26/26    |

Any OpenRouter model works as a judge. Swap one for a single run without editing `.env`:

```bash
npm run eval:answers -- --judge --judge-model=google/gemini-2.5-pro
```

```bash
npm run eval:answers            # deterministic only, one model call per case
npm run eval:answers -- --judge # adds a judge call per case
```

## Project layout

```
apps/
  api/        Fastify: auth, search, answers, corpus management, analytics
  web/        Next.js: login, chat, dashboard
  mcp/        MCP server over the same retriever
packages/
  shared/     zod schemas and inferred types, the contract all three share
  rag/        the retrieval core: load, chunk, embed, store, retrieve, answer
corpus/       the document corpus (142 markdown files)
docs/         sample questions and eval results
```

## Deployment

Not deployed. The case treats that as optional, and the effort went into retrieval quality
instead. How it would be done:

The **web app** is a standard Next.js build and would go to Vercel or any Node host. The
**API** is a single Node process; the constraint is that SQLite needs a persistent
filesystem, so it wants a host with a real disk or attached volume (Fly.io, Railway, a small
VM) rather than a serverless runtime with an ephemeral one. Set `NODE_ENV=production`, that
turns on `secure` cookies and proxy trust. Point `WEB_ORIGIN` at the deployed frontend, and
supply the JWT secrets and API key from the platform's secret store, never from a committed
file.

Ingestion would run as a release step (`npm run seed && npm run ingest`) so the container
starts with a warm index, with the model cache baked into the image to avoid downloading it
on boot. If the corpus changed independently of deploys, the incremental pipeline is already
the right shape for a periodic job. It only re-embeds the difference.

At a corpus size where one process and one file stopped being enough, the `VectorStore`
interface is the seam: swap the SQLite adapter for pgvector, and the API becomes
horizontally scalable without touching retrieval, the routes, or the MCP server.

## What is not here

Stated plainly rather than half-built:

- **A live deployment.** See above for how.
- **Answer-quality scoring.** The eval measures retrieval quantitatively; answer quality is
  checked by reading the output of `npm run eval -- --answers`, not scored.
