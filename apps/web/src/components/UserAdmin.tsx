'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PublicUser, Role } from '@corpus/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Alert } from './ui/Alert';
import { Card } from './ui/Card';

const TH = 'px-4 py-2.5 text-left text-[11px] font-medium tracking-wide text-ink-subtle uppercase';
const TD = 'px-4 py-2.5 text-[13px] text-ink';

/**
 * Admin user management.
 *
 * The self-demotion guard lives on the API — the last admin removing their own
 * role would lock everyone out of the dashboard with no way back through the UI.
 * Here the control is simply disabled for your own row, so the rule is visible
 * before it is enforced rather than only surfacing as a rejected request.
 */
export function UserAdmin({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { users: list } = await apiFetch<{ users: PublicUser[] }>('/admin/users');
      setUsers(list);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(id: string, role: Role) {
    setPendingId(id);
    setError(null);

    try {
      const { user } = await apiFetch<{ user: PublicUser }>(`/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      // Patch the one row rather than refetching the list: the response already
      // carries the updated user.
      setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change that role.');
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <Card className="h-24 animate-pulse bg-surface-sunken" aria-busy />;

  return (
    <section aria-label="User management">
      <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
        Users ({users.length})
      </h2>
      <p className="mt-0.5 text-[13px] text-ink-muted">
        Admins can reach the dashboard and manage the corpus. You cannot change your own role.
      </p>

      {error && <Alert className="mt-3">{error}</Alert>}

      <Card className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px]">
          <thead className="border-b border-border">
            <tr>
              <th className={TH}>Email</th>
              <th className={TH}>Joined</th>
              <th className={TH}>Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;

              return (
                <tr key={user.id}>
                  <td className={TD}>
                    {user.email}
                    {isSelf && <span className="ml-2 text-[12px] text-ink-subtle">(you)</span>}
                  </td>
                  <td className={cn(TD, 'whitespace-nowrap text-ink-muted')}>
                    {new Date(user.createdAt).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })}
                  </td>
                  <td className={TD}>
                    <label className="sr-only" htmlFor={`role-${user.id}`}>
                      Role for {user.email}
                    </label>
                    <select
                      id={`role-${user.id}`}
                      value={user.role}
                      disabled={isSelf || pendingId === user.id}
                      onChange={(e) => void changeRole(user.id, e.target.value as Role)}
                      title={isSelf ? 'You cannot change your own role' : undefined}
                      className="rounded-[7px] border border-border bg-surface px-2 py-1 text-[13px] text-ink outline-none transition-colors focus:border-accent disabled:opacity-60"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
