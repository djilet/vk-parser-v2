import { extractTokenFromUrl } from './tokenStore.js';

/** id официального приложения vk.com на vkhost.github.io — implicit-flow user-токен. */
export const VK_COM_APP_ID = 6287487;

async function getPageHref(page) {
  try {
    return await page.evaluate(() => location.href);
  } catch {
    return page.url();
  }
}

export async function clickVkApp(page, appId = VK_COM_APP_ID) {
  const selector = `.app button[onclick="auth(${appId})"]`;

  await page.waitForSelector(selector, { timeout: 15_000 });
  await page.click(selector);
}

export async function waitForOAuthPage(browser, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const page of await browser.pages()) {
      const url = page.url();
      if ((url.includes('oauth.vk.com') || url.includes('id.vk.com') || url.includes('vk.com'))
        && !url.includes('vkhost.github.io')) {
        return page;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  throw new Error('Страница авторизации VK не открылась');
}

export async function clickContinueAs(page) {
  const href = await getPageHref(page);
  if (href && extractTokenFromUrl(href)) {
    return;
  }

  console.log('Жду кнопку «Продолжить как …»...');

  const continueButton = await page.waitForSelector('button[data-test-id="continue-as-button"]', {
    timeout: 60_000,
    visible: true,
  });

  if (!continueButton) {
    throw new Error('Кнопка «Продолжить как …» не найдена');
  }

  console.log('Нажимаю «Продолжить как …»...');
  await continueButton.click();
}

export async function waitForAccessTokenUrl(browser, timeoutMs = 120_000) {
  console.log('Жду редирект на blank.html#access_token=...');

  return new Promise((resolve, reject) => {
    let settled = false;
    const attachedPages = new WeakSet();

    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      browser.off('targetcreated', onTargetCreated);
      resolve(url);
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      browser.off('targetcreated', onTargetCreated);
      reject(error);
    };

    const checkFrame = async (frame) => {
      try {
        const href = frame.url();
        if (extractTokenFromUrl(href)) {
          console.log('Токен найден в URL:', href.split('#')[0] + '#access_token=...');
          finish(href);
        }
      } catch {
        // frame может быть уже detached
      }
    };

    const attachPage = (page) => {
      if (attachedPages.has(page)) return;
      attachedPages.add(page);

      page.on('framenavigated', (frame) => {
        void checkFrame(frame);
      });

      page.on('load', () => {
        void checkFrame(page.mainFrame());
      });
    };

    const checkAllPages = async () => {
      for (const page of await browser.pages()) {
        attachPage(page);

        const href = await getPageHref(page);
        if (href && extractTokenFromUrl(href)) {
          console.log('Токен найден в URL:', href.split('#')[0] + '#access_token=...');
          finish(href);
          return;
        }

        for (const frame of page.frames()) {
          await checkFrame(frame);
          if (settled) return;
        }
      }

      for (const target of browser.targets()) {
        const url = target.url();
        if (extractTokenFromUrl(url)) {
          console.log('Токен найден в target URL:', url.split('#')[0] + '#access_token=...');
          finish(url);
          return;
        }
      }
    };

    const onTargetCreated = async (target) => {
      const page = await target.page();
      if (page) attachPage(page);

      const url = target.url();
      if (extractTokenFromUrl(url)) {
        console.log('Токен найден в новом target:', url.split('#')[0] + '#access_token=...');
        finish(url);
      }
    };

    browser.on('targetcreated', onTargetCreated);

    const pollTimer = setInterval(() => {
      void checkAllPages();
    }, 300);

    const timeoutTimer = setTimeout(() => {
      fail(new Error('Таймаут: не дождались blank.html#access_token=...'));
    }, timeoutMs);

    void checkAllPages();
  });
}
