import { sleep } from '../utils/sleep.js';

const GROUPS_LINK = 'a[href="/groups"]';
const SEARCH_INPUT = 'input[data-testid="search_input"], input[placeholder="Поиск сообществ"]';
const RESULTS_SECTION_TEXT = 'Среди всех сообществ';
const RESULTS_WAIT_MS = 5_000;

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

export async function clickFirstCommunity(page) {
  console.log('Кликаю на первое сообщество в списке...');

  const linkHandle = await page.evaluateHandle((sectionText) => {
    const headings = document.querySelectorAll('span.vkuiEllipsisText__content');

    for (const heading of headings) {
      if (heading.textContent?.trim() !== sectionText) continue;

      let container = heading.parentElement;
      for (let depth = 0; depth < 12 && container; depth++) {
        const link = container.querySelector(
          'a[data-allow-link-onclick-web="1"]:has([class*="vkitTextClamp"])',
        );

        if (link) return link;

        const links = [...container.querySelectorAll('a[data-allow-link-onclick-web="1"]')].filter(
          (item) => item.querySelector('[class*="vkitTextClamp"]'),
        );

        if (links[0]) return links[0];

        container = container.parentElement;
      }
    }

    return null;
  }, RESULTS_SECTION_TEXT);

  const link = linkHandle.asElement();
  if (!link) {
    await linkHandle.dispose();
    throw new Error('Не удалось найти карточку сообщества для клика');
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
