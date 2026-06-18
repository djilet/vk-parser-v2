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
