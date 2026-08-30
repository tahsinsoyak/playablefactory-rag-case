import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center">
        <p className="text-[13px] font-medium tracking-wide text-ink-subtle uppercase">404</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.01em] text-ink">
          This page does not exist
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-muted">
          It may have moved, or you may not have access to it.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-[8px] bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
        >
          Back to chat
        </Link>
      </div>
    </div>
  );
}
