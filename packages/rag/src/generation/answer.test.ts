import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AnswerEvent, SearchHit } from '@corpus/shared';
import type { ChatModel, Retriever } from '../ports/index.js';
import { GroundedAnswerService, MIN_RELEVANCE_SCORE } from './answer-service.js';
import { extractCitedIndexes, numberSources } from './prompt.js';

function hit(overrides: Partial<SearchHit> & { path: string; vectorScore: number }): SearchHit {
  return {
    chunkId: `chunk-${overrides.path}-${overrides.ordinal ?? 0}`,
    documentId: `doc-${overrides.path}`,
    title: overrides.path,
    docType: 'reference',
    docDate: null,
    heading: null,
    text: 'passage text',
    ordinal: 0,
    score: 0.03,
    vectorRank: 1,
    keywordRank: 1,
    ...overrides,
  };
}

class StubRetriever implements Retriever {
  constructor(private readonly hits: SearchHit[]) {}
  async search(): Promise<SearchHit[]> {
    return this.hits;
  }
}

class StubChatModel implements ChatModel {
  readonly id = 'stub-model';
  called = false;

  constructor(private readonly reply: string) {}

  async *stream(): AsyncIterable<AnswerEvent> {
    this.called = true;
    yield { type: 'delta', text: this.reply };
    // Mirrors the real adapter: the terminal event carries the parsed result.
    const cited = extractCitedIndexes(this.reply, 9);
    if (cited.length === 0) {
      yield {
        type: 'done',
        latencyMs: 1,
        result: { status: 'refused', reason: 'not_in_context', text: this.reply, citations: [] },
      };
      return;
    }
    yield {
      type: 'done',
      latencyMs: 1,
      result: {
        status: 'answered',
        text: this.reply,
        citations: cited.map((index) => ({
          index,
          documentId: `doc-${index}`,
          path: `doc-${index}.md`,
          title: `Doc ${index}`,
          chunkIds: [`chunk-${index}`],
        })),
      },
    };
  }
}

async function collect(service: GroundedAnswerService, question: string): Promise<AnswerEvent[]> {
  const events: AnswerEvent[] = [];
  for await (const event of service.answer({ question, mode: 'hybrid', topK: 8 })) {
    events.push(event);
  }
  return events;
}

describe('citation parsing', () => {
  it('reads the bracket forms the prompt asks for', () => {
    assert.deepEqual(extractCitedIndexes('Ships as one file [1].', 3), [1]);
    assert.deepEqual(extractCitedIndexes('Both apply [1][3].', 3), [1, 3]);
    assert.deepEqual(extractCitedIndexes('Combined [1, 2].', 3), [1, 2]);
  });

  it('drops citations outside the range of sources actually supplied', () => {
    // A hallucinated [7] against three sources must not become a link.
    assert.deepEqual(extractCitedIndexes('As described [7].', 3), []);
    assert.deepEqual(extractCitedIndexes('Mixed [2][9].', 3), [2]);
  });

  it('collapses chunks from one document into a single numbered source', () => {
    const sources = numberSources([
      hit({ path: 'a.md', vectorScore: 0.8, ordinal: 0 }),
      hit({ path: 'a.md', vectorScore: 0.7, ordinal: 1 }),
      hit({ path: 'b.md', vectorScore: 0.6 }),
    ]);

    assert.equal(sources.length, 2, 'two documents, not three chunks');
    assert.equal(sources[0]!.chunkIds.length, 2);
    assert.deepEqual(
      sources.map((s) => s.index),
      [1, 2],
    );
  });
});

describe('refusal gate', () => {
  it('refuses without calling the model when nothing clears the floor', async () => {
    const chatModel = new StubChatModel('This should never be generated.');
    const service = new GroundedAnswerService({
      retriever: new StubRetriever([hit({ path: 'unrelated.md', vectorScore: 0.44 })]),
      chatModel,
    });

    const events = await collect(service, 'What is the vacation policy?');
    const done = events.at(-1);

    assert.equal(done?.type, 'done');
    assert.equal(done.result.status, 'refused');
    assert.equal(done.result.status === 'refused' && done.result.reason, 'no_relevant_context');
    assert.equal(chatModel.called, false, 'a hopeless query must not cost a model call');
  });

  it('still emits the retrieved passages when it refuses', async () => {
    const service = new GroundedAnswerService({
      retriever: new StubRetriever([hit({ path: 'unrelated.md', vectorScore: 0.4 })]),
      chatModel: new StubChatModel('unused'),
    });

    const events = await collect(service, 'What is the vacation policy?');
    // Showing what was searched is what makes a refusal auditable rather than opaque.
    assert.equal(events[0]?.type, 'retrieval');
  });

  it('refuses when retrieval returns nothing at all', async () => {
    const service = new GroundedAnswerService({
      retriever: new StubRetriever([]),
      chatModel: new StubChatModel('unused'),
    });

    const done = (await collect(service, 'anything')).at(-1);
    assert.equal(done?.type === 'done' && done.result.status, 'refused');
  });

  it('generates when the floor is cleared', async () => {
    const chatModel = new StubChatModel('The limit is 5 MB [1].');
    const service = new GroundedAnswerService({
      retriever: new StubRetriever([hit({ path: 'network-specs-applovin.md', vectorScore: 0.83 })]),
      chatModel,
    });

    const done = (await collect(service, 'What is the AppLovin size limit?')).at(-1);
    assert.equal(chatModel.called, true);
    assert.equal(done?.type === 'done' && done.result.status, 'answered');
    assert.equal(done?.type === 'done' && done.result.citations.length, 1);
  });

  it('treats an uncited response as a refusal even when it reads confidently', async () => {
    // The rule that makes grounding structural: no citation, no answer.
    const service = new GroundedAnswerService({
      retriever: new StubRetriever([hit({ path: 'a.md', vectorScore: 0.9 })]),
      chatModel: new StubChatModel('The limit is definitely 12 MB and always has been.'),
    });

    const done = (await collect(service, 'What is the limit?')).at(-1);
    assert.equal(done?.type === 'done' && done.result.status, 'refused');
    assert.equal(done?.type === 'done' && done.result.citations.length, 0);
  });

  it('gates on the best similarity found, not on whatever RRF ranked first', async () => {
    // RRF can put a weakly-similar chunk on top; a strong match further down
    // still means the corpus has something to say.
    const service = new GroundedAnswerService({
      retriever: new StubRetriever([
        hit({ path: 'weak.md', vectorScore: 0.5, score: 0.033 }),
        hit({ path: 'strong.md', vectorScore: 0.82, score: 0.016 }),
      ]),
      chatModel: new StubChatModel('Answer grounded in the second hit [1].'),
    });

    const done = (await collect(service, 'a real question')).at(-1);
    assert.equal(done?.type === 'done' && done.result.status, 'answered');
  });

  it('uses a floor that separates the measured populations', () => {
    // Guards the tuning recorded in docs/eval-results.md. Re-measured once the
    // eval grew paraphrased questions: answerable cases run 0.548 to 0.827,
    // out-of-corpus probes 0.407 to 0.471. The band is much narrower than the
    // five sample questions alone suggested.
    assert.ok(MIN_RELEVANCE_SCORE > 0.471, 'floor must exclude the out-of-corpus probes');
    assert.ok(
      MIN_RELEVANCE_SCORE < 0.548,
      'floor must admit the hardest legitimate question, or real questions get false refusals',
    );
  });
});
