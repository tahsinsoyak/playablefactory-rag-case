import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold">This page does not exist</h1>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Back to chat
        </Link>
      </div>
    </div>
  );
}
