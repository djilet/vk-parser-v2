const OPEN_BUTTON = '[data-testid="open_full_info_modal"]';
const MODAL = '[data-testid="community-info-modal"]';
const STATUS_CELL = '[data-testid="community-info-status"]';
const DESC_CELL = '[data-testid="community-info-description"]';
const BUTTON_WAIT_MS = 10_000;
const MODAL_WAIT_MS = 15_000;

async function closeModal(page) {
  try {
    await page.keyboard.press('Escape');
    await page.waitForSelector(MODAL, { hidden: true, timeout: 5_000 });
  } catch {
    // Закрытие модалки не должно ронять парсинг сообщества.
  }
}

/**
 * Читает статус и описание сообщества из модалки «Подробная информация».
 *
 * Возвращает { description, reason }, где reason различает пустое описание
 * ('empty' — модалка открылась, но текста нет) и неответившую страницу
 * ('no_button' / 'no_modal'). По второму варианту вызывающий код понимает,
 * что VK начал блокировать парсер.
 */
export async function parseCommunityDescription(page) {
  try {
    await page.waitForSelector(OPEN_BUTTON, { timeout: BUTTON_WAIT_MS, visible: true });
  } catch {
    console.log('Кнопка «Подробная информация» не найдена');
    return { description: null, reason: 'no_button' };
  }

  const button = await page.$(OPEN_BUTTON);
  if (!button) {
    return { description: null, reason: 'no_button' };
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

  try {
    await page.waitForSelector(MODAL, { timeout: MODAL_WAIT_MS });
  } catch {
    console.log('Модалка «Подробная информация» не появилась');
    return { description: null, reason: 'no_modal' };
  }

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

    const text = [status, description].filter(Boolean).join('\n') || null;

    return { description: text, reason: text ? 'ok' : 'empty' };
  } finally {
    await closeModal(page);
  }
}
