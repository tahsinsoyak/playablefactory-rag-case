# Retrieval evaluation

Generated 2026-08-30T22:52:41.217Z · embedder `bge-small-en-v1.5` · top-k 8 · relevance floor 0.51

26 cases in three groups. **sample** are straightforward questions, including
the five shipped with the case. **paraphrase** ask the way someone who has not read the
documents would, avoiding the vocabulary the corpus itself uses, which is where keyword
matching stops helping. **probe** cannot be answered from the corpus at all: passing means
retrieving nothing above the relevance floor, so the system refuses rather than assembling
something plausible from unrelated passages.

The floor is applied to cosine similarity, not to the fused RRF score. RRF is rank-derived,
something always ranks first, so an out-of-corpus question fuses to the same score as a
well-answered one. Only the raw similarity distinguishes them.

## Mode: hybrid

- **sample**: hit@8 93%, MRR 0.717 (13/14)
- **paraphrase**: hit@8 86%, MRR 0.518 (6/7)
- **probe**: refused 5/5

Median retrieval latency: 16 ms

| Question | Expected | Rank | Best cosine | Result |
| --- | --- | --- | --- | --- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md | 1 | 0.8266 | pass (rank 1) |
| How do I initialize the current Lumen SDK, and what happened to lumen.track? | sdk-notes-v3.md | 1 | 0.8000 | pass (rank 1) |
| Why are sound assets built in a separate pass? | build-pipeline.md | 1 | 0.6296 | pass (rank 1) |
| What caused the March 2026 AppLovin rejections and what was fixed? | incident-postmortem-2026-03.md | 1 | 0.6989 | pass (rank 1) |
| Which languages must every playable ship with, and what is the fallback? | localization-guide.md | 1 | 0.6268 | pass (rank 1) |
| Who is the client for Merge Marina? | client-briefs/merge-marina.md | 3 | 0.7318 | pass (rank 3) |
| What caused the November 2025 analytics leak? | postmortems/2025-11-analytics-leak.md | 2 | 0.5987 | pass (rank 2) |
| What changed in lumen-build 4.2? | changelogs/lumen-build-4.2.md | 5 | 0.7678 | pass (rank 5) |
| How should asset files be named? | guides/asset-naming.md | 1 | 0.7092 | pass (rank 1) |
| Who runs the delivery review? | guides/review-process.md | n/a | 0.5836 | FAIL, not in top 8 |
| Who owns communication during an incident? | guides/incident-process.md | 1 | 0.6315 | pass (rank 1) |
| What has to be done before every client delivery? | qa-checklist.md | 2 | 0.6425 | pass (rank 2) |
| What is the primary engagement metric? | analytics-events.md | 1 | 0.6014 | pass (rank 1) |
| What went wrong with Korean text in July 2025? | postmortems/2025-07-localization-regression.md | 2 | 0.6054 | pass (rank 2) |
| How big can an ad creative get before that network turns it down? | network-specs-applovin.md | 3 | 0.5771 | pass (rank 3) |
| Someone left a debugging switch on and data went somewhere it should not have. What did we change? | postmortems/2025-11-analytics-leak.md | 1 | 0.5813 | pass (rank 1) |
| Can someone sign off on work made by their own team? | guides/review-process.md | 8 | 0.5125 | pass (rank 8) |
| How quickly do we have to write up something that went wrong? | guides/incident-process.md | 6 | 0.5965 | pass (rank 6) |
| What number tells us whether players start playing quickly? | analytics-events.md | n/a | 0.5559 | FAIL, not in top 8 |
| Where do audio files go, and what must they stay out of? | guides/asset-naming.md | 1 | 0.6803 | pass (rank 1) |
| Which ad networks is the merge game aimed at? | client-briefs/merge-marina.md | 1 | 0.6104 | pass (rank 1) |
| What is the company vacation policy? | _(nothing)_ | n/a | 0.4705 | pass, refuses |
| How much do senior developers get paid? | _(nothing)_ | n/a | 0.4711 | pass, refuses |
| What health insurance plan does the company offer? | _(nothing)_ | n/a | 0.4606 | pass, refuses |
| What is the office wifi password? | _(nothing)_ | n/a | 0.4072 | pass, refuses |
| Who won the 2022 football world cup? | _(nothing)_ | n/a | 0.4686 | pass, refuses |

## Mode: vector

- **sample**: hit@8 100%, MRR 0.744 (14/14)
- **paraphrase**: hit@8 57%, MRR 0.446 (4/7)
- **probe**: refused 5/5

Median retrieval latency: 18 ms

| Question | Expected | Rank | Best cosine | Result |
| --- | --- | --- | --- | --- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md | 1 | 0.8266 | pass (rank 1) |
| How do I initialize the current Lumen SDK, and what happened to lumen.track? | sdk-notes-v3.md | 1 | 0.8000 | pass (rank 1) |
| Why are sound assets built in a separate pass? | build-pipeline.md | 2 | 0.6296 | pass (rank 2) |
| What caused the March 2026 AppLovin rejections and what was fixed? | incident-postmortem-2026-03.md | 1 | 0.6989 | pass (rank 1) |
| Which languages must every playable ship with, and what is the fallback? | localization-guide.md | 1 | 0.6268 | pass (rank 1) |
| Who is the client for Merge Marina? | client-briefs/merge-marina.md | 8 | 0.7318 | pass (rank 8) |
| What caused the November 2025 analytics leak? | postmortems/2025-11-analytics-leak.md | 1 | 0.5987 | pass (rank 1) |
| What changed in lumen-build 4.2? | changelogs/lumen-build-4.2.md | 6 | 0.7678 | pass (rank 6) |
| How should asset files be named? | guides/asset-naming.md | 1 | 0.7092 | pass (rank 1) |
| Who runs the delivery review? | guides/review-process.md | 1 | 0.6386 | pass (rank 1) |
| Who owns communication during an incident? | guides/incident-process.md | 1 | 0.6315 | pass (rank 1) |
| What has to be done before every client delivery? | qa-checklist.md | 2 | 0.6425 | pass (rank 2) |
| What is the primary engagement metric? | analytics-events.md | 1 | 0.6014 | pass (rank 1) |
| What went wrong with Korean text in July 2025? | postmortems/2025-07-localization-regression.md | 8 | 0.6054 | pass (rank 8) |
| How big can an ad creative get before that network turns it down? | network-specs-applovin.md | n/a | 0.5771 | FAIL, not in top 8 |
| Someone left a debugging switch on and data went somewhere it should not have. What did we change? | postmortems/2025-11-analytics-leak.md | 8 | 0.5884 | pass (rank 8) |
| Can someone sign off on work made by their own team? | guides/review-process.md | n/a | 0.5125 | FAIL, not in top 8 |
| How quickly do we have to write up something that went wrong? | guides/incident-process.md | 1 | 0.5965 | pass (rank 1) |
| What number tells us whether players start playing quickly? | analytics-events.md | n/a | 0.5559 | FAIL, not in top 8 |
| Where do audio files go, and what must they stay out of? | guides/asset-naming.md | 1 | 0.6803 | pass (rank 1) |
| Which ad networks is the merge game aimed at? | client-briefs/merge-marina.md | 1 | 0.6104 | pass (rank 1) |
| What is the company vacation policy? | _(nothing)_ | n/a | 0.4705 | pass, refuses |
| How much do senior developers get paid? | _(nothing)_ | n/a | 0.4711 | pass, refuses |
| What health insurance plan does the company offer? | _(nothing)_ | n/a | 0.4606 | pass, refuses |
| What is the office wifi password? | _(nothing)_ | n/a | 0.4072 | pass, refuses |
| Who won the 2022 football world cup? | _(nothing)_ | n/a | 0.4686 | pass, refuses |

## Mode: keyword

- **sample**: hit@8 71%, MRR 0.524 (10/14)
- **paraphrase**: hit@8 57%, MRR 0.464 (4/7)
- **probe**: refused 5/5

Median retrieval latency: 1 ms

| Question | Expected | Rank | Best cosine | Result |
| --- | --- | --- | --- | --- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md | 1 | -1.0000 | pass (rank 1) |
| How do I initialize the current Lumen SDK, and what happened to lumen.track? | sdk-notes-v3.md | 2 | -1.0000 | pass (rank 2) |
| Why are sound assets built in a separate pass? | build-pipeline.md | 1 | -1.0000 | pass (rank 1) |
| What caused the March 2026 AppLovin rejections and what was fixed? | incident-postmortem-2026-03.md | 2 | -1.0000 | pass (rank 2) |
| Which languages must every playable ship with, and what is the fallback? | localization-guide.md | 1 | -1.0000 | pass (rank 1) |
| Who is the client for Merge Marina? | client-briefs/merge-marina.md | n/a | -1.0000 | FAIL, not in top 8 |
| What caused the November 2025 analytics leak? | postmortems/2025-11-analytics-leak.md | n/a | -1.0000 | FAIL, not in top 8 |
| What changed in lumen-build 4.2? | changelogs/lumen-build-4.2.md | n/a | -1.0000 | FAIL, not in top 8 |
| How should asset files be named? | guides/asset-naming.md | 2 | -1.0000 | pass (rank 2) |
| Who runs the delivery review? | guides/review-process.md | n/a | -1.0000 | FAIL, not in top 8 |
| Who owns communication during an incident? | guides/incident-process.md | 1 | -1.0000 | pass (rank 1) |
| What has to be done before every client delivery? | qa-checklist.md | 3 | -1.0000 | pass (rank 3) |
| What is the primary engagement metric? | analytics-events.md | 1 | -1.0000 | pass (rank 1) |
| What went wrong with Korean text in July 2025? | postmortems/2025-07-localization-regression.md | 2 | -1.0000 | pass (rank 2) |
| How big can an ad creative get before that network turns it down? | network-specs-applovin.md | n/a | -1.0000 | FAIL, not in top 8 |
| Someone left a debugging switch on and data went somewhere it should not have. What did we change? | postmortems/2025-11-analytics-leak.md | 1 | -1.0000 | pass (rank 1) |
| Can someone sign off on work made by their own team? | guides/review-process.md | 4 | -1.0000 | pass (rank 4) |
| How quickly do we have to write up something that went wrong? | guides/incident-process.md | n/a | -1.0000 | FAIL, not in top 8 |
| What number tells us whether players start playing quickly? | analytics-events.md | n/a | -1.0000 | FAIL, not in top 8 |
| Where do audio files go, and what must they stay out of? | guides/asset-naming.md | 1 | -1.0000 | pass (rank 1) |
| Which ad networks is the merge game aimed at? | client-briefs/merge-marina.md | 1 | -1.0000 | pass (rank 1) |
| What is the company vacation policy? | _(nothing)_ | n/a | -1.0000 | pass, refuses |
| How much do senior developers get paid? | _(nothing)_ | n/a | -1.0000 | pass, refuses |
| What health insurance plan does the company offer? | _(nothing)_ | n/a | -1.0000 | pass, refuses |
| What is the office wifi password? | _(nothing)_ | n/a | -1.0000 | pass, refuses |
| Who won the 2022 football world cup? | _(nothing)_ | n/a | -1.0000 | pass, refuses |

## Reranking

Candidates from hybrid retrieval, reordered by `ms-marco-MiniLM-L-6-v2`, a cross-encoder that
scores each passage against the query directly rather than comparing two independently
computed vectors. It is slower, so it only ever runs over the shortlist.

Median retrieval latency: 839 ms, against 16 ms without it.

### Hybrid, with and without reranking

| Group | hit@k before | hit@k after | MRR before | MRR after | Change |
| --- | --- | --- | --- | --- | --- |
| sample | 93% | 100% | 0.717 | 0.815 | +0.099 |
| paraphrase | 86% | 71% | 0.518 | 0.529 | +0.011 |

| Question | Expected | Rank | Best cosine | Result |
| --- | --- | --- | --- | --- |
| What is the maximum file size for an AppLovin playable, and how does it ship? | network-specs-applovin.md | 1 | 0.8266 | pass (rank 1) |
| How do I initialize the current Lumen SDK, and what happened to lumen.track? | sdk-notes-v3.md | 1 | 0.8000 | pass (rank 1) |
| Why are sound assets built in a separate pass? | build-pipeline.md | 1 | 0.6296 | pass (rank 1) |
| What caused the March 2026 AppLovin rejections and what was fixed? | incident-postmortem-2026-03.md | 1 | 0.6989 | pass (rank 1) |
| Which languages must every playable ship with, and what is the fallback? | localization-guide.md | 1 | 0.6268 | pass (rank 1) |
| Who is the client for Merge Marina? | client-briefs/merge-marina.md | 6 | 0.7318 | pass (rank 6) |
| What caused the November 2025 analytics leak? | postmortems/2025-11-analytics-leak.md | 2 | 0.5987 | pass (rank 2) |
| What changed in lumen-build 4.2? | changelogs/lumen-build-4.2.md | 1 | 0.7678 | pass (rank 1) |
| How should asset files be named? | guides/asset-naming.md | 1 | 0.7092 | pass (rank 1) |
| Who runs the delivery review? | guides/review-process.md | 4 | 0.6386 | pass (rank 4) |
| Who owns communication during an incident? | guides/incident-process.md | 1 | 0.6315 | pass (rank 1) |
| What has to be done before every client delivery? | qa-checklist.md | 2 | 0.6425 | pass (rank 2) |
| What is the primary engagement metric? | analytics-events.md | 1 | 0.6014 | pass (rank 1) |
| What went wrong with Korean text in July 2025? | postmortems/2025-07-localization-regression.md | 1 | 0.6054 | pass (rank 1) |
| How big can an ad creative get before that network turns it down? | network-specs-applovin.md | 5 | 0.5771 | pass (rank 5) |
| Someone left a debugging switch on and data went somewhere it should not have. What did we change? | postmortems/2025-11-analytics-leak.md | 1 | 0.5813 | pass (rank 1) |
| Can someone sign off on work made by their own team? | guides/review-process.md | n/a | 0.5125 | FAIL, not in top 8 |
| How quickly do we have to write up something that went wrong? | guides/incident-process.md | 2 | 0.5965 | pass (rank 2) |
| What number tells us whether players start playing quickly? | analytics-events.md | n/a | 0.5504 | FAIL, not in top 8 |
| Where do audio files go, and what must they stay out of? | guides/asset-naming.md | 1 | 0.6803 | pass (rank 1) |
| Which ad networks is the merge game aimed at? | client-briefs/merge-marina.md | 1 | 0.6104 | pass (rank 1) |
| What is the company vacation policy? | _(nothing)_ | n/a | 0.4705 | pass, refuses |
| How much do senior developers get paid? | _(nothing)_ | n/a | 0.4711 | pass, refuses |
| What health insurance plan does the company offer? | _(nothing)_ | n/a | 0.4606 | pass, refuses |
| What is the office wifi password? | _(nothing)_ | n/a | 0.4072 | pass, refuses |
| Who won the 2022 football world cup? | _(nothing)_ | n/a | 0.4686 | pass, refuses |
