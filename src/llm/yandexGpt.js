import { config } from '../config.js';
import { sleep } from '../utils/sleep.js';

const ENDPOINT = 'https://llm.api.cloud.yandex.net/v1/chat/completions';
const RETRY_STATUSES = new Set([429, 502, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;
const REQUEST_TIMEOUT_MS = 30_000;

export function isYandexConfigured() {
  return Boolean(config.yandex.apiKey && config.yandex.folderId);
}

export function ensureYandexConfigured() {
  if (!isYandexConfigured()) {
    throw new Error(
      'Yandex GPT не настроен: задайте YANDEX_GPT_API_KEY и gpt:/ в .env',
    );
  }
}

/**
 * Один запрос к OpenAI-совместимому Yandex Cloud LLM API.
 * Аналог imgame-backend/src/Services/Chat/Llm/YandexFlashLlmClient.php, но на fetch.
 *
 * @param {{role: 'system'|'user'|'assistant', content: string}[]} messages
 * @param {{temperature?: number, maxTokens?: number}} [options]
 * @returns {Promise<string>} текст ответа модели
 */
export async function completeChat(messages, options = {}) {
  ensureYandexConfigured();

  const payload = {
    model: `gpt://${config.yandex.folderId}/${config.yandex.model}`,
    messages: messages.map(({ role, content }) => ({ role, content })),
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 16,
  };

  let lastError = new Error('Yandex GPT: модель временно недоступна');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;

    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Api-Key ${config.yandex.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      lastError =
        err.name === 'TimeoutError' || err.name === 'AbortError'
          ? new Error(`Yandex GPT: нет ответа за ${REQUEST_TIMEOUT_MS} мс`)
          : new Error(`Yandex GPT: сетевая ошибка: ${err.message}`);

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

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content === '') {
      throw new Error('Yandex GPT: пустой ответ модели');
    }

    return content;
  }

  throw lastError;
}
