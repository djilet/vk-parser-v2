import { getVkClientForUser, type EnvConfig } from '@vk-sales-bot/core';
import { formatMessages } from '@vk-sales-bot/chat';
import { badRequest } from '../errors.js';
import { DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT, parseAccountId, parseLimit, parseOffset, parsePeerId } from '../params.js';
import type { Route } from '../router.js';

export function chatMessageRoutes(env: Pick<EnvConfig, 'vk'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/chats/:peerId/messages',
      handler: async (ctx) => {
        const peerId = parsePeerId(ctx.params.peerId!);
        const accountId = parseAccountId(ctx.query.get('accountId'));
        const limit = parseLimit(ctx.query.get('limit'), DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT);
        const offset = parseOffset(ctx.query.get('offset'));
        const { client: vk, userId } = await getVkClientForUser(accountId, env);

        const history = await vk.getHistory(peerId, limit, offset);
        const messages = formatMessages(history.items);

        let markedRead = false;
        if (offset === 0) {
          try {
            markedRead = await vk.markPeerAsRead(peerId);
          } catch {
            // keep chat usable even if VK mark-as-read fails
          }
        }

        ctx.send(200, {
          accountId,
          peerId,
          userId,
          messages,
          total: history.count,
          offset,
          limit,
          hasMore: history.items.length === limit,
          markedRead,
        });
      },
    },
    {
      method: 'POST',
      path: '/api/chats/:peerId/messages',
      handler: async (ctx) => {
        const peerId = parsePeerId(ctx.params.peerId!);
        const body = await ctx.readBody();
        const accountId = parseAccountId(String(body.accountId ?? ''));
        const message = String(body.message ?? '').trim();

        if (!message) {
          throw badRequest('Message cannot be empty');
        }

        const { client: vk } = await getVkClientForUser(accountId, env);
        const messageId = await vk.sendMessage(peerId, message);

        ctx.send(200, { messageId, peerId, accountId });
      },
    },
    {
      // The pair that used to drift from web/src/api.ts's declared type
      // ({accountId, peerId, upToCmid}) — now pinned by @vk-sales-bot/contracts#MarkChatReadResponse.
      method: 'POST',
      path: '/api/chats/:peerId/read',
      handler: async (ctx) => {
        const peerId = parsePeerId(ctx.params.peerId!);
        const body = await ctx.readBody();
        const accountId = parseAccountId(String(body.accountId ?? ''));
        const { client: vk } = await getVkClientForUser(accountId, env);

        const markedRead = await vk.markPeerAsRead(peerId);

        ctx.send(200, { accountId, peerId, markedRead });
      },
    },
  ];
}
