import type { PaymentSchedule } from "../types/domain.ts";

/**
 * Calendar-accurate schedule math on plain `YYYY-MM-DD` dates.
 *
 * All arithmetic runs on UTC calendar fields, so results never shift across
 * daylight-saving changes, and monthly/annual schedules follow real month
 * lengths instead of 30/365-day approximations.
 */

const DAY_MS = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m: m - 1, d };
}

function fromUtc(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function utcMs(iso: string): number {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m, d);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value);
}

/** Local calendar date of a Date object, as `YYYY-MM-DD` (never UTC-shifted). */
export function localIsoDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local-noon Date for an ISO date; safe for display and same-day comparisons. */
export function isoToLocalNoon(iso: string): Date {
  const { y, m, d } = parts(iso);
  return new Date(y, m, d, 12);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function isMonthEnd(iso: string): boolean {
  const { y, m, d } = parts(iso);
  return d === daysInMonth(y, m);
}

export function addDaysIso(iso: string, days: number): string {
  return fromUtc(utcMs(iso) + days * DAY_MS);
}

export function daysBetweenIso(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/** Same calendar day `months` later, clamped to the month length. */
export function addMonthsIso(iso: string, months: number, preferredDay?: number): string {
  const { y, m, d } = parts(iso);
  const total = y * 12 + m + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const day = Math.min(preferredDay ?? d, daysInMonth(year, month));
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Last calendar day of the month `monthsAhead` after the month containing `iso`. */
export function endOfMonthIso(iso: string, monthsAhead = 0): string {
  const shifted = addMonthsIso(`${iso.slice(0, 7)}-01`, monthsAhead);
  const { y, m } = parts(shifted);
  return `${y}-${pad(m + 1)}-${pad(daysInMonth(y, m))}`;
}

/**
 * Day of month a monthly/annual schedule should land on.
 *
 * `preferredDay` (usually the day of a stable start date) wins. Without it the
 * anchor's own day is used, and an anchor on its month's last day keeps
 * landing on month ends, matching how stored next-payment dates advance.
 */
function resolveMonthlyDay(anchor: string, preferredDay?: number): number {
  if (preferredDay && preferredDay >= 1 && preferredDay <= 31) return preferredDay;
  return isMonthEnd(anchor) ? 31 : parts(anchor).d;
}

/**
 * The `n`th occurrence of a schedule counted from `anchor` (n may be negative).
 * Each occurrence is computed from the anchor, never from the previous
 * occurrence, so short months cannot drift later dates.
 */
export function scheduleOccurrence(
  anchor: string,
  schedule: PaymentSchedule,
  n: number,
  preferredDay?: number
): string {
  switch (schedule) {
    case "Weekly":
      return addDaysIso(anchor, 7 * n);
    case "Bi-weekly":
      return addDaysIso(anchor, 14 * n);
    case "Semi-monthly":
      // Unchanged 15-day cadence: semi-monthly anchor days are not modelled yet.
      return addDaysIso(anchor, 15 * n);
    case "Annual":
      return addMonthsIso(anchor, 12 * n, preferredDay ?? parts(anchor).d);
    case "One-time":
      return anchor;
    case "Monthly":
    default:
      return addMonthsIso(anchor, n, resolveMonthlyDay(anchor, preferredDay));
  }
}

function approximateStepDays(schedule: PaymentSchedule): number {
  switch (schedule) {
    case "Weekly": return 7;
    case "Bi-weekly": return 14;
    case "Semi-monthly": return 15;
    case "Annual": return 365;
    default: return 30;
  }
}

/**
 * Every occurrence of a schedule within [from, to] (inclusive ISO dates).
 * `until` is an optional schedule end date. One-time schedules return the
 * anchor when it falls inside the window.
 */
export function scheduleOccurrencesBetween(
  anchor: string,
  schedule: PaymentSchedule,
  from: string,
  to: string,
  options: { until?: string; preferredDay?: number } = {}
): string[] {
  if (!isIsoDate(anchor) || from > to) return [];
  const last = options.until && options.until < to ? options.until : to;
  if (schedule === "One-time") {
    return anchor >= from && anchor <= last ? [anchor] : [];
  }

  const step = approximateStepDays(schedule);
  let n = Math.floor(daysBetweenIso(anchor, from) / step) - 2;
  while (scheduleOccurrence(anchor, schedule, n, options.preferredDay) >= from) n -= 1;

  const results: string[] = [];
  for (let guard = 0; guard < 2000; guard += 1, n += 1) {
    const occurrence = scheduleOccurrence(anchor, schedule, n, options.preferredDay);
    if (occurrence > last) break;
    if (occurrence >= from && results.at(-1) !== occurrence) results.push(occurrence);
  }
  return results;
}

/**
 * Occurrences of a "next due date" schedule within [from, to]. The anchor is
 * the next unpaid date, so nothing earlier than the anchor is returned.
 */
export function upcomingOccurrences(
  nextDue: string,
  schedule: PaymentSchedule,
  from: string,
  to: string,
  options: { until?: string; preferredDay?: number } = {}
): string[] {
  if (!isIsoDate(nextDue)) return [];
  const anchor = nextDue.slice(0, 10);
  return scheduleOccurrencesBetween(anchor, schedule, anchor > from ? anchor : from, to, options);
}

/** First occurrence strictly after `after` (or on/after when `inclusive`). */
export function nextScheduleOccurrence(
  anchor: string,
  schedule: PaymentSchedule,
  after: string,
  options: { inclusive?: boolean; preferredDay?: number } = {}
): string | null {
  if (!isIsoDate(anchor)) return null;
  if (schedule === "One-time") {
    return options.inclusive ? (anchor >= after ? anchor : null) : (anchor > after ? anchor : null);
  }
  const from = options.inclusive ? after : addDaysIso(after, 1);
  const window = scheduleOccurrencesBetween(anchor, schedule, from, addDaysIso(from, 400), {
    preferredDay: options.preferredDay,
  });
  return window[0] ?? null;
}

/** Day of month of an ISO date, for use as a schedule's preferred day. */
export function dayOfMonth(iso?: string): number | undefined {
  return isIsoDate(iso) ? parts(iso).d : undefined;
}
