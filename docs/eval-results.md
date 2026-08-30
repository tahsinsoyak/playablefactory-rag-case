# Retrieval evaluation

Generated 2026-08-30T16:46:07.468Z · embedder `bge-small-en-v1.5` · top-k 8 · relevance floor 0.55

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

| Question                                                                      | Expected                       | Rank | Best cosine | Result        |
| ----------------------------------------------------------------------------- | ------------------------------ | ---- | ----------- | ------------- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md      | 1    | 0.8266      | pass          |
| How do I initialize the current Lumen SDK, and what happened to lumen.track?  | sdk-notes-v3.md                | 1    | 0.8000      | pass          |
| Why are sound assets built in a separate pass?                                | build-pipeline.md              | 1    | 0.6296      | pass          |
| What caused the March 2026 AppLovin rejections and what was fixed?            | incident-postmortem-2026-03.md | 1    | 0.6989      | pass          |
| Which languages must every playable ship with, and what is the fallback?      | localization-guide.md          | 1    | 0.6268      | pass          |
| What is the company vacation policy?                                          | _(nothing)_                    | n/a  | 0.4705      | pass, refuses |
| How much do senior developers get paid?                                       | _(nothing)_                    | n/a  | 0.4711      | pass, refuses |
| What health insurance plan does the company offer?                            | _(nothing)_                    | n/a  | 0.4606      | pass, refuses |

## Mode: vector

- hit@8: **100%** (5/5)
- MRR: **0.900**
- out-of-corpus correctly below the floor: **3/3**

| Question                                                                      | Expected                       | Rank | Best cosine | Result        |
| ----------------------------------------------------------------------------- | ------------------------------ | ---- | ----------- | ------------- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md      | 1    | 0.8266      | pass          |
| How do I initialize the current Lumen SDK, and what happened to lumen.track?  | sdk-notes-v3.md                | 1    | 0.8000      | pass          |
| Why are sound assets built in a separate pass?                                | build-pipeline.md              | 2    | 0.6296      | pass          |
| What caused the March 2026 AppLovin rejections and what was fixed?            | incident-postmortem-2026-03.md | 1    | 0.6989      | pass          |
| Which languages must every playable ship with, and what is the fallback?      | localization-guide.md          | 1    | 0.6268      | pass          |
| What is the company vacation policy?                                          | _(nothing)_                    | n/a  | 0.4705      | pass, refuses |
| How much do senior developers get paid?                                       | _(nothing)_                    | n/a  | 0.4711      | pass, refuses |
| What health insurance plan does the company offer?                            | _(nothing)_                    | n/a  | 0.4606      | pass, refuses |

## Mode: keyword

- hit@8: **100%** (5/5)
- MRR: **0.800**
- out-of-corpus correctly below the floor: **3/3**

| Question                                                                      | Expected                       | Rank | Best cosine | Result        |
| ----------------------------------------------------------------------------- | ------------------------------ | ---- | ----------- | ------------- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md      | 1    | -1.0000     | pass          |
| How do I initialize the current Lumen SDK, and what happened to lumen.track?  | sdk-notes-v3.md                | 2    | -1.0000     | pass          |
| Why are sound assets built in a separate pass?                                | build-pipeline.md              | 1    | -1.0000     | pass          |
| What caused the March 2026 AppLovin rejections and what was fixed?            | incident-postmortem-2026-03.md | 2    | -1.0000     | pass          |
| Which languages must every playable ship with, and what is the fallback?      | localization-guide.md          | 1    | -1.0000     | pass          |
| What is the company vacation policy?                                          | _(nothing)_                    | n/a  | -1.0000     | pass, refuses |
| How much do senior developers get paid?                                       | _(nothing)_                    | n/a  | -1.0000     | pass, refuses |
| What health insurance plan does the company offer?                            | _(nothing)_                    | n/a  | -1.0000     | pass, refuses |
