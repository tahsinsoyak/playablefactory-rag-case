'use client';

import { useState } from 'react';
import type { McpStatus } from '@corpus/shared';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

/** Copies text and briefly confirms it, so the click has visible feedback. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded-[6px] border border-border px-2 py-1 text-[12px] font-medium text-ink-muted transition-colors hover:border-accent-line hover:text-ink"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function Snippet({ value }: { value: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-[8px] bg-surface-sunken p-3 font-mono text-[12px] leading-relaxed text-ink">
      {value}
    </pre>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-1.5">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="font-mono text-[12px] break-all text-ink">{value}</dd>
    </div>
  );
}

export function ConnectionDetails({ status }: { status: McpStatus }) {
  const stdioConfig = JSON.stringify(
    {
      mcpServers: {
        'corpus-search': {
          command: status.stdioCommand,
          args: status.stdioArgs,
        },
      },
    },
    null,
    2,
  );

  const tokenCurl = `curl -X POST ${status.issuer}/oauth/token \\
  -H 'content-type: application/json' \\
  -d '{"grant_type":"client_credentials",
       "client_id":"${status.clientId}",
       "client_secret":"<MCP_CLIENT_SECRET>"}'`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-ink">stdio</h3>
          <Badge>no authentication</Badge>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          For a desktop client on this machine. The client launches the process and owns its
          lifetime, so nothing listens on a port and there is no network surface to protect.
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink-muted">Client configuration</span>
          <CopyButton value={stdioConfig} label="Copy JSON" />
        </div>
        <Snippet value={stdioConfig} />
        <p className="mt-2 text-[12px] text-ink-subtle">
          Build it first with <code className="font-mono">npm run build -w @corpus/mcp</code>.
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-ink">HTTP</h3>
          <Badge tone="accent">OIDC required</Badge>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          For a client reaching the server over the network. Every request needs a bearer token
          minted for this resource and carrying the search scope.
        </p>

        <dl className="mt-3 divide-y divide-border">
          <Row label="Endpoint" value={status.httpEndpoint} />
          <Row label="Issuer" value={status.issuer} />
          <Row label="Audience" value={status.resource} />
          <Row label="Scope" value={status.scopes.join(' ')} />
          <Row label="Client id" value={status.clientId} />
        </dl>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink-muted">Get a token</span>
          <CopyButton value={tokenCurl} label="Copy curl" />
        </div>
        <Snippet value={tokenCurl} />

        {!status.clientRegistered && (
          <p className="mt-2 text-[12px] text-warning">
            No OAuth client is registered yet. Set{' '}
            <code className="font-mono">MCP_CLIENT_SECRET</code> in{' '}
            <code className="font-mono">.env</code> and re-run{' '}
            <code className="font-mono">npm run seed</code>.
          </p>
        )}
      </Card>
    </div>
  );
}
