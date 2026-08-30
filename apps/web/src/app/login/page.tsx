'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import type { LoginResponse } from '@corpus/shared';
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
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const { user } = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
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
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
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

      <Button type="submit" loading={busy} className="w-full">
        Sign in
      </Button>
    </form>
  );
}

/** Fills the same space as the form, so the card does not resize on hydration. */
function FormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i}>
          <div className="h-4 w-16 rounded bg-surface-sunken" />
          <div className="mt-1.5 h-[42px] rounded-[8px] bg-surface-sunken" />
        </div>
      ))}
      <div className="h-10 rounded-[8px] bg-surface-sunken" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
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

        <div className="mt-6 rounded-[10px] border border-border bg-surface-raised p-5 sm:p-6">
          {/* useSearchParams needs a Suspense boundary during prerender. */}
          <Suspense fallback={<FormSkeleton />}>
            <LoginForm />
          </Suspense>
        </div>

        <div className="mt-4 rounded-[10px] border border-dashed border-border px-4 py-3">
          <p className="text-[12px] font-medium tracking-wide text-ink-subtle uppercase">
            Demo accounts
          </p>
          <dl className="mt-2 space-y-1 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">User</dt>
              <dd className="font-mono text-[12px] text-ink">user@demo.local · demo-user-pw</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Admin</dt>
              <dd className="font-mono text-[12px] text-ink">admin@demo.local · demo-admin-pw</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
