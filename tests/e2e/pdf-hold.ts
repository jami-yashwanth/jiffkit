import type { Page } from '@playwright/test';

/**
 * Lets a test hold merge/split results from the PDF worker. While held, a finished job's result waits for
 * `releaseResults`; page counts pass straight through. Call `installResultHold` before `page.goto`.
 */
export async function installResultHold(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __hold: boolean; __held: (() => void)[]; __release: () => void };
    w.__hold = false;
    w.__held = [];
    w.__release = () => {
      w.__hold = false;
      w.__held.splice(0).forEach((f) => f());
    };
    const Base = window.Worker;
    window.Worker = class extends Base {
      set onmessage(fn: ((e: MessageEvent) => void) | null) {
        super.onmessage = (e: MessageEvent) => {
          if (w.__hold && e.data?.kind === 'done' && typeof e.data.result === 'object') w.__held.push(() => fn?.call(this, e));
          else fn?.call(this, e);
        };
      }
      get onmessage() {
        return super.onmessage;
      }
    };
  });
}
export const holdResults = (page: Page) => page.evaluate(() => ((window as unknown as { __hold: boolean }).__hold = true));
export const releaseResults = (page: Page) => page.evaluate(() => (window as unknown as { __release: () => void }).__release());
