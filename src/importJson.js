import { config } from './config.js';
import { loadCommunitiesFromJson } from './import/fromJson.js';
import { createSupabaseExporter, verifySupabase } from './export/toSupabase.js';

function ensureConfig() {
  const example = 'npm run import -- --file output/2026-05-28_11-52-21.json';

  if (!config.jsonFile?.trim()) {
    console.error(`Укажите путь к JSON: ${example}`);
    process.exit(1);
  }
}

async function main() {
  ensureConfig();
  await verifySupabase();

  const { communities, search_query, file_path } = await loadCommunitiesFromJson(config.jsonFile.trim());
  const exporter = createSupabaseExporter(search_query);

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
