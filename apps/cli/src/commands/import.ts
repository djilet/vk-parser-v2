import type { EnvConfig } from '@vk-sales-bot/core';
import { createSalesApiClient } from '@vk-sales-bot/sales-api';
import { createApiExporter, loadCommunitiesFromJson, verifyApi } from '@vk-sales-bot/parser';

export type ImportOptions = { file: string };

export async function runImportCommand(env: EnvConfig, options: ImportOptions): Promise<void> {
  const api = createSalesApiClient(env.api);
  await verifyApi(api);

  const { communities, search_query, file_path } = await loadCommunitiesFromJson(options.file);
  const exporter = createApiExporter(api, search_query);

  console.log(`JSON: ${file_path}`);
  if (search_query) {
    console.log(`Запрос: ${search_query}`);
  }
  console.log(`Сообществ к загрузке: ${communities.length}\n`);

  for (const [index, community] of communities.entries()) {
    const communityId = await exporter.saveCommunity(community);
    console.log(`[${index + 1}/${communities.length}] community_id=${communityId} ${community.url}`);
  }

  console.log(`\nГотово. Загружено: ${communities.length}/${communities.length}`);
}
