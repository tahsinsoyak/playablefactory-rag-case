import type { AnswerResult, SearchHit } from '@corpus/shared';

/**
 * Deterministic answer checks.
 *
 * These run before any judge model and cost nothing. They catch the failures
 * that matter most and do not need an opinion to detect: a citation pointing at
 * the wrong document, a refusal on a question the corpus answers, and a figure
 * in the answer that appears in none of the passages it cites.
 *
 * Keeping them separate from the judge matters. A model scoring another model is
 * useful for "is this well supported", and unnecessary for "does 5 MB appear in
 * the cited text", which is a string search. Spending a model call on the second
 * kind would add cost, latency, and a source of disagreement to a question that
 * has a definite answer.
 */

export interface CitationScore {
  /** Of the documents cited, how many were expected. */
  precision: number;
  /** Of the documents expected, how many were cited. */
  recall: number;
  cited: string[];
  expected: string[];
  missing: string[];
  unexpected: string[];
}

export function scoreCitations(
  cited: string[],
  expected: string[],
  acceptable: string[] = [],
): CitationScore {
  const citedSet = [...new Set(cited)];
  const correct = citedSet.filter((path) => expected.includes(path));
  // Precision counts a citation as good if it was required or explicitly allowed
  // as supporting context. Recall still measures only the required documents.
  const allowed = citedSet.filter((path) => expected.includes(path) || acceptable.includes(path));

  return {
    precision: citedSet.length === 0 ? 0 : allowed.length / citedSet.length,
    recall: expected.length === 0 ? 1 : correct.length / expected.length,
    cited: citedSet,
    expected,
    missing: expected.filter((path) => !citedSet.includes(path)),
    unexpected: citedSet.filter((path) => !expected.includes(path) && !acceptable.includes(path)),
  };
}

/**
 * Numbers and identifiers stated in the answer.
 *
 * These are the claims a reader is most likely to act on and least able to
 * sanity-check, so an invented one is the most damaging kind of error. They are
 * also the easiest to verify mechanically, which is exactly why this is not left
 * to a judge.
 */
const PROSE_ABBREVIATIONS = new Set(['e.g', 'i.e', 'e.g.', 'i.e.', 'a.m', 'p.m', 'etc.']);

export function extractFactualTokens(text: string): string[] {
  const tokens = new Set<string>();

  // Numbers, with or without a unit: 5 MB, 3 seconds, 180 KB, 2.6.
  for (const match of text.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:MB|KB|GB|ms|s\b|%)?/gi)) {
    const value = match[0].trim();
    // Bare single digits are usually list numbering or citation markers.
    if (/^\d$/.test(value)) continue;
    tokens.add(value.toLowerCase());
  }

  // Dotted or underscored identifiers: LumenSDK.init, first_interaction.
  // Prose abbreviations match the same shape and are not claims about the
  // corpus, so they are excluded by name rather than with a cleverer pattern.
  for (const match of text.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:[._][A-Za-z0-9]+)+\b/g)) {
    const token = match[0].toLowerCase();
    if (PROSE_ABBREVIATIONS.has(token)) continue;
    tokens.add(token);
  }

  return [...tokens];
}

export interface GroundingScore {
  /** Share of factual tokens that appear in the cited passages. */
  supported: number;
  checked: number;
  /** Tokens found nowhere in the cited text. Each is a candidate fabrication. */
  unsupported: string[];
}

/** Normalises spacing so "5 MB" in the answer matches "5MB" in a passage. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Checks the answer's figures against the text it cited.
 *
 * Only the cited passages count, not everything retrieved. An answer that cites
 * document A while taking its numbers from document B is not grounded in what it
 * claimed, and that is precisely the failure worth catching.
 */
export function scoreGrounding(result: AnswerResult, hits: SearchHit[]): GroundingScore {
  if (result.status !== 'answered') {
    return { supported: 1, checked: 0, unsupported: [] };
  }

  const citedChunkIds = new Set(result.citations.flatMap((c) => c.chunkIds));
  const citedText = normalise(
    hits
      .filter((hit) => citedChunkIds.has(hit.chunkId))
      .map((hit) => `${hit.title} ${hit.heading ?? ''} ${hit.text}`)
      .join(' '),
  );

  // Citation markers are the answer's own scaffolding, not claims about the corpus.
  const withoutMarkers = result.text.replace(/\[[\d,\s]+\]/g, ' ');
  const tokens = extractFactualTokens(withoutMarkers);

  const unsupported = tokens.filter((token) => !citedText.includes(normalise(token)));

  return {
    supported: tokens.length === 0 ? 1 : (tokens.length - unsupported.length) / tokens.length,
    checked: tokens.length,
    unsupported,
  };
}

/** Did the system answer when it should have, and refuse when it should have? */
export function scoreRefusalDecision(
  result: AnswerResult,
  expected: string[],
): { correct: boolean; detail: string } {
  const shouldRefuse = expected.length === 0;
  const didRefuse = result.status === 'refused';

  if (shouldRefuse && didRefuse) return { correct: true, detail: 'correctly refused' };
  if (!shouldRefuse && !didRefuse) return { correct: true, detail: 'correctly answered' };
  if (shouldRefuse && !didRefuse) {
    return { correct: false, detail: 'answered a question the corpus cannot support' };
  }
  return { correct: false, detail: 'refused a question the corpus does answer' };
}
