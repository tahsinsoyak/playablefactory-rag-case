# AI Usage Log

Kept as the work happens, not reconstructed afterwards. The case asks what AI did, what I
wrote myself, where it got things wrong, and how I caught it — so the "got it wrong"
entries are the point of this file, not an appendix to it.

**Tool:** Claude Code (Claude Opus 5), used interactively from the terminal.

**How I've been working with it:** I make the calls that shape the system — stack, storage,
auth model, what is in and out of scope — and Claude does the reading, the scaffolding, and
the verification runs. Where it proposed a design decision I made it justify the choice
before accepting it, and where I left a decision open it had to state a recommendation and
a reason rather than ask again.

---

## M0 — Foundation

### What AI did

- Read the case PDF and the sample dataset, and summarised the corpus shape (142 markdown
  files, no front matter, `#`/`##` structure, dates and types encoded in the paths).
- Drafted `PROJECT.md`: goals, scope, architecture, the decisions table, data model,
  milestones, risks.
- Wrote the workspace scaffolding, `packages/shared` zod schemas, and the `packages/rag`
  port interfaces.
- Ran the M0 verification spikes and reported the numbers below.

### What I decided

- Monorepo shape (separate web / api / mcp over shared packages, rather than a single
  Next.js app) and the auth model (own JWT + argon2id rather than a hosted provider),
  because security and architecture are separately graded and I want to be able to defend
  both line by line.
- That the chat model must sit behind a swappable port — I may want to compare providers.
- Vector store and embedder were left to Claude's recommendation, with reasons given:
  SQLite + `sqlite-vec` for zero-infra setup, local embeddings so the reviewer needs one
  API key instead of two.

### Where it got things wrong

**1. `vec0` rowids need `BigInt`.** The first storage spike Claude wrote inserted vectors
with a plain JS number as the primary key and failed with
`Only integers are allows for primary key values on vec_chunks`. better-sqlite3 binds JS
numbers as doubles, and `vec0` rejects that. _Caught by:_ running the spike instead of
assuming it worked — this was exactly why the spike existed. Fixed by binding `BigInt(id)`.
Worth remembering, because the same mistake in the real ingestion path would fail only once
the first vector is written.

**2. TypeScript 7 broke the lint step.** Claude checked the registry, saw `typescript@7.0.2`
as `latest`, and pinned it. `tsc --build` passed, so nothing looked wrong — but
`npx eslint .` then failed outright with `typescript-eslint does not support TS 7.0`.
_Caught by:_ running lint and format in M0 rather than treating "typecheck passes" as done.
Pinned to TypeScript 6.0.3, the newest version the whole toolchain agrees on. The general
lesson: "latest on npm" is not the same as "supported by the toolchain", and only the
verification run tells you which.

**3. Misread exit codes.** While verifying, Claude piped tool output through `grep -v` and
reported the pipeline's exit code, so a clean run appeared as `typecheck exit=1`. It was
`grep` reporting "no lines matched". _Caught by:_ the number not matching the (empty)
output. Re-run capturing each exit code directly: `typecheck=0 lint=0 prettier=0`. Nothing
was actually broken, but it briefly looked like it was — a reminder that a verification
step that can lie about its own result is worse than no verification step.

### Findings from the M0 spikes

Both native dependencies were tested before anything was built on top of them:

| Spike                                                      | Result                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `better-sqlite3` + `sqlite-vec` install (Windows, Node 24) | Prebuilt binaries, ~3 s, no compiler needed                               |
| `vec0` KNN + FTS5 BM25 + both in one transaction           | Work as designed (sqlite 3.53.4, vec v0.1.9)                              |
| `bge-small-en-v1.5` via transformers.js                    | 384 dims, 26 ms for 3 texts; relevant pair scored 0.75 vs irrelevant 0.50 |

Two things surfaced that neither of us predicted:

- **FTS5 tokenization vs. identifiers.** A BM25 search for `lumen` does not match
  `LumenSDK.init`, because the default `unicode61` tokenizer keeps `LumenSDK` as a single
  token. For a corpus this full of identifiers (`lumen.track`, `first_interaction`,
  `cta_click`) that is a real recall gap in the keyword half. Deferred to M3 to tune
  against the eval rather than guessed at now.
- **npm 12 blocks install scripts by default**, so `onnxruntime-node`'s postinstall never
  ran. Embeddings work anyway, but this is exactly the kind of thing that breaks a
  "works on a fresh machine" claim, so it belongs in the README.
