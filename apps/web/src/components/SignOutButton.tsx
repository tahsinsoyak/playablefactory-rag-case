'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from './ui/Button';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Even if the call fails, send the user to the login page: the local
      // session is over either way, and stranding them here helps nobody.
    } finally {
      // refresh() re-runs the server components that read the session, so the
      // header and page guards see the signed-out state.
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={signOut} loading={busy}>
      Sign out
    </Button>
  );
}
