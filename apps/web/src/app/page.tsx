import { AppShell } from '@/components/AppShell';
import { Chat } from '@/components/Chat';
import { requireUser } from '@/lib/session';

// The session is per-request, so this page must never be statically rendered.
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const user = await requireUser('/');

  return (
    <AppShell user={user} active="chat">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Ask the corpus</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Answers are grounded in the indexed documents and cite their sources. When the corpus does
          not cover a question, it says so rather than guessing.
        </p>
      </div>

      <Chat />
    </AppShell>
  );
}
