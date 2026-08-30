'use client';

import { useState } from 'react';
import type { McpTryResponse } from '@corpus/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

/**
 * Runs the real MCP tool over the authenticated HTTP transport.
 *
 * The call is made by the API, not the browser. Minting a token here would mean
 * shipping the client secret to the page, which would undo the reason the
 * transport is authenticated at all. What the browser sends is a query; what it
 * gets back is a record of what the server did.
 */
export function ToolTester({ toolName }: { toolName: string }) {
  const [query, setQuery] = useState('Why are sound assets built in a separate pass?');
  const [result, setResult] = useState<McpTryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const body = await apiFetch<McpTryResponse>('/mcp/try', {
        method: 'POST',
        body: JSON.stringify({ query, limit: 3 }),
      });
      setResult(body);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'The test could not be run.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-semibold text-ink">Call the tool</h3>
        <Badge tone="accent">{toolName}</Badge>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
        Mints a short-lived token and calls the live HTTP endpoint, exactly as an external MCP
        client would. Nothing is simulated, so a green result means the transport, the token, and
        the tool all work. The token is minted on the server: the browser never holds a credential.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="mt-3 flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Query to send to the MCP tool"
          className="min-w-0 flex-1 rounded-[8px] border border-border bg-surface px-3 py-2 text-[14px] text-ink outline-none transition-colors focus:border-accent"
        />
        <Button type="submit" loading={busy} disabled={query.trim().length === 0}>
          Run
        </Button>
      </form>

      {error && (
        <Alert className="mt-3" title="Could not run the test">
          {error}
        </Alert>
      )}

      {result && (
        <div className="mt-4">
          <ol className="space-y-1.5">
            {result.steps.map((step) => (
              <li key={step.name} className="flex items-start gap-2 text-[13px]">
                <span
                  aria-hidden
                  className={cn(
                    'mt-[3px] grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                    step.ok ? 'bg-positive/15 text-positive' : 'bg-danger/15 text-danger',
                  )}
                >
                  {step.ok ? '✓' : '✗'}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-ink">{step.name}</span>
                  <span className="ml-2 font-mono text-[11px] text-ink-subtle">
                    {step.durationMs} ms
                  </span>
                  <span className="block text-[12px] text-ink-muted">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>

          {result.hits.length > 0 && (
            <>
              <p className="mt-4 text-[12px] font-medium tracking-wide text-ink-subtle uppercase">
                What the client received
              </p>
              <ul className="mt-2 space-y-1.5">
                {result.hits.map((hit) => (
                  <li
                    key={hit.path + (hit.heading ?? '')}
                    className="rounded-[8px] border border-border bg-surface-sunken/60 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13px] font-medium text-ink">{hit.title}</span>
                      <span className="font-mono text-[11px] text-ink-subtle">{hit.path}</span>
                    </div>
                    {hit.heading && <p className="text-[12px] text-ink-muted">{hit.heading}</p>}
                    <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">
                      similarity {hit.similarity === null ? 'n/a' : hit.similarity.toFixed(3)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
