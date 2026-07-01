import type { Transaction } from "../types/transaction.ts";

function toFixed2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface DebtPaymentRow {
  transaction: Transaction;
  principal: number;
  interest: number;
  unallocated: number;
  affectsBalance: boolean;
}

export interface DebtSummary {
  anchorAmount: number;
  anchorDate?: string;
  currentOwing: number;
  cashPaid: number;
  principalPaid: number;
  interestPaid: number;
  unallocatedPaid: number;
  rows: DebtPaymentRow[];
}

function splitPayment(transaction: Transaction) {
  const hasSplit = transaction.principalAmount != null || transaction.interestAmount != null;
  if (!hasSplit) {
    return { principal: 0, interest: 0, unallocated: transaction.amount };
  }
  return {
    principal: toFixed2(transaction.principalAmount ?? 0),
    interest: toFixed2(transaction.interestAmount ?? 0),
    unallocated: 0,
  };
}

export function calculateDebtSummary({
  transactions,
  matches,
  balanceSnapshotAmount,
  balanceSnapshotDate,
  fallbackBalance,
}: {
  transactions: Transaction[];
  matches: (transaction: Transaction) => boolean;
  balanceSnapshotAmount?: number;
  balanceSnapshotDate?: string;
  fallbackBalance: number;
}): DebtSummary {
  const hasAnchor = balanceSnapshotAmount != null && Boolean(balanceSnapshotDate);
  const anchorAmount = toFixed2(hasAnchor ? balanceSnapshotAmount : fallbackBalance);
  const rows = transactions
    .filter((transaction) =>
      transaction.status !== "pending"
      && transaction.type === "loan_payment"
      && matches(transaction)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((transaction): DebtPaymentRow => {
      const split = splitPayment(transaction);
      return {
        transaction,
        ...split,
        affectsBalance: hasAnchor && transaction.date > balanceSnapshotDate!,
      };
    });

  const principalAfterAnchor = rows
    .filter((row) => row.affectsBalance)
    .reduce((sum, row) => sum + row.principal, 0);

  return {
    anchorAmount,
    anchorDate: hasAnchor ? balanceSnapshotDate : undefined,
    currentOwing: toFixed2(Math.max(0, anchorAmount - principalAfterAnchor)),
    cashPaid: toFixed2(rows.reduce((sum, row) => sum + row.transaction.amount, 0)),
    principalPaid: toFixed2(rows.reduce((sum, row) => sum + row.principal, 0)),
    interestPaid: toFixed2(rows.reduce((sum, row) => sum + row.interest, 0)),
    unallocatedPaid: toFixed2(rows.reduce((sum, row) => sum + row.unallocated, 0)),
    rows,
  };
}

export function matchesVehicleFinancePayment(vehicleId: string) {
  return (transaction: Transaction) =>
    transaction.linkedVehicleId === vehicleId
    && (
      transaction.purpose === "vehicle_finance_payment"
      || transaction.subType === "bank_loan"
    );
}

export function matchesMortgagePayment(
  houseLoanId: string,
  propertyId: string | undefined,
  propertyHasSingleMortgage: boolean
) {
  return (transaction: Transaction) =>
    transaction.linkedHouseLoanId === houseLoanId
    || (
      transaction.recurringOriginType === "house_loan"
      && transaction.recurringOriginId === houseLoanId
    )
    || (
      propertyHasSingleMortgage
      && Boolean(propertyId)
      && transaction.linkedPropertyId === propertyId
      && transaction.subType === "mortgage"
    );
}
