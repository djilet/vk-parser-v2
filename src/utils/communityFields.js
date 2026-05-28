export function getCommunityMsgUrl(community) {
  return community?.msg_url ?? community?.msgUrl ?? null;
}

export function normalizeCommunity(community) {
  return {
    url: community.url ?? null,
    name: community.name ?? null,
    phone: community.phone ?? null,
    site: community.site ?? null,
    msg_url: getCommunityMsgUrl(community),
    last_post_date: community.last_post_date ?? community.lastPostDate ?? null,
    contacts: (community.contacts ?? []).map((contact) => ({
      full_name: contact.full_name ?? contact.fullName ?? null,
      profile_url: contact.profile_url ?? contact.profileUrl ?? null,
      description: contact.description ?? null,
      phone: contact.phone ?? null,
      email: contact.email ?? null,
    })),
  };
}
