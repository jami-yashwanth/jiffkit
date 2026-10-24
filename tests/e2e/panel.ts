import type { Page } from '@playwright/test';

// The AI island's panel (consent, downloading, working) can pass in a blink when files are local. These record
// every text it shows while it is on screen, so a test can check a state was shown after the fact.

type Recorded = { seen: string[] };

/** Start recording on every page load. Call before page.goto. */
export async function recordPanel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Recorded).seen = [];
    addEventListener('DOMContentLoaded', () => {
      new MutationObserver(() => {
        const panel = document.querySelector<HTMLElement>('[data-ai-panel]');
        const t = panel?.querySelector('p')?.textContent;
        if (t && !panel!.hidden) (window as unknown as Recorded).seen.push(t);
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    });
  });
}

/** Every panel text recorded on this page load so far. */
export const panelSeen = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as Recorded).seen);

/** Forget what was recorded so far. */
export const clearPanelSeen = (page: Page): Promise<void> =>
  page.evaluate(() => void ((window as unknown as Recorded).seen = []));
