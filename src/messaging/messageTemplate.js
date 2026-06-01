import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const MESSAGE_TEMPLATE_PATH = resolve('msg_template.txt');

export async function loadMessageTemplate() {
  try {
    return (await readFile(MESSAGE_TEMPLATE_PATH, 'utf8')).trimEnd();
  } catch {
    throw new Error(`Не удалось прочитать шаблон сообщения: ${MESSAGE_TEMPLATE_PATH}`);
  }
}
