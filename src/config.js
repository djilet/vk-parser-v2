import { config as loadEnv } from 'dotenv';
import { parseArgs } from './utils/args.js';

loadEnv();

const args = parseArgs();
const query = args.query ?? null;
const limitRaw = args.limit ?? args.count ?? null;
const limit = limitRaw == null ? null : Number.parseInt(String(limitRaw), 10);
const skipRaw = args.skip ?? null;
const skip = skipRaw == null ? null : Number.parseInt(String(skipRaw), 10);
const offsetRaw = args.offset ?? null;
const offset = offsetRaw == null ? null : Number.parseInt(String(offsetRaw), 10);
const jsonFile = args.file ?? null;
const communityRaw = args.community ?? null;
const communityId = communityRaw == null ? null : Number.parseInt(String(communityRaw), 10);
const full = Boolean(args.full);
const allConversations = Boolean(args['all-conversations']);

const browserIdRaw = args.browser ?? process.env.VK_BROWSER ?? null;
const browserId = Number.parseInt(String(browserIdRaw ?? ''), 10) || 1;

export const config = {
  /** Страница входа VK */
  loginUrl: process.env.VK_LOGIN_URL ?? 'https://vk.com/login',

  /** Поисковый запрос для сообществ */
  query,

  /** Сколько групп парсить из списка */
  limit: Number.isFinite(limit) && limit > 0 ? limit : null,

  /** Сколько первых сообществ пропустить в списке (для parse-skip) */
  skip: Number.isFinite(skip) && skip >= 0 ? skip : null,

  /** С какого элемента списка начинать (для parse-descriptions) */
  offset: Number.isFinite(offset) && offset >= 0 ? offset : null,

  /** Путь к JSON для скрипта openMessages */
  jsonFile,

  /** --community <id> для syncMessages: синхронизировать только одно сообщество */
  communityId: Number.isFinite(communityId) && communityId > 0 ? communityId : null,

  /**
   * Сырое значение --community до парсинга — только чтобы отличить «флаг не передан» (null)
   * от «передан, но без числа» (--community без значения парсится в args.community === true,
   * Number.parseInt('true') === NaN, и без этого поля такой вызов молча откатывался бы к «все
   * сообщества» вместо явной ошибки).
   */
  communityIdRaw: communityRaw,

  /** --full для syncMessages: полная заливка истории вместо до-синхронизации новых */
  full,

  /**
   * --all-conversations для syncMessages: вместо журнала отправок список сообществ берём
   * из messages.getConversations текущего аккаунта — так находятся и те переписки, которых
   * ещё нет в sales_community_messages_sent.
   */
  allConversations,

  /** false — видимый браузер, true — headless */
  headless: process.env.HEADLESS === 'true',

  /**
   * Режим подключения к уже запущенному Chrome:
   * CONNECT_URL=http://127.0.0.1:9222
   */
  connectUrl: process.env.CONNECT_URL ?? null,

  /**
   * Профиль браузера (для сохранения сессии VK) — свой на каждый browserId, чтобы несколько
   * VK-аккаунтов не делили одну и ту же сессию/куки. Браузер #1 намеренно оставлен на
   * './chrome-profile' (старый путь) — так уже залогиненные пользователи не потеряют сессию.
   */
  userDataDir: process.env.USER_DATA_DIR
    ?? (browserId === 1 ? './chrome-profile' : `./chrome-profile-${browserId}`),

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

  supabase: {
    /** Старая база, из которой переносим исторические данные в sales_* через API. */
    url: process.env.SB_URL ?? null,

    /** Anon-ключ: таблицы communities/community_* сейчас без RLS, его достаточно для чтения. */
    key: process.env.SB_KEY ?? null,
  },

  stats: {
    timezone: process.env.STATS_TIMEZONE ?? 'Europe/Moscow',
  },

  vk: {
    /** Номер браузера/аккаунта VK — свой токен и профиль Chrome на каждый. --browser <n> или VK_BROWSER=<n> */
    browserId,

    /** Таймаут одного запроса к api.vk.com, мс — прогон идёт часами, зависший запрос не должен его вешать */
    requestTimeoutMs: Number.parseInt(process.env.VK_REQUEST_TIMEOUT_MS ?? '', 10) || 30_000,

    /** Пауза между запросами к VK API, мс — user-токен ограничен 3 запросами в секунду */
    requestDelayMs: Number.parseInt(process.env.VK_REQUEST_DELAY_MS ?? '', 10) || 350,
  },

  yandex: {
    /** Api-Key сервисного аккаунта Yandex Cloud (тот же, что YANDEX_GPT_API_KEY в бэкенде) */
    apiKey: process.env.YANDEX_GPT_API_KEY ?? null,

    /** Каталог Yandex Cloud — первая часть modelUri gpt://{folderId}/{model} */
    folderId: process.env.YANDEX_GPT_FOLDER_ID ?? null,

    /** Модель, часть modelUri после folder id */
    model: process.env.YANDEX_GPT_MODEL ?? 'yandexgpt-lite/latest',
  },
};
