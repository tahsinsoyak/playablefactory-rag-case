# AI Usage Log

Kept as the work happens, not reconstructed afterwards. The case asks what AI did, what I
wrote myself, where it got things wrong, and how I caught it, so the "got it wrong"
entries are the point of this file, not an appendix to it.

**Tool:** Claude Code (Claude Opus 5), used interactively from the terminal.

**How I've been working with it:** I make the calls that shape the system, stack, storage,
auth model, what is in and out of scope, and Claude does the reading, the scaffolding, and
the verification runs. Where it proposed a design decision I made it justify the choice
before accepting it, and where I left a decision open it had to state a recommendation and
a reason rather than ask again.

---

## M0: Foundation

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
- That the chat model must sit behind a swappable port. I may want to compare providers.
- Vector store and embedder were left to Claude's recommendation, with reasons given:
  SQLite + `sqlite-vec` for zero-infra setup, local embeddings so the reviewer needs one
  API key instead of two.

### Where it got things wrong

**1. `vec0` rowids need `BigInt`.** The first storage spike Claude wrote inserted vectors
with a plain JS number as the primary key and failed with
`Only integers are allows for primary key values on vec_chunks`. better-sqlite3 binds JS
numbers as doubles, and `vec0` rejects that. _Caught by:_ running the spike instead of
assuming it worked. This was exactly why the spike existed. Fixed by binding `BigInt(id)`.
Worth remembering, because the same mistake in the real ingestion path would fail only once
the first vector is written.

**2. TypeScript 7 broke the lint step.** Claude checked the registry, saw `typescript@7.0.2`
as `latest`, and pinned it. `tsc --build` passed, so nothing looked wrong, but
`npx eslint .` then failed outright with `typescript-eslint does not support TS 7.0`.
_Caught by:_ running lint and format in M0 rather than treating "typecheck passes" as done.
Pinned to TypeScript 6.0.3, the newest version the whole toolchain agrees on. The general
lesson: "latest on npm" is not the same as "supported by the toolchain", and only the
verification run tells you which.

**3. Misread exit codes.** While verifying, Claude piped tool output through `grep -v` and
reported the pipeline's exit code, so a clean run appeared as `typecheck exit=1`. It was
`grep` reporting "no lines matched". _Caught by:_ the number not matching the (empty)
output. Re-run capturing each exit code directly: `typecheck=0 lint=0 prettier=0`. Nothing
was actually broken, but it briefly looked like it was, a reminder that a verification
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

---

## M1: Auth spine

**What AI did:** wrote the schema and migrations, argon2id hashing, JWT issuing and
verification, the refresh-token rotation logic, the route handlers, and the test suite.

**What I decided:** that this milestone gets tested properly rather than eyeballed, because
security is separately graded and I have to defend it line by line in the walkthrough. Also
that the demo credentials live in `.env` rather than hard-coded, so a reviewer can change
them.

**Where it went well, and worth calling out as a review of the AI rather than a rubber
stamp:** several of the security properties here came from Claude proposing them and
justifying the reason. The decoy hash so a login for a nonexistent address costs the same
argon2 work as a real one, and revoking the whole token family on reuse of a rotated refresh
token. I kept both because the reasoning held up, not because they sounded good. The one I
pushed on was scoping the refresh cookie to `/auth`; the justification, a long-lived
credential should not ride along on every request, is sound, so it stayed.

**What I checked myself:** that the tests actually fail when the protection is removed, not
just that they pass. A test asserting 403 is worthless if it would also pass with the guard
deleted.

## M2: Ingestion

**What AI did:** corpus loader, metadata extraction, the heading-aware chunker, the local
embedder, the SQLite store, the incremental ingestion pass, and 13 tests.

**Where it got things wrong:**

**4. Deleting a document would have left orphaned vectors.** The first version of the store
relied on `on delete cascade` to clean up. That works for `chunks` and `chunk_rowids`, but
`vec_chunks` and `chunks_fts` are virtual tables with no foreign keys, nothing would have
cascaded, and deleted documents would have kept surfacing in search results with their text
already gone. _Caught by:_ writing a test that asserts all three counts return to zero after
a removal, rather than only checking that the `chunks` table emptied. That test exists
precisely because the invariant is invisible from the outside.

**5. A partial answer on the FTS5 tokenizer.** The M0 spike found that `LumenSDK` stays one
token, and the fix landed in M2 as `tokenize = "unicode61 tokenchars '.-_'"`. What was not
initially checked is whether it actually helped on the real corpus, that was verified
afterwards by running a keyword search for `lumen.track` against the live index and
confirming it now matches the meeting notes that mention it. A config change that is never
exercised is a guess wearing a comment.

## M3: Retrieval and grounded answers

**What AI did:** RRF fusion, the Anthropic adapter, the grounding prompt, the answer
service, the API routes, and the eval harness.

**Where it got things wrong. The most instructive one in this project:**

**6. The refusal gate thresholded a number that carries no relevance information.** The
first implementation refused when the top fused RRF score fell below a floor, with a
plausible-sounding comment deriving the constant from `1/(60 + rank)`. It was wrong in a way
that reads as correct. RRF scores come from _ranks_, so something always ranks first: the
eval showed "how much do senior developers get paid?" scoring 0.0328, byte-identical to the
best genuine question, and **all three out-of-corpus probes passed the gate**. A system
described as refusing honestly would in fact have answered every one of them.

_Caught by:_ the eval harness, on its first run, because it scored the out-of-corpus probes
as explicit cases rather than assuming refusal worked. This is the strongest argument in the
project for building the eval before trusting retrieval: no amount of reading that code
would have revealed it, and manual spot-checks of the five sample questions would all have
passed.

_Fixed by:_ gating on cosine similarity, which is absolute, and measuring the two
populations instead of guessing a constant. Answerable questions land at 0.621–0.827,
out-of-corpus probes at 0.461–0.487, so the floor sits at 0.55 in the empty band between
them. A test now asserts that separation still holds.

_Second-order consequence I had to decide:_ this made keyword-only answering impossible to
gate, since BM25 has no calibrated scale. Rather than ship a mode whose grounding guarantee
was quietly weaker, `/answer` now rejects it at the schema.

**7. Two commits pushed with a failing check.** Twice I read the output of `npm run lint`,
saw a failure, and pushed anyway because the shell chain continued past it. Both were
trivial, an unused variable, a type error in a test, but the process failure is the point:
the verification step was being _printed_ rather than _gated on_. Fixed by making the commit
conditional on all three checks exiting zero. Recorded here because a reviewer reading the
git history will see the two follow-up fix commits, and the honest explanation is process,
not bad luck.

## M4: Web app

**What AI did:** the Next.js app. Login, chat with SSE streaming and citation highlighting,
the dashboard, and the server-side page guards.

**Where it got things wrong:**

**8. An open redirect in the login flow.** The login page read a `next` query parameter and
redirected to it after authenticating, with no check on where it pointed. A link like
`/login?next=https://evil.example` would have bounced a freshly authenticated user off-site.
_Caught by:_ reading the redirect logic specifically looking for this, because a post-auth
redirect is a known place for it. Fixed by accepting only paths starting with a single `/`.

**9. A stale server misled a verification run.** While testing the search endpoint I got a
404 and briefly went looking for a routing bug. The API process on port 4000 was one started
an hour earlier, before those routes existed. _Caught by:_ checking the process rather than
the code. The lesson is verification hygiene. A passing or failing test against the wrong
build tells you nothing either way.

**Also worth stating plainly:** the UI has not been checked visually. The Chrome extension
was not connected in this environment, so responsiveness and layout were verified by reading
the markup and the Tailwind breakpoints, and through HTTP responses, not by eye. That is a
real gap in the verification, not a formality.

## M5: MCP server

**What AI did:** the server, the tool definition, and two verification paths.

**What I decided:** that "it compiles" is not evidence an MCP server works. It is verified
twice. Once with a real MCP `Client` over an in-memory transport pair, and once by driving
the shipped stdio entry point with raw line-delimited JSON-RPC, which is what an actual
client does.

**A good call by the AI:** opening the database read-only for the MCP process, so a client
can search but structurally cannot modify the corpus. Enforced by the connection rather
than by which tools happen to be registered.

## M6: Documentation

**Where it got things wrong:**

**10. Every configured path resolved against the wrong directory.** The README documented
`npm run seed` and `npm run ingest` from the repo root. Running them to check the
documentation was accurate, both failed: npm sets a workspace script's cwd to that
workspace, so `./corpus` resolved to `apps/api/corpus`. The MCP server had it worse, an
external client launches it with an arbitrary cwd, so it could not reliably find the index
at all. _Caught by:_ running the README's own commands instead of assuming they worked
because the underlying code did. Fixed by anchoring paths to the workspace root. Notably,
that root-walking helper got written twice before being consolidated, duplication lint
cannot catch and a reader would have to spot.

## Post-M6: finishing passes

**11. `npm run dev` never started the web app on Windows.** The root script was
`npm run dev -w api & npm run dev -w web`. On Linux and macOS `&` backgrounds the first
command; npm on Windows runs scripts through `cmd.exe`, where `&` is a _sequential_
separator, so the API started, blocked forever, and the web server was never reached, and
this was the README's headline "run both at once" instruction. _Caught by:_ actually running
it, after the README claimed it worked. A one-line probe confirmed the shell semantics
rather than assuming them.

_Fixed by:_ a small `scripts/dev.mjs` that spawns both, prefixes their output, and stops
both on Ctrl+C. Getting there took two more corrections, both Windows-specific and both
found by running it again: spawning `npm.cmd` fails outright on Node 24 (`spawn EINVAL`,
because Node now refuses to launch a `.cmd` shim without a shell), and passing arguments
with `shell: true` triggers a deprecation warning that would greet the reviewer on every
start (DEP0190, arguments concatenated unescaped). Both disappear when the JS entry points
are run with `node` directly, which also needs no new dependency.

**12. Route protection was asserted for one endpoint, not the set.** The M1 tests proved a
regular user gets 403 from `/admin/users`. Seven other admin routes had no such test, so the
protection was really only verified where someone had remembered to look. Replaced with a
table-driven suite covering every admin route for both anonymous and regular-user callers,
plus a positive case proving an admin still gets through, otherwise a route broken for
everyone would pass as "correctly refused". That immediately found `/index/health` returning
500 under test: it reads the corpus from disk, and the test config's relative `CORPUS_DIR`
resolved against the workspace rather than the repo root. The same class of bug as
correction 10, in the one place I had not looked.

The test fixture was also duplicated verbatim across the two suites before being factored
into `test-support.ts`. A fixture that drifts between suites is worse than none, because the
suites quietly stop testing the same system.

**13. A fresh clone could not run at all. The most important bug in the project.** With
everything else finished and verified, I cloned the repository into a clean directory and
followed the README literally. `npm run seed` failed immediately:
`Cannot find module '@corpus/rag'`.

The three apps import the shared packages by name, which resolve to each package's `dist/`.
`dist/` is gitignored build output, so on a clean checkout it does not exist. My working
copy had those directories from earlier builds. Meaning **every command I had verified
passed for a reason that would not exist on the reviewer's machine**. Nothing about the code
was wrong; the environment I tested in was quietly different from the one described.

_Caught by:_ cloning into a clean directory. There was no other way, testing in place
cannot find this, because the thing that is missing is exactly the thing my directory
already had. _Fixed by:_ a root `prepare` script, which npm runs automatically after
install.

This is the entry I would point at if asked what AI assistance is worst at. Every earlier
correction was a mistake in something written; this one was an unexamined assumption about
the world the code would run in, and it invalidated the verification of every step that came
before it.

### Final fresh-clone verification

The whole thing was then re-run from a second clean clone, following only the README:

| Step                     | Result                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `npm install`            | 334 packages, 43s; packages built automatically via `prepare` |
| `npm run seed`           | both demo accounts created                                    |
| `npm run ingest`         | 142 documents indexed in 25.6s, including the model download  |
| `npm run eval`           | hybrid hit@8 100%, MRR 1.000, 3/3 out-of-corpus refused       |
| `npm test`               | 56 tests, 0 failures                                          |
| MCP smoke test           | tool listed and called, correct document returned             |
| `npm run dev`            | both servers up; sign-in, chat page, and search all working   |
| Dashboard as normal user | 404, as designed                                              |

**14. The chat page could never have worked in a browser.** Everything was verified with
curl, which does not enforce CORS. `/answer` writes its response head with
`reply.raw.writeHead` for the SSE stream, and that discards every header Fastify had
staged - including the CORS headers set by the onRequest hook, so the streamed response
went out with no `Access-Control-Allow-Origin`, the browser blocked it, and the chat page
failed with a bare "Failed to fetch". Every other route was fine, because they return
through Fastify normally; only the one route that bypasses it was broken.

_Caught by:_ the user opening the app and telling me. Nothing I ran could have found it -
curl saw a perfectly healthy stream, the tests passed, the build was clean. This is the
concrete cost of the gap I had been flagging in every summary: no browser was available in
this environment, so a whole class of defect was invisible.

_Fixed by:_ copying whatever the hook staged onto the raw head, rather than restating the
header names, so the fix survives a change to the CORS rules. Added four regression tests
that assert CORS headers on the preflight, on a normal JSON response, on the SSE response,
and their absence for an unknown origin - `app.inject` is a client that cares about
headers, which curl is not. Also relaxed the allowed origin to any loopback host in
development, since Next prints a LAN URL next to the localhost one and opening either is
reasonable; production still matches WEB_ORIGIN exactly.

The lesson generalises past this bug: "I verified it" is only as strong as the client used
to verify. A tool that ignores the rule you depend on cannot test that rule.

**15. Light mode never shipped.** The design tokens declared the light palette in `@theme`
and then a second `@theme` inside `@media (prefers-color-scheme: dark)`. `@theme` may only
appear at the top level, so rather than conditionally overriding, the dark block replaced
the light palette outright: the served stylesheet contained the dark values and not a single
light one. Anyone on a light-themed OS would have seen a dark-only app.

_Caught by:_ not trusting the build. `next build` passed, typecheck passed, nothing warned.
So I fetched the stylesheet the dev server actually serves and grepped it for the light
surface colour. Zero occurrences. _Fixed by:_ overriding the variables on `:root` under the
media query instead of redeclaring `@theme`.

Same root cause as correction 14, in a different costume: a build that succeeds is not
evidence that the output is right, and with no browser available the only way to check is to
inspect the artifact that actually gets served.

**Brand colour.** The accent is `#E8730C`, extracted from the case PDF's own content stream
rather than eyeballed from a screenshot. It is the exact fill used for its headings. It
ships as two tokens because one will not do both jobs: as a fill under near-black ink it
reaches 5.8:1, but as text on a light surface it is 2.9:1 and fails AA, so the text token is
a deepened `#B35708` at 4.9:1, lightened to `#F2853A` on dark. Every ratio was computed.

## Bonus: MCP authentication via OIDC

**What I decided:** that the provider had to be bundled rather than delegated to Auth0 or
Keycloak. The case is graded on running from the README on a fresh machine, and an external
identity provider means an account, a tenant, and a set of secrets a reviewer has to create
before anything works. A small self-contained provider keeps that promise, and because the
resource server verifies through discovery and JWKS rather than anything local, pointing it
at a real provider is a change of one environment variable.

**What AI did:** wrote the signing key handling, the token endpoint, the client registry,
the JWKS-backed verifier, the Streamable HTTP transport, and the tests.

**Two decisions worth defending in the walkthrough.** RS256 rather than the HS256 the app
uses for its own session cookies, because the token is verified by a _different process_: a
shared secret would give the MCP server the power to mint tokens as well as check them,
where a public key lets it only verify. And RFC 8707 resource indicators, so a token is
minted for `http://localhost:4100/mcp` specifically and cannot be replayed against the main
API if it leaks. There is a test for exactly that.

**Where it got things wrong:** two assertions in the new tests looked for the words
"audience" and "issuer" in the rejection message, but jose reports `unexpected "aud" claim
value`. The tokens were being rejected correctly the whole time; the tests were checking for
the wrong string, which is the kind of failure that looks like a product bug for about a
minute. _Caught by:_ reading the actual assertion output rather than assuming a red test
meant broken code.

## Bonus: reranking

**What I decided:** to widen the eval before touching retrieval. The five sample questions
scored MRR 1.000, so any change would have been invisible against them, and shipping a
reranker on that basis would have been adding complexity on faith. The set went to 26 cases
in three groups, including paraphrases that deliberately avoid the corpus's own vocabulary,
which is where a better ranker has room to show itself.

That decision paid for itself immediately: on the wider set, hybrid retrieval scores MRR
0.717 rather than 1.000. The headroom was there all along; the old eval was just too easy to
see it.

**Three things the measurement changed.**

**16. The relevance floor was refusing a real question.** The floor was 0.55, tuned when the
only data was five questions phrased in the corpus's own words (0.621 to 0.827) against
probes (0.461 to 0.487). Paraphrased questions land much closer to the probes: answerable
cases now run 0.548 to 0.827, and the hardest one scored 0.5479, just under the floor. It
was being refused even though retrieval had ranked the correct document first. _Caught by:_
reading the per-case cosine column in the new report rather than only the summary. A false
refusal is a quieter failure than a hallucination and, on a question the corpus does answer,
just as wrong. Floor moved to 0.51, with the guard test updated to the re-measured
populations.

**17. Overriding the ranking with the reranker was worse than fusing it in.** The obvious
implementation replaced the fused order with the cross-encoder's. That gave the best MRR of
any configuration (0.893 on sample) and the worst hit rate: it pushed a correct document out
of the top 8 entirely, which on the answer path means a false refusal. Fusing the reranker in
as a third ranking, through the same RRF already used for vector and keyword, reaches 100%
hit on sample and MRR 0.815. _Caught by:_ reporting hit rate alongside MRR. Had the eval
tracked only MRR, the worse configuration would have looked like the better one.

**18. One of my own eval questions was unanswerable.** "Why is a developer not allowed to
approve their own team's work?" looked like a fair paraphrase. Retrieval found the right
document at rank 2, the model was given it, and it correctly refused: the corpus states the
rule and never gives a reason for it. The case was measuring my question, not the system.
_Caught by:_ chasing a refusal that looked like a bug and reading the source document.
Reworded to something the corpus actually answers, with the reason recorded next to it.

## Bonus: answer-quality scoring

**What I decided:** that most of this should not use a model at all. Whether "5 MB" appears
in the text an answer cited is a string search, and paying a model to have an opinion about
it would add cost, latency, and a source of disagreement to a question with a definite
answer. So the deterministic checks run first, and the judge is asked only the part that
genuinely needs judgement.

The grounding check compares the answer's figures against the passages it _cited_, not
against everything retrieved. An answer citing document A while taking its numbers from
document B is not grounded in what it claimed, and that distinction is the whole point.

**Where it got things wrong:**

**19. The judge was right and the harness was lying to it.** Three answers came back marked
UNFAITHFUL, with the judge reporting citations like `[7]` as fabricated. They were not: the
harness handed the judge only the _cited_ passages, renumbered from one, while the answer's
markers referred to the original numbering across everything retrieved. In the list the judge
had been given, `[7]` genuinely did not exist. Fixing the numbering moved the mean score from
4.62 to 4.92 and unfaithful verdicts from 3 to 0. _Caught by:_ reading all three verdicts
instead of the summary, and noticing they were the same complaint. Three independent
"hallucinations" that are all the same shape are usually one bug in the measurement.

**20. The citation metric punished correct behaviour.** Precision read 76% largely because
`expected` named a single document, so an answer citing the deprecated SDK note alongside the
current one was marked down, even though the case explicitly says a good answer should mention
the deprecation. Added an `acceptable` list for documents that legitimately support an answer.
This is a metric loosened after seeing results, which deserves suspicion, so the constraint is
recorded next to it: documents that merely mention the subject stay unlisted and still cost
precision. Six delivery reports for "who is the client" is over-citation, not context, and
still scores as such.

**A note on what these numbers are worth.** The judge is `claude-sonnet-5` and the answering
model is `qwen3.7-flash`, deliberately different, because a model grading its own output rates
it generously. The judge also never sees which document was expected. Both are recorded in the
report so a reader can check the setup rather than take 4.92 on faith, and the eval now
refuses to run at all if the two models match, rather than trusting the default to stay right.

**What I decided after checking:** the same answers scored 5.00 of 5 under `openai/gpt-4o-mini`,
a different vendor. Both judges agree every answer is faithful, which is the useful agreement.
But the cheaper judge deducted nothing anywhere, and a judge that never deducts cannot detect a
regression, so the stricter model stays the default. That is the reason to prefer it, not that
its number is lower.

---

## Overall

**What AI was genuinely good at:** volume with consistency, thirty-odd files sharing one
error-handling style, one validation approach, one naming convention. Recalling security
practices worth having (the decoy hash, refresh-token reuse detection, the
`httpOnly`/`sameSite`/path combination). Writing tests that assert the _invariant_ rather
than the current output, once pointed at what actually mattered.

**Where it needed watching:** confident wrongness that reads as correct. The RRF threshold is
the clearest case. A well-named constant, a comment deriving it from real arithmetic, and
completely wrong about what the number meant. Nothing in the code looked off.

**The pattern across all ten corrections:** every one was caught by something that could
return an unexpected answer. A spike, a test, an eval, a real HTTP request, running the
documented command. None were caught by re-reading code. That shaped how the project was
built: the native dependencies were proven in M0 before anything depended on them, and the
eval existed before retrieval quality was claimed anywhere.
