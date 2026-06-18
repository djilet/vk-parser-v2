import { join } from 'node:path';

export const VKHOST_URL = 'https://vkhost.github.io/';

export const DEFAULT_APP_NAME = 'vk.com';
export const DEFAULT_APP_ID = 6287487;

export const paths = {
  browserProfile: join(process.cwd(), '.browser-profile'),
  tokenFile: join(process.cwd(), '.vk-token.json'),
};

export type VkTokenConfig = {
  appName: string;
  appId?: number;
};

export function loadConfig(): VkTokenConfig {
  const appName = process.env.VK_APP_NAME ?? DEFAULT_APP_NAME;
  const appId = process.env.VK_APP_ID ? Number(process.env.VK_APP_ID) : DEFAULT_APP_ID;

  return { appName, appId };
}
