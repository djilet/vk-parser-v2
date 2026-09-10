import { completeChat } from './yandexGpt.js';

const DESCRIPTION_MAX_LENGTH = 2_000;

const SYSTEM_PROMPT = `Ты классифицируешь сообщества ВКонтакте для базы спортивных организаторов.
Организатор — это тот, кто сам проводит спортивные мероприятия и занятия:
спортивные школы и секции, клубы, фитнес-центры и залы, бассейны, манежи,
корты, федерации и лиги, организаторы турниров, забегов и соревнований,
спортивные лагеря и тренеры, ведущие набор.
Не организатор: интернет-магазины и продавцы спортивных товаров, паблики с
новостями и мемами о спорте, фан-клубы и болельщики, блоги спортсменов,
ставки и прогнозы на спорт, питание и добавки, а также всё, что к спорту
отношения не имеет.
Отвечай ровно одним словом: "да" — если это организатор, "нет" — если нет.
Никаких пояснений.`;

function buildUserPrompt(community) {
  const description = community.description?.trim();
  const lines = [
    `Название: ${community.name ?? '(нет)'}`,
    `Описание: ${description ? description.slice(0, DESCRIPTION_MAX_LENGTH) : '(нет)'}`,
    `Ссылка: ${community.url ?? '(нет)'}`,
  ];

  return lines.join('\n');
}

function parseAnswer(raw) {
  const normalized = raw.trim().toLowerCase().replace(/[.!"'«»]/g, '');

  if (['да', 'yes', 'true'].includes(normalized)) {
    return true;
  }

  if (['нет', 'no', 'false'].includes(normalized)) {
    return false;
  }

  return null;
}

/**
 * Спрашивает у LLM, является ли сообщество организатором спортивных мероприятий.
 *
 * @param {{name?: string|null, description?: string|null, url?: string|null}} community
 * @returns {Promise<{isOrganizer: boolean|null, raw: string}>}
 */
export async function classifyCommunity(community) {
  const raw = await completeChat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(community) },
  ]);

  return { isOrganizer: parseAnswer(raw), raw };
}
