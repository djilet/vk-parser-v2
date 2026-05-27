import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function loadCommunitiesFromJson(filePath) {
  const absolutePath = resolve(filePath);
  const raw = await readFile(absolutePath, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data.communities)) {
    throw new Error('В JSON нет массива communities');
  }

  return {
    searchQuery: data.searchQuery ?? null,
    filePath: absolutePath,
    communities: data.communities,
  };
}
