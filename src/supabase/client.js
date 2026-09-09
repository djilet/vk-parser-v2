import { config } from '../config.js';

/** PostgREST отдаёт максимум 1000 строк за раз — дальше нужно листать через Range. */
const PAGE_SIZE = 1000;

export function isSupabaseConfigured() {
  return Boolean(config.supabase.url && config.supabase.key);
}

export function ensureSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase не настроен: задайте SB_URL и SB_KEY в .env');
  }
}

/** Все строки таблицы, постранично. order нужен, чтобы Range давал стабильную выборку. */
export async function fetchAllRows(table, { order = 'id.asc' } = {}) {
  ensureSupabaseConfigured();

  const rows = [];
  let offset = 0;

  for (;;) {
    const url = `${config.supabase.url.replace(/\/+$/, '')}/rest/v1/${table}`
      + `?select=*&order=${encodeURIComponent(order)}`;

    const response = await fetch(url, {
      headers: {
        apikey: config.supabase.key,
        Authorization: `Bearer ${config.supabase.key}`,
        Range: `${offset}-${offset + PAGE_SIZE - 1}`,
      },
    });

    if (!response.ok && response.status !== 206) {
      const text = await response.text().catch(() => '');
      throw new Error(`Supabase: GET ${table} — ${response.status}${text ? `: ${text.slice(0, 500)}` : ''}`);
    }

    const page = await response.json();
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }

    offset += PAGE_SIZE;
  }
}
