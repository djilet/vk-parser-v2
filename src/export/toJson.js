import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parsePeerIdFromMsgUrl } from '../utils/peerId.js';

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

function buildCommunityPayload(data) {
  return {
    url: data.url,
    name: data.name,
    phone: data.phone,
    site: data.site,
    msg_url: data.msg_url ?? null,
    peer_id: data.peer_id ?? parsePeerIdFromMsgUrl(data.msg_url) ?? null,
    last_post_date: data.last_post_date ?? null,
    contacts: data.contacts.map((contact) => ({
      full_name: contact.full_name,
      profile_url: contact.profile_url,
      description: contact.description,
      phone: contact.phone,
      email: contact.email,
    })),
  };
}

export function createResultsJsonWriter(searchQuery) {
  const filePath = buildOutputPath();

  async function save(communities) {
    const payload = {
      search_query: searchQuery,
      count: communities.length,
      communities: communities.map(buildCommunityPayload),
    };

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    return filePath;
  }

  return { filePath, save };
}
