import { sleep } from '../utils/sleep.js';

const INPUT_SELECTOR = 'span.ComposerInput__input[contenteditable="true"][role="textbox"]';
const SEND_BUTTON_SELECTOR = 'button.ConvoComposer__sendButton--submit';
const CHAT_LOAD_WAIT_MS = 5_000;
const BEFORE_SEND_MS = 10_000;
const AFTER_SEND_MS = 15_000;

export async function sendCommunityMessage(page, messageText) {
  console.log(`Жду загрузку чата (${CHAT_LOAD_WAIT_MS / 1000}с)...`);
  await sleep(CHAT_LOAD_WAIT_MS);

  await page.waitForSelector(INPUT_SELECTOR, { timeout: 60_000 });
  await page.click(INPUT_SELECTOR);

  const caretPoint = await page.evaluate((selector, text) => {
    const input = document.querySelector(selector);
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
      if (lines[index].length > 0) {
        input.appendChild(document.createTextNode(lines[index]));
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
  }, INPUT_SELECTOR, messageText);

  await page.mouse.move(caretPoint.x, caretPoint.y);
  await page.mouse.click(caretPoint.x, caretPoint.y);

  console.log(`Текст вставлен, курсор в конце. Жду ${BEFORE_SEND_MS / 1000}с перед отправкой...`);
  await sleep(BEFORE_SEND_MS);

  // const sendButton = await page.waitForSelector(SEND_BUTTON_SELECTOR, { timeout: 15_000 });
  // await sendButton.click();

  console.log(`Сообщение отправлено. Жду ${AFTER_SEND_MS / 1000}с...`);
  await sleep(AFTER_SEND_MS);
}
