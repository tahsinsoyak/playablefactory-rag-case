import Link from 'next/link';
import type { PublicUser } from '@corpus/shared';
import { SignOutButton } from './SignOutButton';

/**
 * The frame every signed-in page sits in.
 *
 * The dashboard link is rendered only for admins — but that is presentation, not
 * protection. The page itself re-checks server-side and the API enforces the
 * role on every route, so hiding the link is a courtesy to regular users rather
 * than the thing standing between them and the data.
 */
export function AppShell({
  user,
  active,
  children,
}: {
  user: PublicUser;
  active: 'chat' | 'dashboard';
  children: React.ReactNode;
}) {
  const linkClass = (isActive: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-accent-soft text-accent'
        : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
    }`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Corpus Search
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            <Link href="/" className={linkClass(active === 'chat')}>
              Chat
            </Link>
            {user.role === 'admin' && (
              <Link href="/dashboard" className={linkClass(active === 'dashboard')}>
                Dashboard
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-ink-muted sm:inline">{user.email}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
              {user.role}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
