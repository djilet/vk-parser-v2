# VK Chat Bot — получение access token

Две команды для работы с [vkhost.github.io](https://vkhost.github.io/):

## Установка

```bash
npm install
```

## 1. Создать сессию (вручную)

Открывает браузер на vkhost.github.io. Войдите в VK — сессия сохранится в `.browser-profile/`.

```bash
npm run vk:session
```

Когда закончите — закройте браузер или нажмите Enter в терминале.

## 2. Получить токен (автоматически)

Открывает браузер, кликает по приложению, подтверждает доступ и сохраняет токен в `.vk-token.json`.

```bash
npm run vk:token
```

По умолчанию используется приложение **vk.com** (ID `6287487`). Можно переопределить:

```bash
VK_APP_NAME="vk.com" npm run vk:token
VK_APP_ID=6287487 npm run vk:token
```

## Несколько браузеров

Поддерживаются два независимых профиля: **1** и **2**. У каждого своя сессия и свой токен.

```bash
# Браузер 1 (по умолчанию)
npm run vk:session
npm run vk:token

# Браузер 2
npm run vk:session -- --browser 2
npm run vk:token -- --browser 2
```

Файлы:
- `.browser-profile-1/`, `.browser-profile-2/` — сессии
- `.vk-token-1.json`, `.vk-token-2.json` — токены

Можно также через переменную окружения:

```bash
VK_BROWSER=2 npm run vk:token
```

## Формат сохранённого токена

```json
{
  "accessToken": "...",
  "expiresIn": 86400,
  "userId": 123456789,
  "savedAt": "2026-06-18T12:00:00.000Z"
}
```

## Порядок использования

1. `npm run vk:session` — один раз, чтобы войти в VK
2. `npm run vk:token` — когда нужен свежий access token

Файлы `.browser-profile/` и `.vk-token.json` добавлены в `.gitignore`.
