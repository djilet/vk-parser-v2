import { sleep } from '../utils/sleep.js';

const PAGE_LOAD_WAIT_MS = 5_000;

function printCommunityInfo(data) {
  console.log('\n--- Информация о сообществе ---');
  console.log('Ссылка:', data.url);
  console.log('Название:', data.name ?? '—');
  console.log('Телефон:', data.phone ?? '—');
  console.log('Сайт:', data.site ?? '—');
  console.log('Сообщение:', data.msgUrl ?? '—');

  if (data.contacts.length === 0) {
    console.log('Контакты пользователей: нет');
  } else {
    console.log(`Контакты пользователей (${data.contacts.length}):`);
    for (const [index, contact] of data.contacts.entries()) {
      console.log(`  [${index + 1}] ${contact.fullName ?? '—'}`);
      console.log(`      Профиль: ${contact.profileUrl}`);
      console.log(`      Описание: ${contact.description ?? '—'}`);
      console.log(`      Телефон: ${contact.phone ?? '—'}`);
      console.log(`      Email: ${contact.email ?? '—'}`);
    }
  }

  console.log('---\n');
}

export async function parseCommunityPage(page) {
  console.log(`Жду загрузку страницы сообщества (${PAGE_LOAD_WAIT_MS / 1000}с)...`);
  await sleep(PAGE_LOAD_WAIT_MS);

  const data = await page.evaluate(() => {
    const cleanText = (value) => value?.replace(/\s+/g, ' ').trim() || null;

    const nameElement = document.querySelector('[data-testid="group-name"]');
    const name = cleanText(
      nameElement?.querySelector('span')?.textContent ?? nameElement?.textContent ?? null,
    );

    const phoneElement = document.querySelector('[data-testid="group-info-phone"]');
    let phone = null;
    if (phoneElement) {
      const phoneLink = phoneElement.querySelector('a[href^="tel:"]');
      phone = cleanText(
        phoneLink?.textContent
          ?? phoneLink?.getAttribute('href')?.replace(/^tel:/, '')
          ?? phoneElement.textContent,
      );
    }

    const siteElement = document.querySelector('[data-testid="group-info-site"]');
    let site = null;
    if (siteElement) {
      const siteLink = siteElement.querySelector('a[href]');
      site = siteLink?.href || siteLink?.getAttribute('href') || cleanText(siteElement.textContent);
    }

    const msgLink = document.querySelector(
      'a[data-testid="group_action_send_message"][href], a[aria-label="Написать сообщение"][href*="/im/convo/"]',
    );
    const msgPath = msgLink?.getAttribute('href') ?? null;
    const msgUrl = msgPath ? new URL(msgPath, location.origin).href : null;

    const isProfileHref = (href) => {
      if (!href) return false;
      if (href.startsWith('#') || href.startsWith('tel:') || href.startsWith('mailto:')) return false;
      if (href.includes('logout') || href.includes('login.vk.com')) return false;

      const path = href.startsWith('http') ? new URL(href).pathname : href.split('?')[0];

      const excludedPrefixes = [
        '/settings',
        '/support',
        '/feed',
        '/friends',
        '/groups',
        '/search',
        '/audio',
        '/video',
        '/market',
        '/clips',
        '/games',
        '/apps',
        '/mail',
        '/notifications',
        '/bookmarks',
        '/club',
        '/public',
        '/event',
      ];

      return !excludedPrefixes.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      ) && path.startsWith('/');
    };

    const isInSidebar = (element) => !!element.closest(
      '#side_bar, [id="side_bar"], [data-testid="side_bar"], [class*="LeftMenu"], [class*="left_menu"]',
    );

    const getContactsContainer = () => {
      const infoAnchor = document.querySelector(
        '[data-testid="group-info-phone"], [data-testid="group-info-site"]',
      );

      if (infoAnchor) {
        const infoSection = infoAnchor.closest('section');
        if (infoSection?.parentElement) {
          return infoSection.parentElement;
        }
      }

      const groupName = document.querySelector('[data-testid="group-name"]');
      return groupName?.closest('[class*="TwoColumnLayoutNarrow"]')
        ?? groupName?.closest('[class*="TwoColumnLayout"]')
        ?? null;
    };

    const parseContactCell = (cell) => {
      if (isInSidebar(cell)) return null;

      const profilePath = cell.getAttribute('href');
      if (!isProfileHref(profilePath)) return null;

      const avatar = cell.querySelector('.vkuiSimpleCell__before img');
      if (!avatar) return null;

      const fullName = cleanText(cell.querySelector('.vkuiSimpleCell__children')?.textContent);
      if (!fullName) return null;

      const subtitleElement = cell.querySelector('.vkuiSimpleCell__subtitle');
      let description = null;
      if (subtitleElement) {
        const subtitleClone = subtitleElement.cloneNode(true);
        subtitleClone.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach((link) => {
          link.remove();
        });
        description = cleanText(subtitleClone.textContent);
      }

      const phoneLink = cell.querySelector('a[href^="tel:"]');
      const contactPhone = cleanText(
        phoneLink?.textContent ?? phoneLink?.getAttribute('href')?.replace(/^tel:/, '') ?? null,
      );

      const emailLink = cell.querySelector('a[href^="mailto:"]');
      const email = cleanText(
        emailLink?.textContent ?? emailLink?.getAttribute('href')?.replace(/^mailto:/, '') ?? null,
      );

      return {
        profilePath,
        profileUrl: new URL(profilePath, location.origin).href,
        fullName,
        description,
        phone: contactPhone,
        email,
      };
    };

    const contacts = [];
    const seenProfiles = new Set();
    const contactsContainer = getContactsContainer();

    if (contactsContainer) {
      for (const cell of contactsContainer.querySelectorAll('a.vkuiSimpleCell__host[href]')) {
        const contact = parseContactCell(cell);
        if (!contact || seenProfiles.has(contact.profilePath)) continue;

        seenProfiles.add(contact.profilePath);
        contacts.push(contact);
      }
    }

    return {
      url: location.href.split('?')[0],
      name,
      phone,
      site,
      msgUrl,
      contacts,
    };
  });

  printCommunityInfo(data);
  return data;
}
