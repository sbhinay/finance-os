import { RateEntry, PayrollDrawEntry } from "@/types/business";
import { PaymentSchedule } from "@/types/domain";

/** Round to 2 decimal places (avoids floating point drift) */
export function toFixed2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Format as CAD currency */
export function fmtCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(n);
}

/** Format a YYYY-MM-DD date string for display */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Convert any payment schedule amount to monthly equivalent */
export function toMonthly(amount: number, schedule: PaymentSchedule): number {
  const amt = Number(amount) || 0;
  switch (schedule) {
    case "Weekly":       return toFixed2(amt * 52 / 12);
    case "Bi-weekly":    return toFixed2(amt * 26 / 12);
    case "Semi-monthly": return toFixed2(amt * 2);
    case "Annual":       return toFixed2(amt / 12);
    default:             return toFixed2(amt); // Monthly or One-time
  }
}

/**
 * Find the rate entry effective on a given date.
 * Returns the most recent entry whose effectiveFrom <= dateStr.
 * Falls back to the first entry if none match.
 */
export function getRateOnDate<T extends RateEntry | PayrollDrawEntry>(
  rateHistory: T[] | undefined,
  dateStr: string
): T | null {
  if (!rateHistory || rateHistory.length === 0) return null;
  const d = dateStr || new Date().toISOString().split("T")[0];
  const sorted = [...rateHistory]
    .filter((r) => r.effectiveFrom <= d)
    .sort((a, b) => (b.effectiveFrom > a.effectiveFrom ? 1 : -1));
  return sorted.length > 0 ? sorted[0] : rateHistory[0];
}

/**
 * Roll an anchor date forward by schedule interval until it reaches today or later.
 * Used for display only — never mutates stored data.
 * Returns null for One-time schedules (date is fixed).
 */
export function getNextOccurrence(
  dateStr: string,
  schedule: PaymentSchedule
): string | null {
  if (!dateStr) return null;
  if (schedule === "One-time") return dateStr;

  const schedDays: Partial<Record<PaymentSchedule, number>> = {
    Weekly: 7,
    "Bi-weekly": 14,
    "Semi-monthly": 15,
    Monthly: 30,
    Annual: 365,
  };
  const interval = schedDays[schedule] || 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = new Date(dateStr + "T12:00:00");
  while (d < today) d = new Date(d.getTime() + interval * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Advance a date by exactly one schedule interval.
 * Used to update nextPaymentDate after a payment is confirmed.
 */
export function advanceOneInterval(dateStr: string, schedule: PaymentSchedule): string {
  if (!dateStr || schedule === "One-time") return dateStr;
  const schedDays: Partial<Record<PaymentSchedule, number>> = {
    Weekly: 7, "Bi-weekly": 14, "Semi-monthly": 15, Monthly: 30, Annual: 365,
  };
  const interval = schedDays[schedule] ?? 30;
  const d = new Date(dateStr + "T12:00:00");
  // For monthly, advance by calendar month to avoid drift
  if (schedule === "Monthly") {
    d.setMonth(d.getMonth() + 1);
  } else if (schedule === "Annual") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setTime(d.getTime() + interval * 86_400_000);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Current work fiscal year based on today's date.
 * FY = year+1 if month >= April (0-indexed month 3), else year.
 */
export function currentWorkFiscalYear(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
}

/**
 * Work fiscal year for a given work month + year.
 * Apr(4)–Dec → workYear+1; Jan(1)–Mar(3) → workYear.
 */
export function workFiscalYear(workMonth: number, workYear: number): number {
  return workMonth >= 4 ? workYear + 1 : workYear;
}

/**
 * Parse an HST quarter string like "Q1-2026" into months array and calendar year.
 * Returns null if the string doesn't match the expected format.
 */
export function parseHSTQuarter(
  quarter: string
): { months: number[]; year: number } | null {
  const match = quarter?.match(/^Q(\d)-(\d{4})$/);
  if (!match) return null;
  const q = Number(match[1]);
  const year = Number(match[2]);
  const monthMap: Record<number, number[]> = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12],
  };
  return { months: monthMap[q] || [], year };
}

/** Generate a short random ID (same algo as FinanceOS uid()) */
export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Ontario business days in a given month (excludes weekends + holidays) */
const ON_HOLIDAYS: Record<number, string[]> = {
  2024: ["2024-01-01","2024-02-19","2024-03-29","2024-05-20","2024-07-01","2024-08-05","2024-09-02","2024-10-14","2024-11-11","2024-12-25","2024-12-26"],
  2025: ["2025-01-01","2025-02-17","2025-04-18","2025-05-19","2025-07-01","2025-08-04","2025-09-01","2025-10-13","2025-11-11","2025-12-25","2025-12-26"],
  2026: ["2026-01-01","2026-02-16","2026-04-03","2026-05-18","2026-07-01","2026-08-03","2026-09-07","2026-10-12","2026-11-11","2026-12-25","2026-12-26"],
  2027: ["2027-01-01","2027-02-15","2027-03-26","2027-05-24","2027-07-01","2027-08-02","2027-09-06","2027-10-11","2027-11-11","2027-12-27","2027-12-28"],
};

export function getBizDaysInMonth(year: number, month: number): number {
  const holidays = ON_HOLIDAYS[year] || [];
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    const iso = date.toISOString().split("T")[0];
    if (dow !== 0 && dow !== 6 && !holidays.includes(iso)) count++;
  }
  return count;
}

// ─── Sort accounts/cards with primary first, then alphabetically ─────────────
export function sortByPrimary<T extends { name: string; primary?: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.primary && !b.primary) return -1;
    if (!a.primary && b.primary) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Build payment source options with primary items first
export function buildSourceOptions(
  accounts: Array<{ id: string; name: string; type: string; primary?: boolean }>,
  cards: Array<{ id: string; name: string; primary?: boolean }>,
  placeholder = "— Select account / card —"
): Array<{ value: string; label: string }> {
  const sortedAccounts = sortByPrimary(accounts);
  const sortedCards = sortByPrimary(cards);
  return [
    { value: "", label: placeholder },
    ...sortedAccounts.map((a) => ({ value: a.id, label: `${a.primary ? "★ " : ""}${a.name} (${a.type})` })),
    ...sortedCards.map((c) => ({ value: c.id, label: `${c.primary ? "★ " : ""}${c.name} (Credit)` })),
  ];
}
