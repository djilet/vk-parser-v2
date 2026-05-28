import { config as loadEnv } from 'dotenv';
import { parseArgs } from './utils/args.js';

loadEnv();

const args = parseArgs();
const query = args.query ?? null;
const limitRaw = args.limit ?? null;
const limit = limitRaw == null ? null : Number.parseInt(String(limitRaw), 10);
const jsonFile = args.file ?? null;

export const config = {
  /** Страница входа VK */
  loginUrl: process.env.VK_LOGIN_URL ?? 'https://vk.com/login',

  /** Поисковый запрос для сообществ */
  query,

  /** Сколько групп парсить из списка */
  limit: Number.isFinite(limit) && limit > 0 ? limit : null,

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

  supabase: {
    url: process.env.SUPABASE_URL ?? null,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
    schema: process.env.SUPABASE_SCHEMA ?? 'sales',
  },
};
