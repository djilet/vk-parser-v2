/**
 * Two VK accounts survive the merge (vk-parser-v2's browser-1 and browser-2). Widening this
 * later to a third account is a one-line change here plus a new tokens/browser-3.json +
 * chrome-profile-3/ — nothing else in the codebase hardcodes the count.
 */
export const BROWSER_IDS = [1, 2] as const;
export type BrowserId = (typeof BROWSER_IDS)[number];

export function isBrowserId(value: unknown): value is BrowserId {
  return typeof value === 'number' && (BROWSER_IDS as readonly number[]).includes(value);
}

export function parseBrowserId(value?: string | number): BrowserId {
  const id = Number(value ?? 1);

  if (!isBrowserId(id)) {
    throw new Error(`Номер браузера должен быть одним из: ${BROWSER_IDS.join(', ')}`);
  }

  return id;
}
