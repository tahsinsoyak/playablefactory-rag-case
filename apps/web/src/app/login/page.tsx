'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { DemoAccount, DemoAccountsResponse, LoginResponse } from '@corpus/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Which sign-in is running: the form, or one of the demo buttons. */
  const [pending, setPending] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  // Asked for rather than compiled in. The API returns an empty list in
  // production, so the buttons simply do not appear there - and no build of this
  // app ever contains a password.
  useEffect(() => {
    apiFetch<DemoAccountsResponse>('/auth/demo-accounts')
      .then((body) => setDemoAccounts(body.accounts))
      .catch(() => setDemoAccounts([]));
  }, []);

  /**
   * One sign-in path for both the form and the demo buttons, so the redirect
   * rules and error handling cannot diverge between them.
   */
  async function signIn(credentials: { email: string; password: string }, source: string) {
    setError(null);
    setPending(source);

    try {
      const { user } = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      // Only follow `next` when it is a local path. An open redirect here would
      // let a crafted link bounce a freshly authenticated user off-site.
      const next = params.get('next');
      const destination =
        next && next.startsWith('/') && !next.startsWith('//')
          ? next
          : user.role === 'admin'
            ? '/dashboard'
            : '/';

      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Sign-in failed. Please try again.');
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <>
      <div className="rounded-[10px] border border-border bg-surface-raised p-5 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn({ email, password }, 'form');
          }}
          className="space-y-4"
          noValidate
        >
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <Alert>{error}</Alert>}

          <Button type="submit" loading={pending === 'form'} disabled={busy} className="w-full">
            Sign in
          </Button>
        </form>
      </div>

      {demoAccounts.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
              or sign in as
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {demoAccounts.map((account) => (
              <button
                key={account.role}
                type="button"
                disabled={busy}
                onClick={() =>
                  void signIn({ email: account.email, password: account.password }, account.role)
                }
                className="rounded-[10px] border border-border bg-surface-raised px-3.5 py-3 text-left transition-colors hover:border-accent-line hover:bg-accent-soft/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-[14px] font-semibold text-ink capitalize">
                  {account.role}
                  {pending === account.role && (
                    <span
                      aria-hidden
                      className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                    />
                  )}
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-muted">
                  {account.description}
                </span>
                <span className="mt-1.5 block truncate font-mono text-[11px] text-ink-subtle">
                  {account.email}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-2.5 text-[12px] text-ink-subtle">
            Seeded by <code className="font-mono">npm run seed</code>. The API serves these only
            outside production, so no build ships a password.
          </p>
        </div>
      )}
    </>
  );
}

/** Fills the same space as the form, so the card does not resize on hydration. */
function FormSkeleton() {
  return (
    <div className="rounded-[10px] border border-border bg-surface-raised p-5 sm:p-6" aria-hidden>
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i}>
            <div className="h-4 w-16 rounded bg-surface-sunken" />
            <div className="mt-1.5 h-[42px] rounded-[8px] bg-surface-sunken" />
          </div>
        ))}
        <div className="h-10 rounded-[8px] bg-surface-sunken" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-[9px] bg-accent text-[15px] font-bold text-accent-ink"
          >
            C
          </span>
          <div>
            <h1 className="text-[19px] leading-tight font-semibold tracking-[-0.01em] text-ink">
              Corpus Search
            </h1>
            <p className="text-[13px] text-ink-muted">Internal document search</p>
          </div>
        </div>

        <div className="mt-6">
          {/* useSearchParams needs a Suspense boundary during prerender. */}
          <Suspense fallback={<FormSkeleton />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
