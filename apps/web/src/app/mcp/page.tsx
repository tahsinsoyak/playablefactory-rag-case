import { AppShell } from '@/components/AppShell';
import { McpPanel } from '@/components/mcp/McpPanel';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function McpPage() {
  // Admin only, like the dashboard: the page reports integration state and can
  // trigger a live call against the MCP server.
  const user = await requireAdmin('/mcp');

  return (
    <AppShell user={user} active="mcp">
      <div className="py-6 sm:py-8">
        <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.01em] text-ink sm:text-[28px]">
          MCP server
        </h1>
        <p className="mt-1.5 max-w-[68ch] text-[15px] leading-relaxed text-ink-muted">
          The same retrieval the chat page uses, exposed as a tool an external MCP client can call.
          Two transports: stdio for a client on this machine, HTTP behind OIDC for anything reaching
          it over the network.
        </p>

        <div className="mt-8">
          <McpPanel />
        </div>
      </div>
    </AppShell>
  );
}
