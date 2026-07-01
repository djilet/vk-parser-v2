import {
  goBackToSearchResults,
  clickCommunityByIndex,
  ensureResultsLoaded,
} from '../steps/communities.js';
import { parseCommunityPage } from '../steps/communityPage.js';
import { createSupabaseExporter } from '../export/toSupabase.js';

export async function runCommunityParser(page, { searchQuery, limit, skip = 0 }) {
  const supabaseExporter = createSupabaseExporter(searchQuery);
  let processedCount = 0;

  if (skip > 0) {
    console.log(`Пропускаю первые ${skip} сообществ в списке.`);
    await ensureResultsLoaded(page, skip + 1);
  }

  for (let i = 0; i < limit; i += 1) {
    const listIndex = skip + i;
    const requiredCount = listIndex + 1;
    const availableResults = await ensureResultsLoaded(page, requiredCount);

    if (!availableResults.found || listIndex >= availableResults.count) {
      console.log(
        `\nВ списке ${availableResults.count} сообществ, нужно было дойти до #${requiredCount}. `
        + `Обработано ${processedCount}. Завершаю парсинг.`,
      );
      break;
    }

    console.log(`\n=== Сообщество ${listIndex + 1} в списке (${i + 1} из ${limit}) ===`);

    await clickCommunityByIndex(page, listIndex);
    const community = await parseCommunityPage(page);

    const communityId = await supabaseExporter.saveCommunity(community);
    processedCount += 1;
    console.log(`Supabase: сохранено community_id=${communityId} (${processedCount})`);

    if (i < limit - 1) {
      await goBackToSearchResults(page);
    }
  }

  return processedCount;
}
