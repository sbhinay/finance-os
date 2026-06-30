import fs from "node:fs";
import path from "node:path";

const fixturePath = path.resolve(
  process.argv[2] ?? "C:/Users/singha2/Downloads/FinanceOS_2026-06-29.json"
);
const payload = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const transactions = payload.transactions ?? [];
const accounts = payload.bankAccounts ?? [];
const cards = payload.creditCards ?? [];
const today = "2026-06-30";

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function applies(item, transaction) {
  if (transaction.status === "pending") return false;
  if (transaction.date > today) return false;
  if (transaction.type === "adjustment" && transaction.subType === "reconciliation") return false;
  return !item.balanceSnapshotDate || transaction.date > item.balanceSnapshotDate;
}

function effect(transaction, entityId, kind) {
  const source = transaction.sourceId === entityId;
  const destination = transaction.destinationId === entityId;
  if (!source && !destination) return 0;

  if (["expense", "tax_payment", "loan_payment", "withdrawal"].includes(transaction.type)) {
    return source ? (kind === "card" ? transaction.amount : -transaction.amount) : 0;
  }
  if (["income", "refund", "dividend", "loan_receipt"].includes(transaction.type)) {
    return source ? (kind === "card" ? -transaction.amount : transaction.amount) : 0;
  }
  if (transaction.type === "transfer") {
    if (source) {
      return kind === "card" && transaction.subType === "loc_draw"
        ? transaction.amount
        : -transaction.amount;
    }
    return destination ? (kind === "card" ? -transaction.amount : transaction.amount) : 0;
  }
  if (transaction.type === "adjustment") {
    if (source) return transaction.amount;
    return destination ? -transaction.amount : 0;
  }
  return 0;
}

function replay(item, kind) {
  const hasRelated = transactions.some(
    (transaction) => transaction.sourceId === item.id || transaction.destinationId === item.id
  );
  let balance = item.balanceSnapshotAmount != null && item.balanceSnapshotDate
    ? item.balanceSnapshotAmount
    : hasRelated
      ? 0
      : item.openingBalance;

  transactions
    .filter((transaction) =>
      applies(item, transaction)
      && (transaction.sourceId === item.id || transaction.destinationId === item.id)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .forEach((transaction) => {
      balance = money(balance + effect(transaction, item.id, kind));
    });

  if (kind === "account") {
    const invoices = payload.business?.invoices ?? [];
    invoices.forEach((invoice) => {
      const paymentDate = invoice.paymentDate?.slice(0, 10);
      const amount = Number(invoice.total) || 0;
      const matchingTransaction = transactions.some((transaction) =>
        transaction.status !== "pending"
        && transaction.type === "income"
        && transaction.sourceId === item.id
        && transaction.date === paymentDate
        && money(transaction.amount) === money(amount)
      );
      if (
        invoice.depositAccount === item.name
        && paymentDate
        && paymentDate <= today
        && (!item.balanceSnapshotDate || paymentDate > item.balanceSnapshotDate)
        && !matchingTransaction
      ) {
        balance = money(balance + amount);
      }
    });
  }

  return money(balance);
}

function replayLiability(liability, activity) {
  const hasSnapshot = liability.balanceSnapshotAmount != null && liability.balanceSnapshotDate;
  let balance = hasSnapshot ? liability.balanceSnapshotAmount : liability.openingBalance;

  activity
    .filter((transaction) =>
      transaction.status !== "pending"
      && transaction.linkedLiabilityId === liability.id
      && (!hasSnapshot || transaction.date > liability.balanceSnapshotDate)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .forEach((transaction) => {
      if (transaction.type === "loan_receipt") {
        balance += transaction.amount;
      } else if (transaction.type === "loan_payment") {
        const principal = transaction.principalAmount
          ?? transaction.amount - (transaction.interestAmount ?? 0);
        balance -= principal;
      }
      balance = money(balance);
    });

  return balance;
}

const balanceRows = [
  ...accounts.map((item) => ({ kind: "account", item })),
  ...cards.map((item) => ({ kind: "card", item })),
].map(({ kind, item }) => {
  const replayed = replay(item, kind);
  return {
    kind,
    name: item.name,
    stored: money(item.openingBalance),
    replayed,
    difference: money(item.openingBalance - replayed),
  };
});

const mismatches = balanceRows.filter((row) => Math.abs(row.difference) >= 0.01);
const dpReceipts = transactions.filter(
  (transaction) =>
    transaction.type === "loan_receipt"
    && transaction.subType === "personal_loan"
    && /^Loan DP \d+$/i.test(transaction.description)
);
const dpTotal = money(dpReceipts.reduce((sum, transaction) => sum + transaction.amount, 0));
const syntheticLiability = {
  id: "fixture-lender",
  openingBalance: 999,
  balanceSnapshotAmount: 5000,
  balanceSnapshotDate: "2026-05-31",
};
const syntheticLiabilityBalance = replayLiability(syntheticLiability, [
  {
    id: "before-snapshot",
    linkedLiabilityId: syntheticLiability.id,
    type: "loan_receipt",
    status: "cleared",
    date: "2026-05-01",
    createdAt: "2026-05-01T12:00:00.000Z",
    amount: 700,
  },
  {
    id: "after-snapshot-borrow",
    linkedLiabilityId: syntheticLiability.id,
    type: "loan_receipt",
    status: "cleared",
    date: "2026-06-01",
    createdAt: "2026-06-01T12:00:00.000Z",
    amount: 1000,
  },
  {
    id: "after-snapshot-repay",
    linkedLiabilityId: syntheticLiability.id,
    type: "loan_payment",
    status: "cleared",
    date: "2026-06-15",
    createdAt: "2026-06-15T12:00:00.000Z",
    amount: 450,
    principalAmount: 400,
    interestAmount: 50,
  },
]);

console.table(balanceRows);
console.log(`DP receipts: ${dpReceipts.length}; liability principal received: $${dpTotal.toFixed(2)}`);
console.log(`Synthetic lender balance: $${syntheticLiabilityBalance.toFixed(2)}`);

if (dpReceipts.length !== 7 || dpTotal !== 21000) {
  throw new Error("DP personal-loan fixture invariant failed.");
}
if (syntheticLiabilityBalance !== 5600) {
  throw new Error("Lender snapshot/principal replay invariant failed.");
}
if (mismatches.length) {
  console.error("Balance mismatches detected:", mismatches);
  process.exitCode = 1;
} else {
  console.log("All account and card balances match snapshot-based replay.");
}
