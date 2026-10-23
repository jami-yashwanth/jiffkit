/**
 * Plausible events. Props are only ever {tool, count} or {tool, reason}, or {tool} for tool_used:
 * never a file name, size, type or any pasted/typed content.
 */
export function track(name: 'convert_success' | 'convert_error' | 'tool_used', props: Record<string, string | number>): void {
  (window as { plausible?: (n: string, o: { props: typeof props }) => void }).plausible?.(name, { props });
}
