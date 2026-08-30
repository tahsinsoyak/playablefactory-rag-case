# Answer quality

Generated 2026-08-30T21:59:59.625Z · answering with `qwen/qwen3.7-flash` · judged by `anthropic/claude-sonnet-5`

The retrieval eval measures whether the right passages come back. This measures what is
done with them. Deterministic checks run first and cost nothing: they catch a citation
pointing at the wrong document, a refusal on a question the corpus answers, and a figure
that appears in none of the passages the answer cited. A judge model is only asked the
part that genuinely needs an opinion.

## Deterministic

| Measure                             | Result                |
| ----------------------------------- | --------------------- |
| Answer-or-refuse decision correct   | **100%** (26 cases)   |
| Citation precision                  | 79%                   |
| Citation recall                     | 90%                   |
| Figures traceable to cited passages | **100%** (17 checked) |
| Median end-to-end latency           | 3891 ms               |

## Judged

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
- judge says: The answer correctly states the 5 MB limit and single self-contained inlined HTML file format, matching passage 1.

> AppLovin playables ship as a single self-contained HTML file with all assets inlined (base64), and the maximum allowed file size is 5 MB [1].

### How do I initialize the current Lumen SDK, and what happened to lumen.track?

_must cite sdk-notes-v3.md_

- decision: **correctly answered**
- cited: sdk-notes-v3.md, sdk-notes-v2.md
- citation precision 100%, recall 100%
- figures: 2/2 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects passage 1's description of LumenSDK.init and the fate of lumen.track calls in v3, correctly citing supporting passages.

> To initialize the current SDK (v3), call `LumenSDK.init(config)` before any game code runs [1]. The `lumen.track` method belongs to the deprecated v2 SDK; in v3, these legacy calls are not recognized and fail silently [1][2].

### Why are sound assets built in a separate pass?

_must cite build-pipeline.md_

- decision: **correctly answered**
- cited: build-pipeline.md
- citation precision 100%, recall 100%
- figures: 1/1 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately restates the reason given in passage 1 for building sound assets separately.

> Compressing audio together with textures produced nondeterministic size spikes that broke the AppLovin 5 MB limit on roughly one build in ten [1].

### What caused the March 2026 AppLovin rejections and what was fixed?

_must cite incident-postmortem-2026-03.md_

- decision: **correctly answered**
- cited: incident-postmortem-2026-03.md, changelogs/lumen-build-4.2.md
- citation precision 100%, recall 100%
- figures: 4/4 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: All claims about cause and fixes are directly supported by passages 1 and 5, and the answer directly addresses the question.

> The March 2026 rejections were caused by a lumen-build update that changed the order of the compress and inline stages, causing audio to be compressed with textures instead of in its dedicated pass [1]. This added 0.4 to 1.1 MB to audio-heavy playables, pushing them over the 5 MB limit because the internal size check ran before inlining [1]. The fixes reverted the unified compression path so audio returns to its dedicated pass, updated the verify stage to measure the final inlined artifact, pinned stage order in CI, and added a regression test that builds the three heaviest historical playables on every pipeline change [1][5].

### Which languages must every playable ship with, and what is the fallback?

_must cite localization-guide.md_

- decision: **correctly answered**
- cited: localization-guide.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects passage 1's stated minimum language set and English fallback rule.

> Every playable must ship with English, Spanish, Portuguese, German, French, Japanese, and Korean. English is used as the fallback when locale detection fails or the detected locale is unsupported [1].

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
- judge says: The answer accurately reflects the root cause stated in passage 2, directly answering the question.

> The root cause was a debug flag left enabled, which caused the analytics buffer to flush to the staging endpoint at runtime, bypassing the export-time strip [2].

### What changed in lumen-build 4.2?

_must cite changelogs/lumen-build-4.2.md_

- decision: **correctly answered**
- cited: changelogs/lumen-build-4.2.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reproduces the three changelog items from passage 1 without adding unsupported claims.

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
- judge says: The answer accurately restates the naming convention and example from passage 1, directly answering the question.

> All assets should follow the `pod_game_asset_variant` format in lower snake case (e.g., `nova_bubblebakery_tile_croissant`) [1].

### Who runs the delivery review?

_must cite guides/review-process.md_

- decision: **correctly answered**
- cited: delivery-reports/2025-05-cinder-keep.md, delivery-reports/2025-05-tidal-tycoon.md, delivery-reports/2025-10-puzzle-pier.md, guides/review-process.md, delivery-reports/2025-11-gloom-garden.md, delivery-reports/2026-05-tidal-tycoon.md, delivery-reports/2026-02-sky-ferry.md, delivery-reports/2026-01-tidal-tycoon.md
- citation precision 13%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects passage 4's statement and is consistently corroborated by the delivery reports, with no unsupported claims.

> A developer from a different pod, never the author's own pod, runs the delivery review [4]. This is consistently documented across the delivery reports as being handled by a developer outside the pod [1][2][3][5][6][7][8].

### Who owns communication during an incident?

_must cite guides/incident-process.md_

- decision: **correctly answered**
- cited: guides/incident-process.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer directly matches the claim in passage 1 that the pod producer owns communication during an incident.

> The pod producer owns communication during an incident [1].

### What has to be done before every client delivery?

_must cite qa-checklist.md_

- decision: **correctly answered**
- cited: qa-checklist.md
- citation precision 100%, recall 100%
- judge: **4/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects the QA checklist requirements from passage 2, though it omits the also-required design/delivery reviews and staging CDN rule from passage 1.

> Run the Pre-Delivery QA Checklist with no exceptions, which requires verifying:
>
> 1. Size check per target network (see network spec docs).
> 2. First interaction reachable within 3 seconds.
> 3. No outbound requests in AppLovin builds; analytics stripped.
> 4. Orientation switch mid-session does not break layout.
> 5. Localization: all minimum languages render, fallback to English works, no missing glyphs.
> 6. End card CTA fires the correct network handler.
> 7. Sound: mute state respected, no audio autoplay before first interaction.
> 8. Memory: no growth after three full loops of the playable.
>
> The checklist result must be attached to the delivery ticket by the pod developer, and a delivery is blocked if any item fails [2].

### What is the primary engagement metric?

_must cite analytics-events.md_

- decision: **correctly answered**
- cited: analytics-events.md
- citation precision 100%, recall 100%
- figures: 2/2 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer directly matches passage 1's statement that the time from load_complete to first_interaction is the primary engagement metric.

> The primary engagement metric is the time from `load_complete` to `first_interaction` [1].

### What went wrong with Korean text in July 2025?

_must cite postmortems/2025-07-localization-regression.md_

- decision: **correctly answered**
- cited: postmortems/2025-07-localization-regression.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer directly quotes the July 2025 localization regression postmortem, which matches the question and is fully supported by passage 1.

> Three deliveries shipped with missing Korean glyphs after a font subsetting change trimmed characters used only in the fail-state copy. Internal QA missed it because the checklist glyph check at the time covered Japanese only [1].

### How big can an ad creative get before that network turns it down?

_must cite network-specs-applovin.md_

- decision: **correctly answered**
- cited: incident-postmortem-2026-03.md, network-specs-applovin.md, network-specs-unity-meta.md
- citation precision 33%, recall 100%
- figures: 3/3 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: All stated size limits match the passages and the answer correctly notes ironSource is not covered.

> AppLovin: 5 MB maximum for the final single HTML file [3][5].
> Unity: 5 MB for the ZIP archive, with a limit of up to 10 MB after unzipping [8].
> Meta: 2 MB maximum for the single HTML file [8].
> The provided documents do not specify a size limit for ironSource.

### Someone left a debugging switch on and data went somewhere it should not have. What did we change?

_must cite postmortems/2025-11-analytics-leak.md_

- decision: **correctly answered**
- cited: postmortems/2025-11-analytics-leak.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer accurately reflects the fix described in passage 1, which directly matches the scenario in the question.

> The export now hard-fails if any network transport is reachable from the bundle when the target network forbids runtime requests; debug flags are stripped by the export profile rather than by convention [1].

### Can someone sign off on work made by their own team?

_must cite guides/review-process.md_

- decision: **correctly answered**
- cited: delivery-reports/2025-07-rooftop-dash.md, delivery-reports/2025-06-rooftop-dash.md, delivery-reports/2026-02-tidal-tycoon.md, delivery-reports/2026-04-cinder-keep.md, delivery-reports/2026-01-tidal-tycoon.md, delivery-reports/2025-07-tidal-tycoon.md
- citation precision 0%, recall 0%
- judge: **4/5**, faithful yes, relevant yes
- judge says: The answer correctly cites the pattern from delivery reports showing review is done outside the pod, directly answering the question, though it doesn't explicitly draw a 'no' conclusion or address the onboarding exception about senior developer review.

> Per the delivery reports, the delivery review is run by a developer outside the pod rather than by someone from the same team [1][2][3][5][6][7].

### How quickly do we have to write up something that went wrong?

_must cite guides/incident-process.md_

- decision: **correctly answered**
- cited: guides/incident-process.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer correctly cites the five business day postmortem requirement from passage 2, directly answering the question.

> Every incident requires a postmortem to be written up within five business days [2].

### What number tells us whether players start playing quickly?

_must cite analytics-events.md_

- decision: **correctly answered**
- cited: client-briefs/orbit-golf.md, client-briefs/tidal-tycoon.md, client-briefs/sky-ferry.md, client-briefs/cinder-keep.md, client-briefs/gloom-garden.md, client-briefs/rooftop-dash.md, delivery-reports/2025-05-puzzle-pier.md
- citation precision 0%, recall 0%
- figures: 2/2 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer correctly identifies 'Time to first interaction' as the relevant metric and accurately cites the 3-second requirement across briefs and the specific measurements from the delivery report.

> The metric is "Time to first interaction," which tracks against a 3-second threshold as a standard requirement [1][2][3][4][6][7], with specific measurements of 3.4 s and 2.6 s recorded in delivery reports [8].

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
- judge says: The client brief for Merge Marina specifies ironSource and Unity as target networks, matching the answer.

> ironSource and Unity [1].

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
- judge says: The passages contain no information about developer pay, so declining is appropriate and accurate.

> The corpus does not contain anything relevant to that question.

### What health insurance plan does the company offer?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: The passages contain no information about health insurance, so the answer correctly declines to answer.

> The corpus does not contain anything relevant to that question.

### What is the office wifi password?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: The passages contain no information about office wifi passwords, and the answer correctly declines to answer.

> The corpus does not contain anything relevant to that question.

### Who won the 2022 football world cup?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: The passages contain no information about the football world cup, so declining is appropriate and accurate.

> The corpus does not contain anything relevant to that question.
