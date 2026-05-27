import { sleep } from '../utils/sleep.js';

const GROUPS_LINK = 'a[href="/groups"]';
const SEARCH_INPUT = 'input[data-testid="search_input"], input[placeholder="Поиск сообществ"]';
const RESULTS_SECTION_TEXT = 'Среди всех сообществ';
const RESULTS_WAIT_MS = 5_000;
const PAGINATION_POLL_MS = 1_000;
const PAGINATION_TIMEOUT_MS = 15_000;
const MAX_STAGNANT_ATTEMPTS = 3;

function findCommunityLinkHandle(page, index) {
  return page.evaluateHandle((sectionText, targetIndex) => {
    const headings = document.querySelectorAll('span.vkuiEllipsisText__content');

    for (const heading of headings) {
      if (heading.textContent?.trim() !== sectionText) continue;

      let container = heading.parentElement;
      for (let depth = 0; depth < 12 && container; depth++) {
        const links = [...container.querySelectorAll('a[data-allow-link-onclick-web="1"]')].filter(
          (link) => link.querySelector('[class*="vkitTextClamp"]'),
        );

        if (links[targetIndex]) {
          return links[targetIndex];
        }

        if (links.length > 0) {
          return null;
        }

        container = container.parentElement;
      }
    }

    return null;
  }, RESULTS_SECTION_TEXT, index);
}

async function hasSearchResults(page) {
  return page.evaluate((sectionText) => {
    const headings = document.querySelectorAll('span.vkuiEllipsisText__content');

    for (const heading of headings) {
      if (heading.textContent?.trim() !== sectionText) continue;

      let container = heading.parentElement;
      for (let depth = 0; depth < 12 && container; depth++) {
        const links = [...container.querySelectorAll('a[data-allow-link-onclick-web="1"]')].filter(
          (link) => link.querySelector('[class*="vkitTextClamp"]'),
        );

        if (links.length > 0) {
          return { found: true, count: links.length };
        }

        container = container.parentElement;
      }
    }

    return { found: false, count: 0 };
  }, RESULTS_SECTION_TEXT);
}

async function scrollResultsList(page) {
  await page.evaluate((sectionText) => {
    const headings = document.querySelectorAll('span.vkuiEllipsisText__content');

    for (const heading of headings) {
      if (heading.textContent?.trim() !== sectionText) continue;

      let container = heading.parentElement;
      for (let depth = 0; depth < 12 && container; depth++) {
        const links = [...container.querySelectorAll('a[data-allow-link-onclick-web="1"]')].filter(
          (link) => link.querySelector('[class*="vkitTextClamp"]'),
        );

        if (links.length === 0) {
          container = container.parentElement;
          continue;
        }

        links[links.length - 1].scrollIntoView({ block: 'end' });

        let scrollable = container;
        while (scrollable) {
          if (scrollable.scrollHeight > scrollable.clientHeight + 10) {
            scrollable.scrollTop = scrollable.scrollHeight;
            return;
          }
          scrollable = scrollable.parentElement;
        }

        window.scrollTo(0, document.body.scrollHeight);
        return;
      }
    }

    window.scrollTo(0, document.body.scrollHeight);
  }, RESULTS_SECTION_TEXT);
}

async function waitForResultsCountIncrease(page, previousCount) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < PAGINATION_TIMEOUT_MS) {
    await sleep(PAGINATION_POLL_MS);

    const result = await hasSearchResults(page);
    if (result.count > previousCount) {
      return result;
    }
  }

  return hasSearchResults(page);
}

export async function getSearchResults(page) {
  return hasSearchResults(page);
}

export async function ensureResultsLoaded(page, requiredCount) {
  let result = await hasSearchResults(page);

  if (!result.found) {
    return result;
  }

  if (result.count >= requiredCount) {
    return result;
  }

  let stagnantAttempts = 0;
  let previousCount = result.count;

  while (result.count < requiredCount) {
    console.log(`Подгружаю список: ${result.count}/${requiredCount}...`);

    await scrollResultsList(page);
    result = await waitForResultsCountIncrease(page, previousCount);

    if (result.count > previousCount) {
      console.log(`Список расширен: ${result.count} сообществ.`);
      previousCount = result.count;
      stagnantAttempts = 0;
      continue;
    }

    stagnantAttempts += 1;
    console.log(`Попытка ${stagnantAttempts}/${MAX_STAGNANT_ATTEMPTS}: новые сообщества не подгрузились.`);

    if (stagnantAttempts >= MAX_STAGNANT_ATTEMPTS) {
      console.log('Достигнут конец списка сообществ.');
      return result;
    }

    await sleep(RESULTS_WAIT_MS);
  }

  return result;
}

export async function openCommunities(page) {
  console.log('Открываю раздел «Сообщества»...');

  await page.waitForSelector(GROUPS_LINK, { timeout: 60_000, visible: true });
  await page.click(GROUPS_LINK);

  await page.waitForSelector(SEARCH_INPUT, { timeout: 60_000, visible: true });
  console.log('Страница сообществ загружена.');
}

export async function searchCommunities(page, query) {
  console.log(`Ввожу запрос в поиск: "${query}"`);

  const input = await page.waitForSelector(SEARCH_INPUT, { timeout: 30_000, visible: true });
  await input.click({ clickCount: 3 });
  await input.type(query, { delay: 40 });

  console.log('Запрос введён.');
}

export async function waitForSearchResults(page) {
  console.log('Ожидаю раздел «Среди всех сообществ»...');

  let attempt = 0;

  while (true) {
    attempt += 1;
    await sleep(RESULTS_WAIT_MS);

    const result = await hasSearchResults(page);

    if (result.found) {
      console.log(`Список найден: ${result.count} сообществ (попытка ${attempt}).`);
      return result;
    }

    console.log(`Попытка ${attempt}: список не появился, жду ещё 5с...`);
  }
}

export async function goBackToSearchResults(page) {
  console.log('Возвращаюсь к списку сообществ...');
  await page.goBack();
  await page.waitForSelector(SEARCH_INPUT, { timeout: 60_000, visible: true });

  let attempt = 0;

  while (true) {
    attempt += 1;
    const result = await hasSearchResults(page);

    if (result.found) {
      console.log(`Список снова доступен: ${result.count} сообществ (попытка ${attempt}).`);
      return result;
    }

    console.log(`Попытка ${attempt}: список не появился, жду ещё 5с...`);
    await sleep(RESULTS_WAIT_MS);
  }
}

export async function clickCommunityByIndex(page, index) {
  console.log(`Кликаю на сообщество #${index + 1} в списке...`);

  const linkHandle = await findCommunityLinkHandle(page, index);
  const link = linkHandle.asElement();

  if (!link) {
    await linkHandle.dispose();
    throw new Error(`Не удалось найти сообщество #${index + 1} в списке`);
  }

  const info = await link.evaluate((el) => ({
    title: el.querySelector('[class*="vkitTextClamp"]')?.textContent?.trim() ?? el.textContent?.trim(),
    href: el.getAttribute('href'),
  }));

  console.log(`Открываю: ${info.title} (${info.href})`);

  const urlBefore = page.url();
  await link.click();

  try {
    await page.waitForFunction((before) => location.href !== before, { timeout: 15_000 }, urlBefore);
  } catch {
    await sleep(2_000);
  }

  await linkHandle.dispose();
  console.log(`Страница сообщества: ${page.url()}`);
}
