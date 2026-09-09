import { config } from '../config.js';
import { clearStoredToken, readStoredToken, writeStoredToken } from './tokenStore.js';

let cachedToken = null;
let pendingLogin = null;

export function isApiConfigured() {
  return Boolean(config.api.baseUrl && config.api.phone && config.api.code);
}

export function ensureApiConfigured() {
  if (!isApiConfigured()) {
    throw new Error('API не настроен: задайте API_BASE_URL, API_PHONE и API_CODE в .env');
  }
}

function apiUrl(path) {
  return `${config.api.baseUrl.replace(/\/+$/, '')}${path}`;
}

async function readErrorBody(response) {
  const text = await response.text().catch(() => '');
  return text ? ` — ${text.slice(0, 500)}` : '';
}

/**
 * Шаг 1: просим бэкенд выдать одноразовый код на телефон.
 * На dev/sandbox/test бэкенд всегда ставит 1234, поэтому код и лежит в .env.
 */
async function requestTemporaryPassword() {
  const response = await fetch(apiUrl('/users/get-temp-password-v2'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: config.api.phone }),
  });

  if (!response.ok) {
    throw new Error(
      `API: не удалось запросить код (/users/get-temp-password-v2, ${response.status})`
      + await readErrorBody(response),
    );
  }
}

/** Шаг 2: меняем телефон + код на bearer-токен. */
async function requestToken() {
  const response = await fetch(apiUrl('/login_check'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.api.phone,
      password: config.api.code,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `API: вход не выполнен (/login_check, ${response.status})` + await readErrorBody(response),
    );
  }

  const data = await response.json();

  if (typeof data?.token !== 'string' || data.token.length === 0) {
    throw new Error('API: /login_check не вернул token');
  }

  return data.token;
}

/** Полный логин: код -> токен -> сохранение на диск. */
export async function login() {
  ensureApiConfigured();

  await requestTemporaryPassword();
  const token = await requestToken();

  cachedToken = token;
  await writeStoredToken(token);

  return token;
}

/**
 * Параллельные запросы не должны логиниться каждый сам по себе,
 * поэтому логин выполняется один раз, а остальные ждут тот же промис.
 */
function loginOnce() {
  if (!pendingLogin) {
    pendingLogin = login().finally(() => {
      pendingLogin = null;
    });
  }

  return pendingLogin;
}

export async function getToken() {
  if (cachedToken) {
    return cachedToken;
  }

  ensureApiConfigured();

  const stored = await readStoredToken();
  if (stored) {
    cachedToken = stored;
    return cachedToken;
  }

  return loginOnce();
}

/** Вызывается на 401: выбрасываем протухший токен и логинимся заново. */
export async function refreshToken() {
  cachedToken = null;
  await clearStoredToken();

  return loginOnce();
}
