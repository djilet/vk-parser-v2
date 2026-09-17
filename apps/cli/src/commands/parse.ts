import { parseBrowserId, type BrowserId, type EnvConfig } from '@vk-sales-bot/core';
import { createSalesApiClient } from '@vk-sales-bot/sales-api';
import {
  createApiExporter,
  keepOpenOrClose,
  openCommunities,
  openLoggedInPage,
  runCommunityParser,
  searchCommunities,
  verifyApi,
  waitForSearchResults,
} from '@vk-sales-bot/parser';

export type ParseOptions = {
  query: string;
  limit: number;
  skip: number;
  browser?: string;
  keepOpen?: boolean;
};

/** Replaces vk-parser-v2's index.js + parseSkip.js — the two differed only in an optional --skip. */
export async function runParseCommand(env: EnvConfig, options: ParseOptions): Promise<void> {
  const browserId: BrowserId = parseBrowserId(options.browser);
  const api = createSalesApiClient(env.api);

  await verifyApi(api);
  console.log('API: подключение проверено');

  const { launched, page } = await openLoggedInPage(browserId, env);

  await openCommunities(page);
  await searchCommunities(page, options.query.trim());

  const searchResults = await waitForSearchResults(page);

  if (searchResults.count === 0) {
    console.log('\nВ списке нет сообществ. Завершаю работу.');
    await keepOpenOrClose(launched, false);
    return;
  }

  console.log(options.skip > 0 ? `Пропуск: ${options.skip}, запланировано групп: ${options.limit}` : `Запланировано групп: ${options.limit}`);

  const searchQuery = options.query.trim();
  const exporter = createApiExporter(api, searchQuery);
  const processedCount = await runCommunityParser(page, exporter, { searchQuery, limit: options.limit, skip: options.skip });

  if (processedCount === 0) {
    console.log('\nНет данных для сохранения. Завершаю работу.');
    await keepOpenOrClose(launched, false);
    return;
  }

  console.log(`\nГотово. Сохранено через API: ${processedCount}`);
  await keepOpenOrClose(launched, options.keepOpen ?? false);
}
