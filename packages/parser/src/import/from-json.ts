import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeCommunity, type CommunityInput, type NormalizedCommunity } from '../utils/community-fields.js';

export type CommunitiesJsonFile = {
  search_query: string | null;
  file_path: string;
  communities: NormalizedCommunity[];
};

export async function loadCommunitiesFromJson(filePath: string): Promise<CommunitiesJsonFile> {
  const absolutePath = resolve(filePath);
  const raw = await readFile(absolutePath, 'utf8');
  const data = JSON.parse(raw) as { search_query?: string; searchQuery?: string; communities?: unknown };

  if (!Array.isArray(data.communities)) {
    throw new Error('В JSON нет массива communities');
  }

  return {
    search_query: data.search_query ?? data.searchQuery ?? null,
    file_path: absolutePath,
    communities: (data.communities as CommunityInput[]).map(normalizeCommunity),
  };
}
