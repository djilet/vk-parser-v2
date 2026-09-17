import { config as loadDotenv } from 'dotenv';

export type EnvConfig = {
  api: {
    /** Корень PHP API, включая префикс /api */
    baseUrl: string | null;
    /** Телефон пользователя с ROLE_ADMIN — он же username в /login_check */
    phone: string | null;
    /** Одноразовый код: на dev/sandbox/test бэкенд всегда ставит 1234 */
    code: string | null;
    /** Куда кладём bearer-токен между запусками (относительно корня репозитория) */
    tokenFile: string;
    requestTimeoutMs: number;
  };
  vk: {
    loginUrl: string;
    /** Таймаут одного запроса к api.vk.com, мс — прогон идёт часами, зависший запрос не должен его вешать */
    requestTimeoutMs: number;
    /** Пауза между запросами к VK API, мс — user-токен ограничен 3 запросами в секунду */
    requestDelayMs: number;
    /** false — видимый браузер, true — headless */
    headless: boolean;
    /** Режим подключения к уже запущенному Chrome: CONNECT_URL=http://127.0.0.1:9222 */
    connectUrl: string | null;
  };
  slack: {
    webhookUrl: string | null;
  };
  stats: {
    timezone: string;
  };
  yandex: {
    /** Api-Key сервисного аккаунта Yandex Cloud (тот же, что YANDEX_GPT_API_KEY в бэкенде) */
    apiKey: string | null;
    /** Каталог Yandex Cloud — первая часть modelUri gpt://{folderId}/{model} */
    folderId: string | null;
    model: string;
  };
  server: {
    port: number;
    corsOrigin: string;
  };
  /** Тайминги отправки сообщений в VK-композер — намеренная антидетект-пауза, не оптимизация. */
  send: {
    chatLoadWaitMs: number;
    beforeWriteMs: number;
    beforeSendMs: number;
  };
};

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Pure — takes the env bag as an argument instead of reading process.env directly, so it is
 * unit-testable and carries no import-time side effects. Replaces vk-parser-v2's src/config.js,
 * which called dotenv.config() and parsed process.argv at import time into a frozen module
 * singleton; that broke as soon as a long-running server needed a config that isn't argv-shaped.
 * Per-invocation inputs (query, limit, skip, browser id, …) are NOT part of this type — they are
 * explicit function parameters threaded from the CLI/server, never globals.
 */
export function loadEnvConfig(env: NodeJS.ProcessEnv = process.env): Readonly<EnvConfig> {
  return Object.freeze({
    api: Object.freeze({
      baseUrl: env.API_BASE_URL ?? null,
      phone: env.API_PHONE ?? null,
      code: env.API_CODE ?? null,
      tokenFile: env.API_TOKEN_FILE ?? '.auth-token.json',
      requestTimeoutMs: parseIntEnv(env.API_REQUEST_TIMEOUT_MS, 30_000),
    }),
    vk: Object.freeze({
      loginUrl: env.VK_LOGIN_URL ?? 'https://vk.com/login',
      requestTimeoutMs: parseIntEnv(env.VK_REQUEST_TIMEOUT_MS, 30_000),
      requestDelayMs: parseIntEnv(env.VK_REQUEST_DELAY_MS, 350),
      headless: env.HEADLESS === 'true',
      connectUrl: env.CONNECT_URL ?? null,
    }),
    slack: Object.freeze({
      webhookUrl: env.SLACK_WEBHOOK_URL ?? null,
    }),
    stats: Object.freeze({
      timezone: env.STATS_TIMEZONE ?? 'Europe/Moscow',
    }),
    yandex: Object.freeze({
      apiKey: env.YANDEX_GPT_API_KEY ?? null,
      folderId: env.YANDEX_GPT_FOLDER_ID ?? null,
      model: env.YANDEX_GPT_MODEL ?? 'yandexgpt-lite/latest',
    }),
    server: Object.freeze({
      port: parseIntEnv(env.PORT, 3001),
      corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    }),
    send: Object.freeze({
      chatLoadWaitMs: parseIntEnv(env.SEND_CHAT_LOAD_WAIT_MS, 5_000),
      beforeWriteMs: parseIntEnv(env.SEND_BEFORE_WRITE_MS, 180_000),
      beforeSendMs: parseIntEnv(env.SEND_BEFORE_SEND_MS, 10_000),
    }),
  }) satisfies EnvConfig;
}

let cachedConfig: Readonly<EnvConfig> | null = null;
let dotenvLoaded = false;

/**
 * Memoized accessor. Call this ONLY from an app's composition root (apps/cli/src/index.ts,
 * apps/server/src/index.ts) — library code below that point receives an already-built
 * EnvConfig (or the specific values it needs) as a parameter.
 */
export function getEnvConfig(): Readonly<EnvConfig> {
  if (!dotenvLoaded) {
    loadDotenv();
    dotenvLoaded = true;
  }

  if (!cachedConfig) {
    cachedConfig = loadEnvConfig();
  }

  return cachedConfig;
}

/** Test-only: clears the memoized singleton so a test can load a fresh env bag. */
export function resetEnvConfigForTests(): void {
  cachedConfig = null;
  dotenvLoaded = false;
}
