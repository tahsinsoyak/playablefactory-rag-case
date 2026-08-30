import { cn } from '@/lib/cn';

type Tone = 'danger' | 'warning';

const TONES: Record<Tone, string> = {
  danger: 'border-danger/30 bg-danger-soft text-danger',
  warning: 'border-warning/30 bg-warning-soft text-warning',
};

export function Alert({
  tone = 'danger',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('rounded-[10px] border px-4 py-3 text-[14px]', TONES[tone], className)}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className={cn(title && 'mt-0.5')}>{children}</div>
    </div>
  );
}
