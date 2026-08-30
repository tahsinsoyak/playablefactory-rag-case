# Answer quality

Generated 2026-08-30T22:12:36.919Z · answering with `qwen/qwen3.7-flash` · judged by `anthropic/claude-sonnet-5`

The retrieval eval measures whether the right passages come back. This measures what is
done with them. Deterministic checks run first and cost nothing: they catch a citation
pointing at the wrong document, a refusal on a question the corpus answers, and a figure
that appears in none of the passages the answer cited. A judge model is only asked the
part that genuinely needs an opinion.

## Deterministic

| Measure                             | Result                |
| ----------------------------------- | --------------------- |
| Answer-or-refuse decision correct   | **100%** (26 cases)   |
| Citation precision                  | 83%                   |
| Citation recall                     | 90%                   |
| Figures traceable to cited passages | **100%** (18 checked) |
| Median end-to-end latency           | 3594 ms               |

## Judged

Answers came from `qwen/qwen3.7-flash`; the judge is `anthropic/claude-sonnet-5`. They are
different models, and the eval refuses to run if they are not.

The judge sees the question, the cited passages, and the answer. It is never told which
document was expected, so it scores support by the evidence rather than agreement with a
label. It runs as `anthropic/claude-sonnet-5`, chosen to differ from the answering model where
possible: models rate their own output generously.

| Measure                           | Result       |
| --------------------------------- | ------------ |
| Faithful (every claim traceable)  | **26/26**    |
| Relevant (answers what was asked) | **26/26**    |
| Mean score                        | **4.92 / 5** |

## Per case

### What is the maximum file size for an AppLovin playable, and how does it ship?

_must cite network-specs-applovin.md_

- decision: **correctly answered**
- cited: network-specs-applovin.md
- citation precision 100%, recall 100%
- figures: 1/1 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately states the 5 MB limit and single self-contained inlined HTML file delivery format, both directly supported by passage 1.

> AppLovin playables ship as a single self-contained HTML file with all assets inlined (base64), and the maximum allowed file size is 5 MB [1].

### How do I initialize the current Lumen SDK, and what happened to lumen.track?

_must cite sdk-notes-v3.md_

- decision: **correctly answered**
- cited: sdk-notes-v3.md, sdk-notes-v2.md
- citation precision 100%, recall 100%
- figures: 2/2 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects the initialization method and the fate of lumen.track as described in passages 1 and 2, and directly answers both parts of the question.

> To initialize the current SDK (v3), call `LumenSDK.init(config)` before any game code runs [1]. The `lumen.track` function belongs to the deprecated v2 SDK; in v3, those legacy calls are not recognized and fail silently [1][2].

### Why are sound assets built in a separate pass?

_must cite build-pipeline.md_

- decision: **correctly answered**
- cited: build-pipeline.md
- citation precision 100%, recall 100%
- figures: 1/1 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately restates the reason given in passage 1 for the separate sound build pass.

> Sound assets are built in a separate pass because compressing them together with textures produced nondeterministic size spikes that broke the AppLovin 5 MB limit on roughly one build in ten [1].

### What caused the March 2026 AppLovin rejections and what was fixed?

_must cite incident-postmortem-2026-03.md_

- decision: **correctly answered**
- cited: incident-postmortem-2026-03.md, changelogs/lumen-build-4.2.md
- citation precision 100%, recall 100%
- figures: 4/4 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: All claims about the root cause and fixes are directly supported by passages 1 and 5, and the answer directly addresses the question.

> The March 2026 rejections were caused by a lumen-build update that changed the order of the compress and inline stages, causing audio to be compressed with textures instead of in its dedicated pass [1]. This added 0.4 to 1.1 MB to audio-heavy playables, pushing them over the 5 MB limit because the internal size check ran before inlining [1].
>
> The fixes reverted the unified compression path so audio returns to its dedicated pass, updated the verify stage to measure the final inlined artifact instead of the pre-inline bundle, pinned stage order in CI, and added a regression test that builds the three heaviest historical playables on every pipeline change [1][5].

### Which languages must every playable ship with, and what is the fallback?

_must cite localization-guide.md_

- decision: **correctly answered**
- cited: localization-guide.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer correctly lists the minimum language set and fallback exactly as stated in passage 1.

> Every playable must ship with English, Spanish, Portuguese, German, French, Japanese, and Korean. English is used as the fallback when auto-detection fails or the device locale is unsupported [1].

### Who is the client for Merge Marina?

_must cite client-briefs/merge-marina.md_

- decision: **correctly answered**
- cited: delivery-reports/2025-09-merge-marina.md, delivery-reports/2025-12-merge-marina.md, delivery-reports/2026-02-merge-marina.md, client-briefs/merge-marina.md, delivery-reports/2026-06-merge-marina.md, delivery-reports/2025-10-merge-marina.md
- citation precision 17%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer correctly identifies BlueHarbor Interactive as the client, directly supported by multiple passages.

> The client for Merge Marina is BlueHarbor Interactive [1][2][3][6][7][8].

### What caused the November 2025 analytics leak?

_must cite postmortems/2025-11-analytics-leak.md_

- decision: **correctly answered**
- cited: postmortems/2025-11-analytics-leak.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects the root cause stated in passage 2 and directly answers the question.

> The root cause was a debug flag left enabled, which caused the analytics buffer to flush to the staging endpoint at runtime, bypassing the export-time strip [2].

### What changed in lumen-build 4.2?

_must cite changelogs/lumen-build-4.2.md_

- decision: **correctly answered**
- cited: changelogs/lumen-build-4.2.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately lists the three changes from passage 1's lumen-build 4.2 changelog without adding unsupported claims.

> - Reverted the unified compression path: audio returns to its dedicated pass [1].
> - Verify stage now measures the final inlined artifact instead of the pre-inline bundle [1].
> - Stage order pinned in CI; regression suite builds the three heaviest historical playables on every pipeline change [1].

### How should asset files be named?

_must cite guides/asset-naming.md_

- decision: **correctly answered**
- cited: guides/asset-naming.md
- citation precision 100%, recall 100%
- figures: 2/2 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects the naming convention stated in passage 1 and directly answers the question.

> All assets should follow the `pod_game_asset_variant` format in lower snake case (e.g., `nova_bubblebakery_tile_croissant`) [1].

### Who runs the delivery review?

_must cite guides/review-process.md_

- decision: **correctly answered**
- cited: guides/review-process.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects passage 4's statement about who runs the delivery review.

> The delivery review is run by a developer from a different pod, never the author's own pod [4].

### Who owns communication during an incident?

_must cite guides/incident-process.md_

- decision: **correctly answered**
- cited: guides/incident-process.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer directly and accurately reflects passage 1's statement that the pod producer owns communication during an incident.

> The pod producer owns communication during an incident [1].

### What has to be done before every client delivery?

_must cite qa-checklist.md_

- decision: **correctly answered**
- cited: guides/review-process.md, qa-checklist.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: All claims accurately reflect passages 1 and 2 regarding required reviews and the QA checklist before client delivery.

> Before every client delivery, two internal reviews must be passed: a design review at the first playable build and a delivery review after QA (conducted by a developer from a different pod) [1]. Additionally, a Pre-Delivery QA Checklist must be run with no exceptions [2]. The checklist requires verifying eight specific criteria:
>
> 1. Size check per target network [2].
> 2. First interaction reachable within 3 seconds [2].
> 3. No outbound requests in AppLovin builds and analytics stripped [2].
> 4. Orientation switching mid-session does not break layout [2].
> 5. All minimum languages render, fallback to English works, and no glyphs are missing [2].
> 6. End card CTA fires the correct network handler [2].
> 7. Mute state is respected and no audio autoplays before the first interaction [2].
> 8. No memory growth occurs after three full loops of the playable [2].
>
> If any checklist item fails, the delivery is blocked [2]. The pod developer must also attach the completed checklist result to the delivery ticket [2].

### What is the primary engagement metric?

_must cite analytics-events.md_

- decision: **correctly answered**
- cited: analytics-events.md
- citation precision 100%, recall 100%
- figures: 2/2 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer correctly states the primary engagement metric as defined in passage 1.

> The primary engagement metric is the time from `load_complete` to `first_interaction` [1].

### What went wrong with Korean text in July 2025?

_must cite postmortems/2025-07-localization-regression.md_

- decision: **correctly answered**
- cited: postmortems/2025-07-localization-regression.md
- citation precision 100%, recall 100%
- figures: 1/1 traceable
- judge: **4/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects passage 1's postmortem about missing Korean glyphs from a font subsetting change, matching the July 2025 event, though it omits the separate July 2025 Korean line-break issue noted in passage 8.

> In July 2025, three deliveries shipped with missing Korean glyphs because a font subsetting change trimmed characters that were only used in the fail-state copy [1].

### How big can an ad creative get before that network turns it down?

_must cite network-specs-applovin.md_

- decision: **correctly answered**
- cited: incident-postmortem-2026-03.md, network-specs-applovin.md, network-specs-unity-meta.md
- citation precision 33%, recall 100%
- figures: 3/3 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects the size limits stated in passages 5 and 8 and correctly notes the absence of ironSource limits in the corpus.

> - AppLovin: 5 MB for the final single HTML file [3][5].
> - Unity: 5 MB archive limit, up to 10 MB after unzip [8].
> - Meta: 2 MB for the single HTML file [8].
> - ironSource: The provided corpus does not specify a size limit for this network.

### Someone left a debugging switch on and data went somewhere it should not have. What did we change?

_must cite postmortems/2025-11-analytics-leak.md_

- decision: **correctly answered**
- cited: postmortems/2025-11-analytics-leak.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects the fix described in passage 1, directly addressing the debug-flag data leak question.

> The export now hard-fails if any network transport is reachable from the bundle when the target network forbids runtime requests; debug flags are stripped by the export profile rather than by convention [1].

### Can someone sign off on work made by their own team?

_must cite guides/review-process.md_

- decision: **correctly answered**
- cited: delivery-reports/2025-07-rooftop-dash.md, delivery-reports/2025-06-rooftop-dash.md, delivery-reports/2026-02-tidal-tycoon.md, delivery-reports/2026-04-cinder-keep.md, delivery-reports/2026-01-tidal-tycoon.md, delivery-reports/2025-07-tidal-tycoon.md
- citation precision 0%, recall 0%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects the repeated statement across delivery reports that review is run by a developer outside the pod, correctly answering that own-team sign-off is not the process.

> According to the delivery reports, the delivery review must be run by a developer outside the pod, meaning work cannot be signed off by someone from their own team [1][2][3][5][6][7].

### How quickly do we have to write up something that went wrong?

_must cite guides/incident-process.md_

- decision: **correctly answered**
- cited: guides/incident-process.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer correctly cites the five-business-day postmortem requirement from passage 2, directly answering the question.

> Every incident requires a postmortem to be written up within five business days [2].

### What number tells us whether players start playing quickly?

_must cite analytics-events.md_

- decision: **correctly answered**
- cited: client-briefs/orbit-golf.md, delivery-reports/2025-05-puzzle-pier.md
- citation precision 0%, recall 0%
- figures: 2/2 traceable
- judge: **4/5**, faithful yes, relevant yes
- judge says: The answer correctly identifies 'time to first interaction' as the metric and cites supported figures from the passages, though citing [1] alongside all the other briefs with the same requirement is a minor oversimplification.

> The "Time to first interaction" metric tracks this, with the delivery report citing 3.4 s and 2.6 s, and client briefs requiring it to be within 3 seconds [8][1].

### Where do audio files go, and what must they stay out of?

_must cite guides/asset-naming.md_

- decision: **correctly answered**
- cited: guides/asset-naming.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects passage 1's statement that audio files live under audio/ and never inside texture folders.

> Audio files live under the `audio/` directory and must never be placed inside texture folders [1].

### Which ad networks is the merge game aimed at?

_must cite client-briefs/merge-marina.md_

- decision: **correctly answered**
- cited: client-briefs/merge-marina.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: Passage 1 explicitly states Merge Marina's target networks are ironSource and Unity, matching the answer.

> The merge game is aimed at ironSource and Unity [1].

### What is the company vacation policy?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: The passages contain no information about vacation policy, so the answer correctly declines.

> The corpus does not contain anything relevant to that question.

### How much do senior developers get paid?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: The passages contain no salary information, so declining is faithful and appropriately relevant.

> The corpus does not contain anything relevant to that question.

### What health insurance plan does the company offer?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: The passages contain no information about health insurance, and the answer correctly declines to answer.

> The corpus does not contain anything relevant to that question.

### What is the office wifi password?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: The passages contain no information about office wifi passwords, and the answer correctly declines to answer while accurately noting this.

> The corpus does not contain anything relevant to that question.

### Who won the 2022 football world cup?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: The passages are unrelated delivery reports and contain no information about the World Cup, so the decline to answer is correct and appropriate.

> The corpus does not contain anything relevant to that question.
