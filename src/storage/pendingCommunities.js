import { getSupabaseClient } from '../supabase/client.js';

async function loadContactsByCommunityIds(communityIds) {
  if (communityIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('community_contacts')
    .select('community_id, full_name, description')
    .in('community_id', communityIds)
    .eq('is_active', true);

  if (error) {
    throw new Error(`Supabase: не удалось получить контакты сообществ — ${error.message}`);
  }

  const contactsByCommunityId = new Map();

  for (const contact of data ?? []) {
    const contacts = contactsByCommunityId.get(contact.community_id) ?? [];
    contacts.push(contact);
    contactsByCommunityId.set(contact.community_id, contacts);
  }

  return contactsByCommunityId;
}

export async function loadPendingCommunities(limit) {
  const supabase = getSupabaseClient();
  const batchSize = Math.max(limit * 5, limit);

  const { data: sentRows, error: sentError } = await supabase
    .from('community_messages_sent')
    .select('chat_id');

  if (sentError) {
    throw new Error(`Supabase: не удалось получить список отправленных чатов — ${sentError.message}`);
  }

  const sentChatIds = new Set((sentRows ?? []).map((row) => row.chat_id));
  const pending = [];
  let offset = 0;

  while (pending.length < limit) {
    const { data: communities, error: communitiesError } = await supabase
      .from('communities')
      .select('id, url, name, phone, site, msg_url, peer_id, last_post_date')
      .not('msg_url', 'is', null)
      .not('peer_id', 'is', null)
      .order('last_post_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (communitiesError) {
      throw new Error(`Supabase: не удалось получить сообщества для отправки — ${communitiesError.message}`);
    }

    if (!communities || communities.length === 0) {
      break;
    }

    pending.push(...communities.filter((community) => !sentChatIds.has(community.peer_id)));

    if (communities.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  const result = pending.slice(0, limit);
  const contactsByCommunityId = await loadContactsByCommunityIds(result.map((community) => community.id));

  return result.map((community) => ({
    ...community,
    contacts: contactsByCommunityId.get(community.id) ?? [],
  }));
}
