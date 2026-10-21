import type { CreditCard } from "../types/creditCard.ts";
import { locDrawRepaymentDate } from "./debtProjection.ts";
import { isIsoDate, isoToLocalNoon } from "./scheduleDates.ts";

/**
 * Projection-only what-if planning.
 *
 * Scenarios never create transactions or touch balances; they only add dated
 * events to the Dashboard projection.
 */

export type ProjectionEventType =
  | "vehicle"
  | "loan"
  | "fixed"
  | "cra"
  | "income"
  | "invoice"
  | "debt"
  | "borrow"
  | "scenario"
  | "transfer";

export interface ProjectionEvent {
  date: Date;
  label: string;
  /** Cash effect on bank accounts: positive = in, negative = out. */
  amount: number;
  type: ProjectionEventType;
  account?: string;
  /** Receiving bank account of a cash-neutral transfer between own accounts. */
  toAccount?: string;
  displayAmount?: number;
}

export type WhatIfType = "income" | "expense" | "loc_draw";

export interface WhatIfEntry {
  id: string;
  type: WhatIfType;
  amount: number;
  date: string;
  locId: string;
  /** Optional bank account for extra income/expense, used by per-account balances. */
  accountId?: string;
}

export interface ProjectionScenario {
  id: string;
  name: string;
  entries: WhatIfEntry[];
  createdAt: string;
  updatedAt: string;
}

export const MAX_PROJECTION_SCENARIOS = 5;

export interface WhatIfWarning {
  entryId: string;
  message: string;
}

export interface WhatIfBuildResult {
  events: ProjectionEvent[];
  warnings: WhatIfWarning[];
  /** Draws whose repayment is not projected inside [from, to]. */
  unrepaidDraws: number;
}

function toFixed2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function fmtShortDate(iso: string): string {
  return isoToLocalNoon(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

/**
 * Turn what-if entries into projection events inside [fromIso, toIso].
 *
 * LOC withdrawals are borrowing, not income: the cash arrives in the LOC's
 * linked account, and the full draw is repaid on the LOC's first payment date
 * after the draw.
 */
export function buildWhatIfEvents(
  entries: WhatIfEntry[],
  locCards: CreditCard[],
  fromIso: string,
  toIso: string
): WhatIfBuildResult {
  const events: ProjectionEvent[] = [];
  const warnings: WhatIfWarning[] = [];
  let unrepaidDraws = 0;

  entries
    .filter((entry) => entry.amount > 0 && isIsoDate(entry.date))
    .forEach((entry) => {
      const amount = toFixed2(entry.amount);
      const drawIso = entry.date.slice(0, 10);
      const inWindow = drawIso >= fromIso && drawIso <= toIso;

      if (entry.type !== "loc_draw") {
        if (!inWindow) return;
        events.push({
          date: isoToLocalNoon(drawIso),
          label: entry.type === "income" ? "What-if: Extra income" : "What-if: Extra expense",
          amount: entry.type === "income" ? amount : -amount,
          type: "scenario",
          account: entry.accountId || undefined,
        });
        return;
      }

      // A hypothetical draw dated before the window never happened, so neither did its repayment.
      if (drawIso < fromIso) return;
      const loc = locCards.find((card) => card.id === entry.locId);
      if (!loc) {
        if (inWindow) {
          warnings.push({ entryId: entry.id, message: `LOC withdrawal of ${amount.toFixed(2)} on ${drawIso} has no line of credit selected; it is not projected.` });
        }
        return;
      }

      if (inWindow) {
        events.push({
          date: isoToLocalNoon(drawIso),
          label: `What-if: LOC draw - ${loc.name}`,
          amount,
          type: "borrow",
          account: loc.linkedAccountId,
        });
      }

      const repayIso = locDrawRepaymentDate(loc, drawIso);
      if (!repayIso) {
        if (inWindow) {
          unrepaidDraws = toFixed2(unrepaidDraws + amount);
          warnings.push({ entryId: entry.id, message: `${loc.name} has no Next Payment Date, so the ${drawIso} draw's repayment is not projected.` });
        }
        return;
      }

      if (repayIso >= fromIso && repayIso <= toIso) {
        events.push({
          date: isoToLocalNoon(repayIso),
          label: `Repay LOC draw - ${loc.name} (drawn ${fmtShortDate(drawIso)})`,
          amount: -amount,
          type: "debt",
          account: loc.linkedAccountId,
        });
      } else if (inWindow) {
        unrepaidDraws = toFixed2(unrepaidDraws + amount);
      }
    });

  return {
    events: events.sort((a, b) => a.date.getTime() - b.date.getTime()),
    warnings,
    unrepaidDraws,
  };
}

export interface FlowSummary {
  in: number;
  out: number;
  borrowed: number;
  net: number;
}

/** Money in (excluding borrowing), money out, borrowing, and net cash change. */
export function summarizeFlows(items: Array<{ amount: number; borrow?: boolean }>): FlowSummary {
  let moneyIn = 0;
  let moneyOut = 0;
  let borrowed = 0;
  items.forEach((item) => {
    if (item.borrow && item.amount > 0) borrowed += item.amount;
    else if (item.amount > 0) moneyIn += item.amount;
    else moneyOut += -item.amount;
  });
  return {
    in: toFixed2(moneyIn),
    out: toFixed2(moneyOut),
    borrowed: toFixed2(borrowed),
    net: toFixed2(moneyIn + borrowed - moneyOut),
  };
}

const WHAT_IF_TYPES: WhatIfType[] = ["income", "expense", "loc_draw"];

/** Defensive shape check for scenarios read from storage, cloud, or JSON import. */
export function normalizeProjectionScenarios(raw: unknown): ProjectionScenario[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => {
      const now = new Date().toISOString();
      const entries = Array.isArray(item.entries) ? item.entries : [];
      return {
        id: typeof item.id === "string" && item.id ? item.id : `scenario-${index + 1}`,
        // Not trimmed: the name is saved while it is being typed.
        name: typeof item.name === "string" && item.name.trim() ? item.name.slice(0, 60) : `Scenario ${index + 1}`,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
        entries: entries
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
          .map((entry, entryIndex) => ({
            id: typeof entry.id === "string" && entry.id ? entry.id : `entry-${entryIndex + 1}`,
            type: WHAT_IF_TYPES.includes(entry.type as WhatIfType) ? entry.type as WhatIfType : "expense",
            amount: Math.max(0, Number(entry.amount) || 0),
            date: isIsoDate(entry.date) ? (entry.date as string).slice(0, 10) : "",
            locId: typeof entry.locId === "string" ? entry.locId : "",
            ...(typeof entry.accountId === "string" && entry.accountId ? { accountId: entry.accountId } : {}),
          })),
      };
    })
    .slice(0, MAX_PROJECTION_SCENARIOS);
}
