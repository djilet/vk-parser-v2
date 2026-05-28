import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeCommunity } from '../utils/communityFields.js';

export async function loadCommunitiesFromJson(filePath) {
  const absolutePath = resolve(filePath);
  const raw = await readFile(absolutePath, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data.communities)) {
    throw new Error('В JSON нет массива communities');
  }

  return {
    search_query: data.search_query ?? data.searchQuery ?? null,
    file_path: absolutePath,
    communities: data.communities.map(normalizeCommunity),
  };
}
