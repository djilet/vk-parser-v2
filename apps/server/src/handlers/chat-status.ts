import { getTokenByUserId, type EnvConfig } from '@vk-sales-bot/core';
import { loadChatStatuses, setChatStatus } from '@vk-sales-bot/chat';
import { parseAccountId, parseChatStatus, parsePeerId } from '../params.js';
import type { Route } from '../router.js';

export function chatStatusRoutes(_env: Pick<EnvConfig, 'vk'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/chat-status',
      handler: async (ctx) => {
        const accountId = parseAccountId(ctx.query.get('accountId'));
        await getTokenByUserId(accountId);

        const statuses = await loadChatStatuses(accountId);
        ctx.send(200, { accountId, statuses });
      },
    },
    {
      method: 'PUT',
      path: '/api/chats/:peerId/status',
      handler: async (ctx) => {
        const peerId = parsePeerId(ctx.params.peerId!);
        const body = await ctx.readBody();
        const accountId = parseAccountId(String(body.accountId ?? ''));
        const status = parseChatStatus(body.status);

        await getTokenByUserId(accountId);
        const statuses = await setChatStatus(accountId, peerId, status);

        ctx.send(200, { accountId, peerId, status, statuses });
      },
    },
  ];
}
