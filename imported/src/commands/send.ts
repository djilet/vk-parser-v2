import { getTokenByUserId } from '../token/index.js';
import { sendMessage } from '../vk/api.js';

export type SendMessageOptions = {
  accountId: number;
  peerId: number;
  message: string;
};

export function parseAccountId(value: string): number {
  const accountId = Number(value);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error('accountId должен быть положительным целым числом');
  }

  return accountId;
}

export function parsePeerId(value: string): number {
  const peerId = Number(value);

  if (!Number.isInteger(peerId) || peerId === 0) {
    throw new Error('peerId должен быть ненулевым целым числом');
  }

  return peerId;
}

export async function runSendMessageCommand(options: SendMessageOptions): Promise<number> {
  const text = options.message.trim();

  if (!text) {
    throw new Error('Сообщение не может быть пустым');
  }

  const token = await getTokenByUserId(options.accountId);
  const messageId = await sendMessage(token.accessToken, options.peerId, text);

  console.log(`Отправлено от user_id=${token.userId} в peer_id=${options.peerId}`);
  console.log(`message_id: ${messageId}`);

  return messageId;
}
