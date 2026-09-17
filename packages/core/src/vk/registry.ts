import type { BrowserId } from '../accounts.js';
import type { EnvConfig } from '../env.js';
import { createVkClient, type VkClient } from './client.js';
import { getAccessToken, getTokenByUserId } from './token-store.js';

type CacheEntry = { accessToken: string; client: VkClient };

const clientsByBrowserId = new Map<BrowserId, CacheEntry>();
const clientsByUserId = new Map<number, CacheEntry>();

function clientOptions(env: Pick<EnvConfig, 'vk'>) {
  return { requestTimeoutMs: env.vk.requestTimeoutMs, requestDelayMs: env.vk.requestDelayMs };
}

/** A cached client per account, invalidated automatically when the on-disk token changes. */
export async function getVkClientForAccount(
  browserId: BrowserId,
  env: Pick<EnvConfig, 'vk'>,
): Promise<VkClient> {
  const accessToken = await getAccessToken(browserId);
  const cached = clientsByBrowserId.get(browserId);

  if (cached && cached.accessToken === accessToken) {
    return cached.client;
  }

  const client = createVkClient(accessToken, clientOptions(env));
  clientsByBrowserId.set(browserId, { accessToken, client });
  return client;
}

/** Same cache, looked up by the VK user id the server/CLI's `chat send` addresses accounts by. */
export async function getVkClientForUser(
  userId: number,
  env: Pick<EnvConfig, 'vk'>,
): Promise<{ client: VkClient; browserId: BrowserId; userId: number }> {
  const token = await getTokenByUserId(userId);
  const cached = clientsByUserId.get(userId);

  if (cached && cached.accessToken === token.accessToken) {
    return { client: cached.client, browserId: token.browserId, userId };
  }

  const client = createVkClient(token.accessToken, clientOptions(env));
  clientsByUserId.set(userId, { accessToken: token.accessToken, client });
  return { client, browserId: token.browserId, userId };
}
