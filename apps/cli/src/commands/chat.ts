import { getVkClientForUser, type EnvConfig } from '@vk-sales-bot/core';

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

export type ChatSendOptions = { accountId: number; peerId: number; message: string };

export async function runChatSendCommand(env: EnvConfig, options: ChatSendOptions): Promise<number> {
  const text = options.message.trim();

  if (!text) {
    throw new Error('Сообщение не может быть пустым');
  }

  const { client: vk, userId } = await getVkClientForUser(options.accountId, env);
  const messageId = await vk.sendMessage(options.peerId, text);

  console.log(`Отправлено от user_id=${userId} в peer_id=${options.peerId}`);
  console.log(`message_id: ${messageId}`);

  return messageId;
}
