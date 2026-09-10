import { config } from './config.js';
import { isApiConfigured } from './api/auth.js';
import { verifyApi } from './export/toApi.js';
import { uploadAllCommunityMessages, syncCommunityMessages, syncNewMessages } from './sync/messages.js';

function ensureConfig() {
  if (!isApiConfigured()) {
    console.error('API не настроен: задайте API_BASE_URL, API_PHONE и API_CODE в .env');
    process.exit(1);
  }

  // --community без значения парсится в args.community === true (bare-флаг), а не в id.
  // Без этой проверки Number.parseInt('true') даёт NaN → config.communityId тихо становится
  // null, и вызов вместо ошибки откатывается к «синхронизировать все сообщества».
  if (config.communityIdRaw != null && config.communityId == null) {
    console.error(`--community требует числовой id сообщества, получено: ${config.communityIdRaw}`);
    process.exit(1);
  }
}

async function main() {
  ensureConfig();
  await verifyApi();
  console.log('API: подключение проверено');

  let result;

  if (config.communityId) {
    if (config.full) {
      console.log(`Синхронизирую сообщество ${config.communityId} (вся история)...`);
      result = await uploadAllCommunityMessages({ limit: config.limit, onlyCommunityId: config.communityId });
    } else {
      console.log(`Синхронизирую сообщество ${config.communityId} (только новые сообщения)...`);
      result = await syncCommunityMessages(config.communityId);
    }
  } else if (config.full) {
    console.log('Полная заливка истории по всем сообществам из журнала отправок...');
    result = await uploadAllCommunityMessages({ limit: config.limit });
  } else {
    console.log('До-синхронизация новых сообщений по всем сообществам...');
    result = await syncNewMessages({ limit: config.limit });
  }

  console.log(
    `\nГотово. Сообществ: ${result.processed}, сообщений добавлено: ${result.inserted}`
    + ` (без текста/вложений пропущено: ${result.dropped}), ошибок: ${result.failed}`
  );

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
