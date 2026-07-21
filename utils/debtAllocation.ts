import type { HouseLoan, PaymentSchedule } from "../types/domain.ts";
import type { Transaction } from "../types/transaction.ts";

export const FINANCEOS_ESTIMATED_SPLIT_NOTE = "Estimated principal/interest split from the mortgage rate.";

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

function paymentPeriodRate(annualRatePercent?: number, schedule?: PaymentSchedule): number | undefined {
  if (!(annualRatePercent && annualRatePercent > 0) || !schedule) return undefined;
  return annualRatePercent / 100 / paymentsPerYear(schedule);
}

function existingPrincipal(transaction: Transaction): number {
  if (isFinanceOsEstimatedSplit(transaction)) return 0;
  if (transaction.principalAmount != null) return toFixed2(transaction.principalAmount);
  if (transaction.interestAmount != null) return toFixed2(transaction.amount - transaction.interestAmount);
  return 0;
}

export function hasStoredDebtSplit(transaction: Transaction): boolean {
  return transaction.principalAmount != null || transaction.interestAmount != null;
}

export function isFinanceOsEstimatedSplit(transaction: Transaction): boolean {
  return hasStoredDebtSplit(transaction) && Boolean(transaction.notes?.includes(FINANCEOS_ESTIMATED_SPLIT_NOTE));
}

export function hasManualDebtSplit(transaction: Transaction): boolean {
  return hasStoredDebtSplit(transaction) && !isFinanceOsEstimatedSplit(transaction);
}

function estimateSplitBeforeKnownEnding({
  amount,
  annualRatePercent,
  endingOwing,
  schedule,
}: {
  amount: number;
  annualRatePercent?: number;
  endingOwing?: number;
  schedule: PaymentSchedule;
}): { principalAmount: number; interestAmount: number; openingOwing: number } | undefined {
  const rate = paymentPeriodRate(annualRatePercent, schedule);
  if (!(amount > 0) || !(endingOwing && endingOwing > 0) || !rate) {
    return undefined;
  }

  const openingOwing = toFixed2((endingOwing + amount) / (1 + rate));
  const interestAmount = toFixed2(Math.min(amount, openingOwing * rate));
  return {
    openingOwing,
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

export function buildHouseLoanSplitEstimates(
  loan: HouseLoan,
  transactions: Transaction[]
): Map<string, { principalAmount: number; interestAmount: number }> {
  const anchorDate = loan.balanceSnapshotDate;
  const anchorAmount = loan.balanceSnapshotAmount ?? loan.remaining;
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const estimates = new Map<string, { principalAmount: number; interestAmount: number }>();

  if (!anchorDate) {
    let runningOwing = loan.principal || anchorAmount;
    sorted.forEach((transaction) => {
      const split = hasManualDebtSplit(transaction)
        ? undefined
        : estimateHouseLoanSplit(loan, transaction.amount, runningOwing);
      const principal = split?.principalAmount ?? existingPrincipal(transaction);
      runningOwing = toFixed2(Math.max(0, runningOwing - principal));
      if (split) estimates.set(transaction.id, split);
    });
    return estimates;
  }

  let forwardOwing = anchorAmount;
  sorted
    .filter((transaction) => transaction.date > anchorDate)
    .forEach((transaction) => {
      const split = hasManualDebtSplit(transaction)
        ? undefined
        : estimateHouseLoanSplit(loan, transaction.amount, forwardOwing);
      const principal = split?.principalAmount ?? existingPrincipal(transaction);
      forwardOwing = toFixed2(Math.max(0, forwardOwing - principal));
      if (split) estimates.set(transaction.id, split);
    });

  let endingOwing = anchorAmount;
  [...sorted]
    .filter((transaction) => transaction.date <= anchorDate)
    .reverse()
    .forEach((transaction) => {
      const split = hasManualDebtSplit(transaction)
        ? undefined
        : estimateSplitBeforeKnownEnding({
            amount: transaction.amount,
            annualRatePercent: loan.interestRate,
            endingOwing,
            schedule: loan.schedule,
          });
      const principal = split?.principalAmount ?? existingPrincipal(transaction);
      endingOwing = split?.openingOwing ?? toFixed2(endingOwing + principal);
      if (split) estimates.set(transaction.id, split);
    });

  return estimates;
}
