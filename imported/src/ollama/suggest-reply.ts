import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateOllamaReply } from './client.js';

export type ChatMessageForSuggestion = {
  date: string;
  fromId: number;
  text: string;
  files: { type: string; url: string; name?: string }[];
};

const FAQ_PATH = join(process.cwd(), 'data', 'faq.md');
const MAX_CONTEXT_MESSAGES = 50;

async function loadFaqText(): Promise<string> {
  try {
    return await readFile(FAQ_PATH, 'utf8');
  } catch {
    throw new Error('FAQ file is missing. Create or update data/faq.md');
  }
}

function toTranscriptLine(message: ChatMessageForSuggestion, userId?: number): string {
  const role = userId != null && message.fromId === userId ? 'Оператор' : 'Клиент';
  const text = message.text.trim() || (message.files.length > 0 ? '[Вложение]' : '[Пустое сообщение]');
  return `${role}: ${text}`;
}

function buildTranscript(messages: ChatMessageForSuggestion[], userId?: number): string {
  const limitedMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
  return limitedMessages.map((message) => toTranscriptLine(message, userId)).join('\n');
}

export async function suggestReply(
  messages: ChatMessageForSuggestion[],
  userId?: number,
): Promise<string> {
  if (messages.length === 0) {
    throw new Error('Cannot suggest reply without chat messages');
  }

  const faqText = await loadFaqText();
  const transcript = buildTranscript(messages, userId);

  const systemPrompt = [
    'Ты помощник оператора в чате VK.',
    'Твоя задача: предложить короткий, уместный и дружелюбный ответ клиенту.',
    'Используй FAQ как источник истины. Если данных в FAQ не хватает, напиши нейтральный уточняющий ответ.',
    'Отвечай только на русском языке.',
    'Выведи только текст сообщения для отправки, без кавычек, пояснений и markdown.',
    '',
    'FAQ:',
    faqText,
  ].join('\n');

  const userPrompt = [
    'История переписки (от старых к новым):',
    transcript,
    '',
    'Сформируй один вариант следующего ответа оператора.',
  ].join('\n');

  return generateOllamaReply([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
}
