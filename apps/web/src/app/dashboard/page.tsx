import { AppShell } from '@/components/AppShell';
import { Dashboard } from '@/components/Dashboard';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Server-side guard: a regular user is redirected before any dashboard markup
  // is generated. The API enforces the same rule on every route it exposes.
  const user = await requireAdmin('/dashboard');

  return (
    <AppShell user={user} active="dashboard">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Corpus contents, ingestion history, index health, and search analytics.
        </p>
      </div>

      <Dashboard />
    </AppShell>
  );
}
