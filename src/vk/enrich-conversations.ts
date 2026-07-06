import { getHistory } from './api.js';
import type { VkConversation, VkConversationItem, VkMessage } from './types.js';

function normalizeConversationItem(item: VkConversationItem | VkConversation): VkConversationItem {
  if ('conversation' in item) {
    return item;
  }

  return { conversation: item };
}

async function fetchLastMessageForPeer(
  accessToken: string,
  peerId: number,
  lastConversationMessageId?: number,
): Promise<VkMessage | undefined> {
  try {
    const history = await getHistory(accessToken, peerId, 1, 0);
    const lastMessage = history.items[0];

    if (lastMessage) {
      return lastMessage;
    }
  } catch {
    // try fallback below
  }

  if (lastConversationMessageId == null) {
    return undefined;
  }

  try {
    const history = await getHistory(accessToken, peerId, 1, 0, lastConversationMessageId);
    return history.items[0];
  } catch {
    return undefined;
  }
}

export async function enrichConversationItemWithLastMessage(
  accessToken: string,
  item: VkConversationItem | VkConversation,
): Promise<VkConversationItem> {
  const normalized = normalizeConversationItem(item);

  if (normalized.last_message) {
    return normalized;
  }

  const peerId = normalized.conversation.peer.id;
  const lastMessage = await fetchLastMessageForPeer(
    accessToken,
    peerId,
    normalized.conversation.last_conversation_message_id,
  );

  if (!lastMessage) {
    return normalized;
  }

  return {
    conversation: normalized.conversation,
    last_message: lastMessage,
  };
}

export async function enrichConversationItemsWithLastMessages(
  accessToken: string,
  items: Array<VkConversationItem | VkConversation>,
): Promise<VkConversationItem[]> {
  return Promise.all(
    items.map((item) => enrichConversationItemWithLastMessage(accessToken, item)),
  );
}
