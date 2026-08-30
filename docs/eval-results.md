# Retrieval evaluation

Generated 2026-08-30T13:36:13.305Z · embedder `bge-small-en-v1.5` · top-k 8 · relevance floor 0.55

Answerable cases score hit@k (is the expected document retrieved at all) and MRR
(how high it ranks). Out-of-corpus cases invert the test: the system passes by
retrieving _nothing above the relevance floor_, so that it refuses instead of
assembling an answer from unrelated passages.

The floor is applied to cosine similarity, not to the fused RRF score. RRF is
rank-derived - something always ranks first - so an out-of-corpus question fuses
to the same score as a well-answered one. Only the raw similarity distinguishes
them, and keeping both columns visible is what makes that checkable.

## Mode: hybrid

- hit@8: **100%** (5/5)
- MRR: **1.000**
- out-of-corpus correctly below the floor: **3/3**

| Question                                                                      | Expected                       | Rank | Best cosine | Result         |
| ----------------------------------------------------------------------------- | ------------------------------ | ---- | ----------- | -------------- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md      | 1    | 0.8266      | pass           |
| How do I initialize the current Lumen SDK, and what happened to lumen.track?  | sdk-notes-v3.md                | 1    | 0.8000      | pass           |
| Why are sound assets built in a separate pass?                                | build-pipeline.md              | 1    | 0.6296      | pass           |
| What caused the March 2026 AppLovin rejections and what was fixed?            | incident-postmortem-2026-03.md | 1    | 0.6989      | pass           |
| Which languages must every playable ship with, and what is the fallback?      | localization-guide.md          | 1    | 0.6268      | pass           |
| What is the company vacation policy?                                          | _(nothing)_                    | —    | 0.4705      | pass — refuses |
| How much do senior developers get paid?                                       | _(nothing)_                    | —    | 0.4711      | pass — refuses |
| What health insurance plan does the company offer?                            | _(nothing)_                    | —    | 0.4606      | pass — refuses |

## Mode: vector

- hit@8: **100%** (5/5)
- MRR: **0.900**
- out-of-corpus correctly below the floor: **3/3**

| Question                                                                      | Expected                       | Rank | Best cosine | Result         |
| ----------------------------------------------------------------------------- | ------------------------------ | ---- | ----------- | -------------- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md      | 1    | 0.8266      | pass           |
| How do I initialize the current Lumen SDK, and what happened to lumen.track?  | sdk-notes-v3.md                | 1    | 0.8000      | pass           |
| Why are sound assets built in a separate pass?                                | build-pipeline.md              | 2    | 0.6296      | pass           |
| What caused the March 2026 AppLovin rejections and what was fixed?            | incident-postmortem-2026-03.md | 1    | 0.6989      | pass           |
| Which languages must every playable ship with, and what is the fallback?      | localization-guide.md          | 1    | 0.6268      | pass           |
| What is the company vacation policy?                                          | _(nothing)_                    | —    | 0.4705      | pass — refuses |
| How much do senior developers get paid?                                       | _(nothing)_                    | —    | 0.4711      | pass — refuses |
| What health insurance plan does the company offer?                            | _(nothing)_                    | —    | 0.4606      | pass — refuses |

## Mode: keyword

- hit@8: **100%** (5/5)
- MRR: **0.800**
- out-of-corpus correctly below the floor: **3/3**

| Question                                                                      | Expected                       | Rank | Best cosine | Result         |
| ----------------------------------------------------------------------------- | ------------------------------ | ---- | ----------- | -------------- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md      | 1    | -1.0000     | pass           |
| How do I initialize the current Lumen SDK, and what happened to lumen.track?  | sdk-notes-v3.md                | 2    | -1.0000     | pass           |
| Why are sound assets built in a separate pass?                                | build-pipeline.md              | 1    | -1.0000     | pass           |
| What caused the March 2026 AppLovin rejections and what was fixed?            | incident-postmortem-2026-03.md | 2    | -1.0000     | pass           |
| Which languages must every playable ship with, and what is the fallback?      | localization-guide.md          | 1    | -1.0000     | pass           |
| What is the company vacation policy?                                          | _(nothing)_                    | —    | -1.0000     | pass — refuses |
| How much do senior developers get paid?                                       | _(nothing)_                    | —    | -1.0000     | pass — refuses |
| What health insurance plan does the company offer?                            | _(nothing)_                    | —    | -1.0000     | pass — refuses |

## Generated answers (hybrid)

### What is the maximum file size for an AppLovin playable, and how does it ship?

_must cite network-specs-applovin.md_

**answered** — cites network-specs-applovin.md

> AppLovin playables ship as a single self-contained HTML file with all assets inlined (base64) and no external network requests allowed at runtime [1]. The maximum file size for the final single HTML file is 5 MB [1].

### How do I initialize the current Lumen SDK, and what happened to lumen.track?

_must cite sdk-notes-v3.md_ · sdk-notes-v2.md is deprecated; a good answer says so

**answered** — cites sdk-notes-v3.md

> Call `LumenSDK.init(config)` before any game code runs [1]. The old `lumen.track` calls from v2 are not recognized in v3 and fail silently [1].

### Why are sound assets built in a separate pass?

_must cite build-pipeline.md_ · incident-postmortem-2026-03.md adds useful context

**answered** — cites build-pipeline.md

> Sound assets are built in a separate pass because compressing audio together with textures produced nondeterministic size spikes that broke the AppLovin 5 MB limit on roughly one build in ten [1].

### What caused the March 2026 AppLovin rejections and what was fixed?

_must cite incident-postmortem-2026-03.md_

**answered** — cites incident-postmortem-2026-03.md, changelogs/lumen-build-4.2.md

> The March 2026 rejections were caused by a lumen-build update that changed the order of the compress and inline stages, forcing audio to be compressed with textures instead of running in its dedicated pass [1]. This added 0.4 to 1.1 MB to audio-heavy playables, pushing them over AppLovin’s 5 MB single-file limit because the internal size check executed before inlining [1].
>
> Fixes shipped include reverting the unified compression path so audio returns to its dedicated pass, updating the verify stage to measure the final inlined artifact instead of the pre-inline bundle, pinning the stage order in CI, and adding a regression test that builds the three heaviest historical playables on every pipeline change [1][3].

### Which languages must every playable ship with, and what is the fallback?

_must cite localization-guide.md_

**answered** — cites localization-guide.md

> Every playable must ship with English, Spanish, Portuguese, German, French, Japanese, and Korean. English is used as the fallback when auto-detection fails or the device locale is unsupported [1].

### What is the company vacation policy?

_must refuse_

**refused** — cites nothing

> The corpus does not contain anything relevant to that question.

### How much do senior developers get paid?

_must refuse_

**refused** — cites nothing

> The corpus does not contain anything relevant to that question.

### What health insurance plan does the company offer?

_must refuse_

**refused** — cites nothing

> The corpus does not contain anything relevant to that question.
