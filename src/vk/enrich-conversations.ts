import { getHistory } from './api.js';
import type { VkConversation, VkConversationItem } from './types.js';

function normalizeConversationItem(item: VkConversationItem | VkConversation): VkConversationItem {
  if ('conversation' in item) {
    return item;
  }

  return { conversation: item };
}

export async function enrichConversationItemsWithLastMessages(
  accessToken: string,
  items: Array<VkConversationItem | VkConversation>,
): Promise<VkConversationItem[]> {
  return Promise.all(
    items.map(async (item) => {
      const normalized = normalizeConversationItem(item);

      if (normalized.last_message) {
        return normalized;
      }

      const peerId = normalized.conversation.peer.id;

      try {
        const history = await getHistory(accessToken, peerId, 1, 0);
        const lastMessage = history.items[0];

        if (!lastMessage) {
          return normalized;
        }

        return {
          conversation: normalized.conversation,
          last_message: lastMessage,
        };
      } catch {
        return normalized;
      }
    }),
  );
}
