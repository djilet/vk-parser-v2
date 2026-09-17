import type { VkConversation, VkConversationItem, VkGroup, VkProfile } from '@vk-sales-bot/core';
import type { ChatSummaryData } from '@vk-sales-bot/contracts';
import { resolvePeerPhotoUrl, resolvePeerTitle } from './peer-title.js';

export type { ChatSummaryData };

function normalizeConversationItem(item: VkConversationItem | VkConversation): VkConversationItem {
  if ('conversation' in item) {
    return item;
  }

  return { conversation: item };
}

export function mapConversationToSummary(
  item: VkConversationItem | VkConversation,
  profiles: VkProfile[] = [],
  groups: VkGroup[] = [],
): ChatSummaryData {
  const normalized = normalizeConversationItem(item);
  const lastMessage = normalized.last_message;
  const peerId = normalized.conversation.peer.id;

  return {
    peerId,
    peerType: normalized.conversation.peer.type,
    title: resolvePeerTitle(normalized, profiles, groups),
    photoUrl: resolvePeerPhotoUrl(normalized, profiles, groups),
    unreadCount: normalized.conversation.unread_count ?? 0,
    lastMessage: lastMessage
      ? {
          text: lastMessage.text ?? '',
          date: new Date(lastMessage.date * 1000).toISOString(),
          out: lastMessage.out === 1,
        }
      : null,
  };
}

export function sortChatsForDisplay<T extends { unreadCount: number; lastMessage: { date: string } | null }>(
  chats: T[],
): T[] {
  return [...chats].sort((left, right) => {
    const leftUnread = left.unreadCount > 0 ? 1 : 0;
    const rightUnread = right.unreadCount > 0 ? 1 : 0;

    if (leftUnread !== rightUnread) {
      return rightUnread - leftUnread;
    }

    const leftTime = left.lastMessage ? new Date(left.lastMessage.date).getTime() : 0;
    const rightTime = right.lastMessage ? new Date(right.lastMessage.date).getTime() : 0;
    return rightTime - leftTime;
  });
}
