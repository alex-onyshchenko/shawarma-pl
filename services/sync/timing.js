export const MINUTE = 60_000;
export const QUARTER = 15 * MINUTE;
export const DEFAULT_HOURS = { timeZone: 'Europe/Kyiv', openHour: 10, closeHour: 22 };

export function localParts(timestamp, timeZone = DEFAULT_HOURS.timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(timestamp).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function formatTime(timestamp, timeZone = DEFAULT_HOURS.timeZone) {
  return new Intl.DateTimeFormat('uk-UA', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(timestamp);
}

export function ceilQuarter(timestamp) {
  return Math.ceil(timestamp / QUARTER) * QUARTER;
}

export function getSlots(now, hours = DEFAULT_HOURS) {
  if (hours.closed) return [];
  const day = localParts(now, hours.timeZone).day;
  const slots = [];
  for (let slot = ceilQuarter(now + 15 * MINUTE); slot <= now + 26 * 60 * MINUTE; slot += QUARTER) {
    const local = localParts(slot, hours.timeZone);
    if (local.day === day && local.minutes >= (hours.openMinute ?? hours.openHour * 60) && local.minutes <= (hours.closeMinute ?? hours.closeHour * 60)) slots.push(slot);
  }
  return slots;
}

export function asapAvailable(now, hours = DEFAULT_HOURS) {
  if (hours.closed) return false;
  const start = localParts(now, hours.timeZone);
  const end = localParts(ceilQuarter(now + 15 * MINUTE), hours.timeZone);
  return start.day === end.day && start.minutes >= (hours.openMinute ?? hours.openHour * 60) && end.minutes <= (hours.closeMinute ?? hours.closeHour * 60);
}

export function normalizeTiming({ timingMode = 'asap', requestedReadyAt }, now, hours = DEFAULT_HOURS) {
  if (!['asap', 'scheduled'].includes(timingMode)) throw new Error('Невідомий режим часу');
  if (timingMode === 'asap') {
    if (!asapAvailable(now, hours)) throw new Error('Замовлення на зараз недоступне в цей час');
    return { timingMode, requestedReadyAt: null, baselineReadyAt: ceilQuarter(now + 15 * MINUTE), timingAdjusted: false };
  }
  const requested = typeof requestedReadyAt === 'number' ? requestedReadyAt : NaN;
  if (!Number.isFinite(requested) || requested % QUARTER !== 0) throw new Error('Оберіть час, кратний 15 хвилинам');
  const slots = getSlots(now, hours);
  const candidate = slots.find(slot => slot >= Math.max(requested, ceilQuarter(now + 15 * MINUTE)));
  if (!candidate) throw new Error('Сьогодні немає доступного часу. Оберіть слот у межах роботи закладу');
  return { timingMode, requestedReadyAt: requested, baselineReadyAt: candidate, timingAdjusted: candidate !== requested };
}

export function earlyStart(order, now) {
  return order.timingMode === 'scheduled' && order.confirmedReadyAt - now > 20 * MINUTE;
}

// Staff can schedule over the next 24 hours independently of opening hours.
export function getManualSlots(now) {
  const slots = [];
  for (let slot = ceilQuarter(now + 15 * MINUTE); slot <= now + 24 * 60 * MINUTE; slot += QUARTER) slots.push(slot);
  return slots;
}

export function normalizeManualTiming({ requestedReadyAt }, now) {
  if (typeof requestedReadyAt !== 'number' || !Number.isFinite(requestedReadyAt) || requestedReadyAt % QUARTER !== 0) throw new Error('Оберіть час, кратний 15 хвилинам');
  const readyAt = Math.max(requestedReadyAt, ceilQuarter(now + 15 * MINUTE));
  if (readyAt > now + 24 * 60 * MINUTE) throw new Error('Оберіть час у найближчі 24 години');
  return { timingMode: 'scheduled', requestedReadyAt, baselineReadyAt: readyAt, timingAdjusted: readyAt !== requestedReadyAt };
}
