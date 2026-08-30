/**
 * Retrieval evaluation.
 *
 * Runs the sample questions shipped with the case plus out-of-corpus probes, and
 * reports hit@k and MRR per retrieval mode. This exists so that claims about
 * retrieval quality are numbers rather than impressions, and so that tuning the
 * relevance floor is a measurement rather than a guess.
 *
 * `npm run eval` scores retrieval only - no model calls, no API key needed.
 * `npm run eval -- --answers` additionally generates answers for the questions,
 * which does call the model and does cost money.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  GroundedAnswerService,
  HybridRetriever,
  SqliteVectorStore,
  createEmbedder,
  MIN_RELEVANCE_SCORE,
} from '@corpus/rag';
import type { RetrievalMode } from '@corpus/shared';
import { loadConfig, REPO_ROOT } from '../config.js';
import { initDatabase } from '../db/index.js';
import { chatModelFromConfig } from '../rag.js';

interface EvalCase {
  question: string;
  /** Documents a good answer must cite. Empty means the corpus cannot answer it. */
  expected: string[];
  note?: string;
}

/** The five from `docs/sample_questions.md`, plus the out-of-corpus probes it asks for. */
const CASES: EvalCase[] = [
  {
    question: 'What is the maximum file size for an AppLovin playable, and how does it ship?',
    expected: ['network-specs-applovin.md'],
  },
  {
    question: 'How do I initialize the current Lumen SDK, and what happened to lumen.track?',
    expected: ['sdk-notes-v3.md'],
    note: 'sdk-notes-v2.md is deprecated; a good answer says so',
  },
  {
    question: 'Why are sound assets built in a separate pass?',
    expected: ['build-pipeline.md'],
    note: 'incident-postmortem-2026-03.md adds useful context',
  },
  {
    question: 'What caused the March 2026 AppLovin rejections and what was fixed?',
    expected: ['incident-postmortem-2026-03.md'],
  },
  {
    question: 'Which languages must every playable ship with, and what is the fallback?',
    expected: ['localization-guide.md'],
  },
  { question: 'What is the company vacation policy?', expected: [] },
  { question: 'How much do senior developers get paid?', expected: [] },
  { question: 'What health insurance plan does the company offer?', expected: [] },
];

const MODES: RetrievalMode[] = ['hybrid', 'vector', 'keyword'];
const TOP_K = 8;

interface CaseResult {
  question: string;
  expected: string[];
  retrieved: string[];
  hit: boolean;
  /** Reciprocal rank of the first expected document, 0 when it never appears. */
  reciprocalRank: number;
  topScore: number;
  /** Best cosine similarity among the hits. What the refusal gate actually reads. */
  bestSimilarity: number;
  aboveFloor: boolean;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const withAnswers = process.argv.includes('--answers');
  const { db } = initDatabase(config.DATABASE_PATH);

  const embedder = createEmbedder(config.EMBEDDER, { cacheDir: config.MODEL_CACHE_DIR });
  const store = new SqliteVectorStore(db);
  const retriever = new HybridRetriever(db, store, embedder);

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
    'Answerable cases score hit@k (is the expected document retrieved at all) and MRR',
    '(how high it ranks). Out-of-corpus cases invert the test: the system passes by',
    'retrieving *nothing above the relevance floor*, so that it refuses instead of',
    'assembling an answer from unrelated passages.',
    '',
    'The floor is applied to cosine similarity, not to the fused RRF score. RRF is',
    'rank-derived - something always ranks first - so an out-of-corpus question fuses',
    'to the same score as a well-answered one. Only the raw similarity distinguishes',
    'them, and keeping both columns visible is what makes that checkable.',
    '',
  ];

  const answerable = CASES.filter((c) => c.expected.length > 0);

  for (const mode of MODES) {
    const results: CaseResult[] = [];

    for (const testCase of CASES) {
      const hits = await retriever.search({ query: testCase.question, limit: TOP_K, mode });
      const retrieved = [...new Set(hits.map((hit) => hit.path))];

      const firstMatch = retrieved.findIndex((path) => testCase.expected.includes(path));
      const topScore = hits[0]?.score ?? 0;
      const bestSimilarity = hits.reduce((best, hit) => Math.max(best, hit.vectorScore ?? -1), -1);

      results.push({
        question: testCase.question,
        expected: testCase.expected,
        retrieved,
        hit: firstMatch !== -1,
        reciprocalRank: firstMatch === -1 ? 0 : 1 / (firstMatch + 1),
        topScore,
        bestSimilarity,
        aboveFloor: bestSimilarity >= MIN_RELEVANCE_SCORE,
      });
    }

    const answerableResults = results.slice(0, answerable.length);
    const unanswerableResults = results.slice(answerable.length);

    const hitRate = answerableResults.filter((r) => r.hit).length / answerableResults.length;
    const mrr =
      answerableResults.reduce((sum, r) => sum + r.reciprocalRank, 0) / answerableResults.length;
    const correctlyRejected = unanswerableResults.filter((r) => !r.aboveFloor).length;

    lines.push(
      `## Mode: ${mode}`,
      '',
      `- hit@${TOP_K}: **${(hitRate * 100).toFixed(0)}%** (${answerableResults.filter((r) => r.hit).length}/${answerableResults.length})`,
      `- MRR: **${mrr.toFixed(3)}**`,
      `- out-of-corpus correctly below the floor: **${correctlyRejected}/${unanswerableResults.length}**`,
      '',
      '| Question | Expected | Rank | Best cosine | Result |',
      '| --- | --- | --- | --- | --- |',
    );

    for (const result of results) {
      const isProbe = result.expected.length === 0;
      const rank =
        result.reciprocalRank === 0 ? 'n/a' : String(Math.round(1 / result.reciprocalRank));
      const verdict = isProbe
        ? result.aboveFloor
          ? 'FAIL, would answer'
          : 'pass, refuses'
        : result.hit
          ? 'pass'
          : 'FAIL, not retrieved';

      lines.push(
        `| ${result.question} | ${isProbe ? '_(nothing)_' : result.expected.join(', ')} | ${isProbe ? 'n/a' : rank} | ${result.bestSimilarity.toFixed(4)} | ${verdict} |`,
      );
    }

    lines.push('');
    console.log(
      `${mode.padEnd(8)} hit@${TOP_K} ${(hitRate * 100).toFixed(0)}%  MRR ${mrr.toFixed(3)}  refused ${correctlyRejected}/${unanswerableResults.length}`,
    );
  }

  if (withAnswers) {
    lines.push('## Generated answers (hybrid)', '');
    const chatModel = chatModelFromConfig(config);
    const answerService = new GroundedAnswerService({ retriever, chatModel });

    for (const testCase of CASES) {
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

      const expectedNote =
        testCase.expected.length === 0
          ? 'must refuse'
          : `must cite ${testCase.expected.join(', ')}`;

      lines.push(
        `### ${testCase.question}`,
        '',
        `_${expectedNote}_${testCase.note ? ` · ${testCase.note}` : ''}`,
        '',
        `**${status}**. Cites ${citations.length > 0 ? citations.join(', ') : 'nothing'}`,
        '',
        `> ${text.replace(/\n/g, '\n> ')}`,
        '',
      );

      console.log(`${status.padEnd(9)} ${testCase.question.slice(0, 60)}`);
    }
  }

  // Anchored to the repo root: npm runs a workspace script with its cwd inside
  // that workspace, so a relative path would write into apps/api/docs.
  await writeFile(join(REPO_ROOT, 'docs', 'eval-results.md'), lines.join('\n'), 'utf8');
  console.log('\nWrote docs/eval-results.md');
  db.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
