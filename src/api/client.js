import { config } from '../config.js';
import { ensureApiConfigured, getToken, refreshToken } from './auth.js';

/** Бэкенд отдаёт максимум 20 записей на страницу (AbstractSalesController::MAX_LIMIT). */
export const PAGE_SIZE = 20;

export class ApiError extends Error {
  constructor(status, method, path, body) {
    super(`API ${method} ${path} — ${status}${body ? `: ${body.slice(0, 500)}` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function buildUrl(path, query) {
  const url = new URL(`${config.api.baseUrl.replace(/\/+$/, '')}${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null || value === '') {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function send(method, path, { query, body, token }) {
  const headers = { Authorization: `Bearer ${token}` };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    return await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Парсер работает часами без присмотра — без таймаута один зависший
      // запрос к бэкенду повесил бы весь прогон.
      signal: AbortSignal.timeout(config.api.requestTimeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`API: ${method} ${path} — нет ответа за ${config.api.requestTimeoutMs} мс`);
    }

    throw new Error(`API: ${method} ${path} — сетевая ошибка: ${err.message}`);
  }
}

/**
 * Один запрос к API. На 401 токен обновляется и запрос повторяется ровно один раз —
 * токен живёт год, так что это лечит только отозванный/испорченный токен из кеша.
 */
export async function apiRequest(method, path, { query, body } = {}) {
  ensureApiConfigured();

  let token = await getToken();
  let response = await send(method, path, { query, body, token });

  if (response.status === 401) {
    token = await refreshToken();
    response = await send(method, path, { query, body, token });
  }

  if (!response.ok) {
    throw new ApiError(response.status, method, path, await response.text().catch(() => ''));
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  return text ? JSON.parse(text) : null;
}

/**
 * Одна страница списка: {items, total, limit, offset}.
 * Форма ответа проверяется строго: молча подставленный 0/[] на кривом ответе бэкенда
 * не отличить от «записей действительно нет», а от этого зависят и статистика, и рассылка.
 */
export async function apiListPage(path, query = {}, { limit = PAGE_SIZE, offset = 0 } = {}) {
  const page = await apiRequest('GET', path, { query: { ...query, limit, offset } });

  if (!Array.isArray(page?.items) || typeof page?.total !== 'number') {
    throw new Error(`API: GET ${path} — неожиданный формат ответа списка: ${JSON.stringify(page)}`);
  }

  return page;
}

/** Сколько всего записей подходит под фильтр — без выкачивания самих записей. */
export async function apiCount(path, query = {}) {
  const page = await apiListPage(path, query, { limit: 1, offset: 0 });

  return page.total;
}

/**
 * Постранично обходит список, отдавая элементы по одному.
 * `stop` в колбэке не нужен — потребитель просто перестаёт итерировать.
 */
export async function* apiIterate(path, query = {}) {
  let offset = 0;

  for (;;) {
    const page = await apiListPage(path, query, { limit: PAGE_SIZE, offset });

    for (const item of page.items) {
      yield item;
    }

    if (page.items.length < PAGE_SIZE) {
      return;
    }

    offset += PAGE_SIZE;
  }
}

/** Все записи по фильтру. Использовать только там, где выборка заведомо небольшая. */
export async function apiListAll(path, query = {}) {
  const items = [];

  for await (const item of apiIterate(path, query)) {
    items.push(item);
  }

  return items;
}

/** Ровно одна запись по фильтру, который должен быть уникальным. */
export async function apiFindOne(path, query) {
  const page = await apiListPage(path, query, { limit: 1, offset: 0 });

  return page.items[0] ?? null;
}
