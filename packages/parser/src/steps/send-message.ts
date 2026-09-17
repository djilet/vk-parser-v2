import { sleep, type EnvConfig } from '@vk-sales-bot/core';
import type { Page } from 'puppeteer';

const INPUT_SELECTOR = 'span.ComposerInput__input[contenteditable="true"][role="textbox"]';
const SEND_BUTTON_SELECTOR = 'button.ConvoComposer__sendButton--submit';

export type SendMessageTimings = Pick<EnvConfig, 'send'>['send'];

/**
 * Тайминги — намеренная антидетект-пауза перед вводом и отправкой, а не что-то, что стоит
 * "оптимизировать": именно эта пауза перед вводом текста и есть основная защита от блокировки
 * VK за подозрительно быструю отправку сообщений сразу после открытия чата.
 */
export async function sendCommunityMessage(page: Page, messageText: string, timings: SendMessageTimings): Promise<void> {
  console.log(`Жду загрузку чата (${timings.chatLoadWaitMs / 1000}с)...`);
  await sleep(timings.chatLoadWaitMs);

  console.log(`Чат открыт. Жду ${timings.beforeWriteMs / 1000}с перед вводом сообщения...`);
  await sleep(timings.beforeWriteMs);

  await page.waitForSelector(INPUT_SELECTOR, { timeout: 60_000 });
  await page.click(INPUT_SELECTOR);

  const caretPoint = await page.evaluate(
    (selector, text) => {
      const input = document.querySelector(selector) as HTMLElement | null;
      if (!input) {
        throw new Error('Composer input not found');
      }

      input.focus();
      input.innerHTML = '';

      const lines = text.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        if (index > 0) {
          input.appendChild(document.createElement('br'));
        }
        if (lines[index]!.length > 0) {
          input.appendChild(document.createTextNode(lines[index]!));
        }
      }

      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));

      const caretRect = range.getBoundingClientRect();
      if (caretRect.width > 0 || caretRect.height > 0) {
        return { x: caretRect.left, y: caretRect.top + caretRect.height / 2 };
      }

      const inputRect = input.getBoundingClientRect();
      return { x: inputRect.right - 4, y: inputRect.bottom - 8 };
    },
    INPUT_SELECTOR,
    messageText,
  );

  await page.mouse.move(caretPoint.x, caretPoint.y);
  await page.mouse.click(caretPoint.x, caretPoint.y);

  console.log(`Текст вставлен, курсор в конце. Жду ${timings.beforeSendMs / 1000}с перед отправкой...`);
  await sleep(timings.beforeSendMs);

  const sendButton = await page.waitForSelector(SEND_BUTTON_SELECTOR, { timeout: 15_000 });
  await sendButton!.click();

  console.log('Сообщение отправлено.');
}
