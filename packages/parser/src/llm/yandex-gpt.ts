import { sleep, type EnvConfig } from '@vk-sales-bot/core';

const ENDPOINT = 'https://llm.api.cloud.yandex.net/v1/chat/completions';
const RETRY_STATUSES = new Set([429, 502, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;
const REQUEST_TIMEOUT_MS = 30_000;

export type YandexChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type YandexEnv = Pick<EnvConfig, 'yandex'>;

export function isYandexConfigured(env: YandexEnv): boolean {
  return Boolean(env.yandex.apiKey && env.yandex.folderId);
}

export function ensureYandexConfigured(env: YandexEnv): void {
  if (!isYandexConfigured(env)) {
    throw new Error('Yandex GPT не настроен: задайте YANDEX_GPT_API_KEY и YANDEX_GPT_FOLDER_ID в .env');
  }
}

/**
 * Один запрос к OpenAI-совместимому Yandex Cloud LLM API.
 * Аналог imgame-backend/src/Services/Chat/Llm/YandexFlashLlmClient.php, но на fetch.
 */
export async function completeChat(
  env: YandexEnv,
  messages: YandexChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  ensureYandexConfigured(env);

  const payload = {
    model: `gpt://${env.yandex.folderId}/${env.yandex.model}`,
    messages: messages.map(({ role, content }) => ({ role, content })),
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 16,
  };

  let lastError = new Error('Yandex GPT: модель временно недоступна');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${env.yandex.apiKey}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      lastError =
        name === 'TimeoutError' || name === 'AbortError'
          ? new Error(`Yandex GPT: нет ответа за ${REQUEST_TIMEOUT_MS} мс`)
          : new Error(`Yandex GPT: сетевая ошибка: ${error instanceof Error ? error.message : String(error)}`);

      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      throw lastError;
    }

    if (RETRY_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
      lastError = new Error(`Yandex GPT: HTTP ${response.status}`);
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Yandex GPT: HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content === '') {
      throw new Error('Yandex GPT: пустой ответ модели');
    }

    return content;
  }

  throw lastError;
}
