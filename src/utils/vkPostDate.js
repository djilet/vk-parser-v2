const MONTHS = {
  янв: 0,
  фев: 1,
  мар: 2,
  апр: 3,
  май: 4,
  мая: 4,
  июн: 5,
  июл: 6,
  авг: 7,
  сен: 8,
  окт: 9,
  ноя: 10,
  дек: 11,
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
  январь: 0,
  февраль: 1,
  март: 2,
  апрель: 3,
  июнь: 5,
  июль: 6,
  август: 7,
  сентябрь: 8,
  октябрь: 9,
  ноябрь: 10,
  декабрь: 11,
};

function resolveMonthName(monthName) {
  const normalized = monthName.replace(/\.$/, '').toLowerCase();
  return MONTHS[normalized];
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatTimestamp(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffset / 60));
  const offsetMins = pad(absoluteOffset % 60);

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `${sign}${offsetHours}:${offsetMins}`,
  ].join('');
}

function subtractMinutes(date, minutes) {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() - minutes);
  return result;
}

function subtractHours(date, hours) {
  const result = new Date(date);
  result.setHours(result.getHours() - hours);
  return result;
}

function subtractDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function buildDateWithOptionalYear(referenceDate, day, month, year, hours, minutes) {
  const resolvedYear = year ?? referenceDate.getFullYear();
  const candidate = new Date(resolvedYear, month, day, hours ?? 12, minutes ?? 0, 0, 0);

  if (!year && candidate > referenceDate) {
    candidate.setFullYear(resolvedYear - 1);
  }

  return candidate;
}

export function parseVkPostDateText(text, referenceDate = new Date()) {
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  const now = new Date(referenceDate);

  if (normalized === 'только что') {
    return formatTimestamp(now);
  }

  let match = normalized.match(/^(\d+)\s*мин(?:\.|ут(?:а|ы|ов)?)?\s*назад$/);
  if (match) {
    return formatTimestamp(subtractMinutes(now, Number.parseInt(match[1], 10)));
  }

  match = normalized.match(/^(\d+)\s*ч(?:\.|ас(?:а|ов)?)?\s*назад$/);
  if (match) {
    return formatTimestamp(subtractHours(now, Number.parseInt(match[1], 10)));
  }

  match = normalized.match(/^(\d+)\s*(?:д|дн(?:\.|я|ей)?)\s*назад$/);
  if (match) {
    return formatTimestamp(subtractDays(now, Number.parseInt(match[1], 10)));
  }

  match = normalized.match(/^вчера(?:\s+в\s+(\d{1,2}):(\d{2}))?$/);
  if (match) {
    const date = subtractDays(now, 1);
    if (match[1]) {
      date.setHours(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), 0, 0);
    }
    return formatTimestamp(date);
  }

  match = normalized.match(/^сегодня(?:\s+в\s+(\d{1,2}):(\d{2}))?$/);
  if (match) {
    const date = new Date(now);
    if (match[1]) {
      date.setHours(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), 0, 0);
    }
    return formatTimestamp(date);
  }

  match = normalized.match(
    /^(\d{1,2})\s+([а-яё]+)\.?(?:\s+(\d{4}))?(?:\s+в\s+(\d{1,2}):(\d{2}))?$/,
  );
  if (match) {
    const day = Number.parseInt(match[1], 10);
    const month = resolveMonthName(match[2]);
    if (month === undefined) {
      return null;
    }

    const year = match[3] ? Number.parseInt(match[3], 10) : null;
    const hours = match[4] ? Number.parseInt(match[4], 10) : null;
    const minutes = match[5] ? Number.parseInt(match[5], 10) : null;

    return formatTimestamp(
      buildDateWithOptionalYear(now, day, month, year, hours, minutes),
    );
  }

  return null;
}

export function pickLatestPostDate(dateTexts, referenceDate = new Date()) {
  const timestamps = dateTexts
    .map((text) => parseVkPostDateText(text, referenceDate))
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left));

  return timestamps[0] ?? null;
}
