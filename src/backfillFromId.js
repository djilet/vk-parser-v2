import { config } from './config.js';
import { isApiConfigured } from './api/auth.js';
import { verifyApi } from './export/toApi.js';
import { loadToken } from './vk/tokenStore.js';
import { fetchSyncState, iterateCommunityMessages, updateMessage } from './api/salesMessages.js';
import { parseArgs } from './utils/args.js';

// Разовый бэкфилл: все сообщения в sales_messages когда-либо заливались только одним VK-
// аккаунтом (browser 1), поэтому null from_id простановляется его user_id — без разбора на
// входящие/исходящие (так решил владелец данных: для его случая from_id должен указывать
// именно на этот аккаунт, а не на реального отправителя каждого сообщения).
const args = parseArgs();
const apply = Boolean(args.apply);

function ensureConfig() {
  if (!isApiConfigured()) {
    console.error('API не настроен: задайте API_BASE_URL, API_PHONE и API_CODE в .env');
    process.exit(1);
  }

  if (config.communityIdRaw != null && config.communityId == null) {
    console.error(`--community требует числовой id сообщества, получено: ${config.communityIdRaw}`);
    process.exit(1);
  }
}

async function backfillCommunity(communityId, userId) {
  let checked = 0;
  let filled = 0;

  for await (const row of iterateCommunityMessages(communityId)) {
    if (row.from_id != null) {
      continue;
    }

    checked += 1;

    if (apply) {
      await updateMessage(row.id, { from_id: userId });
    }

    filled += 1;
  }

  if (checked > 0) {
    console.log(
      `community_id=${communityId} — пустых from_id: ${checked}, `
      + `${apply ? 'проставлено' : 'будет проставлено (dry-run)'}: ${filled}`
    );
  }

  return { checked, filled };
}

async function main() {
  ensureConfig();
  await verifyApi();
  console.log('API: подключение проверено');

  const token = await loadToken(config.vk.browserId);
  if (!token?.userId) {
    console.error(
      `Не нашёл userId в сохранённом токене браузера #${config.vk.browserId} — запустите npm run vk-token заново.`
    );
    process.exit(1);
  }

  console.log(`Аккаунт browser ${config.vk.browserId}: VK user_id=${token.userId}`);
  console.log(
    apply
      ? 'Режим: ПРИМЕНЕНИЕ изменений (--apply)'
      : 'Режим: dry-run — передайте --apply, чтобы реально обновить БД'
  );

  const communityIds = config.communityId
    ? [config.communityId]
    : (await fetchSyncState()).items.map((row) => row.community_id);

  console.log(`Сообществ для проверки: ${communityIds.length}\n`);

  let totalChecked = 0;
  let totalFilled = 0;

  for (const communityId of communityIds) {
    try {
      const result = await backfillCommunity(communityId, token.userId);
      totalChecked += result.checked;
      totalFilled += result.filled;
    } catch (err) {
      console.error(`community_id=${communityId} — ошибка: ${err.message}`);
    }
  }

  console.log(
    `\nИтого: пустых from_id — ${totalChecked}, `
    + `${apply ? 'проставлено' : 'будет проставлено (dry-run)'} — ${totalFilled}`
  );

  if (!apply && totalFilled > 0) {
    console.log('Это был dry-run, БД не менялась. Повторите с --apply, чтобы применить.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
