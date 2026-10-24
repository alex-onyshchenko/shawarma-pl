import { createHmac, timingSafeEqual } from 'node:crypto';

export const ORDER_LIMITS = { perProduct: 5, totalItems: 10, cashMax: 500 };
export const webhookSecret = token => createHmac('sha256', token).update('shaurmisha-contact-webhook-v1').digest('hex');
const fail = (message, status = 400, code) => { throw Object.assign(new Error(message), { status, code }); };

export function normalizePhone(value) {
  if (typeof value !== 'string' || !/^\+?[\d\s().-]{7,30}$/.test(value.trim())) fail('Вкажіть коректний номер телефону');
  const digits = value.replace(/\D/g, '');
  if (!/^\d{7,15}$/.test(digits)) fail('Вкажіть коректний номер телефону');
  return '+' + digits;
}

export function createCustomers(db, token) {
  db.exec(`CREATE TABLE IF NOT EXISTS customers (
    telegram_id INTEGER PRIMARY KEY, verified_phone TEXT, contact_at INTEGER,
    contact_update_id INTEGER, prepayment_only INTEGER NOT NULL DEFAULT 0,
    no_show_at INTEGER, no_show_order_id TEXT
  )`);
  const get = id => db.prepare('SELECT * FROM customers WHERE telegram_id=?').get(id);
  return {
    get,
    profile(id) {
      const customer = get(id);
      return { phoneVerified: Boolean(customer?.verified_phone), phoneNumber: customer?.verified_phone || '',
        prepaymentOnly: Boolean(customer?.prepayment_only), limits: ORDER_LIMITS, onlinePaymentsAvailable: false };
    },
    contact(update, secret) {
      const expected = Buffer.from(token ? webhookSecret(token) : '');
      const supplied = Buffer.from(typeof secret === 'string' ? secret : '');
      if (!token || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) fail('Невірний підпис Telegram webhook', 401);
      const message = update?.message;
      const id = message?.from?.id;
      if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0 || !Number.isSafeInteger(id) || id <= 0 ||
        message.from.is_bot || message.chat?.type !== 'private' || message.chat.id !== id || message.contact?.user_id !== id ||
        !Number.isSafeInteger(message.date)) return { ignored: true };
      const phone = normalizePhone(message.contact.phone_number);
      db.prepare(`INSERT INTO customers(telegram_id,verified_phone,contact_at,contact_update_id) VALUES(?,?,?,?)
        ON CONFLICT(telegram_id) DO UPDATE SET verified_phone=excluded.verified_phone,
          contact_at=excluded.contact_at,contact_update_id=excluded.contact_update_id
        WHERE customers.contact_at IS NULL OR excluded.contact_at>customers.contact_at
          OR (excluded.contact_at=customers.contact_at AND excluded.contact_update_id>customers.contact_update_id)`)
        .run(id, phone, message.date, update.update_id);
      return { saved: true };
    },
    restrict(id, orderId) {
      if (!id) return;
      db.prepare(`INSERT INTO customers(telegram_id,prepayment_only,no_show_at,no_show_order_id) VALUES(?,1,?,?)
        ON CONFLICT(telegram_id) DO UPDATE SET prepayment_only=1,
          no_show_at=COALESCE(customers.no_show_at,excluded.no_show_at),
          no_show_order_id=COALESCE(customers.no_show_order_id,excluded.no_show_order_id)`)
        .run(id, Date.now(), String(orderId));
    },
    checkOrder(user, quote, data) {
      if (!user) fail('Відкрийте застосунок у Telegram та поділіться номером телефону', 401, 'PHONE_REQUIRED');
      const customer = get(user.id);
      if (!customer?.verified_phone) fail('Спочатку поділіться своїм номером у Telegram', 403, 'PHONE_REQUIRED');
      const quantities = new Map(); let total = 0;
      for (const item of quote.items) {
        total += item.qty;
        quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.qty);
      }
      if (total > ORDER_LIMITS.totalItems || [...quantities.values()].some(quantity => quantity > ORDER_LIMITS.perProduct)) {
        fail('Максимум 5 одиниць однієї позиції та 10 товарів у замовленні. Усі розміри враховуються разом.', 409, 'ORDER_LIMIT');
      }
      if (customer.prepayment_only || Math.round(quote.totalPrice * 100) > ORDER_LIMITS.cashMax * 100) {
        fail(customer.prepayment_only
          ? 'Після неявки замовлення доступні лише за передоплатою. Онлайн-оплату ще не підключено, тому оформлення тимчасово недоступне.'
          : 'Для замовлень понад 500 грн потрібна повна передоплата. Онлайн-оплату ще не підключено. Зменште кошик до 500 грн або замовте в закладі.', 409, 'PREPAYMENT_REQUIRED');
      }
      return normalizePhone(data.phoneNumber === undefined ? customer.verified_phone : data.phoneNumber);
    },
  };
}
