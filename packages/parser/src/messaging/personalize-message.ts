const LEADER_KEYWORDS = ['руководитель', 'директор', 'организатор', 'заведующий'];
const LEADER_DESCRIPTION_PATTERN = new RegExp(LEADER_KEYWORDS.join('|'), 'i');

/**
 * Deliberately loose — structurally matches both NormalizedCommunity's contacts (full_name /
 * description: string | null) and @vk-sales-bot/sales-api's SalesCommunityContact
 * (string | undefined), so callers don't need to convert between the two shapes just to build
 * an outreach message.
 */
export type ContactLike = { full_name?: string | null; description?: string | null };

export function extractFirstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.split(/\s+/)[0] ?? null;
}

export function findLeaderContact(contacts: ContactLike[] | null | undefined): ContactLike | null {
  if (!contacts?.length) {
    return null;
  }

  return (
    contacts.find((contact) => {
      const description = contact.description?.trim();
      if (!description) {
        return false;
      }

      return LEADER_DESCRIPTION_PATTERN.test(description);
    }) ?? null
  );
}

export function findGreetingContact(contacts: ContactLike[] | null | undefined): ContactLike | null {
  if (!contacts?.length) {
    return null;
  }

  return findLeaderContact(contacts) ?? contacts[0]!;
}

export function buildPersonalizedMessage(template: string, contacts: ContactLike[] | null | undefined): string {
  const contact = findGreetingContact(contacts);
  const firstName = extractFirstName(contact?.full_name);

  if (firstName) {
    return template.replaceAll(':name', firstName);
  }

  return template.replace('Приветствую :name!', 'Приветствую!');
}
