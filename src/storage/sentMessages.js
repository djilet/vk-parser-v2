import { getSupabaseClient } from '../supabase/client.js';

export async function markCommunityMessageSent(community) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('community_messages_sent')
    .upsert(
      {
        community_id: community.id,
        chat_id: community.peer_id,
        msg_url: community.msg_url,
      },
      {
        onConflict: 'chat_id',
      },
    )
    .select('id')
    .single();

  if (error) {
    throw new Error(`Supabase: не удалось отметить отправку — ${error.message}`);
  }

  return data.id;
}
