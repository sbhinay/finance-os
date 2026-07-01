import { calculateDebtSummary, matchesMortgagePayment } from "../utils/debtReporting.ts";

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

console.log("Debt reporting validated: principal-only replay, interest reporting, and unsplit cash preservation.");
