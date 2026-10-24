/** Copy text to the clipboard. Falls back to a hidden textarea where the async Clipboard API is missing or refused. */
export async function copyText(s: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    // fall through to the legacy path
  }
  const active = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = s;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.append(ta);
  ta.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
    active?.focus();
  }
}
