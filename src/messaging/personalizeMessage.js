const LEADER_KEYWORDS = [
  'руководитель',
  'директор',
  'организатор',
  'заведующий',
];

const LEADER_DESCRIPTION_PATTERN = new RegExp(LEADER_KEYWORDS.join('|'), 'i');

export function extractFirstName(fullName) {
  const trimmed = fullName?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.split(/\s+/)[0] ?? null;
}

export function findLeaderContact(contacts) {
  if (!contacts?.length) {
    return null;
  }

  return contacts.find((contact) => {
    const description = contact.description?.trim();
    if (!description) {
      return false;
    }

    return LEADER_DESCRIPTION_PATTERN.test(description);
  }) ?? null;
}

export function findGreetingContact(contacts) {
  if (!contacts?.length) {
    return null;
  }

  return findLeaderContact(contacts) ?? contacts[0];
}

export function buildPersonalizedMessage(template, contacts) {
  const contact = findGreetingContact(contacts);
  const firstName = extractFirstName(contact?.full_name);

  if (firstName) {
    return template.replaceAll(':name', firstName);
  }

  return template.replace('Приветствую :name!', 'Приветствую!');
}
