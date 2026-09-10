import { completeChat } from './yandexGpt.js';

const DESCRIPTION_MAX_LENGTH = 2_000;
const MAX_TOKENS_PER_ITEM = 12;

const SYSTEM_PROMPT = `Ты классифицируешь сообщества ВКонтакте для базы спортивных организаторов.
Организатор — это тот, кто сам проводит спортивные мероприятия:
лиги, турниры, чемпионаты и федерации.
Не организатор: школы, команды, букмекерские конторы, ставки, новости и тв каналы,
а также всё, что к спорту отношения не имеет.

Тебе дан список сообществ, каждое начинается со строки вида "### <id>".
Для каждого сообщества выведи ровно одну строку в формате "<id>: да" или "<id>: нет" —
без пояснений, без пустых строк, без символов "###", по одной строке на каждый id из
списка, в любом порядке.`;

// \b не годится как граница после кириллицы (JS по умолчанию считает словом только
// [A-Za-z0-9_]) — без него "123: да" не матчился бы, а с \b "да" не отличилось бы
// от начала слова вроде "данные". Явно требуем не-букву или конец строки после ответа.
// Модель иногда возвращает id с эхом заголовка блока ("### 123: да") несмотря на
// промпт — (?:#+\s*)? снимает этот префикс, не делая парсер строже необходимого.
const ANSWER_LINE_RE = /^\s*(?:#+\s*)?(\d+)\s*:\s*(да|нет|yes|no|true|false)(?=$|[^а-яёa-z])/i;

function buildCommunityBlock(community) {
  const description = community.description?.trim();
  const lines = [
    `### ${community.id}`,
    `Название: ${community.name ?? '(нет)'}`,
    `Описание: ${description ? description.slice(0, DESCRIPTION_MAX_LENGTH) : '(нет)'}`,
    `Ссылка: ${community.url ?? '(нет)'}`,
  ];

  return lines.join('\n');
}

function buildUserPrompt(communities) {
  return communities.map(buildCommunityBlock).join('\n\n');
}

function parseAnswer(word) {
  const normalized = word.toLowerCase();

  if (['да', 'yes', 'true'].includes(normalized)) {
    return true;
  }

  if (['нет', 'no', 'false'].includes(normalized)) {
    return false;
  }

  return null;
}

/**
 * Разбирает ответ LLM построчно, привязывая каждый результат к id сообщества —
 * так один сбитый или потерянный пункт не портит остальные результаты батча.
 *
 * @param {string} raw
 * @param {Set<number>} requestedIds
 * @returns {Map<number, {isOrganizer: boolean, raw: string}>}
 */
function parseBatchAnswer(raw, requestedIds) {
  const results = new Map();

  for (const line of raw.split('\n')) {
    const match = line.match(ANSWER_LINE_RE);
    if (!match) {
      continue;
    }

    const id = Number.parseInt(match[1], 10);
    if (!requestedIds.has(id)) {
      continue;
    }

    const isOrganizer = parseAnswer(match[2]);
    if (isOrganizer === null) {
      continue;
    }

    results.set(id, { isOrganizer, raw: line.trim() });
  }

  return results;
}

/**
 * Спрашивает у LLM за один запрос про несколько сообществ сразу — резко сокращает
 * число вызовов Yandex GPT (и повторную пересылку системного промпта на каждое сообщество).
 *
 * @param {{id: number, name?: string|null, description?: string|null, url?: string|null}[]} communities
 * @returns {Promise<{results: Map<number, {isOrganizer: boolean, raw: string}>, rawResponse: string}>}
 *   `results` — только по id, чей ответ удалось разобрать; `rawResponse` — полный ответ модели,
 *   пригодится для отладки, если часть id не распозналась.
 */
export async function classifyCommunities(communities) {
  const requestedIds = new Set(communities.map((c) => c.id));

  const rawResponse = await completeChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(communities) },
    ],
    { maxTokens: Math.max(64, communities.length * MAX_TOKENS_PER_ITEM) },
  );

  return { results: parseBatchAnswer(rawResponse, requestedIds), rawResponse };
}
