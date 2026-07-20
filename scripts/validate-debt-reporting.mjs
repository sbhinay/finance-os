import { calculateDebtSummary, matchesMortgagePayment } from "../utils/debtReporting.ts";
import { estimateDebtPaymentSplit, estimateMissingHouseLoanSplits } from "../utils/debtAllocation.ts";

const base = {
  type: "loan_payment",
  subType: "mortgage",
  purpose: "mortgage_payment",
  sourceId: "bank",
  linkedPropertyId: "property-a",
  linkedHouseLoanId: "loan-a",
  recurringOriginType: "house_loan",
  recurringOriginId: "loan-a",
  currency: "CAD",
  status: "cleared",
};

const transactions = [
  {
    ...base,
    id: "before",
    amount: 1000,
    principalAmount: 600,
    interestAmount: 400,
    date: "2026-05-31",
    createdAt: "2026-06-01T12:00:00.000Z",
    description: "Mortgage Payment - Before Snapshot",
  },
  {
    ...base,
    id: "split",
    amount: 1000,
    principalAmount: 650,
    interestAmount: 350,
    date: "2026-06-15",
    createdAt: "2026-06-15T12:00:00.000Z",
    description: "Mortgage Payment - Split",
  },
  {
    ...base,
    id: "unsplit",
    amount: 1000,
    date: "2026-06-29",
    createdAt: "2026-06-29T12:00:00.000Z",
    description: "Mortgage Payment - Unsplit",
  },
];

const summary = calculateDebtSummary({
  transactions,
  matches: matchesMortgagePayment("loan-a", "property-a", true),
  balanceSnapshotAmount: 100000,
  balanceSnapshotDate: "2026-06-01",
  fallbackBalance: 99999,
});

if (summary.currentOwing !== 99350) {
  throw new Error(`Expected principal-only owing of 99350; received ${summary.currentOwing}.`);
}
if (summary.cashPaid !== 3000 || summary.principalPaid !== 1250 || summary.interestPaid !== 750) {
  throw new Error("Debt cash/principal/interest totals are incorrect.");
}
if (summary.unallocatedPaid !== 1000) {
  throw new Error("Unsplit payment must remain visible as unallocated cash.");
}
if (summary.rows.filter((row) => row.affectsBalance).length !== 2) {
  throw new Error("Only transactions after the snapshot date should participate in replay.");
}

const estimatedSplit = estimateDebtPaymentSplit({
  amount: 1000,
  annualRatePercent: 6,
  openingOwing: 100000,
  schedule: "Monthly",
});
if (!estimatedSplit || estimatedSplit.interestAmount !== 500 || estimatedSplit.principalAmount !== 500) {
  throw new Error(`Expected a 500/500 estimated monthly split; received ${JSON.stringify(estimatedSplit)}.`);
}

const estimatedRows = estimateMissingHouseLoanSplits(
  {
    id: "loan-a",
    propertyId: "property-a",
    name: "Primary",
    principal: 100000,
    remaining: 100000,
    balanceSnapshotAmount: 100000,
    balanceSnapshotDate: "2026-06-01",
    payment: 1000,
    schedule: "Monthly",
    source: "bank",
    startDate: "2026-01-01",
    endDate: "2050-01-01",
    nextPaymentDate: "2026-06-15",
    interestRate: 6,
  },
  [transactions[2]]
);
if (estimatedRows[0].principalAmount !== 500 || estimatedRows[0].interestAmount !== 500) {
  throw new Error("Missing mortgage splits should be estimable from rate, payment, and owing.");
}

console.log("Debt reporting validated: principal-only replay, interest reporting, unsplit cash preservation, and estimated mortgage splits.");
