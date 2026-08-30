/**
 * The evaluation set.
 *
 * Split out from the runner so cases can be added without touching the scoring,
 * and so the two can be reviewed independently: it is easier to argue about
 * whether a question is fair when it is not surrounded by table formatting.
 *
 * Three groups, because they test different things:
 *
 * - `sample` are the five shipped with the case. They are the acceptance bar.
 * - `paraphrase` deliberately avoid the corpus's own vocabulary, asking the way
 *   someone who has not read the documents would. Keyword search cannot help
 *   much here, so this is where a better ranker has room to show itself.
 * - `probe` cannot be answered from the corpus at all. Passing means retrieving
 *   nothing above the relevance floor, so the system refuses rather than
 *   assembling something plausible from unrelated passages.
 */
export type EvalGroup = 'sample' | 'paraphrase' | 'probe';

export interface EvalCase {
  question: string;
  group: EvalGroup;
  /** Documents a good answer must cite. Empty means the corpus cannot answer it. */
  expected: string[];
  note?: string;
}

export const EVAL_CASES: EvalCase[] = [
  // --- the five shipped with the case ---
  {
    question: 'What is the maximum file size for an AppLovin playable, and how does it ship?',
    group: 'sample',
    expected: ['network-specs-applovin.md'],
  },
  {
    question: 'How do I initialize the current Lumen SDK, and what happened to lumen.track?',
    group: 'sample',
    expected: ['sdk-notes-v3.md'],
    note: 'sdk-notes-v2.md is deprecated; a good answer says so',
  },
  {
    question: 'Why are sound assets built in a separate pass?',
    group: 'sample',
    expected: ['build-pipeline.md'],
    note: 'incident-postmortem-2026-03.md adds useful context',
  },
  {
    question: 'What caused the March 2026 AppLovin rejections and what was fixed?',
    group: 'sample',
    expected: ['incident-postmortem-2026-03.md'],
  },
  {
    question: 'Which languages must every playable ship with, and what is the fallback?',
    group: 'sample',
    expected: ['localization-guide.md'],
  },

  // --- straightforward questions across the rest of the corpus ---
  {
    question: 'Who is the client for Merge Marina?',
    group: 'sample',
    expected: ['client-briefs/merge-marina.md'],
  },
  {
    question: 'What caused the November 2025 analytics leak?',
    group: 'sample',
    expected: ['postmortems/2025-11-analytics-leak.md'],
  },
  {
    question: 'What changed in lumen-build 4.2?',
    group: 'sample',
    expected: ['changelogs/lumen-build-4.2.md'],
  },
  {
    question: 'How should asset files be named?',
    group: 'sample',
    expected: ['guides/asset-naming.md'],
  },
  {
    question: 'Who runs the delivery review?',
    group: 'sample',
    expected: ['guides/review-process.md'],
  },
  {
    question: 'Who owns communication during an incident?',
    group: 'sample',
    expected: ['guides/incident-process.md'],
  },
  {
    question: 'What has to be done before every client delivery?',
    group: 'sample',
    expected: ['qa-checklist.md'],
  },
  {
    question: 'What is the primary engagement metric?',
    group: 'sample',
    expected: ['analytics-events.md'],
  },
  {
    question: 'What went wrong with Korean text in July 2025?',
    group: 'sample',
    expected: ['postmortems/2025-07-localization-regression.md'],
  },

  // --- paraphrases: the words a newcomer would use, not the corpus's own ---
  {
    question: 'How big can an ad creative get before that network turns it down?',
    group: 'paraphrase',
    expected: ['network-specs-applovin.md'],
    note: 'never says "playable", "file size", or "AppLovin"',
  },
  {
    question:
      'Someone left a debugging switch on and data went somewhere it should not have. What did we change?',
    group: 'paraphrase',
    expected: ['postmortems/2025-11-analytics-leak.md'],
    note: 'describes the incident without naming analytics or the network',
  },
  {
    // Originally worded as "why is a developer not allowed to approve their own
    // team's work". Retrieval found the right document, but the model correctly
    // refused: the corpus states the rule and never gives a reason for it. An
    // eval case has to be answerable from the corpus, or it measures the
    // question rather than the system, and "why" questions often are not.
    question: 'Can someone sign off on work made by their own team?',
    group: 'paraphrase',
    expected: ['guides/review-process.md'],
    note: 'never says "review", "delivery", or "pod"',
  },
  {
    question: 'How quickly do we have to write up something that went wrong?',
    group: 'paraphrase',
    expected: ['guides/incident-process.md'],
    note: 'never says "postmortem" or "incident"',
  },
  {
    question: 'What number tells us whether players start playing quickly?',
    group: 'paraphrase',
    expected: ['analytics-events.md'],
    note: 'never says "event", "metric name", or "first_interaction"',
  },
  {
    question: 'Where do audio files go, and what must they stay out of?',
    group: 'paraphrase',
    expected: ['guides/asset-naming.md'],
  },
  {
    question: 'Which ad networks is the merge game aimed at?',
    group: 'paraphrase',
    expected: ['client-briefs/merge-marina.md'],
    note: 'refers to the game by genre rather than by name',
  },

  // --- out of corpus: the right answer is to refuse ---
  { question: 'What is the company vacation policy?', group: 'probe', expected: [] },
  { question: 'How much do senior developers get paid?', group: 'probe', expected: [] },
  { question: 'What health insurance plan does the company offer?', group: 'probe', expected: [] },
  { question: 'What is the office wifi password?', group: 'probe', expected: [] },
  { question: 'Who won the 2022 football world cup?', group: 'probe', expected: [] },
];
