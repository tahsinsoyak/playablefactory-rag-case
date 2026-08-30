import Link from 'next/link';
import type { PublicUser } from '@corpus/shared';
import { cn } from '@/lib/cn';
import { SignOutButton } from './SignOutButton';

/**
 * The frame every signed-in page sits in.
 *
 * The dashboard link appears only for admins, but that is presentation, not
 * protection. The page re-checks server-side and the API enforces the role on
 * every route, so hiding the link is a courtesy to regular users rather than the
 * thing standing between them and the data.
 */
export function AppShell({
  user,
  active,
  children,
}: {
  user: PublicUser;
  active: 'chat' | 'dashboard' | 'mcp';
  children: React.ReactNode;
}) {
  const navLink = (isActive: boolean) =>
    cn(
      'rounded-[7px] px-2.5 py-1.5 text-[13px] font-medium transition-colors',
      isActive
        ? 'bg-accent-soft text-accent-text'
        : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
    );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface-raised/85 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ink"
          >
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-[6px] bg-accent text-[12px] font-bold text-accent-ink"
            >
              C
            </span>
            <span className="hidden sm:inline">Corpus Search</span>
          </Link>

          <nav className="flex items-center gap-0.5" aria-label="Main">
            <Link
              href="/"
              className={navLink(active === 'chat')}
              aria-current={active === 'chat' ? 'page' : undefined}
            >
              Chat
            </Link>
            {user.role === 'admin' && (
              <>
                <Link
                  href="/dashboard"
                  className={navLink(active === 'dashboard')}
                  aria-current={active === 'dashboard' ? 'page' : undefined}
                >
                  Dashboard
                </Link>
                <Link
                  href="/mcp"
                  className={navLink(active === 'mcp')}
                  aria-current={active === 'mcp' ? 'page' : undefined}
                >
                  MCP
                </Link>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[13px] text-ink-muted md:inline">{user.email}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium tracking-wide text-ink-muted uppercase">
              {user.role}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 sm:px-6">{children}</main>
    </div>
  );
}
