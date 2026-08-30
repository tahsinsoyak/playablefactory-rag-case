'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnswerEvent, AnswerResult, SearchHit } from '@corpus/shared';
import { API_URL } from '@/lib/config';
import { cn } from '@/lib/cn';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

const EXAMPLES = [
  'What is the maximum file size for an AppLovin playable?',
  'How do I initialize the current Lumen SDK?',
  'Why are sound assets built in a separate pass?',
  'Which languages must every playable ship with?',
];

/** One question and its answer. The page holds a list of these. */
interface Turn {
  id: string;
  question: string;
  hits: SearchHit[];
  streamed: string;
  result: AnswerResult | null;
  error: string | null;
  /** True from submit until the stream closes. */
  pending: boolean;
}

/**
 * Renders `[1]` markers as buttons that reveal the source they point at.
 *
 * Done at render time rather than by rewriting the model's text, so what is
 * displayed stays exactly what was generated.
 */
function AnswerBody({ text, onCite }: { text: string; onCite: (index: number) => void }) {
  const parts = text.split(/(\[[\d,\s]+\])/g);

  return (
    <>
      {parts.map((part, i) => {
        const match = /^\[([\d,\s]+)\]$/.exec(part);
        if (!match) return <span key={i}>{part}</span>;

        const numbers = match[1]!
          .split(',')
          .map((n) => Number.parseInt(n.trim(), 10))
          .filter(Number.isInteger);

        return (
          <span key={i} className="whitespace-nowrap">
            {numbers.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onCite(n)}
                aria-label={`Show source ${n}`}
                className="mx-px inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-accent-soft px-1 align-[1px] text-[11px] font-semibold text-accent-text transition-colors hover:bg-accent hover:text-accent-ink"
              >
                {n}
              </button>
            ))}
          </span>
        );
      })}
    </>
  );
}

function SourceList({ turn }: { turn: Turn }) {
  const citations = turn.result?.status === 'answered' ? turn.result.citations : [];
  const citedChunkIds = new Set(citations.flatMap((c) => c.chunkIds));

  if (turn.hits.length === 0) return null;

  return (
    <ul className="mt-3 space-y-2">
      {turn.hits.map((hit) => {
        const citation = citations.find((c) => c.chunkIds.includes(hit.chunkId));
        const wasUsed = citedChunkIds.has(hit.chunkId);

        return (
          <li
            key={hit.chunkId}
            id={citation ? `source-${citation.index}` : undefined}
            className={cn(
              'rounded-[8px] border p-3 transition-colors',
              wasUsed ? 'border-accent/40 bg-accent-soft/50' : 'border-border bg-surface-sunken/60',
            )}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {citation && (
                <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-accent px-1 text-[11px] font-semibold text-accent-ink">
                  {citation.index}
                </span>
              )}
              <span className="text-[14px] font-medium text-ink">{hit.title}</span>
              <span className="font-mono text-[11px] text-ink-subtle">{hit.path}</span>
            </div>

            {hit.heading && (
              <p className="mt-1 text-[12px] font-medium text-ink-muted">{hit.heading}</p>
            )}

            <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-ink-muted">
              {hit.text}
            </p>

            <p className="mt-2 font-mono text-[11px] text-ink-subtle">
              cos {hit.vectorScore === null ? 'n/a' : hit.vectorScore.toFixed(3)}
              {' · vector '}
              {hit.vectorRank ?? 'n/a'}
              {' · keyword '}
              {hit.keywordRank ?? 'n/a'}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const [showSources, setShowSources] = useState(false);

  const refused = turn.result?.status === 'refused';
  const text = turn.result?.text ?? turn.streamed;
  const citationCount = turn.result?.status === 'answered' ? turn.result.citations.length : 0;

  function revealSource(index: number) {
    setShowSources(true);
    // Let the list mount before scrolling to the target.
    requestAnimationFrame(() => {
      document.getElementById(`source-${index}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }

  return (
    <article className="animate-fade-rise">
      <div className="flex justify-end">
        <h2 className="max-w-[90%] rounded-[10px] rounded-br-[3px] border border-accent-line bg-accent-soft px-3.5 py-2 text-[15px] font-medium text-ink sm:max-w-[80%]">
          {turn.question}
        </h2>
      </div>

      <div className="mt-4">
        {turn.error ? (
          <Alert title="Could not answer">{turn.error}</Alert>
        ) : refused ? (
          <Alert tone="warning" title="Not covered by the corpus">
            {text}
          </Alert>
        ) : (
          <div
            className={cn(
              'max-w-[68ch] text-[15px] leading-[1.7] whitespace-pre-wrap text-ink',
              turn.pending && text.length > 0 && 'streaming-caret',
            )}
          >
            {text.length > 0 ? (
              <AnswerBody text={text} onCite={revealSource} />
            ) : (
              <span className="inline-flex items-center gap-2 text-[14px] text-ink-muted">
                <span
                  aria-hidden
                  className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                Searching the corpus…
              </span>
            )}
          </div>
        )}

        {turn.hits.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowSources((open) => !open)}
              aria-expanded={showSources}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <span aria-hidden className={cn('transition-transform', showSources && 'rotate-90')}>
                ▸
              </span>
              {turn.hits.length} passage{turn.hits.length === 1 ? '' : 's'} retrieved
              {citationCount > 0 && (
                <Badge tone="accent" className="ml-1">
                  {citationCount} cited
                </Badge>
              )}
            </button>

            {showSources && <SourceList turn={turn} />}
          </div>
        )}
      </div>
    </article>
  );
}

export function Chat() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the newest turn as it grows, but only when one is actually running,
  // so scrolling back through history is not fought by the page.
  useEffect(() => {
    if (busy) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  function update(id: string, patch: Partial<Turn>) {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const id = crypto.randomUUID();
    setTurns((prev) => [
      ...prev,
      { id, question: trimmed, hits: [], streamed: '', result: null, error: null, pending: true },
    ]);
    setQuestion('');
    setBusy(true);

    try {
      const response = await fetch(`${API_URL}/answer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, mode: 'hybrid', topK: 8 }),
      });

      if (!response.ok || !response.body) {
        throw new Error(
          response.status === 401
            ? 'Your session has expired. Please sign in again.'
            : `The answer request failed (HTTP ${response.status}).`,
        );
      }

      // Server-sent events, parsed directly: one `data:` line per event is less
      // code than pulling in an SSE client.
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let streamed = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const frames = buffer.split('\n\n');
        // The trailing piece may be a partial frame; hold it for the next chunk.
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;

          const event = JSON.parse(line.slice(6)) as AnswerEvent;

          if (event.type === 'retrieval') update(id, { hits: event.hits });
          if (event.type === 'delta') {
            streamed += event.text;
            update(id, { streamed });
          }
          if (event.type === 'done') update(id, { result: event.result });
          if (event.type === 'error') update(id, { error: event.message });
        }
      }
    } catch (err) {
      update(id, { error: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      update(id, { pending: false });
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 pb-4">
        {turns.length === 0 ? (
          <div className="py-10 sm:py-16">
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.01em] text-ink sm:text-[30px]">
              Ask the corpus
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-muted">
              Answers are grounded in the indexed documents and cite their sources. When the corpus
              does not cover a question, it says so rather than guessing.
            </p>

            <p className="mt-8 text-[13px] font-medium tracking-wide text-ink-subtle uppercase">
              Try one
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void ask(example)}
                  className="rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-left text-[14px] text-ink-muted transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-ink"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-10 py-6">
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Docked so the input stays reachable however long the conversation gets. */}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface/85 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="mx-auto flex max-w-3xl gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about the corpus…"
            aria-label="Your question"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-[8px] border border-border bg-surface-raised px-4 text-[15px] text-ink transition-colors outline-none placeholder:text-ink-subtle focus:border-accent"
          />
          <Button type="submit" loading={busy} disabled={question.trim().length === 0}>
            Ask
          </Button>
        </form>
      </div>
    </div>
  );
}
