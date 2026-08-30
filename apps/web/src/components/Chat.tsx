'use client';

import { useRef, useState } from 'react';
import type { AnswerEvent, AnswerResult, SearchHit } from '@corpus/shared';
import { API_URL } from '@/lib/config';

const EXAMPLES = [
  'What is the maximum file size for an AppLovin playable?',
  'How do I initialize the current Lumen SDK?',
  'Why are sound assets built in a separate pass?',
  'Which languages must every playable ship with?',
];

/**
 * Renders `[1]` markers in the answer as links to the matching citation.
 *
 * Done at render time rather than by rewriting the model's text, so what is
 * displayed stays exactly what was generated.
 */
function AnswerText({
  text,
  onCitationClick,
}: {
  text: string;
  onCitationClick: (i: number) => void;
}) {
  const parts = text.split(/(\[[\d,\s]+\])/g);

  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, index) => {
        const match = /^\[([\d,\s]+)\]$/.exec(part);
        if (!match) return <span key={index}>{part}</span>;

        const numbers = match[1]!
          .split(',')
          .map((n) => Number.parseInt(n.trim(), 10))
          .filter(Number.isInteger);

        return (
          <span key={index}>
            {numbers.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onCitationClick(n)}
                className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft px-1 align-baseline text-xs font-semibold text-accent hover:underline"
                aria-label={`Jump to source ${n}`}
              >
                {n}
              </button>
            ))}
          </span>
        );
      })}
    </p>
  );
}

export function Chat() {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [streaming, setStreaming] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sourceRefs = useRef<Record<number, HTMLLIElement | null>>({});

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setAsked(trimmed);
    setHits([]);
    setStreaming('');
    setResult(null);
    setError(null);

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
            : 'The answer request failed.',
        );
      }

      // Server-sent events, parsed by hand: the payload is one `data:` line per
      // event, which is less code than pulling in an SSE client.
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const frames = buffer.split('\n\n');
        // The last piece may be a partial frame; keep it for the next chunk.
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;

          const event = JSON.parse(line.slice(6)) as AnswerEvent;

          if (event.type === 'retrieval') setHits(event.hits);
          if (event.type === 'delta') setStreaming((prev) => prev + event.text);
          if (event.type === 'done') setResult(event.result);
          if (event.type === 'error') setError(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const citations = result?.status === 'answered' ? result.citations : [];
  const answerText = result?.text ?? streaming;
  const refused = result?.status === 'refused';

  function scrollToSource(index: number) {
    sourceRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about the corpus…"
          aria-label="Your question"
          className="flex-1 rounded-lg border border-border bg-surface-raised px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length === 0}
          className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Searching…' : 'Ask'}
        </button>
      </form>

      {!asked && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuestion(example);
                void ask(example);
              }}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      {asked && !error && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section
            aria-label="Answer"
            aria-live="polite"
            className="rounded-xl border border-border bg-surface-raised p-5"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Answer</h2>

            {answerText.length === 0 && busy && (
              <p className="mt-3 text-sm text-ink-muted">Retrieving passages…</p>
            )}

            {answerText.length > 0 && (
              <div className="mt-3 text-[15px]">
                {refused ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      Not answered from the corpus
                    </p>
                    <p className="mt-1 text-ink-muted">{answerText}</p>
                  </div>
                ) : (
                  <AnswerText text={answerText} onCitationClick={scrollToSource} />
                )}
              </div>
            )}

            {citations.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Cited documents
                </h3>
                <ul className="mt-2 space-y-1">
                  {citations.map((citation) => (
                    <li key={citation.documentId} className="text-sm">
                      <button
                        type="button"
                        onClick={() => scrollToSource(citation.index)}
                        className="text-left text-accent hover:underline"
                      >
                        [{citation.index}] {citation.title}
                      </button>
                      <span className="ml-1 font-mono text-xs text-ink-muted">{citation.path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <aside aria-label="Retrieved passages">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Retrieved passages{hits.length > 0 && ` (${hits.length})`}
            </h2>

            <ul className="mt-2 space-y-2">
              {hits.map((hit, index) => {
                const citation = citations.find((c) => c.chunkIds.includes(hit.chunkId));
                return (
                  <li
                    key={hit.chunkId}
                    ref={(el) => {
                      if (citation) sourceRefs.current[citation.index] = el;
                    }}
                    className={`rounded-lg border p-3 text-sm transition-colors ${
                      citation
                        ? 'border-accent bg-accent-soft/40'
                        : 'border-border bg-surface-raised'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{hit.title}</span>
                      {citation && (
                        <span className="shrink-0 rounded bg-accent px-1.5 text-xs font-semibold text-white">
                          {citation.index}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-ink-muted">{hit.path}</p>
                    {hit.heading && (
                      <p className="mt-1 text-xs font-medium text-ink-muted">{hit.heading}</p>
                    )}
                    <p className="mt-1.5 line-clamp-4 text-ink-muted">{hit.text}</p>
                    <p className="mt-2 font-mono text-[11px] text-ink-muted">
                      #{index + 1} · cos{' '}
                      {hit.vectorScore === null ? '—' : hit.vectorScore.toFixed(3)} · v
                      {hit.vectorRank ?? '—'} · k{hit.keywordRank ?? '—'}
                    </p>
                  </li>
                );
              })}

              {hits.length === 0 && !busy && (
                <li className="rounded-lg border border-border p-3 text-sm text-ink-muted">
                  Nothing retrieved.
                </li>
              )}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
