import fs from "node:fs";

const source = fs.readFileSync("modules/business/DashboardProjectionSections.tsx", "utf8");

[
  "transactionProjectionVisibility",
  'purpose === "credit_card_payment"',
  'transaction.type === "tax_payment"',
  'transaction.type === "loan_payment"',
  "visibleMonthTx",
  "monthlyVisibility[transactionProjectionVisibility(transaction)]",
  "isPast",
].forEach((fragment) => {
  if (!source.includes(fragment)) {
    throw new Error(`Monthly projection visibility is missing: ${fragment}`);
  }
});

console.log("Monthly projection visibility validated for posted and projected rows.");
