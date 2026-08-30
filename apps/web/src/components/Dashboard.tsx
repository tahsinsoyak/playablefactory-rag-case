'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DocumentListResponse, IndexHealth, IngestionRun, SearchStats } from '@corpus/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function Dashboard() {
  const [health, setHealth] = useState<IndexHealth | null>(null);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [documents, setDocuments] = useState<DocumentListResponse | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Independent panels, so fetch them together rather than in sequence.
      const [healthData, runsData, statsData, docsData] = await Promise.all([
        apiFetch<IndexHealth>('/index/health'),
        apiFetch<{ runs: IngestionRun[] }>('/ingestion/runs'),
        apiFetch<SearchStats>('/analytics/search'),
        apiFetch<DocumentListResponse>(
          `/documents?limit=200${filter ? `&q=${encodeURIComponent(filter)}` : ''}`,
        ),
      ]);

      setHealth(healthData);
      setRuns(runsData.runs);
      setStats(statsData);
      setDocuments(docsData);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the dashboard.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runIngestion(force: boolean) {
    setIngesting(true);
    setError(null);
    try {
      await apiFetch<{ run: IngestionRun }>('/ingestion/run', {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Ingestion failed.');
    } finally {
      setIngesting(false);
    }
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-8">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <section aria-label="Index health">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Documents" value={String(health?.documentCount ?? 0)} />
          <Stat label="Chunks" value={String(health?.chunkCount ?? 0)} />
          <Stat
            label="Failed"
            value={String(health?.failedDocumentCount ?? 0)}
            hint={health?.failedDocumentCount ? 'see the table below' : 'none'}
          />
          <Stat
            label="Embedder"
            value={`${health?.dimensions ?? 0}d`}
            hint={health?.embedderId ?? '—'}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-raised p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {health?.stale ? 'The index is behind the corpus on disk' : 'Index is up to date'}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Last indexed {formatDate(health?.lastIngestionAt ?? null)}
              {health?.stale && ' · re-run ingestion to pick up the changes'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runIngestion(false)}
              disabled={ingesting}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {ingesting ? 'Running…' : 'Run ingestion'}
            </button>
            <button
              type="button"
              onClick={() => void runIngestion(true)}
              disabled={ingesting}
              title="Re-embeds every document, needed after a chunking change"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-50"
            >
              Force rebuild
            </button>
          </div>
        </div>
      </section>

      <section aria-label="Search analytics">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Search</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Searches" value={String(stats?.totalSearches ?? 0)} />
          <Stat label="Last 7 days" value={String(stats?.searchesLast7Days ?? 0)} />
          <Stat
            label="Answered"
            value={`${Math.round((stats?.answeredRate ?? 0) * 100)}%`}
            hint="rest were honest refusals"
          />
          <Stat label="Median latency" value={`${stats?.medianLatencyMs ?? 0} ms`} />
        </div>

        {stats && stats.recentUnanswered.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-surface-raised p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Recent questions the corpus could not answer
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              These are the gaps — either the corpus is missing something, or retrieval is.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {stats.recentUnanswered.map((entry, index) => (
                <li key={index} className="flex flex-wrap justify-between gap-2">
                  <span className="min-w-0 truncate">{entry.query}</span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {formatDate(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-label="Ingestion history">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Ingestion runs
        </h2>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <table className="w-full min-w-125 text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Added</th>
                <th className="px-4 py-2 text-right font-medium">Updated</th>
                <th className="px-4 py-2 text-right font-medium">Removed</th>
                <th className="px-4 py-2 text-right font-medium">Unchanged</th>
                <th className="px-4 py-2 text-right font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2">{formatDate(run.startedAt)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        run.status === 'succeeded'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : run.status === 'failed'
                            ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{run.added}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{run.updated}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{run.removed}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-muted">
                    {run.unchanged}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{run.failed}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-muted">
                    No ingestion runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Indexed documents">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Documents {documents && `(${documents.total})`}
          </h2>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title or path…"
            aria-label="Filter documents"
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm outline-none focus:border-accent sm:w-64"
          />
        </div>

        <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <table className="w-full min-w-150 text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Path</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Chunks</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {documents?.documents.map((doc) => (
                <tr key={doc.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2">{doc.title}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-muted">{doc.path}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{doc.docType}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{doc.chunkCount}</td>
                  <td className="px-4 py-2">
                    {doc.status === 'indexed' ? (
                      <span className="text-emerald-700 dark:text-emerald-400">indexed</span>
                    ) : (
                      <span
                        title={doc.error ?? undefined}
                        className="text-red-600 dark:text-red-400"
                      >
                        {doc.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {documents?.documents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                    No documents match that filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
