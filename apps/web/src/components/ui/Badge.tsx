import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'positive' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'border-border bg-surface-sunken text-ink-muted',
  accent: 'border-transparent bg-accent-soft text-accent-text',
  positive: 'border-transparent bg-positive/12 text-positive',
  warning: 'border-transparent bg-warning/12 text-warning',
  danger: 'border-transparent bg-danger/12 text-danger',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
