import {
  endOfMonthIso,
  scheduleOccurrence,
  scheduleOccurrencesBetween,
  upcomingOccurrences,
  addDaysIso,
} from "../utils/scheduleDates.ts";
import { locDrawRepaymentDate } from "../utils/debtProjection.ts";
import {
  buildWhatIfEvents,
  normalizeProjectionScenarios,
  summarizeFlows,
  MAX_PROJECTION_SCENARIOS,
} from "../utils/projectionScenarios.ts";
import { localIsoDate } from "../utils/scheduleDates.ts";

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

// ── Calendar schedule math ───────────────────────────────────────────────────
expectEqual(
  scheduleOccurrencesBetween("2026-01-30", "Monthly", "2026-01-01", "2026-05-31"),
  ["2026-01-30", "2026-02-28", "2026-03-30", "2026-04-30", "2026-05-30"],
  "Monthly on the 30th must not drift after February"
);
expectEqual(
  scheduleOccurrencesBetween("2026-01-31", "Monthly", "2026-01-01", "2026-04-30"),
  ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
  "Monthly on the 31st lands on each month end"
);
expectEqual(
  scheduleOccurrencesBetween("2026-10-15", "Monthly", "2026-10-13", "2027-07-31").length,
  10,
  "A 15th-of-month payment occurs exactly once per month through July"
);
expectEqual(
  upcomingOccurrences("2026-11-15", "Monthly", "2026-10-13", "2026-12-31"),
  ["2026-11-15", "2026-12-15"],
  "Nothing is projected before the next due date"
);
expectEqual(
  scheduleOccurrencesBetween("2026-10-30", "Bi-weekly", "2026-10-30", "2026-11-30"),
  ["2026-10-30", "2026-11-13", "2026-11-27"],
  "Bi-weekly dates stay on calendar days across the November clock change"
);
expectEqual(scheduleOccurrence("2026-02-28", "Monthly", 1, 30), "2026-03-30", "Start-date day restores a clamped 30th");
expectEqual(scheduleOccurrence("2028-02-29", "Annual", 1), "2029-02-28", "Annual leap day clamps");
expectEqual(addDaysIso("2026-10-31", 2), "2026-11-02", "Day math is DST-safe");

// ── Month-end horizons (option A: counted after the current month) ──────────
expectEqual(
  [1, 3, 6, 9].map((months) => endOfMonthIso("2026-10-13", months)),
  ["2026-11-30", "2027-01-31", "2027-04-30", "2027-07-31"],
  "Horizons end on the last day of the target month"
);

// ── LOC draw repayment rule ──────────────────────────────────────────────────
const scotia = { repaymentDueDate: "2026-10-15" };
expectEqual(locDrawRepaymentDate(scotia, "2026-10-10"), "2026-10-15", "Draw before the payment date is repaid that month");
expectEqual(locDrawRepaymentDate(scotia, "2026-10-19"), "2026-11-15", "Draw after the payment date is repaid next month");
expectEqual(locDrawRepaymentDate(scotia, "2026-10-15"), "2026-11-15", "Draw on the payment date is repaid next month");
expectEqual(locDrawRepaymentDate({ repaymentDueDate: "2026-11-15" }, "2026-10-10"), "2026-11-15", "Never repaid before the stored next payment date");
expectEqual(locDrawRepaymentDate({}, "2026-10-19"), null, "No payment date means no projected repayment");

const loc = { id: "loc-1", name: "Scotia Line", type: "loc", linkedAccountId: "bank-1", repaymentDueDate: "2026-10-15" };
const result = buildWhatIfEvents([
  { id: "a", type: "loc_draw", amount: 4500, date: "2026-10-19", locId: "loc-1" },
  { id: "b", type: "income", amount: 18000, date: "2026-11-13", locId: "" },
  { id: "c", type: "expense", amount: 12500, date: "2026-11-16", locId: "" },
  { id: "d", type: "loc_draw", amount: 2500, date: "2026-11-30", locId: "loc-1" },
  { id: "e", type: "loc_draw", amount: 100, date: "2026-10-01", locId: "loc-1" },
], [loc], "2026-10-13", "2026-11-30");

expectEqual(
  result.events.map((event) => [localIsoDate(event.date), event.type, event.amount]),
  [
    ["2026-10-19", "borrow", 4500],
    ["2026-11-13", "scenario", 18000],
    ["2026-11-15", "debt", -4500],
    ["2026-11-16", "scenario", -12500],
    ["2026-11-30", "borrow", 2500],
  ],
  "Draws are borrowing with a full repayment; past-dated draws are ignored"
);
expectEqual(result.unrepaidDraws, 2500, "A draw repaid after the horizon stays in debt exposure");

const missing = buildWhatIfEvents(
  [{ id: "x", type: "loc_draw", amount: 900, date: "2026-10-20", locId: "loc-2" }],
  [{ id: "loc-2", name: "RBC LOC", type: "loc", linkedAccountId: "bank-1" }],
  "2026-10-13",
  "2026-11-30"
);
expectEqual(missing.events.length, 1, "Draw still adds cash when the LOC has no payment date");
expectEqual(missing.warnings.length, 1, "Missing payment date is reported");

// ── Daily totals keep borrowing out of income ────────────────────────────────
expectEqual(
  summarizeFlows([{ amount: 500 }, { amount: -200 }, { amount: 1000, borrow: true }]),
  { in: 500, out: 200, borrowed: 1000, net: 1300 },
  "Borrowing is separate from income but included in net cash"
);

// ── Stored scenario shape ────────────────────────────────────────────────────
const normalized = normalizeProjectionScenarios(
  Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, name: `Plan ${i}`, entries: [{ type: "bogus", amount: "-5", date: "nope" }] }))
);
expectEqual(normalized.length, MAX_PROJECTION_SCENARIOS, "At most five scenarios are kept");
expectEqual(normalized[0].entries[0], { id: "entry-1", type: "expense", amount: 0, date: "", locId: "" }, "Malformed entries are made safe");
expectEqual(normalizeProjectionScenarios(undefined), [], "Older exports without scenarios load as empty");

console.log("Projection scenarios validated: calendar schedules, month-end horizons, LOC borrowing and repayment, daily totals, and saved-scenario shape.");
