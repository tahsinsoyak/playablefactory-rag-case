/**
 * Joins class names, dropping falsey ones.
 *
 * Deliberately not `clsx` + `tailwind-merge`: this app never builds conflicting
 * class strings at runtime, so a dependency would be paying for a problem we do
 * not have.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
