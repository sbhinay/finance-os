import type { CreditCard } from "../types/creditCard.ts";
import type { FixedPayment, PaymentSchedule } from "../types/domain.ts";

function toFixed2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function scheduleDays(schedule: PaymentSchedule): number {
  switch (schedule) {
    case "Weekly":
      return 7;
    case "Bi-weekly":
      return 14;
    case "Semi-monthly":
      return 15;
    case "Annual":
      return 365;
    case "One-time":
      return 0;
    case "Monthly":
    default:
      return 30;
  }
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
      const firstDate = new Date(`${payment.date}T12:00:00`);
      if (payment.endDate && new Date(`${payment.endDate}T12:00:00`) < today) return;

      if (payment.schedule === "One-time") {
        if (firstDate >= today && firstDate <= end) {
          occurrences.push({ date: firstDate, amount: toFixed2(payment.amount), name: payment.name, source: payment.source });
        }
        return;
      }

      const interval = scheduleDays(payment.schedule);
      let current = firstDate;
      while (current < today) {
        current = new Date(current.getTime() + interval * 86400000);
      }
      while (current <= end && (!payment.endDate || current <= new Date(`${payment.endDate}T12:00:00`))) {
        occurrences.push({ date: new Date(current), amount: toFixed2(payment.amount), name: payment.name, source: payment.source });
        current = new Date(current.getTime() + interval * 86400000);
      }
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
  const end = new Date(today.getTime() + days * 86400000);
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

      const date = card.repaymentDueDate
        ? new Date(`${card.repaymentDueDate}T12:00:00`)
        : new Date(today.getTime() + 21 * 86400000);
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
