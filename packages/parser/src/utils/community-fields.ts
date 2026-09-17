import { parsePeerIdFromMsgUrl } from '@vk-sales-bot/core';

export type CommunityContactInput = {
  full_name?: string | null;
  fullName?: string | null;
  profile_url?: string | null;
  profileUrl?: string | null;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type CommunityInput = {
  url?: string | null;
  name?: string | null;
  phone?: string | null;
  site?: string | null;
  msg_url?: string | null;
  msgUrl?: string | null;
  peer_id?: number | null;
  peerId?: number | null;
  last_post_date?: string | null;
  lastPostDate?: string | null;
  description?: string | null;
  contacts?: CommunityContactInput[];
  [key: string]: unknown;
};

export type NormalizedContact = {
  full_name: string | null;
  profile_url: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
};

export type NormalizedCommunity = {
  url: string | null;
  name: string | null;
  phone: string | null;
  site: string | null;
  msg_url: string | null;
  peer_id: number | null;
  last_post_date: string | null;
  description: string | null;
  contacts: NormalizedContact[];
};

export function getCommunityMsgUrl(community: CommunityInput | null | undefined): string | null {
  return community?.msg_url ?? community?.msgUrl ?? null;
}

export function getCommunityPeerId(community: CommunityInput | null | undefined): number | null {
  const explicit = community?.peer_id ?? community?.peerId;
  if (explicit != null) {
    return explicit;
  }

  return parsePeerIdFromMsgUrl(getCommunityMsgUrl(community));
}

export function normalizeCommunity(community: CommunityInput): NormalizedCommunity {
  return {
    url: community.url ?? null,
    name: community.name ?? null,
    phone: community.phone ?? null,
    site: community.site ?? null,
    msg_url: getCommunityMsgUrl(community),
    peer_id: getCommunityPeerId(community),
    last_post_date: community.last_post_date ?? community.lastPostDate ?? null,
    description: community.description ?? null,
    contacts: (community.contacts ?? []).map((contact) => ({
      full_name: contact.full_name ?? contact.fullName ?? null,
      profile_url: contact.profile_url ?? contact.profileUrl ?? null,
      description: contact.description ?? null,
      phone: contact.phone ?? null,
      email: contact.email ?? null,
    })),
  };
}
