import type { EvalCase, EvalGroup } from './eval-cases.js';

export interface CaseResult {
  testCase: EvalCase;
  retrieved: string[];
  hit: boolean;
  /** Reciprocal rank of the first expected document, 0 when it never appears. */
  reciprocalRank: number;
  /** Best cosine similarity among the hits. What the refusal gate reads. */
  bestSimilarity: number;
  aboveFloor: boolean;
  latencyMs: number;
}

export interface GroupScore {
  group: EvalGroup;
  total: number;
  hits: number;
  hitRate: number;
  mrr: number;
  /** Probes only: how many correctly fell below the relevance floor. */
  refused: number;
}

/**
 * Scores one group.
 *
 * Answerable groups are scored on hit rate and MRR. Probes invert the test: they
 * pass by retrieving nothing above the floor, so a "hit" there would be a
 * failure.
 */
export function scoreGroup(group: EvalGroup, results: CaseResult[]): GroupScore {
  const inGroup = results.filter((r) => r.testCase.group === group);
  const answerable = inGroup.filter((r) => r.testCase.expected.length > 0);

  const hits = answerable.filter((r) => r.hit).length;
  const mrr =
    answerable.length === 0
      ? 0
      : answerable.reduce((sum, r) => sum + r.reciprocalRank, 0) / answerable.length;

  return {
    group,
    total: inGroup.length,
    hits,
    hitRate: answerable.length === 0 ? 0 : hits / answerable.length,
    mrr,
    refused: inGroup.filter((r) => r.testCase.expected.length === 0 && !r.aboveFloor).length,
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/** One line per group, for the console. */
export function formatGroupLine(label: string, score: GroupScore): string {
  if (score.group === 'probe') {
    return `  ${label.padEnd(22)} refused ${score.refused}/${score.total}`;
  }
  return `  ${label.padEnd(22)} hit ${percent(score.hitRate).padStart(4)}  MRR ${score.mrr.toFixed(3)}  (${score.hits}/${score.total})`;
}

/** The per-case table written into the report. */
export function renderCaseTable(results: CaseResult[], topK: number): string[] {
  const lines = [
    `| Question | Expected | Rank | Best cosine | Result |`,
    `| --- | --- | --- | --- | --- |`,
  ];

  for (const result of results) {
    const isProbe = result.testCase.expected.length === 0;
    const rank =
      result.reciprocalRank === 0 ? 'n/a' : String(Math.round(1 / result.reciprocalRank));

    const verdict = isProbe
      ? result.aboveFloor
        ? 'FAIL, would answer'
        : 'pass, refuses'
      : result.hit
        ? `pass (rank ${rank})`
        : `FAIL, not in top ${topK}`;

    lines.push(
      `| ${result.testCase.question} | ${isProbe ? '_(nothing)_' : result.testCase.expected.join(', ')} | ${isProbe ? 'n/a' : rank} | ${result.bestSimilarity.toFixed(4)} | ${verdict} |`,
    );
  }

  return lines;
}

/**
 * Compares two runs.
 *
 * The reason the eval exists in this shape: a change to retrieval should have to
 * show what it bought. A row here that moved the wrong way is an argument
 * against shipping the change, not a detail to explain away.
 */
export function renderComparison(
  label: string,
  before: GroupScore[],
  after: GroupScore[],
): string[] {
  const lines = [
    `| Group | hit@k before | hit@k after | MRR before | MRR after | Change |`,
    `| --- | --- | --- | --- | --- | --- |`,
  ];

  for (const beforeScore of before) {
    const afterScore = after.find((s) => s.group === beforeScore.group);
    if (!afterScore || beforeScore.group === 'probe') continue;

    const delta = afterScore.mrr - beforeScore.mrr;
    const arrow =
      delta > 0.0005 ? `+${delta.toFixed(3)}` : delta < -0.0005 ? delta.toFixed(3) : 'no change';

    lines.push(
      `| ${beforeScore.group} | ${percent(beforeScore.hitRate)} | ${percent(afterScore.hitRate)} | ${beforeScore.mrr.toFixed(3)} | ${afterScore.mrr.toFixed(3)} | ${arrow} |`,
    );
  }

  return [`### ${label}`, '', ...lines, ''];
}
