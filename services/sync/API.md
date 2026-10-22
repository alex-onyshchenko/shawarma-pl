# Поточний контракт Sync API

Базовий URL визначає розгортання; типовий локальний — `http://localhost:3002`.
Фронтенди можуть звертатися через same-origin reverse proxy `/api`.
Тіла запитів і відповідей — JSON, крім SSE. Авторизації поки немає.

| Метод | Шлях | Відповідь |
| --- | --- | --- |
| GET | `/api/health` | `{ status: "ok", service: "shawarma-sync" }` |
| GET | `/api/orders` | `{ orders: [], archivedOrders: [] }` |
| POST | `/api/orders` | HTTP 201, `{ success: true, order }` |
| PATCH | `/api/orders/:id/status` | `{ success: true, order }` |
| GET | `/api/events` | Потік `text/event-stream` |
| GET | `/api/analytics` | `summary`, `byPeriod`, `topProducts`, `ordersByHour`, `revenueByDay`, `recentOrders` |
| POST | `/api/reset` | `{ success: true }`; регенерує архівну демоісторію |

## Замовлення

```json
{
  "id": "1044",
  "time": "12:30",
  "createdAt": 1792661400000,
  "status": "new",
  "orderType": "pickup",
  "customerName": "Клієнт Telegram",
  "phoneNumber": "+380971234567",
  "totalPrice": 150,
  "deliveryAddress": null,
  "selectedLocation": null,
  "orderComment": "",
  "items": [
    {
      "name": "Класична Шаурма",
      "qty": 1,
      "lavash": null,
      "spiciness": null,
      "added": [],
      "removed": [],
      "comment": ""
    }
  ]
}
```

`POST` приймає ці поля, але встановлює `status: "new"`.
PATCH приймає `{ "status": "cooking" }`; використані інтерфейсами статуси:
`new`, `cooking`, `ready`, `archived`. Архівація переносить замовлення
в `archivedOrders` і додає `completedAt`. PATCH із `ready` може повернути
архівне замовлення до активних. Поточна реалізація не валідує повний перелік
статусів, унікальність ID чи ціни — це не гарантії контракту.

## SSE

Кожна подія має формат `event: <type>`, `data: <JSON>` і порожній рядок.

| Подія | Дані |
| --- | --- |
| `init` | `{ orders, archivedOrders }` одразу після підключення |
| `new_order` | Повний об'єкт нового замовлення |
| `order_status_updated` | `{ id, status, order }` |
| `reset` | `{ orders }` |

Історія подій не відтворюється. Після перепідключення використовуйте `init`
або `GET /api/orders` для відновлення стану. Reverse proxy не повинен
буферизувати SSE; nginx-конфіги фронтендів містять відповідні налаштування.
