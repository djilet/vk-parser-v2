import { getVkClientForUser, type EnvConfig, type VkClient } from '@vk-sales-bot/core';
import {
  enrichConversationItemsWithLastMessages,
  loadPeerIdsByStatus,
  loadPinnedPeerIds,
  mapConversationToSummary,
  sortChatsForDisplay,
} from '@vk-sales-bot/chat';
import { ChatStatus, isChatStatus } from '@vk-sales-bot/contracts';
import { badRequest } from '../errors.js';
import { parseAccountId, parseConversationFilter, parseLimit, parseOffset } from '../params.js';
import type { Route } from '../router.js';

async function fetchConversationsByPeerIds(vk: VkClient, peerIds: number[]) {
  const batchSize = 100;
  const items: Awaited<ReturnType<VkClient['getConversationsById']>>['items'] = [];
  let profiles: NonNullable<Awaited<ReturnType<VkClient['getConversationsById']>>['profiles']> = [];
  let groups: NonNullable<Awaited<ReturnType<VkClient['getConversationsById']>>['groups']> = [];

  for (let offset = 0; offset < peerIds.length; offset += batchSize) {
    const batch = peerIds.slice(offset, offset + batchSize);
    const data = await vk.getConversationsById(batch);
    items.push(...data.items);
    profiles = data.profiles ?? profiles;
    groups = data.groups ?? groups;
  }

  return { items, profiles, groups };
}

function toSortedChats(
  peerIds: number[],
  chatsByPeerId: Map<number, ReturnType<typeof mapConversationToSummary>>,
): ReturnType<typeof mapConversationToSummary>[] {
  return sortChatsForDisplay(
    peerIds.map((peerId) => chatsByPeerId.get(peerId)).filter((chat): chat is NonNullable<typeof chat> => chat != null),
  );
}

export function conversationRoutes(env: Pick<EnvConfig, 'vk'>): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/conversations',
      handler: async (ctx) => {
        const accountId = parseAccountId(ctx.query.get('accountId'));
        const limit = parseLimit(ctx.query.get('limit'));
        const offset = parseOffset(ctx.query.get('offset'));
        const filter = parseConversationFilter(ctx.query.get('filter'));
        const { client: vk } = await getVkClientForUser(accountId, env);

        const data = await vk.getConversations(limit, offset, filter);
        const enrichedItems = await enrichConversationItemsWithLastMessages(vk, data.items);
        const chats = enrichedItems.map((item) => mapConversationToSummary(item, data.profiles ?? [], data.groups ?? []));

        ctx.send(200, { accountId, chats, total: data.count, offset, limit, filter });
      },
    },
    {
      method: 'GET',
      path: '/api/pinned-chats/conversations',
      handler: async (ctx) => {
        const accountId = parseAccountId(ctx.query.get('accountId'));
        const { client: vk } = await getVkClientForUser(accountId, env);
        const peerIds = await loadPinnedPeerIds(accountId);

        if (peerIds.length === 0) {
          ctx.send(200, { accountId, chats: [] });
          return;
        }

        const data = await vk.getConversationsById(peerIds);
        const enrichedItems = await enrichConversationItemsWithLastMessages(vk, data.items);
        const chatsByPeerId = new Map<number, ReturnType<typeof mapConversationToSummary>>();

        for (const item of enrichedItems) {
          const chat = mapConversationToSummary(item, data.profiles ?? [], data.groups ?? []);
          chatsByPeerId.set(chat.peerId, chat);
        }

        ctx.send(200, { accountId, chats: toSortedChats(peerIds, chatsByPeerId) });
      },
    },
    {
      method: 'GET',
      path: '/api/chat-status/conversations',
      handler: async (ctx) => {
        const accountId = parseAccountId(ctx.query.get('accountId'));
        const status = ctx.query.get('status');

        if (!isChatStatus(status) || status === ChatStatus.Initial) {
          throw badRequest('status must be active_dialog or client');
        }

        const { client: vk } = await getVkClientForUser(accountId, env);
        const peerIds = await loadPeerIdsByStatus(accountId, status);

        if (peerIds.length === 0) {
          ctx.send(200, { accountId, status, chats: [] });
          return;
        }

        const data = await fetchConversationsByPeerIds(vk, peerIds);
        const enrichedItems = await enrichConversationItemsWithLastMessages(vk, data.items);
        const chatsByPeerId = new Map<number, ReturnType<typeof mapConversationToSummary>>();

        for (const item of enrichedItems) {
          const chat = mapConversationToSummary(item, data.profiles ?? [], data.groups ?? []);
          chatsByPeerId.set(chat.peerId, chat);
        }

        ctx.send(200, { accountId, status, chats: toSortedChats(peerIds, chatsByPeerId) });
      },
    },
  ];
}
