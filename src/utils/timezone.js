function getZonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
  };
}

export function getZonedDayBounds(timeZone, date = new Date()) {
  const { year, month, day } = getZonedDateParts(date, timeZone);

  let start = null;

  for (let utcMs = Date.UTC(year, month - 1, day - 1); utcMs < Date.UTC(year, month - 1, day + 2); utcMs += 60_000) {
    const candidate = new Date(utcMs);
    const parts = getZonedDateParts(candidate, timeZone);

    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === 0) {
      start = candidate;
      break;
    }
  }

  if (!start) {
    throw new Error(`Не удалось определить начало дня для часового пояса ${timeZone}`);
  }

  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 86_400_000).toISOString(),
  };
}
