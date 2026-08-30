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
      <div className="py-6 sm:py-8">
        <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.01em] text-ink sm:text-[28px]">
          Dashboard
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-muted">
          Corpus contents, ingestion history, index health, and search analytics.
        </p>

        <div className="mt-8">
          <Dashboard currentUserId={user.id} />
        </div>
      </div>
    </AppShell>
  );
}
