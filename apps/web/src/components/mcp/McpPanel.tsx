'use client';

import { useCallback, useEffect, useState } from 'react';
import type { McpStatus } from '@corpus/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { ConnectionDetails } from './ConnectionDetails';
import { ToolTester } from './ToolTester';

export function McpPanel() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setStatus(await apiFetch<McpStatus>('/mcp/status'));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not read the MCP status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Card className="h-40 animate-pulse bg-surface-sunken" aria-busy />;
  if (error) return <Alert>{error}</Alert>;
  if (!status) return null;

  const http = status.transports.find((t) => t.transport === 'http');

  return (
    <div className="space-y-6">
      <section aria-label="Transport status">
        <div className="grid gap-3 sm:grid-cols-3">
          {status.transports.map((transport) => (
            <Card key={transport.transport} className="px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">{transport.transport}</span>
                <Badge
                  tone={
                    transport.reachable === 'up'
                      ? 'positive'
                      : transport.reachable === 'down'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {transport.reachable === 'not_applicable' ? 'on demand' : transport.reachable}
                </Badge>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{transport.detail}</p>
            </Card>
          ))}
          <Card className="px-4 py-3.5">
            <span className="text-[13px] font-semibold text-ink">corpus</span>
            <p className="mt-1 text-[12px] text-ink-muted">
              {status.indexedDocuments} documents searchable through the tool
            </p>
          </Card>
        </div>
      </section>

      <section aria-label="Connecting a client">
        <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
          Connecting a client
        </h2>
        <div className="mt-3">
          <ConnectionDetails status={status} />
        </div>
      </section>

      <section aria-label="Live check">
        <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">Live check</h2>
        <div className="mt-3">
          {http?.reachable === 'down' ? (
            <Alert tone="warning" title="The HTTP transport is not running">
              Start it with <code className="font-mono">npm run dev:mcp</code>, then reload. The
              stdio transport does not need it.
            </Alert>
          ) : (
            <ToolTester toolName={status.toolName} />
          )}
        </div>
      </section>
    </div>
  );
}
