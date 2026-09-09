import { sleep } from '../utils/sleep.js';

const OPEN_BUTTON = '[data-testid="open_full_info_modal"]';
const MODAL = '[data-testid="community-info-modal"]';
const STATUS_CELL = '[data-testid="community-info-status"]';
const DESC_CELL = '[data-testid="community-info-description"]';
const MODAL_WAIT_MS = 5_000;
const MODAL_ATTEMPTS = 3; // первая проверка + 2 повтора

async function closeModal(page) {
  try {
    await page.keyboard.press('Escape');
    await sleep(500);
  } catch {
    // Закрытие модалки не должно ронять парсинг сообщества.
  }
}

export async function parseCommunityDescription(page) {
  const button = await page.$(OPEN_BUTTON);
  if (!button) {
    console.log('Кнопка «Подробная информация» не найдена');
    return null;
  }

  try {
    try {
      await button.click();
    } catch {
      await page.evaluate((el) => el.click(), button);
    }
  } finally {
    await button.dispose();
  }

  let modal = null;
  for (let attempt = 1; attempt <= MODAL_ATTEMPTS; attempt += 1) {
    await sleep(MODAL_WAIT_MS);
    modal = await page.$(MODAL);
    if (modal) {
      break;
    }
  }

  if (!modal) {
    console.log('Модалка «Подробная информация» не появилась');
    return null;
  }

  await modal.dispose();

  try {
    const { status, description } = await page.evaluate((modalSel, statusSel, descSel) => {
      const cleanText = (value) => value?.replace(/\s+/g, ' ').trim() || null;

      const modalElement = document.querySelector(modalSel);
      if (!modalElement) {
        return { status: null, description: null };
      }

      const readCell = (selector) => {
        const cell = modalElement.querySelector(selector);
        const content = cell?.querySelector('.vkuiMiniInfoCell__middle')?.textContent
          ?? cell?.textContent
          ?? null;
        return cleanText(content);
      };

      return {
        status: readCell(statusSel),
        description: readCell(descSel),
      };
    }, MODAL, STATUS_CELL, DESC_CELL);

    return [status, description].filter(Boolean).join('\n') || null;
  } finally {
    await closeModal(page);
  }
}
