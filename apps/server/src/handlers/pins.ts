import { getTokenByUserId, type EnvConfig } from '@vk-sales-bot/core';
import { loadPinnedPeerIds, setPeerPinned } from '@vk-sales-bot/chat';
import { parseAccountId, parsePeerId } from '../params.js';
import type { Route } from '../router.js';

export function pinRoutes(_env: Pick<EnvConfig, 'vk'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/pinned-chats',
      handler: async (ctx) => {
        const accountId = parseAccountId(ctx.query.get('accountId'));
        await getTokenByUserId(accountId);

        const peerIds = await loadPinnedPeerIds(accountId);
        ctx.send(200, { accountId, peerIds });
      },
    },
    {
      method: 'PUT',
      path: '/api/chats/:peerId/pin',
      handler: async (ctx) => {
        const peerId = parsePeerId(ctx.params.peerId!);
        const body = await ctx.readBody();
        const accountId = parseAccountId(String(body.accountId ?? ''));
        const pinned = body.pinned === true;

        await getTokenByUserId(accountId);
        const peerIds = await setPeerPinned(accountId, peerId, pinned);

        ctx.send(200, { accountId, peerId, pinned, peerIds });
      },
    },
  ];
}
