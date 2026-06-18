# VK Chat Bot — получение access token

Работа с [vkhost.github.io](https://vkhost.github.io/).

## Установка

```bash
npm install
```

## Команды

### Создать сессию (вручную)

```bash
npm run vk:session
npm run vk:session -- --browser 2
```

### Получить и сохранить токен

```bash
npm run vk:token
npm run vk:token -- --browser 2
npm run vk:token-all   # по очереди для браузеров 1 и 2
```

### Работа с сохранёнными токенами

```bash
npm run vk:tokens              # список всех токенов
npm run vk:show -- --browser 1 # показать токен браузера
npm run vk:get -- --browser 1  # вывести только access_token (для скриптов)
```

## Несколько браузеров

Два независимых профиля: **1** и **2**.

| Браузер | Сессия | Токен |
|---------|--------|-------|
| 1 | `.browser-profile-1/` | `tokens/browser-1.json` |
| 2 | `.browser-profile-2/` | `tokens/browser-2.json` |

```bash
VK_BROWSER=2 npm run vk:token
```

## Локальное хранение токенов

Токены сохраняются в папку `tokens/` с метаданными:

```json
{
  "browserId": 1,
  "accessToken": "vk1.a....",
  "expiresIn": 86400,
  "expiresAt": "2026-06-19T12:00:00.000Z",
  "userId": 123456789,
  "email": "user@mail.ru",
  "appId": 6287487,
  "savedAt": "2026-06-18T12:00:00.000Z"
}
```

### Использование в коде

```typescript
import { getAccessToken, loadToken, loadAllTokens } from './token/index.js';

const token = await getAccessToken(1); // активный токен браузера #1
const saved = await loadToken(2);      // полные данные браузера #2
const all = await loadAllTokens();     // все сохранённые токены
```

## Порядок использования

1. `npm run vk:session -- --browser 1` — войти в VK
2. `npm run vk:token -- --browser 1` — получить и сохранить токен
3. `npm run vk:get -- --browser 1` — использовать токен в других скриптах

Старые файлы `.vk-token-*.json` автоматически мигрируют в `tokens/` при первом чтении.
