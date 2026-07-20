import { buildDebtRepaymentProjection, estimateCardRepaymentAmount } from "../utils/debtProjection.ts";

const today = new Date("2026-06-01T12:00:00");

const baseCard = {
  id: "card-a",
  name: "Test Visa",
  issuer: "Test",
  type: "personal",
  limitAmount: 5000,
  openingBalance: 1000,
  linkedAccountId: "bank-a",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const full = buildDebtRepaymentProjection({
  cards: [{
    ...baseCard,
    repaymentProjectionEnabled: true,
    repaymentStrategy: "full_current_balance",
    repaymentDueDate: "2026-06-15",
  }],
  fixedPayments: [],
  today,
  days: 30,
});
if (full.repaymentPressure !== 1000 || full.events[0]?.amount !== -1000) {
  throw new Error(`Full current balance should create a $1000 pressure event; received ${JSON.stringify(full)}.`);
}

const minimum = estimateCardRepaymentAmount({
  ...baseCard,
  openingBalance: 1000,
  repaymentProjectionEnabled: true,
  repaymentStrategy: "minimum",
  repaymentMinimumAmount: 10,
  repaymentMinimumPercent: 3,
});
if (minimum !== 30) {
  throw new Error(`Minimum estimate should use 3% of $1000; received ${minimum}.`);
}

const plannedOffset = buildDebtRepaymentProjection({
  cards: [{
    ...baseCard,
    repaymentProjectionEnabled: true,
    repaymentStrategy: "full_current_balance",
    repaymentDueDate: "2026-06-15",
  }],
  fixedPayments: [{
    id: "fp-card",
    name: "Planned card payment",
    amount: 400,
    schedule: "One-time",
    date: "2026-06-10",
    source: "bank-a",
    destinationId: "card-a",
    transactionType: "transfer",
    subType: "cc_payment",
  }],
  today,
  days: 30,
});
if (plannedOffset.repaymentPressure !== 600 || plannedOffset.plannedExistingPayments !== 400) {
  throw new Error(`Existing planned card payment should reduce pressure to $600; received ${JSON.stringify(plannedOffset)}.`);
}

const missingStrategy = buildDebtRepaymentProjection({
  cards: [baseCard],
  fixedPayments: [],
  today,
  days: 30,
});
if (missingStrategy.unplannedExposure !== 1000 || missingStrategy.warnings[0]?.reason !== "no_strategy") {
  throw new Error(`Card owing without a strategy should become unplanned exposure; received ${JSON.stringify(missingStrategy)}.`);
}

const loc = buildDebtRepaymentProjection({
  cards: [{
    ...baseCard,
    id: "loc-a",
    name: "LOC",
    type: "loc",
    openingBalance: 3000,
    repaymentProjectionEnabled: true,
    repaymentStrategy: "fixed_amount",
    repaymentFixedAmount: 500,
    repaymentDueDate: "2026-06-20",
  }],
  fixedPayments: [],
  today,
  days: 30,
});
if (loc.repaymentPressure !== 500 || !loc.events[0]?.label.includes("LOC repayment pressure")) {
  throw new Error(`LOC fixed repayment should produce LOC pressure event; received ${JSON.stringify(loc)}.`);
}

console.log("Debt projection validated: card payoff, LOC repayment, minimum estimate, planned-payment offset, and no-strategy warnings.");
