import { join } from 'node:path';

export const VKHOST_URL = 'https://vkhost.github.io/';

export const DEFAULT_APP_NAME = 'vk.com';
export const DEFAULT_APP_ID = 6287487;

export const BROWSER_IDS = [1, 2] as const;
export type BrowserId = (typeof BROWSER_IDS)[number];

export type BrowserPaths = {
  browserProfile: string;
  tokenFile: string;
};

export type VkTokenConfig = {
  appName: string;
  appId: number;
  browserId: BrowserId;
  paths: BrowserPaths;
};

export function parseBrowserId(value?: string | number): BrowserId {
  const id = Number(value ?? process.env.VK_BROWSER ?? 1);

  if (id !== 1 && id !== 2) {
    throw new Error('Номер браузера должен быть 1 или 2');
  }

  return id;
}

export function getBrowserPaths(browserId: BrowserId): BrowserPaths {
  return {
    browserProfile: join(process.cwd(), `.browser-profile-${browserId}`),
    tokenFile: join(process.cwd(), 'tokens', `browser-${browserId}.json`),
  };
}

export function loadConfig(browserId: BrowserId = parseBrowserId()): VkTokenConfig {
  const appName = process.env.VK_APP_NAME ?? DEFAULT_APP_NAME;
  const appId = process.env.VK_APP_ID ? Number(process.env.VK_APP_ID) : DEFAULT_APP_ID;

  return {
    appName,
    appId,
    browserId,
    paths: getBrowserPaths(browserId),
  };
}
