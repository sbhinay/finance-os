import type { HouseLoan, PaymentSchedule } from "../types/domain.ts";
import type { Transaction } from "../types/transaction.ts";

function toFixed2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function paymentsPerYear(schedule: PaymentSchedule): number {
  switch (schedule) {
    case "Weekly":
      return 52;
    case "Bi-weekly":
      return 26;
    case "Semi-monthly":
      return 24;
    case "Annual":
      return 1;
    case "One-time":
      return 1;
    case "Monthly":
    default:
      return 12;
  }
}

export function estimateDebtPaymentSplit({
  amount,
  annualRatePercent,
  openingOwing,
  schedule,
}: {
  amount: number;
  annualRatePercent?: number;
  openingOwing?: number;
  schedule: PaymentSchedule;
}): { principalAmount: number; interestAmount: number } | undefined {
  if (!(amount > 0) || !(openingOwing && openingOwing > 0) || !(annualRatePercent && annualRatePercent > 0)) {
    return undefined;
  }

  const interestAmount = toFixed2(Math.min(
    amount,
    openingOwing * (annualRatePercent / 100) / paymentsPerYear(schedule)
  ));
  return {
    interestAmount,
    principalAmount: toFixed2(Math.max(0, amount - interestAmount)),
  };
}

export function estimateHouseLoanSplit(
  loan: HouseLoan,
  amount = loan.payment,
  openingOwing = loan.balanceSnapshotAmount ?? loan.remaining
) {
  return estimateDebtPaymentSplit({
    amount,
    annualRatePercent: loan.interestRate,
    openingOwing,
    schedule: loan.schedule,
  });
}

export function estimateMissingHouseLoanSplits(
  loan: HouseLoan,
  transactions: Transaction[]
): Transaction[] {
  let replayOwing = loan.balanceSnapshotAmount ?? loan.remaining;
  let historicalOwing = loan.principal || replayOwing;
  const anchorDate = loan.balanceSnapshotDate;

  return [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((transaction) => {
      const hasSplit = transaction.principalAmount != null || transaction.interestAmount != null;
      const openingOwing = anchorDate && transaction.date > anchorDate ? replayOwing : historicalOwing;
      const split = hasSplit
        ? undefined
        : estimateHouseLoanSplit(loan, transaction.amount, openingOwing);
      const principal = split?.principalAmount ?? transaction.principalAmount ?? 0;

      if (anchorDate && transaction.date > anchorDate) {
        replayOwing = toFixed2(Math.max(0, replayOwing - principal));
      } else {
        historicalOwing = toFixed2(Math.max(0, historicalOwing - principal));
      }

      if (!split) return transaction;
      return {
        ...transaction,
        principalAmount: split.principalAmount,
        interestAmount: split.interestAmount,
        notes: transaction.notes
          ? `${transaction.notes}\nEstimated principal/interest split from the mortgage rate.`
          : "Estimated principal/interest split from the mortgage rate.",
      };
    });
}
