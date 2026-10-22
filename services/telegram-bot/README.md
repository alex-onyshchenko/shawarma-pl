# Telegram Bot — ШаурМіша

Самостійний Node.js 24 підпроєкт для @shaurmisha_pl_bot. Не імпортує клієнт чи Sync, не має бази, polling або npm-залежностей. Окремий Vercel-проєкт із двома функціями: `POST /api/webhook` та `GET /api/health`.

У приватному чаті `/start`, `/start payload`, `/start@shaurmisha_pl_bot` і `/help` повертають привітання та кнопку **«🌯 Відкрити меню»**. Кнопка `web_app` відкриває `MINI_APP_URL` усередині Telegram. Звичайна команда `/start` сама не запускає Mini App; для прямого запуску `https://t.me/shaurmisha_pl_bot?startapp` потрібно окремо увімкнути Main Mini App у BotFather.

## Змінні оточення

Є `.env.dev` і `.env.prod`, шаблони версіонуються, приватні значення виключені з Git і Docker image. З кореня `npm run env:setup` створює відсутні файли. Для окремого репозиторію скопіюйте `.env.dev.example` і `.env.prod.example` у відповідні env-файли.

| Змінна | Призначення |
| --- | --- |
| `MINI_APP_URL` | HTTPS-адреса клієнта; зараз `https://shawarma-pl-pe1y.vercel.app/` |
| `TELEGRAM_BOT_USERNAME` | `shaurmisha_pl_bot`, без `@` |
| `TELEGRAM_BOT_TOKEN` | Приватний токен BotFather; потрібний лише локальному скрипту реєстрації, у runtime функції не використовується |
| `BOT_PUBLIC_URL` | HTTPS origin **окремого бот-проєкту**, без шляху, наприклад `https://YOUR-BOT-PROJECT.vercel.app`; потрібний скрипту |
| `HOST`, `PORT` | Локальний сервер, за замовчуванням `127.0.0.1:3005` |

Окремий webhook-секрет не використовується. У Vercel достатньо адреси меню та username бота. Токен BotFather потрібний тільки для реєстрації webhook: зберігайте його приватно, не додавайте в Git або `VITE_*`.

## Деплой на Vercel

Імпортуйте той самий GitHub-репозиторій як **новий окремий проєкт**:

| Налаштування | Значення |
| --- | --- |
| Project Name | `shaurmisha-bot` або інша вільна назва |
| Root Directory | `services/telegram-bot` |
| Framework Preset | Other |
| Node.js | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run check` |
| Output Directory | `public` — задано у `vercel.json` |

Для Web Standard функцій потрібний увімкнений Fluid compute (стандартний режим нових проєктів Vercel). Публічні статичні файли обмежені каталогом `public`; корінь бот-домену може повертати 404 — перевіряйте `/api/health`.

Додайте для Production лише `MINI_APP_URL` і `TELEGRAM_BOT_USERNAME`. `TELEGRAM_BOT_TOKEN` у Vercel не потрібен: Telegram виконує `sendMessage` з JSON-відповіді на webhook. Токен потрібний лише для локальних викликів `getMe`, `setWebhook` та `getWebhookInfo`.

Після деплою перевірте `https://YOUR-BOT-PROJECT.vercel.app/api/health`: має повернути `status: ok`, `service: telegram-bot`. Без потрібних налаштувань повертається 503. Адреса `/api/webhook` має бути доступна Telegram без сторінки входу Vercel. Перевірки джерела повідомлення у webhook немає.

Заповніть `BOT_PUBLIC_URL` і `TELEGRAM_BOT_TOKEN` у приватному `services/telegram-bot/.env.prod`, потім:

```bash
cd services/telegram-bot
npm ci
npm run webhook:prod
npm run webhook:info
```

Реєстрація перевіряє відповідність username токену, health endpoint та доступність webhook через no-op update. Лише після цього викликає `setWebhook`. Перевірка не надсилає повідомлень. Pending updates не видаляються, тому після реєстрації Telegram може доставити попередні команди за останні 24 години.

Один бот має один webhook: `webhook:dev` замінить production endpoint, якщо в dev використано той самий токен. Для ізольованих тестів використовуйте іншого Telegram-бота й окремий dev-токен.

Після реєстрації відкрийте @shaurmisha_pl_bot, надішліть `/start` і натисніть «Відкрити меню». Поточний клієнт — автономний перегляд меню: замовлення та сповіщення про них цей сервіс не реалізує.

## Локально та Docker

```bash
npm ci
npm run dev         # .env.dev, watch, порт 3005
npm run start:dev   # .env.dev
npm start           # .env.prod
npm run check
npm test
```

З кореня: `npm run dev:bot`, `npm run test:bot`. Docker опціональний, незалежний від Sync:

```bash
APP_ENV=dev docker compose --profile bot up -d --build telegram-bot
```

Локальний HTTP endpoint доступний тільки для перевірок; Telegram потребує публічного HTTPS URL. Тести перевіряють webhook без справжніх токенів і без повідомлень у Telegram.

## Контракт і обмеження

Webhook приймає POST JSON до 64 KiB без авторизації та без перевірки походження запиту. Заголовок `X-Telegram-Bot-Api-Secret-Token`, якщо він залишився від старої реєстрації, ігнорується. Групи, edited updates, повідомлення ботів та інші команди ігноруються з HTTP 200. Токени, тексти повідомлень і chat ID не логуються.

Відповідь — Telegram Bot API `sendMessage` у тілі webhook, без окремого мережевого виклику. Звичайний сторонній POST отримує JSON-відповідь і сам по собі не надсилає повідомлення в Telegram. Цей endpoint лише формує публічне привітання; він не використовується для замовлень, оплат чи персональних даних. Telegram не повертає результат такого `sendMessage`, тому для перевірки доставки треба натиснути `/start` у реальному чаті. Сервіс не зберігає `update_id`; при повторній доставці update можливе повторне привітання. Персональні дані та замовлення не зберігаються.

Джерела: [Telegram webhook responses](https://core.telegram.org/bots/api#making-requests-when-getting-updates), [setWebhook](https://core.telegram.org/bots/api#setwebhook), [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js).
