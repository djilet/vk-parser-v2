import { sleep } from '../utils/sleep.js';

const GROUPS_LINK = 'a[href="/groups"]';
const SEARCH_INPUT = 'input[data-testid="search_input"], input[placeholder="Поиск сообществ"]';
const RESULTS_SECTION_TEXTS = ['Среди всех сообществ'];
const RESULTS_WAIT_MS = 5_000;
const PAGINATION_POLL_MS = 1_000;
const PAGINATION_TIMEOUT_MS = 15_000;
const MAX_STAGNANT_ATTEMPTS = 3;

function queryCommunityResults(page, targetIndex = null) {
  return page.evaluate((sectionTexts, index) => {
    const COMMUNITY_HREF_RE = /^\/(club|public|event)\d+(?:[/?#]|$)/;

    function normalizeText(text) {
      return text?.replace(/\s+/g, ' ').trim() ?? '';
    }

    function isCommunityLink(link) {
      const href = link.getAttribute('href') ?? '';
      if (COMMUNITY_HREF_RE.test(href)) {
        return true;
      }

      if (link.querySelector('[class*="vkitTextClamp"], [class*="TextClamp"]')) {
        return true;
      }

      return link.hasAttribute('data-allow-link-onclick-web');
    }

    function collectCommunityLinks(container) {
      const seen = new Set();
      const links = [];

      for (const link of container.querySelectorAll('a[href]')) {
        if (!isCommunityLink(link)) {
          continue;
        }

        const href = link.getAttribute('href') ?? '';
        if (seen.has(href)) {
          continue;
        }

        seen.add(href);
        links.push(link);
      }

      return links;
    }

    function findResultsSectionHeading() {
      const selector = [
        'span.vkuiEllipsisText__content',
        '[class*="EllipsisText"]',
        '[class*="Subhead"]',
        '[class*="HeaderTitle"]',
        'h2',
        'h3',
      ].join(', ');

      for (const el of document.querySelectorAll(selector)) {
        const text = normalizeText(el.textContent);
        if (sectionTexts.some((sectionText) => text === sectionText)) {
          return el;
        }
      }

      return null;
    }

    function findLinksFromHeading(heading) {
      let container = heading.parentElement;

      for (let depth = 0; depth < 12 && container; depth++) {
        const links = collectCommunityLinks(container);

        if (links.length > 0) {
          return links;
        }

        container = container.parentElement;
      }

      return [];
    }

    function findLinksFallback() {
      const searchInput = document.querySelector(
        'input[data-testid="search_input"], input[placeholder="Поиск сообществ"]',
      );
      const root = searchInput?.closest('main, [role="main"]') ?? document.body;
      const links = collectCommunityLinks(root).filter((link) => {
        const href = link.getAttribute('href') ?? '';
        return COMMUNITY_HREF_RE.test(href);
      });

      return links.length >= 3 ? links : [];
    }

    const heading = findResultsSectionHeading();
    const links = heading ? findLinksFromHeading(heading) : findLinksFallback();

    return {
      found: links.length > 0,
      count: links.length,
      link: index == null ? null : (links[index] ?? null),
    };
  }, RESULTS_SECTION_TEXTS, targetIndex);
}

function findCommunityLinkHandle(page, index) {
  return page.evaluateHandle((sectionTexts, targetIndex) => {
    const COMMUNITY_HREF_RE = /^\/(club|public|event)\d+(?:[/?#]|$)/;

    function normalizeText(text) {
      return text?.replace(/\s+/g, ' ').trim() ?? '';
    }

    function isCommunityLink(link) {
      const href = link.getAttribute('href') ?? '';
      if (COMMUNITY_HREF_RE.test(href)) {
        return true;
      }

      if (link.querySelector('[class*="vkitTextClamp"], [class*="TextClamp"]')) {
        return true;
      }

      return link.hasAttribute('data-allow-link-onclick-web');
    }

    function collectCommunityLinks(container) {
      const seen = new Set();
      const links = [];

      for (const link of container.querySelectorAll('a[href]')) {
        if (!isCommunityLink(link)) {
          continue;
        }

        const href = link.getAttribute('href') ?? '';
        if (seen.has(href)) {
          continue;
        }

        seen.add(href);
        links.push(link);
      }

      return links;
    }

    function findResultsSectionHeading() {
      const selector = [
        'span.vkuiEllipsisText__content',
        '[class*="EllipsisText"]',
        '[class*="Subhead"]',
        '[class*="HeaderTitle"]',
        'h2',
        'h3',
      ].join(', ');

      for (const el of document.querySelectorAll(selector)) {
        const text = normalizeText(el.textContent);
        if (sectionTexts.some((sectionText) => text === sectionText)) {
          return el;
        }
      }

      return null;
    }

    function findLinksFromHeading(heading) {
      let container = heading.parentElement;

      for (let depth = 0; depth < 12 && container; depth++) {
        const links = collectCommunityLinks(container);

        if (links.length > 0) {
          return links;
        }

        container = container.parentElement;
      }

      return [];
    }

    function findLinksFallback() {
      const searchInput = document.querySelector(
        'input[data-testid="search_input"], input[placeholder="Поиск сообществ"]',
      );
      const root = searchInput?.closest('main, [role="main"]') ?? document.body;
      const links = collectCommunityLinks(root).filter((link) => {
        const href = link.getAttribute('href') ?? '';
        return COMMUNITY_HREF_RE.test(href);
      });

      return links.length >= 3 ? links : [];
    }

    const heading = findResultsSectionHeading();
    const links = heading ? findLinksFromHeading(heading) : findLinksFallback();

    return links[targetIndex] ?? null;
  }, RESULTS_SECTION_TEXTS, index);
}

async function hasSearchResults(page) {
  const result = await queryCommunityResults(page);
  return { found: result.found, count: result.count };
}

async function debugSearchPage(page) {
  return page.evaluate((sectionTexts) => {
    const headings = [...document.querySelectorAll('span, h2, h3, div')]
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim())
      .filter((text) => text && text.length <= 60);

    const uniqueHeadings = [...new Set(headings)].slice(0, 12);
    const communityLinks = document.querySelectorAll('a[href^="/club"], a[href^="/public"], a[href^="/event"]').length;
    const hasSection = sectionTexts.some((sectionText) => headings.includes(sectionText));

    return { uniqueHeadings, communityLinks, hasSection };
  }, RESULTS_SECTION_TEXTS);
}

async function scrollResultsList(page) {
  await page.evaluate((sectionTexts) => {
    const COMMUNITY_HREF_RE = /^\/(club|public|event)\d+(?:[/?#]|$)/;

    function normalizeText(text) {
      return text?.replace(/\s+/g, ' ').trim() ?? '';
    }

    function isCommunityLink(link) {
      const href = link.getAttribute('href') ?? '';
      if (COMMUNITY_HREF_RE.test(href)) {
        return true;
      }

      if (link.querySelector('[class*="vkitTextClamp"], [class*="TextClamp"]')) {
        return true;
      }

      return link.hasAttribute('data-allow-link-onclick-web');
    }

    function collectCommunityLinks(container) {
      const seen = new Set();
      const links = [];

      for (const link of container.querySelectorAll('a[href]')) {
        if (!isCommunityLink(link)) {
          continue;
        }

        const href = link.getAttribute('href') ?? '';
        if (seen.has(href)) {
          continue;
        }

        seen.add(href);
        links.push(link);
      }

      return links;
    }

    function findResultsSectionHeading() {
      const selector = [
        'span.vkuiEllipsisText__content',
        '[class*="EllipsisText"]',
        '[class*="Subhead"]',
        '[class*="HeaderTitle"]',
        'h2',
        'h3',
      ].join(', ');

      for (const el of document.querySelectorAll(selector)) {
        const text = normalizeText(el.textContent);
        if (sectionTexts.some((sectionText) => text === sectionText)) {
          return el;
        }
      }

      return null;
    }

    function scrollLinks(links, container) {
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
    }

    const heading = findResultsSectionHeading();

    if (heading) {
      let container = heading.parentElement;

      for (let depth = 0; depth < 12 && container; depth++) {
        const links = collectCommunityLinks(container);

        if (links.length === 0) {
          container = container.parentElement;
          continue;
        }

        scrollLinks(links, container);
        return;
      }
    }

    window.scrollTo(0, document.body.scrollHeight);
  }, RESULTS_SECTION_TEXTS);
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

export async function scrollToCommunityIndex(page, index) {
  const result = await ensureResultsLoaded(page, index + 1);

  if (!result.found || index >= result.count) {
    return result;
  }

  console.log(`Прокручиваю к сообществу #${index + 1} в списке...`);

  const linkHandle = await findCommunityLinkHandle(page, index);
  const link = linkHandle.asElement();

  if (!link) {
    await linkHandle.dispose();
    throw new Error(`Не удалось прокрутить к сообществу #${index + 1} в списке`);
  }

  await link.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await linkHandle.dispose();
  await sleep(500);
  return result;
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
  await input.press('Enter');

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

    if (attempt === 3 || attempt % 5 === 0) {
      const debug = await debugSearchPage(page);
      console.log(
        `Диагностика: ссылок club/public/event — ${debug.communityLinks}, `
        + `заголовок «Среди всех сообществ» — ${debug.hasSection ? 'есть' : 'нет'}`,
      );
      if (debug.communityLinks > 0) {
        console.log(`Заголовки на странице: ${debug.uniqueHeadings.join(' | ')}`);
      }
    }
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

  await scrollToCommunityIndex(page, index);

  const linkHandle = await findCommunityLinkHandle(page, index);
  const link = linkHandle.asElement();

  if (!link) {
    await linkHandle.dispose();
    throw new Error(`Не удалось найти сообщество #${index + 1} в списке`);
  }

  const info = await link.evaluate((el) => ({
    title: el.querySelector('[class*="vkitTextClamp"], [class*="TextClamp"]')?.textContent?.trim()
      ?? el.textContent?.trim(),
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
