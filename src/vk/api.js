import { config } from '../config.js';

/** Версия VK API — фиксируем, чтобы ответ не менялся при обновлениях на стороне VK. */
export const VK_API_VERSION = '5.199';

const FLOOD_CONTROL_CODE = 9; // Flood control: слишком часто одно и то же действие
const TOO_MANY_REQUESTS_CODE = 6; // Too many requests per second
export const AUTH_FAILED_CODE = 5; // истёкший/невалидный токен — вызывающий код должен прервать весь прогон
const MAX_RETRIES = 5;

export class VkApiError extends Error {
  constructor(method, code, message) {
    super(`VK API ${method}: ${message} (${code})`);
    this.name = 'VkApiError';
    this.method = method;
    this.code = code;
  }
}

/**
 * Запросы к VK сериализуем через одну очередь с паузой между ними: user-токен ограничен
 * тремя запросами в секунду, а без сериализации параллельные вызовы (Promise.all) быстро
 * ловят flood control.
 */
let queue = Promise.resolve();

function enqueue(fn) {
  const result = queue.then(fn, fn);
  queue = result.then(() => undefined, () => undefined);

  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawRequest(method, accessToken, params) {
  const url = new URL(`https://api.vk.com/method/${method}`);

  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('v', VK_API_VERSION);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(config.vk.requestTimeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`VK API: ${method} — нет ответа за ${config.vk.requestTimeoutMs} мс`);
    }

    throw new Error(`VK API: ${method} — сетевая ошибка: ${err.message}`);
  }

  return response.json();
}

async function vkRequest(method, accessToken, params) {
  return enqueue(async () => {
    let attempt = 0;

    // Пауза перед следующим освобождением очереди должна случиться независимо от исхода
    // (успех/финальная ошибка после исчерпанных ретраев) — иначе запрос сразу после упавшего
    // уходит вплотную к нему, ровно когда пауза нужнее всего.
    try {
      for (;;) {
        const payload = await rawRequest(method, accessToken, params);

        if (payload && typeof payload === 'object' && 'error' in payload) {
          const { error } = payload;
          const isRetryable = error.error_code === FLOOD_CONTROL_CODE || error.error_code === TOO_MANY_REQUESTS_CODE;

          if (isRetryable && attempt < MAX_RETRIES) {
            const waitMs = 1000 * 2 ** attempt;
            await sleep(waitMs);
            attempt += 1;
            continue;
          }

          throw new VkApiError(method, error.error_code, error.error_msg);
        }

        return payload.response;
      }
    } finally {
      await sleep(config.vk.requestDelayMs);
    }
  });
}

/**
 * История переписки, от новых сообщений к старым (rev=0).
 * startCmid — conversation_message_id, с которого продолжаем постраничный обход (курсор вместо
 * offset: на большой истории offset у VK ненадёжен). VK требует offset<=0, когда start_cmid задан.
 */
export function getHistory(accessToken, peerId, count, offset, startCmid) {
  return vkRequest('messages.getHistory', accessToken, {
    peer_id: peerId,
    count,
    offset,
    extended: 0,
    rev: 0,
    start_cmid: startCmid,
  });
}

export function getUsers(accessToken, userIds) {
  if (userIds.length === 0) {
    return Promise.resolve([]);
  }

  return vkRequest('users.get', accessToken, { user_ids: userIds.join(',') });
}

export async function isAccessTokenValid(accessToken, userId) {
  try {
    await getUsers(accessToken, [userId]);
    return true;
  } catch (err) {
    if (err instanceof VkApiError && err.code === AUTH_FAILED_CODE) {
      return false;
    }

    return true;
  }
}
