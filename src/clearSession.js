import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from './config.js';
import { tokenFilePath } from './vk/tokenStore.js';

async function removeIfExists(path, label) {
  try {
    await rm(path, { recursive: true, force: true });
    console.log(`Удалено: ${label} (${path})`);
  } catch (err) {
    console.error(`Не удалось удалить ${label} (${path}): ${err.message}`);
  }
}

async function main() {
  const browserId = config.vk.browserId;
  // userDataDir у puppeteer резолвится относительно cwd (см. launchBrowser) — здесь так же,
  // чтобы гарантированно чистить тот же профиль, с которым работает остальной скрапинг.
  const profileDir = resolve(process.cwd(), config.userDataDir);
  const tokenPath = tokenFilePath(browserId);

  console.log(`Очищаю сессию браузера #${browserId}`);
  console.log(`Профиль Chrome: ${profileDir}`);
  console.log(`Токен VK: ${tokenPath}`);
  console.log('');

  await removeIfExists(profileDir, 'профиль Chrome');
  await removeIfExists(tokenPath, 'токен VK');

  console.log(`\nГотово. Для повторного входа: npm run vk-token -- --browser ${browserId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
