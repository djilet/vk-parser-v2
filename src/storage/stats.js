import { getSupabaseClient } from '../supabase/client.js';
import { getZonedDayBounds } from '../utils/timezone.js';

export async function countMessagesSentToday(timeZone) {
  const supabase = getSupabaseClient();
  const { start, end } = getZonedDayBounds(timeZone);

  const { count, error } = await supabase
    .from('community_messages_sent')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', start)
    .lt('sent_at', end);

  if (error) {
    throw new Error(`Supabase: не удалось посчитать отправки за сегодня — ${error.message}`);
  }

  return count ?? 0;
}

export async function countMessagesSentTotal() {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from('community_messages_sent')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Supabase: не удалось посчитать все отправки — ${error.message}`);
  }

  return count ?? 0;
}

export async function countCommunities() {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from('communities')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Supabase: не удалось посчитать сообщества — ${error.message}`);
  }

  return count ?? 0;
}
