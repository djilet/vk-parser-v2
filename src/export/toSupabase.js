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
      'Supabase: функция upsert_community_bundle не найдена. '
      + 'Примените миграции из supabase/migrations/ (включая 20260528120005_create_public_upsert_wrapper.sql).',
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
