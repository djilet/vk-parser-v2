import { readFile } from 'node:fs/promises';
import { dataPath } from '@vk-sales-bot/core';

export const MESSAGE_TEMPLATE_PATH = dataPath('msg-template.txt');

export async function loadMessageTemplate(): Promise<string> {
  try {
    return (await readFile(MESSAGE_TEMPLATE_PATH, 'utf8')).trimEnd();
  } catch {
    throw new Error(`Не удалось прочитать шаблон сообщения: ${MESSAGE_TEMPLATE_PATH}`);
  }
}
