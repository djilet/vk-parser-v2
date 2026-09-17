import type { SalesApiClient } from '@vk-sales-bot/sales-api';
import { getCommunityMsgUrl, getCommunityPeerId, type CommunityInput } from '../utils/community-fields.js';

/** chat_id уникален: на сообщество приходится одна запись в журнале отправок. */
export async function markCommunityMessageSent(
  api: SalesApiClient,
  community: CommunityInput & { id?: number },
): Promise<number> {
  const chatId = getCommunityPeerId(community);

  if (chatId == null) {
    throw new Error('API: не удалось отметить отправку — у сообщества нет peer_id');
  }

  const payload = {
    community_id: community.id ?? null,
    chat_id: chatId,
    msg_url: getCommunityMsgUrl(community),
  };

  const existing = await api.messagesSent.findMessageSentByChatId(chatId);

  if (existing) {
    await api.messagesSent.updateMessageSent(existing.id, {
      community_id: payload.community_id,
      msg_url: payload.msg_url,
    });

    return existing.id;
  }

  const created = await api.messagesSent.createMessageSent(payload);
  return created.id;
}
