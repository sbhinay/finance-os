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
  "horizonMonths",
  "setHorizonMonths",
  "HORIZON_OPTIONS",
  "endOfMonthIso(todayIso, horizonMonths)",
  "buildEvents(todayIso, horizonEndIso",
  'purpose === "loc_draw") return "borrowing"',
  "summarizeFlows",
  "projectionScenarioRepository",
].forEach((fragment) => {
  if (!source.includes(fragment)) {
    throw new Error(`Monthly projection visibility is missing: ${fragment}`);
  }
});

// Projection dates must come from the calendar, not fixed 30-day steps.
const projectionSource = source.slice(
  source.indexOf("function buildEvents("),
  source.indexOf("export function DashboardSection")
).replace(/^function DashboardOverviewPanel[\s\S]*?^}\n/m, "");
for (const forbidden of ["86400000", "Monthly: 30", "toISOString().split(\"T\")[0]"]) {
  if (projectionSource.includes(forbidden)) {
    throw new Error(`Projection still uses day-count date math: ${forbidden}`);
  }
}

console.log("Monthly projection visibility validated for posted and projected rows, month-end horizons, and borrowing.");
