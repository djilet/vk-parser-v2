import {
  clearToken,
  getVkClientForAccount,
  isTokenExpired,
  loadAllTokens,
  loadToken,
  markTokenNeedsSession,
  parseBrowserId,
  type EnvConfig,
  type SavedToken,
} from '@vk-sales-bot/core';
import type { AccountSummary } from '@vk-sales-bot/contracts';
import { getAccountSetupStatus, startSessionSetup, startTokenSetup } from '../account-setup.js';
import { conflict } from '../errors.js';
import { stopAccountLongPoll } from '../long-poll-manager.js';
import type { Route } from '../router.js';

async function resolveTokenStatus(
  token: SavedToken,
  env: Pick<EnvConfig, 'vk'>,
): Promise<{ expired: boolean; needsSession: boolean }> {
  try {
    const expired = isTokenExpired(token);

    if (token.needsSession) {
      return { expired, needsSession: true };
    }

    if (!expired && token.userId && token.accessToken) {
      const vk = await getVkClientForAccount(token.browserId, env);
      const valid = await vk.isAccessTokenValid(token.userId);
      if (!valid) {
        await markTokenNeedsSession(token.browserId);
        return { expired, needsSession: true };
      }
    }

    return { expired, needsSession: false };
  } catch {
    return { expired: isTokenExpired(token), needsSession: true };
  }
}

export function accountRoutes(env: Pick<EnvConfig, 'vk'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/accounts',
      handler: async (ctx) => {
        const tokens = await loadAllTokens();
        const statuses = await Promise.all(tokens.map((token) => resolveTokenStatus(token, env)));
        const activeTokens = tokens.filter(
          (token, index) => token.userId && !statuses[index]!.expired && !statuses[index]!.needsSession,
        );
        const profilesById = new Map<number, { first_name: string; last_name: string }>();

        if (activeTokens.length > 0) {
          try {
            const vk = await getVkClientForAccount(activeTokens[0]!.browserId, env);
            const userIds = [...new Set(activeTokens.map((token) => token.userId!))];
            const profiles = await vk.getUsers(userIds);

            for (const profile of profiles ?? []) {
              profilesById.set(profile.id, { first_name: profile.first_name, last_name: profile.last_name });
            }
          } catch {
            // fall back to email / token label in the UI
          }
        }

        const response: AccountSummary[] = tokens.map((token, index) => {
          const profile = token.userId ? profilesById.get(token.userId) : undefined;
          const status = statuses[index]!;

          return {
            userId: token.userId,
            email: token.email,
            firstName: profile?.first_name,
            lastName: profile?.last_name,
            browserId: token.browserId,
            expired: status.expired,
            needsSession: status.needsSession,
          };
        });

        ctx.send(200, response);
      },
    },
    {
      method: 'DELETE',
      path: '/api/accounts/:browserId',
      handler: async (ctx) => {
        const browserId = parseBrowserId(ctx.params.browserId);
        const token = await loadToken(browserId);

        if (token?.userId) {
          stopAccountLongPoll(token.userId);
        }

        await clearToken(browserId);
        ctx.send(200, { browserId, loggedOut: true });
      },
    },
    {
      method: 'GET',
      path: '/api/accounts/:browserId/setup',
      handler: async (ctx) => {
        const browserId = parseBrowserId(ctx.params.browserId);
        ctx.send(200, { browserId, ...getAccountSetupStatus(browserId) });
      },
    },
    {
      method: 'POST',
      path: '/api/accounts/:browserId/session',
      handler: async (ctx) => {
        const browserId = parseBrowserId(ctx.params.browserId);
        const result = startSessionSetup(browserId, env);

        if (!result.started) {
          throw conflict(result.error ?? 'Session setup is already running');
        }

        ctx.send(202, { browserId, started: true });
      },
    },
    {
      method: 'POST',
      path: '/api/accounts/:browserId/token',
      handler: async (ctx) => {
        const browserId = parseBrowserId(ctx.params.browserId);
        const result = startTokenSetup(browserId, env);

        if (!result.started) {
          throw conflict(result.error ?? 'Token setup is already running');
        }

        ctx.send(202, { browserId, started: true });
      },
    },
  ];
}
