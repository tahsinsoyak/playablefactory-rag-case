import { AppShell } from '@/components/AppShell';
import { Chat } from '@/components/Chat';
import { requireUser } from '@/lib/session';

// The session is per-request, so this page must never be statically rendered.
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const user = await requireUser('/');

  return (
    <AppShell user={user} active="chat">
      {/* Chat owns its own heading: it belongs to the empty state and is
          replaced by the conversation once one exists. */}
      <Chat />
    </AppShell>
  );
}
