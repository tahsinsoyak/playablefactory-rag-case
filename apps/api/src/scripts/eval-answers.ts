/**
 * Answer-quality evaluation.
 *
 * The retrieval eval measures whether the right passages come back. This one
 * measures what is done with them: are the citations right, are the figures
 * real, and does the system answer when it can and decline when it cannot.
 *
 *   npm run eval:answers            deterministic checks only, one model call per case
 *   npm run eval:answers -- --judge also score each answer with a judge model
 *
 * Both cost money, because both generate real answers. The judge costs a second
 * call per case on top.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  GroundedAnswerService,
  HybridRetriever,
  SqliteVectorStore,
  createCompletionModel,
  createEmbedder,
  createReranker,
  judgeAnswer,
  numberSources,
  rerankingDisabled,
  scoreCitations,
  scoreGrounding,
  scoreRefusalDecision,
  type JudgeVerdict,
} from '@corpus/rag';
import type { AnswerResult, SearchHit } from '@corpus/shared';
import { loadConfig, REPO_ROOT } from '../config.js';
import { initDatabase } from '../db/index.js';
import { chatModelFromConfig } from '../rag.js';
import { EVAL_CASES, type EvalCase } from './eval-cases.js';

const TOP_K = 8;

interface AnswerOutcome {
  testCase: EvalCase;
  result: AnswerResult;
  hits: SearchHit[];
  latencyMs: number;
  verdict?: JudgeVerdict;
  judgeError?: string;
}

function summarise(outcomes: AnswerOutcome[]) {
  const answerable = outcomes.filter((o) => o.testCase.expected.length > 0);
  const answered = answerable.filter((o) => o.result.status === 'answered');

  const citation = answered.map((o) =>
    scoreCitations(
      o.result.status === 'answered' ? o.result.citations.map((c) => c.path) : [],
      o.testCase.expected,
      o.testCase.acceptable ?? [],
    ),
  );
  const grounding = answered.map((o) => scoreGrounding(o.result, o.hits));

  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

  return {
    total: outcomes.length,
    decisionAccuracy: mean(
      outcomes.map((o) => (scoreRefusalDecision(o.result, o.testCase.expected).correct ? 1 : 0)),
    ),
    citationPrecision: mean(citation.map((c) => c.precision)),
    citationRecall: mean(citation.map((c) => c.recall)),
    groundedFigures: mean(grounding.map((g) => g.supported)),
    figuresChecked: grounding.reduce((sum, g) => sum + g.checked, 0),
    medianLatency: (() => {
      const sorted = outcomes.map((o) => o.latencyMs).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0;
    })(),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const withJudge = process.argv.includes('--judge');
  const { db } = initDatabase(config.DATABASE_PATH);

  const embedder = createEmbedder(config.EMBEDDER, { cacheDir: config.MODEL_CACHE_DIR });
  const store = new SqliteVectorStore(db);
  const reranker = rerankingDisabled(config.RERANKER)
    ? undefined
    : createReranker(config.RERANKER, { cacheDir: config.MODEL_CACHE_DIR });
  const retriever = new HybridRetriever(db, store, embedder, reranker ? { reranker } : {});

  const answerService = new GroundedAnswerService({
    retriever,
    chatModel: chatModelFromConfig(config),
  });

  // `--judge-model=<id>` overrides JUDGE_MODEL for one run, so two judges can be
  // compared without editing .env.
  const judgeModelArg = process.argv
    .find((arg) => arg.startsWith('--judge-model='))
    ?.slice('--judge-model='.length);
  const judgeModel = judgeModelArg ?? config.JUDGE_MODEL;

  // A model grading its own output rates it generously, so a run where the judge
  // and the candidate are the same model does not measure what the report says
  // it measures. Refusing is better than printing a number that looks like
  // evidence and is not.
  if (withJudge && judgeModel === config.LLM_MODEL) {
    console.error(
      [
        `The judge and the answering model are both "${judgeModel}".`,
        'A model grading its own output rates it generously, so the score would not mean',
        'what the report claims. Set JUDGE_MODEL to a different model, or pass',
        '--judge-model=<id>. See https://openrouter.ai/models.',
      ].join('\n'),
    );
    process.exit(1);
  }

  const judge = withJudge
    ? createCompletionModel({
        provider: config.LLM_PROVIDER,
        model: judgeModel,
        apiKey: config.ANTHROPIC_API_KEY,
        openRouterApiKey: config.OPENROUTER_API_KEY,
      })
    : undefined;

  console.log(`answering ${EVAL_CASES.length} cases with ${config.LLM_MODEL}`);
  if (judge) console.log(`judging with ${judge.id}\n`);

  const outcomes: AnswerOutcome[] = [];

  for (const testCase of EVAL_CASES) {
    const startedAt = Date.now();
    let result: AnswerResult = {
      status: 'refused',
      reason: 'no_relevant_context',
      text: 'no result',
      citations: [],
    };
    let hits: SearchHit[] = [];

    for await (const event of answerService.answer({
      question: testCase.question,
      mode: 'hybrid',
      topK: TOP_K,
    })) {
      if (event.type === 'retrieval') hits = event.hits;
      if (event.type === 'done') result = event.result;
      if (event.type === 'error') {
        result = {
          status: 'refused',
          reason: 'no_relevant_context',
          text: `error: ${event.message}`,
          citations: [],
        };
      }
    }

    const outcome: AnswerOutcome = { testCase, result, hits, latencyMs: Date.now() - startedAt };

    if (judge) {
      // Numbered exactly as the answering prompt numbered them, so a marker like
      // [7] in the answer points at the same passage the judge is looking at.
      // The judge is still never told which document was expected, so it scores
      // support by the evidence rather than agreement with a label.
      const passages = numberSources(hits).map((source) => ({
        index: source.index,
        text: [`${source.title} (${source.path})`, ...source.passages].join('\n\n'),
      }));

      try {
        outcome.verdict = await judgeAnswer(judge, {
          question: testCase.question,
          passages,
          answer: result.text,
        });
      } catch (error) {
        outcome.judgeError = error instanceof Error ? error.message : String(error);
      }
    }

    outcomes.push(outcome);

    const decision = scoreRefusalDecision(result, testCase.expected);
    const verdictMark = outcome.verdict
      ? ` judge ${outcome.verdict.score}/5${outcome.verdict.faithful ? '' : ' UNFAITHFUL'}`
      : '';
    console.log(
      `  ${(decision.correct ? 'ok  ' : 'FAIL').padEnd(5)}${result.status.padEnd(9)}${verdictMark}  ${testCase.question.slice(0, 52)}`,
    );
  }

  const summary = summarise(outcomes);
  const judged = outcomes.filter((o) => o.verdict);

  const lines: string[] = [
    '# Answer quality',
    '',
    `Generated ${new Date().toISOString()} · answering with \`${config.LLM_MODEL}\`${judge ? ` · judged by \`${judge.id}\`` : ''}`,
    '',
    'The retrieval eval measures whether the right passages come back. This measures what is',
    'done with them. Deterministic checks run first and cost nothing: they catch a citation',
    'pointing at the wrong document, a refusal on a question the corpus answers, and a figure',
    'that appears in none of the passages the answer cited. A judge model is only asked the',
    'part that genuinely needs an opinion.',
    '',
    '## Deterministic',
    '',
    `| Measure | Result |`,
    `| --- | --- |`,
    `| Answer-or-refuse decision correct | **${(summary.decisionAccuracy * 100).toFixed(0)}%** (${summary.total} cases) |`,
    `| Citation precision | ${(summary.citationPrecision * 100).toFixed(0)}% |`,
    `| Citation recall | ${(summary.citationRecall * 100).toFixed(0)}% |`,
    `| Figures traceable to cited passages | **${(summary.groundedFigures * 100).toFixed(0)}%** (${summary.figuresChecked} checked) |`,
    `| Median end-to-end latency | ${summary.medianLatency} ms |`,
    '',
  ];

  if (judged.length > 0) {
    const faithful = judged.filter((o) => o.verdict?.faithful).length;
    const relevant = judged.filter((o) => o.verdict?.relevant).length;
    const meanScore = judged.reduce((sum, o) => sum + (o.verdict?.score ?? 0), 0) / judged.length;

    lines.push(
      '## Judged',
      '',
      `Answers came from \`${config.LLM_MODEL}\`; the judge is \`${judge?.id}\`. They are`,
      `different models, and the eval refuses to run if they are not.`,
      '',
      `The judge sees the question, the cited passages, and the answer. It is never told which`,
      `document was expected, so it scores support by the evidence rather than agreement with a`,
      `label. It runs as \`${judge?.id}\`, chosen to differ from the answering model where`,
      `possible: models rate their own output generously.`,
      '',
      `| Measure | Result |`,
      `| --- | --- |`,
      `| Faithful (every claim traceable) | **${faithful}/${judged.length}** |`,
      `| Relevant (answers what was asked) | **${relevant}/${judged.length}** |`,
      `| Mean score | **${meanScore.toFixed(2)} / 5** |`,
      '',
    );
  }

  lines.push('## Per case', '');

  for (const outcome of outcomes) {
    const decision = scoreRefusalDecision(outcome.result, outcome.testCase.expected);
    const grounding = scoreGrounding(outcome.result, outcome.hits);
    const cited =
      outcome.result.status === 'answered' ? outcome.result.citations.map((c) => c.path) : [];
    const citation = scoreCitations(
      cited,
      outcome.testCase.expected,
      outcome.testCase.acceptable ?? [],
    );

    lines.push(
      `### ${outcome.testCase.question}`,
      '',
      `_${outcome.testCase.expected.length === 0 ? 'must refuse' : `must cite ${outcome.testCase.expected.join(', ')}`}_`,
      '',
      `- decision: **${decision.detail}**${decision.correct ? '' : ' (FAIL)'}`,
      `- cited: ${cited.length > 0 ? cited.join(', ') : 'nothing'}`,
    );

    if (outcome.testCase.expected.length > 0 && outcome.result.status === 'answered') {
      lines.push(
        `- citation precision ${(citation.precision * 100).toFixed(0)}%, recall ${(citation.recall * 100).toFixed(0)}%`,
      );
    }

    if (grounding.checked > 0) {
      lines.push(
        `- figures: ${grounding.checked - grounding.unsupported.length}/${grounding.checked} traceable${grounding.unsupported.length > 0 ? ` (unsupported: ${grounding.unsupported.join(', ')})` : ''}`,
      );
    }

    if (outcome.verdict) {
      lines.push(
        `- judge: **${outcome.verdict.score}/5**, faithful ${outcome.verdict.faithful ? 'yes' : '**no**'}, relevant ${outcome.verdict.relevant ? 'yes' : '**no**'}`,
        `- judge says: ${outcome.verdict.reasoning}`,
      );
      if (outcome.verdict.unsupportedClaims.length > 0) {
        lines.push(`- unsupported claims: ${outcome.verdict.unsupportedClaims.join('; ')}`);
      }
    }
    if (outcome.judgeError) lines.push(`- judge failed: ${outcome.judgeError}`);

    lines.push('', `> ${outcome.result.text.replace(/\n/g, '\n> ')}`, '');
  }

  await writeFile(join(REPO_ROOT, 'docs', 'answer-quality.md'), lines.join('\n'), 'utf8');

  console.log(`\ndecision accuracy   ${(summary.decisionAccuracy * 100).toFixed(0)}%`);
  console.log(`citation precision  ${(summary.citationPrecision * 100).toFixed(0)}%`);
  console.log(`citation recall     ${(summary.citationRecall * 100).toFixed(0)}%`);
  console.log(
    `figures grounded    ${(summary.groundedFigures * 100).toFixed(0)}% (${summary.figuresChecked} checked)`,
  );
  if (judged.length > 0) {
    const meanScore = judged.reduce((sum, o) => sum + (o.verdict?.score ?? 0), 0) / judged.length;
    console.log(`judge mean score    ${meanScore.toFixed(2)} / 5`);
  }
  console.log('\nWrote docs/answer-quality.md');

  db.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
