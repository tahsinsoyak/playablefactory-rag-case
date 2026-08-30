'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { apiFetch, ApiRequestError } from '@/lib/api';
import type { LoginResponse } from '@corpus/shared';

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
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Corpus Search</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sign in to search the internal document corpus.
        </p>

        <div className="mt-6 rounded-xl border border-border bg-surface-raised p-5 sm:p-6">
          {/* useSearchParams needs a Suspense boundary during prerender. */}
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>

        <div className="mt-4 rounded-lg border border-border/70 px-4 py-3 text-xs text-ink-muted">
          <p className="font-medium text-ink">Demo accounts</p>
          <p className="mt-1 font-mono">user@demo.local · demo-user-pw</p>
          <p className="font-mono">admin@demo.local · demo-admin-pw</p>
        </div>
      </div>
    </div>
  );
}
