import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salesReport, reportPdf } from '../reports.js';

const DAY = 86400000;
const now = Date.parse('2026-10-24T12:00:00Z');
const point = { id: 'demo', name: 'ШаурМіша', address: 'м. Полтава, вул. Соборності, 46', timeZone: 'Europe/Kyiv' };
const sale = (id, age, changes = {}) => ({ id, pointId: 'demo', status: 'archived', createdAt: now - age * DAY, issuedAt: now - age * DAY,
  totalPrice: 230, items: [{ qty: 1, name: 'Фірмова шаурма · Середня (450 г)', unitPrice: 230 }], ...changes });

test('reports include all issued sales, exact rolling boundaries, legacy dates, and the chosen point only', () => {
  const orders = [sale('a', 0), sale('b', 7), sale('c', 8), sale('d', 21), sale('e', 22), sale('f', 30), sale('g', 31),
    sale('future', -1), sale('cancelled', 1, { status: 'cancelled' }), sale('new', 1, { status: 'new' }),
    sale('cooking', 1, { status: 'cooking' }), sale('ready', 1, { status: 'ready' }), sale('other-point', 1, { pointId: 'other' }),
    sale('legacy', 2, { issuedAt: undefined }), sale('issued-now', 50, { issuedAt: now })];
  const week = salesReport(orders, point, { now });
  assert.deepEqual(week.sales.map(sale => sale.id), ['b', 'legacy', 'a', 'issued-now']);
  assert.equal(week.estimatedDates, true);
  assert.equal(week.sales.find(sale => sale.id === 'legacy').estimatedDate, true);
  assert.equal(week.totals.amountKopecks, 92000);
  assert.equal(salesReport(orders, point, { period: '21', now }).count, 6);
  assert.equal(salesReport(orders, point, { period: '30', now }).count, 8);
  const many = salesReport(Array.from({ length: 123 }, (_, index) => sale(String(index), 1)), point, { now });
  assert.equal(many.count, 123);
});

test('commission rounds each sale in kopecks, accepts fractional rates and sums rows consistently', () => {
  const orders = [sale('a', 1, { totalPrice: 0.05 }), sale('b', 1, { totalPrice: 0.05 })];
  const report = salesReport(orders, point, { commission: '10', now });
  assert.deepEqual(report.totals, { amountKopecks: 10, commissionKopecks: 2, netKopecks: 8 });
  assert.equal(salesReport([sale('a', 1)], point, { commission: '2.75', now }).totals.commissionKopecks, 633);
  assert.equal(salesReport(orders, point, { commission: '100', now }).totals.netKopecks, 0);
  assert.equal(salesReport(orders, point, { commission: '0', now }).totals.commissionKopecks, 0);
  for (const commission of ['-1', '100.01', 'abc', 'NaN', '2.333', '', '1,5', 'Infinity']) {
    assert.throws(() => salesReport(orders, point, { commission, now }), { status: 400 });
  }
  for (const period of ['0', '8', '365', 'month', '']) assert.throws(() => salesReport(orders, point, { period, now }), { status: 400 });
  assert.equal(salesReport([], point, { now }).count, 0);
});

test('PDF export handles empty, multipage and very long recipes with embedded Cyrillic fonts', async () => {
  for (const orders of [[], Array.from({ length: 80 }, (_, index) => sale(String(index), 1)),
    [sale('long', 1, { items: Array.from({ length: 50 }, () => ({ qty: 99, name: 'Пекінська капуста з зеленню та часниковий соус карі '.repeat(4) })) })]]) {
    const pdf = await reportPdf(salesReport(orders, point, { commission: '5', now }));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.match(pdf.toString('latin1'), /\/FontFile2/);
    if (orders.length > 1) assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 1);
  }
});
