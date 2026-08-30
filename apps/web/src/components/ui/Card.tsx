import { cn } from '@/lib/cn';

/** The one raised surface in the app, so panels never drift apart visually. */
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('rounded-[10px] border border-border bg-surface-raised', className)}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">{title}</h2>
      {hint && <p className="mt-0.5 text-[13px] text-ink-muted normal-case">{hint}</p>}
    </div>
  );
}
