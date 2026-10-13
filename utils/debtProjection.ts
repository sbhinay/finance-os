import type { CreditCard } from "../types/creditCard.ts";
import type { FixedPayment } from "../types/domain.ts";
import { addDaysIso, dayOfMonth, isoToLocalNoon, localIsoDate, nextScheduleOccurrence, upcomingOccurrences } from "./scheduleDates.ts";

function isoOf(date: Date): string {
  return localIsoDate(date);
}

function toFixed2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cardPaymentOccurrences(card: CreditCard, fixedPayments: FixedPayment[], today: Date, end: Date) {
  const occurrences: Array<{ date: Date; amount: number; name: string; source?: string }> = [];
  fixedPayments
    .filter((payment) =>
      !payment.archived
      && payment.transactionType === "transfer"
      && (payment.subType === "cc_payment" || payment.subType === "loc_payment")
      && payment.destinationId === card.id
    )
    .forEach((payment) => {
      upcomingOccurrences(payment.date, payment.schedule, isoOf(today), isoOf(end), {
        until: payment.endDate,
        preferredDay: dayOfMonth(payment.startDate),
      }).forEach((iso) => {
        occurrences.push({ date: isoToLocalNoon(iso), amount: toFixed2(payment.amount), name: payment.name, source: payment.source });
      });
    });
  return occurrences;
}

export interface DebtProjectionEvent {
  date: Date;
  label: string;
  amount: number;
  account?: string;
  cardId: string;
}

export interface DebtProjectionWarning {
  cardId: string;
  name: string;
  owing: number;
  plannedAmount: number;
  unplannedAmount: number;
  reason: "no_strategy" | "missing_pay_from";
}

export interface DebtProjectionSummary {
  events: DebtProjectionEvent[];
  warnings: DebtProjectionWarning[];
  repaymentPressure: number;
  unplannedExposure: number;
  plannedExistingPayments: number;
}

export function estimateCardRepaymentAmount(card: CreditCard): number {
  const owing = toFixed2(Math.max(0, card.openingBalance));
  if (owing <= 0) return 0;

  switch (card.repaymentStrategy) {
    case "fixed_amount":
      return toFixed2(Math.min(owing, Math.max(0, card.repaymentFixedAmount ?? 0)));
    case "minimum": {
      const percent = card.repaymentMinimumPercent ?? 3;
      const amount = Math.max(card.repaymentMinimumAmount ?? 10, owing * (percent / 100));
      return toFixed2(Math.min(owing, amount));
    }
    case "statement_balance":
    case "full_current_balance":
    default:
      return owing;
  }
}

export function buildDebtRepaymentProjection({
  cards,
  fixedPayments,
  today,
  days,
}: {
  cards: CreditCard[];
  fixedPayments: FixedPayment[];
  today: Date;
  days: number;
}): DebtProjectionSummary {
  const end = isoToLocalNoon(addDaysIso(isoOf(today), days));
  const events: DebtProjectionEvent[] = [];
  const warnings: DebtProjectionWarning[] = [];
  let repaymentPressure = 0;
  let unplannedExposure = 0;
  let plannedExistingPayments = 0;

  cards
    .filter((card) => card.active !== false && card.openingBalance > 0)
    .forEach((card) => {
      const existing = cardPaymentOccurrences(card, fixedPayments, today, end);
      const existingAmount = toFixed2(existing.reduce((sum, occurrence) => sum + occurrence.amount, 0));
      plannedExistingPayments = toFixed2(plannedExistingPayments + existingAmount);

      if (!card.repaymentProjectionEnabled) {
        const unplannedAmount = toFixed2(Math.max(0, card.openingBalance - existingAmount));
        if (unplannedAmount > 0) {
          unplannedExposure = toFixed2(unplannedExposure + unplannedAmount);
          warnings.push({
            cardId: card.id,
            name: card.name,
            owing: toFixed2(card.openingBalance),
            plannedAmount: existingAmount,
            unplannedAmount,
            reason: "no_strategy",
          });
        }
        return;
      }

      if (!card.linkedAccountId) {
        const target = estimateCardRepaymentAmount(card);
        const unplannedAmount = toFixed2(Math.max(0, target - existingAmount));
        unplannedExposure = toFixed2(unplannedExposure + unplannedAmount);
        warnings.push({
          cardId: card.id,
          name: card.name,
          owing: toFixed2(card.openingBalance),
          plannedAmount: existingAmount,
          unplannedAmount,
          reason: "missing_pay_from",
        });
        return;
      }

      const target = estimateCardRepaymentAmount(card);
      const pressure = toFixed2(Math.max(0, target - existingAmount));
      if (pressure <= 0) return;

      // A due date already behind us rolls forward to this month's/next month's same day.
      const dueIso = card.repaymentDueDate
        ? (card.repaymentDueDate >= isoOf(today)
          ? card.repaymentDueDate
          : nextScheduleOccurrence(card.repaymentDueDate, "Monthly", isoOf(today), { inclusive: true }))
        : null;
      const date = dueIso
        ? isoToLocalNoon(dueIso)
        : isoToLocalNoon(addDaysIso(isoOf(today), 21));
      if (date < today || date > end) return;

      repaymentPressure = toFixed2(repaymentPressure + pressure);
      events.push({
        date,
        label: `${card.type === "loc" ? "LOC" : "Card"} repayment pressure - ${card.name}`,
        amount: -pressure,
        account: card.linkedAccountId,
        cardId: card.id,
      });
    });

  return {
    events: events.sort((a, b) => a.date.getTime() - b.date.getTime()),
    warnings,
    repaymentPressure,
    unplannedExposure,
    plannedExistingPayments,
  };
}

/**
 * Date a line-of-credit draw is projected to be repaid: the first LOC payment
 * date strictly after the draw (and not before the stored next payment date),
 * following the LOC's monthly Next Payment Date.
 * Returns null when the LOC has no payment date set.
 */
export function locDrawRepaymentDate(loc: Pick<CreditCard, "repaymentDueDate">, drawIso: string): string | null {
  if (!loc.repaymentDueDate) return null;
  // The stored date is the next unpaid payment, so never repay before it.
  if (loc.repaymentDueDate > drawIso) return loc.repaymentDueDate;
  return nextScheduleOccurrence(loc.repaymentDueDate, "Monthly", drawIso);
}
