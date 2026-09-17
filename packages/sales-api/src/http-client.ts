import { clearStoredToken, readStoredToken, writeStoredToken } from './token-store.js';

export type SalesApiEnv = {
  baseUrl: string | null;
  phone: string | null;
  code: string | null;
  tokenFile: string;
  requestTimeoutMs: number;
};

/** Бэкенд отдаёт максимум 20 записей на страницу (AbstractSalesController::MAX_LIMIT). */
export const PAGE_SIZE = 20;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    method: string,
    path: string,
    readonly body: string,
  ) {
    super(`API ${method} ${path} — ${status}${body ? `: ${body.slice(0, 500)}` : ''}`);
    this.name = 'ApiError';
  }
}

export type ApiPage<T> = { items: T[]; total: number; limit: number; offset: number };

export type SalesApiHttpClient = {
  isConfigured(): boolean;
  ensureConfigured(): void;
  login(): Promise<string>;
  /** Cached token if any, else the one stored on disk, else performs a full login. */
  getToken(): Promise<string>;
  request<T = unknown>(
    method: string,
    path: string,
    options?: { query?: Record<string, unknown>; body?: unknown },
  ): Promise<T>;
  listPage<T>(
    path: string,
    query?: Record<string, unknown>,
    paging?: { limit?: number; offset?: number },
  ): Promise<ApiPage<T>>;
  count(path: string, query?: Record<string, unknown>): Promise<number>;
  iterate<T>(path: string, query?: Record<string, unknown>): AsyncGenerator<T>;
  listAll<T>(path: string, query?: Record<string, unknown>): Promise<T[]>;
  findOne<T>(path: string, query: Record<string, unknown>): Promise<T | null>;
};

function apiUrl(env: SalesApiEnv, path: string): string {
  return `${(env.baseUrl ?? '').replace(/\/+$/, '')}${path}`;
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  return text ? ` — ${text.slice(0, 500)}` : '';
}

export function createSalesApiHttpClient(env: SalesApiEnv): SalesApiHttpClient {
  let cachedToken: string | null = null;
  let pendingLogin: Promise<string> | null = null;

  function isConfigured(): boolean {
    return Boolean(env.baseUrl && env.phone && env.code);
  }

  function ensureConfigured(): void {
    if (!isConfigured()) {
      throw new Error('API не настроен: задайте API_BASE_URL, API_PHONE и API_CODE в .env');
    }
  }

  /** Шаг 1: просим бэкенд выдать одноразовый код на телефон (dev/sandbox/test всегда ставит 1234, поэтому код лежит в .env). */
  async function requestTemporaryPassword(): Promise<void> {
    const response = await fetch(apiUrl(env, '/users/get-temp-password-v2'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: env.phone }),
    });

    if (!response.ok) {
      throw new Error(
        `API: не удалось запросить код (/users/get-temp-password-v2, ${response.status})` +
          (await readErrorBody(response)),
      );
    }
  }

  /** Шаг 2: меняем телефон + код на bearer-токен. */
  async function requestToken(): Promise<string> {
    const response = await fetch(apiUrl(env, '/login_check'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: env.phone, password: env.code }),
    });

    if (!response.ok) {
      throw new Error(`API: вход не выполнен (/login_check, ${response.status})` + (await readErrorBody(response)));
    }

    const data = (await response.json()) as { token?: unknown };

    if (typeof data.token !== 'string' || data.token.length === 0) {
      throw new Error('API: /login_check не вернул token');
    }

    return data.token;
  }

  /** Полный логин: код -> токен -> сохранение на диск. */
  async function login(): Promise<string> {
    ensureConfigured();

    await requestTemporaryPassword();
    const token = await requestToken();

    cachedToken = token;
    await writeStoredToken(env, token);

    return token;
  }

  /** Параллельные запросы не должны логиниться каждый сам по себе — логин выполняется один раз, остальные ждут тот же промис. */
  function loginOnce(): Promise<string> {
    if (!pendingLogin) {
      pendingLogin = login().finally(() => {
        pendingLogin = null;
      });
    }

    return pendingLogin;
  }

  async function getToken(): Promise<string> {
    if (cachedToken) {
      return cachedToken;
    }

    ensureConfigured();

    const stored = await readStoredToken(env);
    if (stored) {
      cachedToken = stored;
      return cachedToken;
    }

    return loginOnce();
  }

  /** Вызывается на 401: выбрасываем протухший токен и логинимся заново. */
  async function refreshToken(): Promise<string> {
    cachedToken = null;
    await clearStoredToken(env);

    return loginOnce();
  }

  function buildUrl(path: string, query?: Record<string, unknown>): string {
    const url = new URL(apiUrl(env, path));

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value == null || value === '') {
        continue;
      }

      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }

  async function send(
    method: string,
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown; token: string },
  ): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${options.token}` };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      return await fetch(buildUrl(path, options.query), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        // Парсер работает часами без присмотра — без таймаута один зависший запрос к
        // бэкенду повесил бы весь прогон.
        signal: AbortSignal.timeout(env.requestTimeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new Error(`API: ${method} ${path} — нет ответа за ${env.requestTimeoutMs} мс`);
      }

      throw new Error(`API: ${method} ${path} — сетевая ошибка: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Один запрос к API. На 401 токен обновляется и запрос повторяется ровно один раз. */
  async function request<T = unknown>(
    method: string,
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    ensureConfigured();

    let token = await getToken();
    let response = await send(method, path, { ...options, token });

    if (response.status === 401) {
      token = await refreshToken();
      response = await send(method, path, { ...options, token });
    }

    if (!response.ok) {
      throw new ApiError(response.status, method, path, await response.text().catch(() => ''));
    }

    if (response.status === 204) {
      return null as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /**
   * Одна страница списка. Форма ответа проверяется строго: молча подставленный 0/[] на
   * кривом ответе бэкенда не отличить от «записей действительно нет», а от этого зависят
   * и статистика, и рассылка.
   */
  async function listPage<T>(
    path: string,
    query: Record<string, unknown> = {},
    paging: { limit?: number; offset?: number } = {},
  ): Promise<ApiPage<T>> {
    const { limit = PAGE_SIZE, offset = 0 } = paging;
    const page = await request<Partial<ApiPage<T>>>('GET', path, { query: { ...query, limit, offset } });

    if (!Array.isArray(page?.items) || typeof page?.total !== 'number') {
      throw new Error(`API: GET ${path} — неожиданный формат ответа списка: ${JSON.stringify(page)}`);
    }

    return page as ApiPage<T>;
  }

  /** Сколько всего записей подходит под фильтр — без выкачивания самих записей. */
  async function count(path: string, query: Record<string, unknown> = {}): Promise<number> {
    const page = await listPage(path, query, { limit: 1, offset: 0 });
    return page.total;
  }

  /** Постранично обходит список, отдавая элементы по одному. */
  async function* iterate<T>(path: string, query: Record<string, unknown> = {}): AsyncGenerator<T> {
    let offset = 0;

    for (;;) {
      const page = await listPage<T>(path, query, { limit: PAGE_SIZE, offset });

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
  async function listAll<T>(path: string, query: Record<string, unknown> = {}): Promise<T[]> {
    const items: T[] = [];
    for await (const item of iterate<T>(path, query)) {
      items.push(item);
    }
    return items;
  }

  /** Ровно одна запись по фильтру, который должен быть уникальным. */
  async function findOne<T>(path: string, query: Record<string, unknown>): Promise<T | null> {
    const page = await listPage<T>(path, query, { limit: 1, offset: 0 });
    return page.items[0] ?? null;
  }

  return { isConfigured, ensureConfigured, login, getToken, request, listPage, count, iterate, listAll, findOne };
}
