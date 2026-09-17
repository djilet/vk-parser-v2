import { getVkClientForAccount, parseBrowserId, type BrowserId, type EnvConfig } from '@vk-sales-bot/core';
import { createSalesApiClient } from '@vk-sales-bot/sales-api';
import {
  syncAllAccountConversations,
  syncCommunityMessages,
  syncNewMessages,
  uploadAllAccountConversations,
  uploadAllCommunityMessages,
  verifyApi,
  type SyncResult,
} from '@vk-sales-bot/parser';

export type SyncMessagesOptions = {
  full?: boolean;
  allConversations?: boolean;
  community?: number;
  limit?: number;
  browser?: string;
};

export async function runSyncMessagesCommand(env: EnvConfig, options: SyncMessagesOptions): Promise<void> {
  const browserId: BrowserId = parseBrowserId(options.browser);
  const api = createSalesApiClient(env.api);
  const vk = await getVkClientForAccount(browserId, env);

  await verifyApi(api);
  console.log('API: подключение проверено');

  let result: SyncResult;

  if (options.allConversations) {
    if (options.full) {
      console.log('Ищу все переписки аккаунта через messages.getConversations (вся история)...');
      result = await uploadAllAccountConversations(vk, api, { limit: options.limit });
    } else {
      console.log('Ищу все переписки аккаунта через messages.getConversations (только новые сообщения)...');
      result = await syncAllAccountConversations(vk, api, { limit: options.limit });
    }
  } else if (options.community != null) {
    if (options.full) {
      console.log(`Синхронизирую сообщество ${options.community} (вся история)...`);
      result = await uploadAllCommunityMessages(vk, api, { limit: options.limit, onlyCommunityId: options.community });
    } else {
      console.log(`Синхронизирую сообщество ${options.community} (только новые сообщения)...`);
      result = await syncCommunityMessages(vk, api, options.community);
    }
  } else if (options.full) {
    console.log('Полная заливка истории по всем сообществам из журнала отправок...');
    result = await uploadAllCommunityMessages(vk, api, { limit: options.limit });
  } else {
    console.log('До-синхронизация новых сообщений по всем сообществам...');
    result = await syncNewMessages(vk, api, { limit: options.limit });
  }

  console.log(
    `\nГотово. Сообществ: ${result.processed}, сообщений добавлено: ${result.inserted}` +
      ` (без текста/вложений пропущено: ${result.dropped}), ошибок: ${result.failed}`,
  );

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}
