# Answer quality

Generated 2026-08-30T22:32:29.586Z · answering with `qwen/qwen3.7-flash` · judged by `openai/gpt-5-mini`

The retrieval eval measures whether the right passages come back. This measures what is
done with them. Deterministic checks run first and cost nothing: they catch a citation
pointing at the wrong document, a refusal on a question the corpus answers, and a figure
that appears in none of the passages the answer cited. A judge model is only asked the
part that genuinely needs an opinion.

## Deterministic

| Measure                             | Result                |
| ----------------------------------- | --------------------- |
| Answer-or-refuse decision correct   | **100%** (26 cases)   |
| Citation precision                  | 80%                   |
| Citation recall                     | 90%                   |
| Figures traceable to cited passages | **100%** (17 checked) |
| Median end-to-end latency           | 4581 ms               |

## Judged

Answers came from `qwen/qwen3.7-flash`; the judge is `openai/gpt-5-mini`. They are
different models, and the eval refuses to run if they are not.

The judge sees the question, the cited passages, and the answer. It is never told which
document was expected, so it scores support by the evidence rather than agreement with a
label. It runs as `openai/gpt-5-mini`, chosen to differ from the answering model where
possible: models rate their own output generously.

| Measure                           | Result       |
| --------------------------------- | ------------ |
| Faithful (every claim traceable)  | **25/26**    |
| Relevant (answers what was asked) | **26/26**    |
| Mean score                        | **4.88 / 5** |

## Per case

### What is the maximum file size for an AppLovin playable, and how does it ship?

_must cite network-specs-applovin.md_

- decision: **correctly answered**
- cited: network-specs-applovin.md
- citation precision 100%, recall 100%
- figures: 1/1 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: Both facts (single self-contained HTML with base64-inlined assets, 5 MB maximum) are explicitly stated in passage 1.

> AppLovin playables ship as a single self-contained HTML file with all assets inlined (base64), and the maximum allowed file size is 5 MB [1].

### How do I initialize the current Lumen SDK, and what happened to lumen.track?

_must cite sdk-notes-v3.md_

- decision: **correctly answered**
- cited: sdk-notes-v3.md
- citation precision 100%, recall 100%
- figures: 2/2 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: Both claims are directly supported by passage 1: use LumenSDK.init(config) before game code, and lumen.track from v2 is not recognized in v3 and fails silently.

> Call `LumenSDK.init(config)` before any game code runs [1]. The old `lumen.track` calls from v2 are not recognized in v3 and fail silently [1].

### Why are sound assets built in a separate pass?

_must cite build-pipeline.md_

- decision: **correctly answered**
- cited: build-pipeline.md
- citation precision 100%, recall 100%
- figures: 1/1 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: The claim matches passage 1 which states audio is encoded in a dedicated pass because compressing it with textures caused nondeterministic size spikes that broke the AppLovin 5 MB limit roughly one in ten builds.

> Sound assets are built in a separate pass because compressing them together with textures produced nondeterministic size spikes that broke the AppLovin 5 MB limit on roughly one build in ten [1].

### What caused the March 2026 AppLovin rejections and what was fixed?

_must cite incident-postmortem-2026-03.md_

- decision: **correctly answered**
- cited: incident-postmortem-2026-03.md, changelogs/lumen-build-4.2.md
- citation precision 100%, recall 100%
- figures: 4/4 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: All factual claims in the answer are directly supported by the provided passages (postmortem and changelog), and the answer addresses the asked cause and fixes.

> The March 2026 rejections were caused by a lumen-build update that changed the order of the compress and inline stages, causing audio to be compressed with textures instead of in its dedicated pass. This added 0.4 to 1.1 MB to audio-heavy playables, pushing them over the 5 MB limit because the internal size check ran before inlining [1].
>
> The fixes shipped included reverting the unified compression path so audio returns to its dedicated pass, updating the verify stage to measure the final inlined artifact instead of the pre-inline bundle, pinning stage order in CI, and implementing a regression test that builds the three heaviest historical playables on every pipeline change [1][5].

### Which languages must every playable ship with, and what is the fallback?

_must cite localization-guide.md_

- decision: **correctly answered**
- cited: localization-guide.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer directly matches passage 1 (and is corroborated by passage 6) which lists the required languages and states English is the fallback.

> Every playable must ship with English, Spanish, Portuguese, German, French, Japanese, and Korean [1]. English is used as the fallback when auto-detection fails or the device locale is unsupported [1].

### Who is the client for Merge Marina?

_must cite client-briefs/merge-marina.md_

- decision: **correctly answered**
- cited: delivery-reports/2025-09-merge-marina.md, delivery-reports/2025-12-merge-marina.md, delivery-reports/2026-02-merge-marina.md, client-briefs/merge-marina.md, delivery-reports/2026-06-merge-marina.md, delivery-reports/2025-10-merge-marina.md
- citation precision 17%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: All provided passages explicitly identify the client as BlueHarbor Interactive, so the answer is fully supported and directly addresses the question.

> The client for Merge Marina is BlueHarbor Interactive [1][2][3][6][7][8].

### What caused the November 2025 analytics leak?

_must cite postmortems/2025-11-analytics-leak.md_

- decision: **correctly answered**
- cited: postmortems/2025-11-analytics-leak.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer directly matches the root-cause statement in passage 2 that a debug flag left enabled caused the buffer to flush to staging and bypass the export-time strip.

> The root cause was a debug flag left enabled, which caused the analytics buffer to flush to the staging endpoint at runtime and bypass the export-time strip [2].

### What changed in lumen-build 4.2?

_must cite changelogs/lumen-build-4.2.md_

- decision: **correctly answered**
- cited: changelogs/lumen-build-4.2.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: All three listed changes match the lumen-build 4.2 changelog in passage 1 exactly.

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
- judge says: The answer directly quotes passage 1, which states the naming format and example exactly.

> All assets follow pod_game_asset_variant, lower snake case: nova_bubblebakery_tile_croissant [1].

### Who runs the delivery review?

_must cite guides/review-process.md_

- decision: **correctly answered**
- cited: delivery-reports/2025-05-cinder-keep.md, delivery-reports/2025-05-tidal-tycoon.md, delivery-reports/2025-10-puzzle-pier.md, guides/review-process.md, delivery-reports/2025-11-gloom-garden.md, delivery-reports/2026-05-tidal-tycoon.md, delivery-reports/2026-02-sky-ferry.md, delivery-reports/2026-01-tidal-tycoon.md
- citation precision 13%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: Passage 4 explicitly states the delivery review is run by a developer from a different pod and passages 1-3,5-8 corroborate with phrasing like "developer outside the pod," so the answer is fully supported.

> A developer from a different pod, never the author's own pod [4]. This is consistently documented across delivery reports as a developer outside the pod [1][2][3][5][6][7][8].

### Who owns communication during an incident?

_must cite guides/incident-process.md_

- decision: **correctly answered**
- cited: guides/incident-process.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: Passage 1 explicitly states that the pod producer owns communication during an incident.

> The pod producer owns communication during an incident [1].

### What has to be done before every client delivery?

_must cite qa-checklist.md_

- decision: **correctly answered**
- cited: guides/review-process.md, qa-checklist.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: All claims (two internal reviews, running the Pre-Delivery QA Checklist with its items, attaching the checklist result, and using the staging CDN) are directly supported by the provided passages.

> Before every client delivery, the following steps are mandatory:
>
> - Complete two internal reviews: a design review at the first playable build, and a delivery review after QA conducted by a developer from a different pod [1].
> - Run the Pre-Delivery QA Checklist without exception, verifying:
>   1. Size check per target network [2]
>   2. First interaction reachable within 3 seconds [2]
>   3. No outbound requests in AppLovin builds; analytics stripped [2]
>   4. Orientation switch mid-session does not break layout [2]
>   5. Localization: all minimum languages render, fallback to English works, no missing glyphs [2]
>   6. End card CTA fires the correct network handler [2]
>   7. Sound: mute state respected, no audio autoplay before first interaction [2]
>   8. Memory: no growth after three full loops of the playable [2]
> - Attach the checklist result to the delivery ticket [2].
> - Serve client-visible builds exclusively from the staging CDN; direct file transfers to clients are prohibited [1].

### What is the primary engagement metric?

_must cite analytics-events.md_

- decision: **correctly answered**
- cited: analytics-events.md
- citation precision 100%, recall 100%
- figures: 2/2 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: Passage 1 explicitly states that the time from load_complete to first_interaction is the primary engagement metric.

> The time from load_complete to first_interaction [1].

### What went wrong with Korean text in July 2025?

_must cite postmortems/2025-07-localization-regression.md_

- decision: **correctly answered**
- cited: postmortems/2025-07-localization-regression.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: Both claims in the answer are directly stated in passage 1 (Postmortem: July 2025 Localization Regression).

> Three deliveries shipped with missing Korean glyphs after a font subsetting change trimmed characters used only in the fail-state copy [1]. Internal QA missed the issue because the checklist glyph check at the time only covered Japanese [1].

### How big can an ad creative get before that network turns it down?

_must cite network-specs-applovin.md_

- decision: **correctly answered**
- cited: network-specs-applovin.md, network-specs-unity-meta.md
- citation precision 50%, recall 100%
- figures: 3/3 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: All size limits stated (AppLovin 5 MB, Unity 5 MB/10 MB after unzip, Meta 2 MB) and the absence of an ironSource limit are explicitly given in the provided passages.

> AppLovin: 5 MB maximum for the final single HTML file [5].
> Unity: 5 MB archive limit, up to 10 MB after unzip [8].
> Meta: 2 MB limit for the single HTML file [8].
> The provided corpus does not specify a size limit for ironSource.

### Someone left a debugging switch on and data went somewhere it should not have. What did we change?

_must cite postmortems/2025-11-analytics-leak.md_

- decision: **correctly answered**
- cited: postmortems/2025-11-analytics-leak.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer directly matches the fix described in passage 1: export hard-fails when a network transport is reachable under a forbidden target and debug flags are stripped by the export profile.

> The export process was updated to hard-fail if any network transport is reachable from the bundle when the target network forbids runtime requests, and debug flags are now stripped by the export profile rather than by convention [1].

### Can someone sign off on work made by their own team?

_must cite guides/review-process.md_

- decision: **correctly answered**
- cited: delivery-reports/2025-07-rooftop-dash.md, delivery-reports/2025-06-rooftop-dash.md, delivery-reports/2026-02-tidal-tycoon.md, delivery-reports/2026-04-cinder-keep.md, delivery-reports/2026-01-tidal-tycoon.md, delivery-reports/2025-07-tidal-tycoon.md
- citation precision 0%, recall 0%
- judge: **2/5**, faithful **no**, relevant yes
- judge says: The answer incorrectly claims the documents don't explicitly state the rule, but the passages do state delivery reviews are run by a developer outside the pod per the review process.
- unsupported claims: The provided documents do not explicitly state whether signing off on one's own team's work is permitted.

> The provided documents do not explicitly state whether signing off on one's own team's work is permitted. However, the delivery reports consistently note that delivery reviews are run by a developer outside the pod, per the review process [1][2][3][5][6][7].

### How quickly do we have to write up something that went wrong?

_must cite guides/incident-process.md_

- decision: **correctly answered**
- cited: guides/incident-process.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: Passage 2 explicitly says every incident closes with a postmortem in the corpus within five business days.

> Every incident requires a postmortem to be written up within five business days [2].

### What number tells us whether players start playing quickly?

_must cite analytics-events.md_

- decision: **correctly answered**
- cited: client-briefs/orbit-golf.md, client-briefs/tidal-tycoon.md, client-briefs/sky-ferry.md, client-briefs/cinder-keep.md, client-briefs/gloom-garden.md, client-briefs/rooftop-dash.md, delivery-reports/2025-05-puzzle-pier.md
- citation precision 0%, recall 0%
- figures: 2/2 traceable
- judge: **5/5**, faithful yes, relevant yes
- judge says: Passages repeatedly specify 'first interaction within 3 seconds' as the benchmark and passage 8 reports time to first interaction changing from 3.4 s to 2.6 s, so all claims are supported.

> The target benchmark is a time to first interaction of 3 seconds or less [1][2][3][4][6][7], with actual performance tracked at 3.4 s and 2.6 s [8].

### Where do audio files go, and what must they stay out of?

_must cite guides/asset-naming.md_

- decision: **correctly answered**
- cited: guides/asset-naming.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: The answer directly matches passage 1 which states audio files live under audio/ and never inside texture folders.

> Audio files live under the `audio/` directory and must never be placed inside texture folders [1].

### Which ad networks is the merge game aimed at?

_must cite client-briefs/merge-marina.md_

- decision: **correctly answered**
- cited: client-briefs/merge-marina.md
- citation precision 100%, recall 100%
- judge: **5/5**, faithful yes, relevant yes
- judge says: Passage 1 (Merge Marina client brief) explicitly lists the target networks as ironSource and Unity.

> The merge game is aimed at ironSource and Unity [1].

### What is the company vacation policy?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: None of the supplied passages mention vacation, so stating that the corpus lacks relevant information is correct.

> The corpus does not contain anything relevant to that question.

### How much do senior developers get paid?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: None of the provided passages mention compensation or pay for senior developers, so the statement that the corpus lacks relevant information is supported.

> The corpus does not contain anything relevant to that question.

### What health insurance plan does the company offer?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: None of the provided passages mention employee benefits or health insurance, so stating the corpus lacks that information is supported.

> The corpus does not contain anything relevant to that question.

### What is the office wifi password?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: None of the provided passages mention Wi‑Fi, network credentials, or passwords, so declining is correct.

> The corpus does not contain anything relevant to that question.

### Who won the 2022 football world cup?

_must refuse_

- decision: **correctly refused**
- cited: nothing
- judge: **5/5**, faithful yes, relevant yes
- judge says: None of the provided passages mention the 2022 football World Cup or its winner, so stating the corpus lacks relevant information is accurate.

> The corpus does not contain anything relevant to that question.
