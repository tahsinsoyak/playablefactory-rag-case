import type { CompletionModel } from '../generation/completion.js';

/**
 * A model scoring another model's answer.
 *
 * Three constraints keep the verdicts worth reading:
 *
 * 1. **The judge sees no ground truth.** It gets the question, the passages, and
 *    the answer, and nothing about which document was "expected". Told the
 *    intended source, a judge tends to score agreement with that label rather
 *    than support by the evidence, which is a different measurement.
 * 2. **It judges only against the cited passages.** The question is whether the
 *    answer is supported by what it claimed to use, not whether it happens to be
 *    true of the world.
 * 3. **It should not be the model under test.** Models rate their own output
 *    generously. `JUDGE_MODEL` defaults to something other than `LLM_MODEL` for
 *    that reason, and the report records both so a reader can see whether they
 *    were the same.
 */
export interface JudgeVerdict {
  /** Every claim traceable to the passages. */
  faithful: boolean;
  /** Actually answers what was asked, rather than something adjacent. */
  relevant: boolean;
  /** 1 to 5, where 5 is fully supported and directly responsive. */
  score: number;
  reasoning: string;
  /** Claims the judge could not trace to the passages. */
  unsupportedClaims: string[];
}

const SYSTEM_PROMPT = `You grade answers produced by a retrieval system. You are strict, literal, and brief.

You are given a question, the source passages the answer was allowed to use, and the answer. Judge only whether the answer is supported by those passages and whether it responds to the question. Do not use outside knowledge, and do not reward fluency.

Rules:
- An answer is faithful only if every factual claim in it can be traced to the passages. A single invented figure, name, or causal claim makes it unfaithful.
- An answer is relevant if it addresses what was actually asked. Answering a related but different question is not relevant.
- An answer that declines because the passages do not cover the question is faithful, and relevant if the passages genuinely do not cover it.
- Bracketed numbers like [1] are citation markers, not claims.

Reply with JSON only, no prose around it:
{"faithful": true|false, "relevant": true|false, "score": 1-5, "reasoning": "one sentence", "unsupportedClaims": ["..."]}`;

export interface NumberedPassage {
  index: number;
  text: string;
}

/**
 * The passages must carry the numbers the answer actually used.
 *
 * An earlier version handed the judge only the cited passages, renumbered from
 * one. The judge then reported citations like [7] as fabricated, and it was
 * right: in the list it had been given, [7] did not exist. The answers were fine
 * and the harness was lying to the judge. Preserving the original numbering makes
 * "does this citation exist" a question about the answer rather than about how
 * the evidence was assembled.
 */
function buildUserMessage(question: string, passages: NumberedPassage[], answer: string): string {
  const sources = passages.map(
    (passage) => `<passage n="${passage.index}">\n${passage.text}\n</passage>`,
  );

  return `<question>${question}</question>

<passages>
${sources.join('\n\n')}
</passages>

<answer>
${answer}
</answer>`;
}

/**
 * Pulls the JSON object out of a reply.
 *
 * Models wrap JSON in prose or fences even when told not to, and a judge that
 * throws on its own formatting would fail the run rather than the answer.
 */
function parseVerdict(reply: string): JudgeVerdict {
  const match = /\{[\s\S]*\}/.exec(reply);
  if (!match) throw new Error(`The judge returned no JSON object: ${reply.slice(0, 160)}`);

  const parsed = JSON.parse(match[0]) as Partial<JudgeVerdict>;

  return {
    faithful: parsed.faithful === true,
    relevant: parsed.relevant === true,
    score: typeof parsed.score === 'number' ? Math.min(5, Math.max(1, parsed.score)) : 1,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'no reasoning given',
    unsupportedClaims: Array.isArray(parsed.unsupportedClaims)
      ? parsed.unsupportedClaims.filter((claim): claim is string => typeof claim === 'string')
      : [],
  };
}

export async function judgeAnswer(
  model: CompletionModel,
  input: { question: string; passages: NumberedPassage[]; answer: string },
): Promise<JudgeVerdict> {
  const reply = await model.complete(
    SYSTEM_PROMPT,
    buildUserMessage(input.question, input.passages, input.answer),
  );

  return parseVerdict(reply);
}

export { parseVerdict as parseJudgeVerdict };
