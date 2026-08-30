'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DocumentListResponse, IndexHealth, IngestionRun, SearchStats } from '@corpus/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { UserAdmin } from './UserAdmin';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">{label}</p>
      <p className="mt-1 text-[24px] leading-none font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-ink-muted">{hint}</p>}
    </Card>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">{title}</h2>
      {hint && <p className="mt-0.5 text-[13px] text-ink-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const TH = 'px-4 py-2.5 text-left text-[11px] font-medium tracking-wide text-ink-subtle uppercase';
const TD = 'px-4 py-2.5 text-[13px] text-ink';

export function Dashboard({ currentUserId }: { currentUserId: string }) {
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

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="h-[86px] animate-pulse bg-surface-sunken" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-9">
      {error && <Alert>{error}</Alert>}

      <Section title="Index">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            hint={health?.embedderId ?? 'n/a'}
          />
        </div>

        <Card className="mt-3 flex flex-wrap items-center gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-ink">
              {health?.stale ? (
                <>
                  <Badge tone="warning">stale</Badge>
                  The index is behind the corpus on disk
                </>
              ) : (
                <>
                  <Badge tone="positive">up to date</Badge>
                  Index matches the corpus
                </>
              )}
            </p>
            <p className="mt-1 text-[12px] text-ink-muted">
              Last indexed {formatDate(health?.lastIngestionAt ?? null)}
              {health?.stale && ' · re-run ingestion to pick up the changes'}
            </p>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={() => void runIngestion(false)} loading={ingesting}>
              Run ingestion
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void runIngestion(true)}
              disabled={ingesting}
              title="Re-embeds every document, needed after a chunking change"
            >
              Force rebuild
            </Button>
          </div>
        </Card>
      </Section>

      <Section title="Search analytics">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          <Card className="mt-3 px-4 py-3.5">
            <p className="text-[13px] font-medium text-ink">
              Recent questions the corpus could not answer
            </p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              These are the gaps. Either the corpus is missing something, or retrieval is.
            </p>
            <ul className="mt-2.5 divide-y divide-border">
              {stats.recentUnanswered.map((entry, index) => (
                <li key={index} className="flex flex-wrap justify-between gap-2 py-1.5 text-[13px]">
                  <span className="min-w-0 truncate text-ink">{entry.query}</span>
                  <span className="shrink-0 text-[12px] text-ink-subtle">
                    {formatDate(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section title="Ingestion runs">
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={TH}>Started</th>
                <th className={TH}>Status</th>
                <th className={cn(TH, 'text-right')}>Added</th>
                <th className={cn(TH, 'text-right')}>Updated</th>
                <th className={cn(TH, 'hidden text-right sm:table-cell')}>Removed</th>
                <th className={cn(TH, 'hidden text-right md:table-cell')}>Unchanged</th>
                <th className={cn(TH, 'hidden text-right sm:table-cell')}>Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className={cn(TD, 'whitespace-nowrap')}>{formatDate(run.startedAt)}</td>
                  <td className={TD}>
                    <Badge
                      tone={
                        run.status === 'succeeded'
                          ? 'positive'
                          : run.status === 'failed'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {run.status}
                    </Badge>
                  </td>
                  <td className={cn(TD, 'text-right')}>{run.added}</td>
                  <td className={cn(TD, 'text-right')}>{run.updated}</td>
                  <td className={cn(TD, 'hidden text-right sm:table-cell')}>{run.removed}</td>
                  <td className={cn(TD, 'hidden text-right text-ink-subtle md:table-cell')}>
                    {run.unchanged}
                  </td>
                  <td className={cn(TD, 'hidden text-right sm:table-cell')}>{run.failed}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-ink-muted">
                    No ingestion runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section title={`Documents${documents ? ` (${documents.total})` : ''}`}>
        <div className="mb-3">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title or path…"
            aria-label="Filter documents"
            className="w-full rounded-[8px] border border-border bg-surface-raised px-3 py-2 text-[13px] text-ink transition-colors outline-none placeholder:text-ink-subtle focus:border-accent sm:max-w-xs"
          />
        </div>

        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={TH}>Document</th>
                <th className={cn(TH, 'hidden lg:table-cell')}>Path</th>
                <th className={cn(TH, 'hidden sm:table-cell')}>Type</th>
                <th className={cn(TH, 'hidden text-right sm:table-cell')}>Chunks</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents?.documents.map((doc) => (
                <tr key={doc.id}>
                  <td className={TD}>
                    <span className="block">{doc.title}</span>
                    {/* On narrow screens the path column is hidden, so it rides
                        along under the title rather than being lost. */}
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-subtle lg:hidden">
                      {doc.path}
                    </span>
                  </td>
                  <td
                    className={cn(TD, 'hidden font-mono text-[12px] text-ink-subtle lg:table-cell')}
                  >
                    {doc.path}
                  </td>
                  <td className={cn(TD, 'hidden whitespace-nowrap text-ink-muted sm:table-cell')}>
                    {doc.docType}
                  </td>
                  <td className={cn(TD, 'hidden text-right sm:table-cell')}>{doc.chunkCount}</td>
                  <td className={TD}>
                    {doc.status === 'indexed' ? (
                      <Badge tone="positive">indexed</Badge>
                    ) : (
                      <span title={doc.error ?? undefined}>
                        <Badge tone="danger">{doc.status}</Badge>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {documents?.documents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-ink-muted">
                    No documents match that filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </Section>

      <UserAdmin currentUserId={currentUserId} />
    </div>
  );
}
