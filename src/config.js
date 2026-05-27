import { parseArgs } from './utils/args.js';

const args = parseArgs();
const query = args.query ?? args.q ?? process.env.QUERY ?? null;

export const config = {
  /** Страница входа VK */
  loginUrl: process.env.VK_LOGIN_URL ?? 'https://vk.com/login',

  /** Поисковый запрос для сообществ */
  query,

  /** false — видимый браузер, true — headless */
  headless: process.env.HEADLESS === 'true',

  /**
   * Режим подключения к уже запущенному Chrome:
   * CONNECT_URL=http://127.0.0.1:9222
   */
  connectUrl: process.env.CONNECT_URL ?? null,

  /** Профиль браузера (для сохранения сессии VK) */
  userDataDir: process.env.USER_DATA_DIR ?? './chrome-profile',
};
