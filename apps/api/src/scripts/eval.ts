/**
 * Retrieval evaluation.
 *
 * Exists so that claims about retrieval quality are numbers rather than
 * impressions, and so that tuning is a measurement rather than a guess. It is
 * also the gate a retrieval change has to pass: a change that does not move a
 * row here has not earned its complexity.
 *
 *   npm run eval                  score retrieval, no model calls, no API key
 *   npm run eval -- --rerank      also score with the cross-encoder, and compare
 *   npm run eval -- --answers     also generate answers (calls the model, costs money)
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  GroundedAnswerService,
  HybridRetriever,
  SqliteVectorStore,
  createEmbedder,
  createReranker,
  MIN_RELEVANCE_SCORE,
  type Retriever,
} from '@corpus/rag';
import type { RetrievalMode } from '@corpus/shared';
import { loadConfig, REPO_ROOT } from '../config.js';
import { initDatabase } from '../db/index.js';
import { chatModelFromConfig } from '../rag.js';
import { EVAL_CASES, type EvalGroup } from './eval-cases.js';
import {
  formatGroupLine,
  renderCaseTable,
  renderComparison,
  scoreGroup,
  type CaseResult,
  type GroupScore,
} from './eval-report.js';

const MODES: RetrievalMode[] = ['hybrid', 'vector', 'keyword'];
const GROUPS: EvalGroup[] = ['sample', 'paraphrase', 'probe'];
const TOP_K = 8;

async function runCases(retriever: Retriever, mode: RetrievalMode): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  for (const testCase of EVAL_CASES) {
    const startedAt = Date.now();
    const hits = await retriever.search({ query: testCase.question, limit: TOP_K, mode });
    const latencyMs = Date.now() - startedAt;

    const retrieved = [...new Set(hits.map((hit) => hit.path))];
    const firstMatch = retrieved.findIndex((path) => testCase.expected.includes(path));
    const bestSimilarity = hits.reduce((best, hit) => Math.max(best, hit.vectorScore ?? -1), -1);

    results.push({
      testCase,
      retrieved,
      hit: firstMatch !== -1,
      reciprocalRank: firstMatch === -1 ? 0 : 1 / (firstMatch + 1),
      bestSimilarity,
      aboveFloor: bestSimilarity >= MIN_RELEVANCE_SCORE,
      latencyMs,
    });
  }

  return results;
}

function medianLatency(results: CaseResult[]): number {
  const sorted = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const withAnswers = process.argv.includes('--answers');
  const withRerank = process.argv.includes('--rerank');
  const { db } = initDatabase(config.DATABASE_PATH);

  const embedder = createEmbedder(config.EMBEDDER, { cacheDir: config.MODEL_CACHE_DIR });
  const store = new SqliteVectorStore(db);
  const baseline = new HybridRetriever(db, store, embedder);

  const { n: chunkCount } = db.prepare('select count(*) as n from chunks').get() as { n: number };
  if (chunkCount === 0) {
    console.error('The index is empty. Run `npm run ingest` first.');
    process.exit(1);
  }

  const lines: string[] = [
    '# Retrieval evaluation',
    '',
    `Generated ${new Date().toISOString()} · embedder \`${embedder.id}\` · top-k ${TOP_K} · relevance floor ${MIN_RELEVANCE_SCORE}`,
    '',
    `${EVAL_CASES.length} cases in three groups. **sample** are straightforward questions, including`,
    'the five shipped with the case. **paraphrase** ask the way someone who has not read the',
    'documents would, avoiding the vocabulary the corpus itself uses, which is where keyword',
    'matching stops helping. **probe** cannot be answered from the corpus at all: passing means',
    'retrieving nothing above the relevance floor, so the system refuses rather than assembling',
    'something plausible from unrelated passages.',
    '',
    'The floor is applied to cosine similarity, not to the fused RRF score. RRF is rank-derived,',
    'something always ranks first, so an out-of-corpus question fuses to the same score as a',
    'well-answered one. Only the raw similarity distinguishes them.',
    '',
  ];

  const baselineScores: Record<RetrievalMode, GroupScore[]> = {
    hybrid: [],
    vector: [],
    keyword: [],
  };
  let hybridBaselineLatency = 0;

  for (const mode of MODES) {
    const results = await runCases(baseline, mode);
    const scores = GROUPS.map((group) => scoreGroup(group, results));
    baselineScores[mode] = scores;
    if (mode === 'hybrid') hybridBaselineLatency = medianLatency(results);

    lines.push(`## Mode: ${mode}`, '');
    for (const score of scores) {
      lines.push(
        score.group === 'probe'
          ? `- **probe**: refused ${score.refused}/${score.total}`
          : `- **${score.group}**: hit@${TOP_K} ${(score.hitRate * 100).toFixed(0)}%, MRR ${score.mrr.toFixed(3)} (${score.hits}/${score.total})`,
      );
    }
    lines.push('', `Median retrieval latency: ${medianLatency(results)} ms`, '');
    lines.push(...renderCaseTable(results, TOP_K), '');

    console.log(`\n${mode}`);
    for (const score of scores) console.log(formatGroupLine(score.group, score));
  }

  // --- reranking, measured against the same cases -------------------------
  if (withRerank) {
    console.log('\nreranked (cross-encoder)');
    const reranker = createReranker('local:ms-marco-MiniLM-L-6-v2', {
      cacheDir: config.MODEL_CACHE_DIR,
      onDownloadStart: () =>
        console.log('  loading the cross-encoder (first run downloads ~23 MB)...'),
    });
    const reranked = new HybridRetriever(db, store, embedder, { reranker });

    const results = await runCases(reranked, 'hybrid');
    const scores = GROUPS.map((group) => scoreGroup(group, results));
    for (const score of scores) console.log(formatGroupLine(score.group, score));

    lines.push(
      '## Reranking',
      '',
      `Candidates from hybrid retrieval, reordered by \`${reranker.id}\`, a cross-encoder that`,
      'scores each passage against the query directly rather than comparing two independently',
      'computed vectors. It is slower, so it only ever runs over the shortlist.',
      '',
      `Median retrieval latency: ${medianLatency(results)} ms, against ${hybridBaselineLatency} ms without it.`,
      '',
      ...renderComparison('Hybrid, with and without reranking', baselineScores.hybrid, scores),
      ...renderCaseTable(results, TOP_K),
      '',
    );
  }

  if (withAnswers) {
    lines.push('## Generated answers (hybrid)', '');
    const answerService = new GroundedAnswerService({
      retriever: baseline,
      chatModel: chatModelFromConfig(config),
    });

    for (const testCase of EVAL_CASES) {
      let text = '';
      let status = 'unknown';
      let citations: string[] = [];

      for await (const event of answerService.answer({
        question: testCase.question,
        mode: 'hybrid',
        topK: TOP_K,
      })) {
        if (event.type === 'done') {
          status = event.result.status;
          text = event.result.text;
          citations = event.result.citations.map((c) => c.path);
        }
        if (event.type === 'error') {
          status = 'error';
          text = event.message;
        }
      }

      const expectation =
        testCase.expected.length === 0
          ? 'must refuse'
          : `must cite ${testCase.expected.join(', ')}`;

      lines.push(
        `### ${testCase.question}`,
        '',
        `_${expectation}_${testCase.note ? ` · ${testCase.note}` : ''}`,
        '',
        `**${status}**, cites ${citations.length > 0 ? citations.join(', ') : 'nothing'}`,
        '',
        `> ${text.replace(/\n/g, '\n> ')}`,
        '',
      );

      console.log(`${status.padEnd(9)} ${testCase.question.slice(0, 62)}`);
    }
  }

  await writeFile(join(REPO_ROOT, 'docs', 'eval-results.md'), lines.join('\n'), 'utf8');
  console.log('\nWrote docs/eval-results.md');
  db.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
