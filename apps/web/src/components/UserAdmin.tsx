'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PublicUser, Role } from '@corpus/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';

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

  if (loading) return <p className="text-sm text-ink-muted">Loading users…</p>;

  return (
    <section aria-label="User management">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        Users ({users.length})
      </h2>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="w-full min-w-100 text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Joined</th>
              <th className="px-4 py-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;

              return (
                <tr key={user.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2">
                    {user.email}
                    {isSelf && <span className="ml-2 text-xs text-ink-muted">(you)</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-ink-muted">
                    {new Date(user.createdAt).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })}
                  </td>
                  <td className="px-4 py-2">
                    <label className="sr-only" htmlFor={`role-${user.id}`}>
                      Role for {user.email}
                    </label>
                    <select
                      id={`role-${user.id}`}
                      value={user.role}
                      disabled={isSelf || pendingId === user.id}
                      onChange={(e) => void changeRole(user.id, e.target.value as Role)}
                      title={isSelf ? 'You cannot change your own role' : undefined}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-60"
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
      </div>
    </section>
  );
}
