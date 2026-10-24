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

// Every remaining whole minute today, through the cafe's scheduled closing time.
export function getReadyTimeSlots(now, hours) {
  if (!hours || hours.closed) return [];
  const zone = hours.timeZone || DEFAULT_HOURS.timeZone;
  const today = localParts(now, zone).day;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const close = hours.closeMinute ?? hours.closeHour * 60;
  const slots = [];
  for (let slot = (Math.floor(now / MINUTE) + 1) * MINUTE; slot <= now + 26 * 60 * MINUTE; slot += MINUTE) {
    const parts = Object.fromEntries(formatter.formatToParts(slot).map(part => [part.type, part.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    if (day !== today || Number(parts.hour) * 60 + Number(parts.minute) > close) break;
    slots.push(slot);
  }
  return slots;
}
