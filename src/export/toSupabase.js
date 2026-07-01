import { getCommunityPeerId, normalizeCommunity } from '../utils/communityFields.js';
import { getSupabaseClient, getSupabaseSchema, isSupabaseConfigured } from '../supabase/client.js';

function buildCommunityPayload(community) {
  const normalized = normalizeCommunity(community);

  return {
    url: normalized.url,
    name: normalized.name,
    phone: normalized.phone,
    site: normalized.site,
    msg_url: normalized.msg_url,
    peer_id: getCommunityPeerId(normalized),
    last_post_date: normalized.last_post_date,
  };
}

function buildContactsPayload(community) {
  return normalizeCommunity(community).contacts.map((contact) => ({
    full_name: contact.full_name,
    profile_url: contact.profile_url,
    description: contact.description,
    phone: contact.phone,
    email: contact.email,
  }));
}

async function reconcileCommunityByPeerId(supabase, payload) {
  if (payload.peer_id == null) {
    return;
  }

  const { data: existing, error: findError } = await supabase
    .from('communities')
    .select('id')
    .eq('peer_id', payload.peer_id)
    .maybeSingle();

  if (findError) {
    throw new Error(findError.message);
  }

  if (!existing) {
    return;
  }

  const { error: deleteError } = await supabase
    .from('communities')
    .delete()
    .eq('url', payload.url)
    .neq('id', existing.id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: updateError } = await supabase
    .from('communities')
    .update({
      url: payload.url,
      name: payload.name,
      phone: payload.phone,
      site: payload.site,
      msg_url: payload.msg_url,
      peer_id: payload.peer_id,
      last_post_date: payload.last_post_date,
    })
    .eq('id', existing.id);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function verifySupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase не настроен: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
  }

  const supabase = getSupabaseClient();
  const schema = getSupabaseSchema();

  const { error: rpcError } = await supabase.rpc('upsert_community_bundle', {
    p_search_query: null,
    p_community: {},
    p_contacts: [],
  });

  if (!rpcError) {
    return;
  }

  if (rpcError.message.includes('Could not find the function')) {
    throw new Error(
      `Supabase: функция public.upsert_community_bundle не найдена в schema "${schema}". `
      + 'Примените миграции из supabase/migrations/.',
    );
  }

  if (rpcError.message.includes('community url is required')) {
    return;
  }

  if (rpcError.message.includes(`schema "${schema}" does not exist`)) {
    throw new Error(
      `Supabase: schema "${schema}" не найдена. Примените миграции из supabase/migrations/.`,
    );
  }

  throw new Error(`Supabase: проверка RPC не прошла — ${rpcError.message}`);
}

export function createSupabaseExporter(searchQuery) {
  const query = searchQuery?.trim() || null;
  const supabase = getSupabaseClient();

  async function saveCommunity(community) {
    const payload = buildCommunityPayload(community);
    const contacts = buildContactsPayload(community);

    if (!payload.url) {
      throw new Error('У сообщества нет url');
    }

    await reconcileCommunityByPeerId(supabase, payload);

    const { data, error } = await supabase.rpc('upsert_community_bundle', {
      p_search_query: query,
      p_community: payload,
      p_contacts: contacts,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  return { saveCommunity };
}
