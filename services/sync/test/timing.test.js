import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTiming, getSlots, earlyStart, asapAvailable, MINUTE, getManualSlots, normalizeManualTiming } from '../timing.js';

const at = (time, date = '2026-10-22') => Date.parse(`${date}T${time}:00+03:00`);

test('quarter-hour slots start at current time + 15 minutes, including exact boundaries', () => {
  assert.equal(getSlots(at('14:22'))[0], at('14:45'));
  assert.deepEqual(getSlots(at('14:22')).slice(0, 3), [at('14:45'), at('15:00'), at('15:15')]);
  assert.equal(getSlots(at('14:30'))[0], at('14:45'));
  assert.equal(getSlots(at('14:30') + 1)[0], at('15:00'));
});

test('stale selection moves forward silently, with the original requested time retained', () => {
  const result = normalizeTiming({ timingMode: 'scheduled', requestedReadyAt: at('14:45') }, at('14:35'));
  assert.equal(result.baselineReadyAt, at('15:00'));
  assert.equal(result.requestedReadyAt, at('14:45'));
  assert.equal(result.timingAdjusted, true);
  assert.equal(normalizeTiming({ timingMode: 'scheduled', requestedReadyAt: at('14:45') }, at('14:30')).timingAdjusted, false);
});

test('ASAP adds 15 minutes then rounds upward to a quarter hour', () => {
  for (const [current, ready] of [['14:22', '14:45'], ['16:53', '17:15'], ['16:45', '17:00'], ['16:46', '17:15']]) {
    assert.equal(normalizeTiming({ timingMode: 'asap' }, at(current)).baselineReadyAt, at(ready));
  }
  assert.equal(normalizeTiming({ timingMode: 'asap' }, at('16:45') + 1).baselineReadyAt, at('17:15'));
  const hours = { timeZone: 'Europe/Kyiv', openMinute: 600, closeMinute: 1304 };
  assert.equal(asapAvailable(at('21:29'), hours), false);
  assert.throws(() => normalizeTiming({ timingMode: 'asap' }, at('21:29'), hours));
});

test('only today within business hours; no rollover into tomorrow', () => {
  assert.equal(getSlots(at('08:00'))[0], at('10:00'));
  assert.equal(getSlots(at('21:45')).at(-1), at('22:00'));
  assert.deepEqual(getSlots(at('21:45') + 1), []);
  assert.deepEqual(getSlots(at('23:55')), []);
  assert.throws(() => normalizeTiming({ timingMode: 'scheduled', requestedReadyAt: at('14:30', '2026-10-23') }, at('14:22')));
  assert.equal(asapAvailable(at('09:59')), false);
  assert.equal(asapAvailable(at('21:45')), true);
  assert.equal(asapAvailable(at('21:45') + 1), false);
});

test('reject arbitrary minutes and invalid timestamps before simulated payment', () => {
  for (const requestedReadyAt of [at('14:40'), NaN, Infinity, '14:45']) {
    assert.throws(() => normalizeTiming({ timingMode: 'scheduled', requestedReadyAt }, at('14:22')));
  }
});

test('early-start guard uses confirmed time; exactly 20 minutes is permitted', () => {
  const order = { timingMode: 'scheduled', confirmedReadyAt: at('18:15') };
  assert.equal(earlyStart(order, at('17:54')), true);
  assert.equal(earlyStart(order, at('17:55')), false);
  assert.equal(earlyStart({ ...order, timingMode: 'asap' }, at('14:00')), false);
});

test('slots remain aligned with Kyiv business hours across summer/winter time', () => {
  for (const now of [Date.parse('2026-03-29T05:00:00Z'), Date.parse('2026-10-25T06:00:00Z')]) {
    const slots = getSlots(now);
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' }).format(slots[0]);
    assert.equal(hour, '10:00');
    assert.ok(slots.every(slot => slot >= now + 15 * MINUTE));
  }
});


test('manual slots ignore business hours and include the next day within 24 hours', () => {
  const now = at('23:53');
  const slots = getManualSlots(now);
  assert.equal(slots[0], at('00:15', '2026-10-23'));
  assert.ok(slots.every(slot => slot >= now + 15 * MINUTE && slot <= now + 24 * 60 * MINUTE));
  assert.equal(normalizeManualTiming({ requestedReadyAt: slots[0] }, now).baselineReadyAt, slots[0]);
  assert.equal(normalizeManualTiming({ requestedReadyAt: at('23:45') }, now).baselineReadyAt, slots[0]);
  assert.throws(() => normalizeManualTiming({ requestedReadyAt: at('00:15', '2026-10-24') }, now));
  for (const requestedReadyAt of [null, NaN, Infinity, '23:55', now]) assert.throws(() => normalizeManualTiming({ requestedReadyAt }, now));
});
