import { config as loadEnv } from 'dotenv';
import { parseArgs } from './utils/args.js';

loadEnv();

const args = parseArgs();
const query = args.query ?? null;
const limitRaw = args.limit ?? args.count ?? null;
const limit = limitRaw == null ? null : Number.parseInt(String(limitRaw), 10);
const skipRaw = args.skip ?? null;
const skip = skipRaw == null ? null : Number.parseInt(String(skipRaw), 10);
const jsonFile = args.file ?? null;

export const config = {
  /** Страница входа VK */
  loginUrl: process.env.VK_LOGIN_URL ?? 'https://vk.com/login',

  /** Поисковый запрос для сообществ */
  query,

  /** Сколько групп парсить из списка */
  limit: Number.isFinite(limit) && limit > 0 ? limit : null,

  /** Сколько первых сообществ пропустить в списке (для parse-skip) */
  skip: Number.isFinite(skip) && skip >= 0 ? skip : null,

  /** Путь к JSON для скрипта openMessages */
  jsonFile,

  /** false — видимый браузер, true — headless */
  headless: process.env.HEADLESS === 'true',

  /**
   * Режим подключения к уже запущенному Chrome:
   * CONNECT_URL=http://127.0.0.1:9222
   */
  connectUrl: process.env.CONNECT_URL ?? null,

  /** Профиль браузера (для сохранения сессии VK) */
  userDataDir: process.env.USER_DATA_DIR ?? './chrome-profile',

  api: {
    /** Корень PHP API, включая префикс /api */
    baseUrl: process.env.API_BASE_URL ?? null,

    /** Телефон, под которым логинимся (он же username в /login_check) */
    phone: process.env.API_PHONE ?? null,

    /** Одноразовый код: на dev/sandbox/test бэкенд всегда ставит 1234 */
    code: process.env.API_CODE ?? null,

    /** Куда кладём bearer-токен между запусками скриптов */
    tokenFile: process.env.API_TOKEN_FILE ?? '.auth-token.json',

    /** Таймаут одного HTTP-запроса к API, мс */
    requestTimeoutMs: Number.parseInt(process.env.API_REQUEST_TIMEOUT_MS ?? '', 10) || 30_000,
  },

  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL ?? null,
  },

  stats: {
    timezone: process.env.STATS_TIMEZONE ?? 'Europe/Moscow',
  },
};
