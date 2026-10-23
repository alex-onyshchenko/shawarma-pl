import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PRODUCTS, MODIFIERS, CATEGORIES, SHAWARMA_PRODUCTS } from './catalogSeed.js';

export const DEMO_POINT_ID = 'demo';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, label, max = 200, required = true) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`Перевірте поле «${label}»`);
  return value.trim();
};
const number = (value, min, max, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`Перевірте поле «${label}»`);
  return Math.round(value * 100) / 100;
};
const boolean = (value, label) => { if (typeof value !== 'boolean') fail(`Перевірте поле «${label}»`); return value; };
const minutes = value => {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) fail('Вкажіть час у форматі ГГ:ХХ');
  const [h, m] = value.split(':').map(Number); return h * 60 + m;
};
function interval(value) {
  if (!value || typeof value !== 'object') fail('Невірний розклад');
  const closed = boolean(value.closed, 'Вихідний');
  const open = value.open || '10:00', close = value.close || '22:00';
  if (minutes(open) >= minutes(close)) fail('Закриття має бути пізніше відкриття');
  return { closed, open, close };
}
function validatePoint(input, old) {
  if ('active' in input || 'id' in input) fail('У MVP активна лише демо-точка. Нові точки залишаються неактивними', 409);
  const value = { ...old, ...input };
  const weeklyHours = value.weeklyHours;
  if (!Array.isArray(weeklyHours) || weeklyHours.length !== 7) fail('Потрібен розклад на 7 днів');
  if (!Array.isArray(value.exceptions) || value.exceptions.length > 100) fail('Невірні винятки розкладу');
  const dates = new Set();
  const exceptions = value.exceptions.map(item => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(item.date)) || new Date(item.date).toISOString().slice(0, 10) !== item.date || dates.has(item.date)) fail('Невірна або повторна дата винятку');
    dates.add(item.date); return { date: item.date, ...interval(item) };
  });
  try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format(); } catch { fail('Невірний часовий пояс'); }
  return {
    ...old,
    name: text(value.name, 'Назва', 100), address: text(value.address, 'Адреса'),
    description: text(value.description, 'Опис', 1500, false), phone: text(value.phone, 'Телефон', 50, false),
    metro: text(value.metro, 'Орієнтир', 100, false), timeZone: value.timeZone,
    acceptingOrders: boolean(value.acceptingOrders, 'Прийом замовлень'),
    onBreak: boolean(value.onBreak ?? false, 'Обідня перерва') && value.acceptingOrders,
    deliveryEnabled: boolean(value.deliveryEnabled, 'Доставка'),
    pickupDiscountPercent: number(value.pickupDiscountPercent, 0, 100, 'Знижка'),
    deliveryFee: number(value.deliveryFee, 0, 10000, 'Вартість доставки'),
    freeDeliveryFrom: number(value.freeDeliveryFrom, 0, 100000, 'Безкоштовна доставка'),
    weeklyHours: weeklyHours.map(interval), exceptions,
    updatedAt: Date.now(),
  };
}
function validateSizes(value = []) {
  if (!Array.isArray(value) || value.length > 10) fail('Невірні розміри товару');
  const ids = new Set();
  return value.map(size => {
    const id = text(size.id, 'ID розміру', 80);
    if (ids.has(id)) fail('Розміри не можуть повторюватися');
    ids.add(id);
    return { id, name: text(size.name, 'Розмір', 80), price: number(size.price, 0, 100000, 'Ціна розміру'), weight: text(size.weight, 'Вага розміру', 40) };
  });
}
function validateImage(value) {
  const url = text(value || '', 'Зображення', 1000, false);
  if (url && !/^https?:\/\//.test(url) && !/^\/menu\/[a-z0-9-]+\.jpg$/.test(url) && !/^\/media\/[a-f0-9-]+\.webp$/.test(url)) fail('Оберіть фотографію або http(s)-посилання');
  return url;
}
function validateProduct(input) {
  if (input.ingredientIds !== undefined && !Array.isArray(input.ingredientIds)) fail('Невірний список інгредієнтів');
  const imageUrl = validateImage(input.imageUrl);
  return {
    ingredientIds: Array.isArray(input.ingredientIds) ? [...input.ingredientIds] : [],
    sizes: validateSizes(input.sizes),
    name: text(input.name, 'Назва товару', 100), category: text(input.category, 'Категорія', 80),
    description: text(input.description || '', 'Опис товару', 1500, false),
    price: number(input.price, 0, 100000, 'Ціна'), weight: text(input.weight || '', 'Вага', 40, false),
    emoji: text(input.emoji || '🌯', 'Емодзі', 20), tag: text(input.tag || '', 'Позначка', 50, false), imageUrl,
    hasModifiers: boolean(input.hasModifiers ?? false, 'Модифікатори'),
    availableSpiciness: boolean(input.availableSpiciness ?? false, 'Гострота') && (input.hasModifiers ?? false),
  };
}
export function hoursForPoint(point, now = Date.now()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: point.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: point.timeZone, weekday: 'short' }).format(now);
  const day = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday];
  const rule = point.exceptions.find(rule => rule.date === date) || point.weeklyHours[day];
  return { timeZone: point.timeZone, openMinute: minutes(rule.open), closeMinute: minutes(rule.close), closed: rule.closed };
}

export function createStore(filename, seedHours = { timeZone: 'Europe/Kyiv', openHour: 10, closeHour: 22 }) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS points(id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)), data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_point ON points(active) WHERE active=1;
    CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS point_menu(point_id TEXT REFERENCES points(id), product_id TEXT REFERENCES products(id), price REAL NOT NULL, visible INTEGER NOT NULL, available INTEGER NOT NULL, sort_order INTEGER NOT NULL, PRIMARY KEY(point_id,product_id));
    CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, point_id TEXT, created_at INTEGER NOT NULL);
    `);
  if (!db.prepare('PRAGMA table_info(point_menu)').all().some(column => column.name === 'sizes')) db.exec("ALTER TABLE point_menu ADD COLUMN sizes TEXT NOT NULL DEFAULT '[]'");
  db.exec('PRAGMA user_version=2');
  const get = key => { const row = db.prepare('SELECT data FROM state WHERE key=?').get(key); return row ? JSON.parse(row.data) : null; };
  const set = (key, data) => db.prepare('INSERT INTO state(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key, JSON.stringify(data));
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const audit = (action, pointId = null) => db.prepare('INSERT INTO audit(action,point_id,created_at) VALUES(?,?,?)').run(action, pointId, Date.now());
  const changed = () => set('menuRevision', (get('menuRevision') || 0) + 1);
  if (!db.prepare('SELECT id FROM points WHERE id=?').get(DEMO_POINT_ID)) transaction(() => {
    const hour = h => `${String(h).padStart(2, '0')}:00`;
    const demo = {
      id: DEMO_POINT_ID, active: true, name: 'ШаурМіша', address: 'м. Полтава, вул. Соборності, 46',
      phone: '+380 (44) 777-88-99', metro: '',
      description: 'М’ясо на живому вугіллі, свіжі овочі та авторські соуси.', timeZone: seedHours.timeZone,
      acceptingOrders: true, onBreak: false, deliveryEnabled: false, pickupDiscountPercent: 0, deliveryFee: 50, freeDeliveryFrom: 350,
      weeklyHours: Array.from({ length: 7 }, () => ({ closed: false, open: hour(seedHours.openHour), close: hour(seedHours.closeHour) })),
      exceptions: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    db.prepare('INSERT INTO points VALUES(?,?,?)').run(demo.id, 1, JSON.stringify(demo));
    for (const [index, product] of PRODUCTS.entries()) {
      db.prepare('INSERT INTO products VALUES(?,?)').run(String(product.id), JSON.stringify({ ...product, id: String(product.id), imageUrl: product.imageUrl || '' }));
      db.prepare('INSERT INTO point_menu VALUES(?,?,?,?,?,?,?)').run(demo.id, String(product.id), product.price, 1, 1, index, JSON.stringify(product.sizes || []));
    }
    set('modifiers', MODIFIERS); changed(); audit('Создана демо-точка', demo.id);
  });
  // Apply this catalog replacement once; later admin edits are preserved.
  // Historical orders keep their own item snapshots.
  if (!get('shawarmaMenuV2')) transaction(() => {
    for (const row of db.prepare('SELECT id,data FROM products').all()) {
      if (JSON.parse(row.data).category === 'Шаурма') db.prepare('UPDATE point_menu SET visible=0 WHERE point_id=? AND product_id=?').run(DEMO_POINT_ID, row.id);
    }
    SHAWARMA_PRODUCTS.forEach((product, index) => {
      db.prepare('INSERT INTO products VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(product.id, JSON.stringify({ ...product, imageUrl: product.imageUrl || '' }));
      db.prepare('INSERT INTO point_menu VALUES(?,?,?,?,?,?,?) ON CONFLICT(point_id,product_id) DO UPDATE SET price=excluded.price,visible=1,available=1,sort_order=excluded.sort_order,sizes=excluded.sizes').run(DEMO_POINT_ID, product.id, product.price, 1, 1, index, JSON.stringify(product.sizes));
    });
    set('shawarmaMenuV2', true); changed(); audit('Меню шаурми замінено: Фірмова, Класична, Яловича', DEMO_POINT_ID);
  });
  const point = id => {
    const row = db.prepare('SELECT * FROM points WHERE id=?').get(id);
    if (!row) fail('Точку не знайдено', 404);
    return { onBreak: false, ...JSON.parse(row.data), id: row.id, active: !!row.active };
  };
  if (!get('pickupOnlyPoltavaV1')) transaction(() => {
    const updated = { ...point(DEMO_POINT_ID), address: 'м. Полтава, вул. Соборності, 46', metro: '', deliveryEnabled: false, pickupDiscountPercent: 0, updatedAt: Date.now() };
    db.prepare('UPDATE points SET data=? WHERE id=?').run(JSON.stringify(updated), DEMO_POINT_ID);
    set('pickupOnlyPoltavaV1', true); changed(); audit('Самовивіз у Полтаві без знижки; доставку вимкнено', DEMO_POINT_ID);
  });
  if (!get('signaturePopularV1')) transaction(() => {
    const row = db.prepare('SELECT data FROM products WHERE id=?').get('shawarma-signature');
    if (row) db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(row.data), tag: '🔥 Найпопулярніша' }), 'shawarma-signature');
    set('signaturePopularV1', true); changed();
  });
  if (!get('shaurmishaBrandV1')) transaction(() => {
    const updated = { ...point(DEMO_POINT_ID), name: 'ШаурМіша', updatedAt: Date.now() };
    db.prepare('UPDATE points SET data=? WHERE id=?').run(JSON.stringify(updated), DEMO_POINT_ID);
    set('shaurmishaBrandV1', true); changed(); audit('Назву закладу змінено на ШаурМіша', DEMO_POINT_ID);
  });
  if (!get('shawarmaPhotosV1')) transaction(() => {
    for (const name of ['classic', 'signature', 'beef']) {
      const id = `shawarma-${name}`;
      const row = db.prepare('SELECT data FROM products WHERE id=?').get(id);
      if (row) db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(row.data), imageUrl: `/menu/${name}.jpg` }), id);
    }
    set('shawarmaPhotosV1', true); changed(); audit('Додано фотографії шаурми', DEMO_POINT_ID);
  });
  if (!get('ingredientCatalogV1')) transaction(() => {
    const ingredients = [];
    const rows = db.prepare("SELECT DISTINCT p.id,p.data FROM products p JOIN point_menu m ON p.id=m.product_id WHERE m.visible=1").all();
    for (const row of rows) {
      const value = JSON.parse(row.data);
      if (value.category !== 'Шаурма') continue;
      const ingredientIds = (value.description || '').replace(/[.\s]+$/, '').split(',').map(name => name.trim()).filter(Boolean).map(name => {
        let ingredient = ingredients.find(item => item.name.toLocaleLowerCase('uk') === name.toLocaleLowerCase('uk'));
        if (!ingredient) { ingredient = { id: randomUUID(), name, imageUrl: '' }; ingredients.push(ingredient); }
        return ingredient.id;
      });
      db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify({ ...value, ingredientIds }), row.id);
    }
    set('ingredients', ingredients); set('ingredientCatalogV1', true); changed();
  });
  const ingredients = () => get('ingredients') || [];
  const validateIngredientIds = ids => {
    if (!Array.isArray(ids) || ids.length > 50 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !ingredients().some(item => item.id === id))) fail('Перевірте інгредієнти позиції');
  };
  const product = id => {
    const row = db.prepare('SELECT data FROM products WHERE id=?').get(String(id));
    if (!row) fail('Товар не знайдено', 404);
    return JSON.parse(row.data);
  };
  const menu = id => {
    point(id);
    const catalog = ingredients();
    return db.prepare('SELECT * FROM point_menu WHERE point_id=? ORDER BY sort_order,product_id').all(id).map(row => ({
      ...product(row.product_id), sizes: JSON.parse(row.sizes), price: row.price, visible: !!row.visible, available: !!row.available, sortOrder: row.sort_order,
    })).map(item => {
      const selected = (item.ingredientIds || []).map(id => catalog.find(value => value.id === id)).filter(Boolean);
      return { ...item, ingredients: selected, description: selected.length ? selected.map(value => value.name).join(', ') + '.' : item.description };
    });
  };
  const store = {
    db, get, set, point, product, menu, ingredients,
    saveIngredient(id, input) {
      const catalog = ingredients();
      const existing = id ? catalog.find(item => item.id === id) : null;
      if (id && !existing) fail('Інгредієнт не знайдено', 404);
      const value = { ...existing, ...input };
      const name = text(value.name, 'Назва інгредієнта', 100);
      if (catalog.some(item => item.id !== id && item.name.toLocaleLowerCase('uk') === name.toLocaleLowerCase('uk'))) fail('Інгредієнт із такою назвою вже існує', 409);
      const saved = { id: id || randomUUID(), name, imageUrl: validateImage(value.imageUrl) };
      transaction(() => { set('ingredients', existing ? catalog.map(item => item.id === id ? saved : item) : [...catalog, saved]); changed(); audit(existing ? 'Оновлено інгредієнт' : 'Додано інгредієнт'); });
      return saved;
    },
    points: () => db.prepare('SELECT id FROM points ORDER BY active DESC,rowid').all().map(row => point(row.id)),
    products: () => db.prepare('SELECT data FROM products ORDER BY rowid').all().map(row => JSON.parse(row.data)),
    activePoint: () => point(DEMO_POINT_ID),
    publicMenu() {
      const current = point(DEMO_POINT_ID);
      const products = menu(current.id).filter(item => item.visible);
      const categories = [...new Set(products.map(item => item.category))].map(name => CATEGORIES.find(item => item.name === name) || { id: name, name, icon: '🍽️' });
      return { point: current, products, categories, modifiers: get('modifiers'), revision: get('menuRevision') };
    },
    createPoint(input) {
      const { id, active, ...defaults } = point(DEMO_POINT_ID);
      const created = validatePoint(input, { ...defaults, id: randomUUID(), active: false, createdAt: Date.now(), name: '', address: '', exceptions: [] });
      transaction(() => { db.prepare('INSERT INTO points VALUES(?,?,?)').run(created.id, 0, JSON.stringify(created)); audit('Создан черновик точки', created.id); changed(); });
      return created;
    },
    updatePoint(id, input) {
      const updated = validatePoint(input, point(id));
      transaction(() => { db.prepare('UPDATE points SET data=? WHERE id=?').run(JSON.stringify(updated), id); audit('Изменены настройки точки', id); changed(); });
      return updated;
    },
    createProduct(pointId, input) {
      point(pointId);
      const created = { ...validateProduct(input), id: randomUUID() };
      validateIngredientIds(created.ingredientIds);
      if (created.sizes.length) created.price = Math.min(...created.sizes.map(size => size.price));
      const sortOrder = input.sortOrder ?? menu(pointId).length;
      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) fail('Невірний порядок');
      transaction(() => {
        db.prepare('INSERT INTO products VALUES(?,?)').run(created.id, JSON.stringify(created));
        db.prepare('INSERT INTO point_menu VALUES(?,?,?,?,?,?,?)').run(pointId, created.id, created.price, Number(boolean(input.visible ?? true, 'Видимість')), Number(boolean(input.available ?? true, 'Наявність')), sortOrder, JSON.stringify(created.sizes));
        audit('Добавлена позиция меню', pointId); changed();
      });
      return created;
    },
    updateMenu(pointId, productId, input) {
      point(pointId); const current = product(productId);
      const existing = menu(pointId).find(item => item.id === String(productId));
      const updated = input.product ? { ...validateProduct({ ...current, ...input.product, sizes: current.sizes, price: current.price }), id: current.id } : current;
      validateIngredientIds(updated.ingredientIds || []);
      const entry = { sizes: existing?.sizes ?? updated.sizes ?? [], price: existing?.price ?? updated.price, visible: existing?.visible ?? true, available: existing?.available ?? true, sortOrder: existing?.sortOrder ?? menu(pointId).length, ...input };
      const sizes = validateSizes(entry.sizes);
      const price = sizes.length ? Math.min(...sizes.map(size => size.price)) : number(entry.price, 0, 100000, 'Ціна');
      boolean(entry.visible, 'Видимість'); boolean(entry.available, 'Наявність');
      if (!Number.isInteger(entry.sortOrder) || entry.sortOrder < 0 || entry.sortOrder > 10000) fail('Невірний порядок');
      transaction(() => {
        db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify(updated), String(productId));
        db.prepare('INSERT INTO point_menu VALUES(?,?,?,?,?,?,?) ON CONFLICT(point_id,product_id) DO UPDATE SET price=excluded.price,visible=excluded.visible,available=excluded.available,sort_order=excluded.sort_order,sizes=excluded.sizes').run(pointId, String(productId), price, Number(entry.visible), Number(entry.available), entry.sortOrder, JSON.stringify(sizes));
        audit('Изменена позиция меню', pointId); changed();
      });
      return menu(pointId).find(item => item.id === String(productId));
    },
    updateModifiers(input) {
      const result = {};
      for (const key of ['add', 'remove', 'lavash', 'spiciness']) {
        if (!Array.isArray(input[key]) || input[key].length > 50 || (['lavash', 'spiciness'].includes(key) && !input[key].length)) fail('Невірні модифікатори');
        const seen = new Set();
        result[key] = input[key].map(item => {
          const id = key === 'spiciness' ? number(item.level, 0, 3, 'Рівень гостроти') : text(item.id, 'ID', 80);
          if (seen.has(id) || (key === 'spiciness' && !Number.isInteger(id))) fail('Модифікатори не можуть повторюватися');
          seen.add(id);
          return key === 'spiciness' ? { level: id, label: text(item.label, 'Назва', 100), icon: text(item.icon || '🌶️', 'Іконка', 20) } : {
            id, name: text(item.name, 'Назва', 100), ...(['add', 'lavash'].includes(key) ? { price: number(item.price, 0, 10000, 'Ціна') } : {}), ...(key === 'add' ? { icon: text(item.icon || '➕', 'Іконка', 20) } : {}),
          };
        });
      }
      transaction(() => { set('modifiers', result); audit('Изменены модификаторы'); changed(); });
      return result;
    },
    audit: () => db.prepare('SELECT action,point_id AS pointId,created_at AS createdAt FROM audit ORDER BY id DESC LIMIT 30').all(),
    close: () => db.close(),
  };
  return store;
}

export function quoteOrder(store, data) {
  const point = store.activePoint();
  if (data.pointId && data.pointId !== point.id) fail('Ця точка не приймає замовлення', 409);
  const menu = store.menu(point.id), modifiers = store.get('modifiers');
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) fail('Перевірте склад замовлення');
  if (data.orderType && !['pickup', 'delivery'].includes(data.orderType)) fail('Невірний спосіб отримання');
  if (data.orderType === 'delivery' && !point.deliveryEnabled) fail('Доставка з цієї точки недоступна', 409);
  const items = data.items.map(item => {
    const product = menu.find(product => item.productId ? product.id === String(item.productId) : product.name === item.name);
    if (!product?.visible || !product.available) fail('Позиція недоступна. Перевірте кошик', 409);
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) fail('Невірна кількість товару');
    const selected = (group, ids, names) => {
      const requested = ids ?? names ?? [];
      if (!Array.isArray(requested) || new Set(requested).size !== requested.length) fail('Невірні модифікатори');
      return requested.map(value => { const found = group.find(mod => mod.id === value || mod.name === value); if (!found) fail('Модифікатор недоступний. Оновіть кошик', 409); return found; });
    };
    const added = selected(modifiers.add, item.addedModifierIds, item.added);
    const removed = selected(modifiers.remove, item.removedModifierIds, item.removed);
    const lavash = item.lavashId || item.lavash ? modifiers.lavash.find(mod => mod.id === item.lavashId || mod.name === item.lavash) : null;
    if ((item.lavashId || item.lavash) && !lavash) fail('Лаваш недоступний. Оновіть кошик', 409);
    if (!product.hasModifiers && (added.length || removed.length || lavash)) fail('Цей товар не має модифікаторів');
    const spiciness = product.availableSpiciness ? modifiers.spiciness.find(mod => mod.level === (item.spicinessLevel ?? modifiers.spiciness[0].level)) : null;
    if (product.availableSpiciness && !spiciness) fail('Невірний рівень гостроти');
    const size = product.sizes?.find(size => size.id === item.sizeId);
    if ((product.sizes?.length && !size) || (item.sizeId && !size)) fail('Розмір недоступний. Оберіть розмір ще раз', 409);
    const toastingLevel = product.category === 'Шаурма' ? (item.toastingLevel ?? 'normal') : null;
    if (product.category === 'Шаурма' && !['light', 'normal', 'strong'].includes(toastingLevel)) fail('Невірний варіант підсмаження лаваша');
    if (item.toastingLevel != null && product.category !== 'Шаурма') fail('Підсмаження доступне лише для шаурми');
    const unitPrice = Math.round(((size?.price ?? product.price) + (lavash?.price || 0) + added.reduce((sum, mod) => sum + mod.price, 0)) * 100) / 100;
    return { productId: product.id, name: size ? `${product.name} · ${size.name} (${size.weight})` : product.name, sizeId: size?.id || null, sizeName: size?.name || null, toastingLevel, toasting: toastingLevel === 'strong' ? 'Сильніше' : toastingLevel === 'light' ? 'Слабіше' : toastingLevel === 'normal' ? 'Звичайна піджарка' : null, weight: size?.weight || product.weight, qty: item.qty, unitPrice, lavash: lavash?.name || null, spiciness: spiciness?.label || null, added: added.map(mod => mod.name), removed: removed.map(mod => mod.name), comment: text(item.comment || '', 'Коментар', 1000, false) };
  });
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0) * 100) / 100;
  const code = String(data.promoCode || '').trim().toUpperCase();
  const promo = ['LAVASH', 'LAVASH10', 'SHAVA10'].includes(code) ? 10 : ['VUHILLYA', 'TOP'].includes(code) ? 15 : 0;
  const discount = Math.round(subtotal * (data.orderType === 'delivery' ? 0 : point.pickupDiscountPercent) / 100) + Math.round(subtotal * promo / 100);
  const deliveryFee = data.orderType === 'delivery' && subtotal < point.freeDeliveryFrom ? point.deliveryFee : 0;
  const totalPrice = Math.max(0, Math.round((subtotal - discount + deliveryFee) * 100) / 100);
  if (data.expectedTotal !== undefined && (typeof data.expectedTotal !== 'number' || !Number.isFinite(data.expectedTotal))) fail('Невірна сума');
  if (data.expectedTotal !== undefined && Math.abs(data.expectedTotal - totalPrice) > 0.001) fail('Ціни змінилися. Перевірте оновлений кошик і підтвердьте замовлення ще раз', 409);
  return { items, subtotal, discount, deliveryFee, totalPrice, pointId: point.id, pointName: point.name, selectedLocation: { id: point.id, name: point.address, metro: point.metro } };
}
