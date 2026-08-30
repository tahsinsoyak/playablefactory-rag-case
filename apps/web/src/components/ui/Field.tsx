import { cn } from '@/lib/cn';

/** A labelled text input. Keeps label, control, and error wired together. */
export function Field({
  id,
  label,
  error,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'mt-1.5 w-full rounded-[8px] border bg-surface px-3 py-2.5 text-[15px] text-ink',
          'placeholder:text-ink-subtle',
          'transition-colors outline-none focus:border-accent',
          error ? 'border-danger' : 'border-border',
          className,
        )}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
