import {
  createMessageSent,
  findMessageSentByChatId,
  updateMessageSent,
} from '../api/salesCommunityMessagesSent.js';
import { getCommunityMsgUrl, getCommunityPeerId } from '../utils/communityFields.js';

/** chat_id уникален: на сообщество приходится одна запись в журнале отправок. */
export async function markCommunityMessageSent(community) {
  const chatId = getCommunityPeerId(community);

  if (chatId == null) {
    throw new Error('API: не удалось отметить отправку — у сообщества нет peer_id');
  }

  const payload = {
    community_id: community.id ?? null,
    chat_id: chatId,
    msg_url: getCommunityMsgUrl(community),
  };

  const existing = await findMessageSentByChatId(chatId);

  if (existing) {
    await updateMessageSent(existing.id, {
      community_id: payload.community_id,
      msg_url: payload.msg_url,
    });

    return existing.id;
  }

  const created = await createMessageSent(payload);

  return created.id;
}
