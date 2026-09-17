import type { VkClient, VkConversation, VkConversationItem, VkMessage } from '@vk-sales-bot/core';

function normalizeConversationItem(item: VkConversationItem | VkConversation): VkConversationItem {
  if ('conversation' in item) {
    return item;
  }

  return { conversation: item };
}

async function fetchLastMessageForPeer(
  vk: VkClient,
  peerId: number,
  lastConversationMessageId?: number,
): Promise<VkMessage | undefined> {
  try {
    const history = await vk.getHistory(peerId, 1, 0);
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
    const history = await vk.getHistory(peerId, 1, 0, { startCmid: lastConversationMessageId });
    return history.items[0];
  } catch {
    return undefined;
  }
}

export async function enrichConversationItemWithLastMessage(
  vk: VkClient,
  item: VkConversationItem | VkConversation,
): Promise<VkConversationItem> {
  const normalized = normalizeConversationItem(item);

  // extended:1 already returns last_message for most conversations — only the rare item
  // missing it costs an extra request, and that request is itself serialized through the
  // VkClient's own rate-limit queue, so this never fires faster than VK's own limit allows.
  if (normalized.last_message) {
    return normalized;
  }

  const peerId = normalized.conversation.peer.id;
  const lastMessage = await fetchLastMessageForPeer(vk, peerId, normalized.conversation.last_conversation_message_id);

  if (!lastMessage) {
    return normalized;
  }

  return {
    conversation: normalized.conversation,
    last_message: lastMessage,
  };
}

export async function enrichConversationItemsWithLastMessages(
  vk: VkClient,
  items: Array<VkConversationItem | VkConversation>,
): Promise<VkConversationItem[]> {
  return Promise.all(items.map((item) => enrichConversationItemWithLastMessage(vk, item)));
}
