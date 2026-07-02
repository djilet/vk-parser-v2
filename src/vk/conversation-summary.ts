import { resolvePeerPhotoUrl, resolvePeerTitle } from './peer-title.js';
import type { VkConversation, VkConversationItem, VkGroup, VkProfile } from './types.js';

export type ChatSummaryData = {
  peerId: number;
  peerType: string;
  title: string;
  photoUrl?: string;
  unreadCount: number;
  lastMessage: {
    text: string;
    date: string;
    out: boolean;
  } | null;
};

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
