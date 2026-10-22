# Shawarma Kitchen

Самостійний React/Vite-застосунок, порт `3001`. Потрібен Node.js 24.
Цей каталог можна скопіювати та використовувати без решти репозиторію.

```bash
npm ci
npm run dev
npm run build
npm run preview
```

За замовчуванням `/api` проксіюється до `http://127.0.0.1:3002`.
Налаштування — у `.env.example`: `SYNC_API_TARGET` для dev/preview proxy,
`VITE_SYNC_API_URL` для публічної адреси REST і SSE, без `/api` у кінці.
Порожній `VITE_SYNC_API_URL` використовує same-origin `/api`.
Vite вбудовує `VITE_*` у збірку; зміна потребує повторної збірки.
У production налаштуйте reverse proxy `/api` або HTTPS-адресу API.

Dockerfile збирає цей каталог незалежно. Наданий nginx-конфіг очікує Sync
за адресою `http://sync:3002` у контейнерній мережі та підтримує SSE.
Для іншого розміщення API підмонтуйте власний nginx-конфіг.
