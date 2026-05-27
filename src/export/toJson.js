import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function buildOutputPath() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const fileName = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.json`;

  return resolve('output', fileName);
}

function buildCommunityPayload(data, searchQuery) {
  return {
    searchQuery,
    url: data.url,
    name: data.name,
    phone: data.phone,
    site: data.site,
    contacts: data.contacts.map((contact) => ({
      fullName: contact.fullName,
      profileUrl: contact.profileUrl,
      description: contact.description,
      phone: contact.phone,
      email: contact.email,
    })),
  };
}

export async function saveCommunityToJson(data, searchQuery) {
  const payload = buildCommunityPayload(data, searchQuery);
  const filePath = buildOutputPath();

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return filePath;
}
