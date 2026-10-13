"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { useCategories } from "@/modules/categories/useCategories";
import { useProperties, useVehicles, useHouseLoans } from "./useAssets";
import { useFixedPayments } from "./useFixedPayments";
import { useBusiness } from "./useBusiness";
import { fmtCAD, fmtDate, toFixed2, toMonthly, uid } from "@/utils/finance";
import { DATA_CHANGED_EVENT } from "@/utils/events";
import { useEffect } from "react";
import { theme } from "@/lib/theme";
import type { Transaction } from "@/types/transaction";
import { getExpenseReportEffect, getTransactionListEffect, inferTransactionPurpose } from "@/utils/transactionSemantics";
import { calculateDebtSummary, matchesMortgagePayment, matchesVehicleFinancePayment } from "@/utils/debtReporting";
import { buildDebtRepaymentProjection } from "@/utils/debtProjection";
import {
  addDaysIso,
  addMonthsIso,
  dayOfMonth,
  daysBetweenIso,
  endOfMonthIso,
  isoToLocalNoon,
  localIsoDate,
  upcomingOccurrences,
} from "@/utils/scheduleDates";
import {
  buildWhatIfEvents,
  MAX_PROJECTION_SCENARIOS,
  summarizeFlows,
  type FlowSummary,
  type ProjectionEvent,
  type ProjectionScenario,
  type WhatIfEntry,
  type WhatIfType,
} from "@/utils/projectionScenarios";
import { projectionScenarioRepository } from "@/repositories/projectionScenarioRepository";
import { notifyDataChanged } from "@/utils/events";
import type { PaymentSchedule } from "@/types/domain";
import { ActionButton, DataPanel, MetricCard, PageHeader } from "@/components/ui";

// ─── Primitives ───────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return <MetricCard label={label} value={value} sub={sub} color={color} style={{ flex: 1, minWidth: 160 }} />;
}

function Card({ title, children, accent }: { title?: string; children: React.ReactNode; accent?: string }) {
  return (
    <DataPanel title={title} accent={accent} style={{ marginBottom: 14 }}>
      <div style={{ padding: title ? "14px 16px" : "16px 18px" }}>{children}</div>
    </DataPanel>
  );
}

function Btn({ children, onClick, variant = "primary", small }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary"; small?: boolean;
}) {
  return (
    <ActionButton compact={small} tone={variant === "primary" ? "primary" : "secondary"} onClick={onClick}>
      {children}
    </ActionButton>
  );
}

function useAutoReload(reload: () => void) {
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, [reload]);
}

// ─── Event builder (shared by Projection + Monthly view) ─────────────────────

type ProjectionVisibility = "income" | "expense" | "borrowing" | "debt" | "tax" | "transfer";

function projectionVisibility(event: ProjectionEvent): ProjectionVisibility {
  if (event.type === "income" || event.type === "invoice") return "income";
  if (event.type === "borrow") return "borrowing";
  if (event.type === "loan" || event.type === "debt") return "debt";
  if (event.type === "cra") return "tax";
  if (event.type === "transfer") return "transfer";
  if (event.type === "scenario") return event.amount > 0 ? "income" : "expense";
  return "expense";
}

function transactionProjectionVisibility(transaction: Transaction): ProjectionVisibility {
  const purpose = inferTransactionPurpose(transaction);
  if (transaction.type === "tax_payment") return "tax";
  if (purpose === "loc_draw") return "borrowing";
  if (transaction.type === "loan_payment" || transaction.type === "loan_receipt") return "debt";
  if (purpose === "credit_card_payment" || purpose === "loc_payment") return "debt";
  if (transaction.type === "transfer") return "transfer";
  if (transaction.type === "income" || transaction.type === "dividend" || transaction.type === "refund") return "income";
  return "expense";
}

/** Cash flow of a posted transaction for daily In/Out/Borrowed totals. */
function transactionFlow(transaction: Transaction): { amount: number; borrow?: boolean } | null {
  if (inferTransactionPurpose(transaction) === "loc_draw") return { amount: toFixed2(transaction.amount), borrow: true };
  const effect = getTransactionListEffect(transaction);
  return effect === null ? null : { amount: effect };
}

function eventDateKey(event: ProjectionEvent): string {
  return localIsoDate(event.date);
}

/**
 * Scheduled events between fromIso and toIso (inclusive, local calendar dates).
 * Every recurring date is computed from the calendar, never from 30-day steps.
 */
function buildEvents(
  fromIso: string,
  toIso: string,
  vehicles: ReturnType<typeof useVehicles>["vehicles"],
  houseLoans: ReturnType<typeof useHouseLoans>["houseLoans"],
  cards: ReturnType<typeof useCreditCards>["cards"],
  fixedPayments: ReturnType<typeof useFixedPayments>["fixedPayments"],
  business: ReturnType<typeof useBusiness>["business"],
  incomes: Array<{ id: string; source: string; amount: number; schedule: string; date: string; type: string }>
): ProjectionEvent[] {
  const events: ProjectionEvent[] = [];
  const inWindow = (iso?: string) => Boolean(iso) && iso! >= fromIso && iso! <= toIso;

  const payrollRemittances = business.payrollRemittances ?? [];
  const corporateInstalments = business.corporateInstalments ?? [];
  const hstRemittances = business.hstRemittances ?? [];
  const invoices = business.invoices ?? [];
  const debtProjection = buildDebtRepaymentProjection({
    cards,
    fixedPayments,
    today: isoToLocalNoon(fromIso),
    days: daysBetweenIso(fromIso, toIso),
  });

  // Vehicles
  vehicles.forEach((v) => {
    if (!v.payment || !v.nextPaymentDate) return;
    upcomingOccurrences(v.nextPaymentDate, v.schedule, fromIso, toIso).forEach((iso) => {
      events.push({ date: isoToLocalNoon(iso), label: `${v.name} payment`, amount: -v.payment, type: "vehicle", account: v.source });
    });
  });

  // House loans
  houseLoans.forEach((l) => {
    if (!l.payment || !l.nextPaymentDate) return;
    upcomingOccurrences(l.nextPaymentDate, l.schedule, fromIso, toIso, { until: l.endDate || undefined }).forEach((iso) => {
      events.push({ date: isoToLocalNoon(iso), label: `${l.name} payment`, amount: -l.payment, type: "loan", account: l.source });
    });
  });

  // Fixed payments
  fixedPayments.forEach((p) => {
    if (!p.amount || p.archived) return;

    const isTransfer = p.transactionType === "transfer";
    const isLocDraw = p.subType === "loc_draw" || p.purpose === "loc_draw";
    const isDebtPayment = p.subType === "cc_payment" || p.subType === "loc_payment"
      || p.purpose === "credit_card_payment" || p.purpose === "loc_payment";
    const isNeutralTransfer = p.subType === "bank_to_bank" || p.purpose === "bank_transfer";
    const projectedAmount = isLocDraw ? p.amount : isNeutralTransfer ? 0 : -p.amount;
    const projectedType: ProjectionEvent["type"] = isLocDraw
      ? "borrow"
      : isDebtPayment
        ? "debt"
        : isTransfer
          ? "transfer"
          : "fixed";

    upcomingOccurrences(p.date, p.schedule, fromIso, toIso, {
      until: p.endDate,
      preferredDay: dayOfMonth(p.startDate),
    }).forEach((iso) => {
      events.push({
        date: isoToLocalNoon(iso),
        label: p.name,
        amount: projectedAmount,
        displayAmount: isNeutralTransfer ? p.amount : undefined,
        type: projectedType,
        account: isLocDraw ? p.destinationId : p.source,
      });
    });
  });

  debtProjection.events.forEach((event) => {
    events.push({
      date: event.date,
      label: event.label,
      amount: event.amount,
      type: "debt",
      account: event.account,
    });
  });

  // CRA payroll
  payrollRemittances
    .filter((r) => !r.paid)
    .forEach((r) => {
      const dateStr = r.plannedDate ?? r.dueDate;
      if (inWindow(dateStr)) {
        events.push({ date: isoToLocalNoon(dateStr), label: `CRA Payroll — ${r.month}`, amount: -r.amount, type: "cra" });
      }
    });

  // CRA corp tax
  corporateInstalments
    .filter((i) => !i.paid)
    .forEach((i) => {
      const dateStr = i.plannedDate ?? i.dueDate;
      if (inWindow(dateStr)) {
        events.push({ date: isoToLocalNoon(dateStr), label: `Corp Tax ${i.year} ${i.quarter}`, amount: -i.amount, type: "cra" });
      }
    });

  // CRA HST
  hstRemittances
    .filter((h) => !h.paid && h.amount > 0)
    .forEach((h) => {
      const dateStr = h.plannedDate ?? h.dueDate;
      if (inWindow(dateStr)) {
        events.push({ date: isoToLocalNoon(dateStr), label: `HST ${h.quarter}`, amount: -h.amount, type: "cra" });
      }
    });

  // Expected invoice income: the 15th of the month after the work month
  invoices
    .filter((i) => !i.paymentDate && i.total > 0)
    .forEach((i) => {
      const workYear = Number(i.workYear || new Date().getFullYear());
      const workMonth = Number(i.workMonth || new Date().getMonth() + 1);
      const expectedIso = addMonthsIso(`${workYear}-${String(workMonth).padStart(2, "0")}-15`, 1);
      if (inWindow(expectedIso)) {
        events.push({ date: isoToLocalNoon(expectedIso), label: `Invoice ${i.invoiceNumber} (expected)`, amount: i.total, type: "invoice" });
      }
    });

  // Income sources
  incomes.forEach((inc) => {
    if (!inc.amount || !inc.date) return;
    upcomingOccurrences(inc.date, inc.schedule as PaymentSchedule, fromIso, toIso).forEach((iso) => {
      events.push({ date: isoToLocalNoon(iso), label: inc.source, amount: inc.amount, type: "income" });
    });
  });

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}


const TYPE_COLORS: Record<string, string> = {
  vehicle: "#a05c00", loan: "#a31515", fixed: "#6b7280",
  cra: "#4a3ab5", income: "#1a7f3c", invoice: "#1a7f3c",
  debt: "#b91c1c",
  borrow: "#c2410c",
  scenario: "#0f766e",
  transfer: "#64748b",
};

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function DashboardOverviewPanel({ hideHeader = false }: { hideHeader?: boolean }) {
  const { accounts, reloadAccounts } = useAccounts();
  const { cards } = useCreditCards();
  const { transactions } = useTransactions();
  const { categories } = useCategories();
  const { vehicles } = useVehicles();
  const { properties } = useProperties();
  const { houseLoans } = useHouseLoans();
  const { business } = useBusiness();
  const hstRemittances = business.hstRemittances ?? [];
  const corporateInstalments = business.corporateInstalments ?? [];
  const payrollRemittances = business.payrollRemittances ?? [];

  useAutoReload(reloadAccounts);

  const today = new Date();
  const monthStr = today.toISOString().slice(0, 7);
  const in30 = new Date(today.getTime() + 30 * 86400000);

  // Net worth
  const totalBank = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const propertyAssets = properties
    .filter((property) => !property.archived)
    .reduce((sum, property) => sum + (property.estimatedValue ?? 0), 0);
  const totalAssets = toFixed2(totalBank + propertyAssets);
  const ccDebt = cards.reduce((s, c) => s + c.openingBalance, 0);
  const debtOwing = (item: (typeof houseLoans)[number] | (typeof vehicles)[number]) => {
    const isMortgage = "propertyId" in item;
    return calculateDebtSummary({
      transactions,
      matches: isMortgage
        ? matchesMortgagePayment(
            item.id,
            item.propertyId,
            houseLoans.filter((candidate) => candidate.propertyId === item.propertyId).length === 1
          )
        : matchesVehicleFinancePayment(item.id),
      balanceSnapshotAmount: item.balanceSnapshotAmount,
      balanceSnapshotDate: item.balanceSnapshotDate,
      fallbackBalance: item.remaining,
    }).currentOwing;
  };
  const loanDebt = houseLoans.reduce((sum, loan) => sum + debtOwing(loan), 0);
  const vehicleDebt = vehicles.filter((vehicle) => vehicle.vtype === "Finance").reduce((sum, vehicle) => sum + debtOwing(vehicle), 0);
  const craDebt = toFixed2((business.arrearsHST ?? 0) + (business.arrearsCorp ?? 0));
  const totalDebt = toFixed2(ccDebt + loanDebt + vehicleDebt + craDebt);
  const netWorth = toFixed2(totalAssets - totalDebt);

  // Monthly commitments
  const monthlyFixed = toFixed2(
    houseLoans.reduce((s, l) => s + toMonthly(l.payment, l.schedule), 0) +
    vehicles.reduce((s, v) => s + toMonthly(v.payment, v.schedule), 0)
  );

  // CRA due within 30 days
  const upcomingCRA = [
  ...hstRemittances.map((h) => ({
    ...h,
    typeName: "HST",
    label: `HST ${h.quarter}`,
  })),
  ...corporateInstalments.map((i) => ({
    ...i,
    typeName: "Corp Tax",
    label: `Corp Tax ${i.year} ${i.quarter}`,
  })),
  ...payrollRemittances.map((p) => ({
    ...p,
    typeName: "Payroll",
    label: `Payroll — ${p.month}`,
  })),
].filter((p) => {
  if (p.paid) return false;
  const d = new Date((p.plannedDate ?? p.dueDate) + "T12:00:00");
  return d <= in30 && d >= today;
});

  // Leases ending soon
  const leasesEndingSoon = vehicles.filter((v) => {
    if (v.vtype !== "Lease" || !v.leaseEnd) return false;
    const days = (new Date(v.leaseEnd + "T12:00:00").getTime() - today.getTime()) / 86400000;
    return days > 0 && days <= 90;
  });

  // Monthly actuals
  const monthTx = transactions.filter((t) => t.date.startsWith(monthStr));
  const mIn = monthTx.reduce((sum, transaction) => sum + Math.max(0, getTransactionListEffect(transaction) ?? 0), 0);
  const mOut = monthTx.reduce((sum, transaction) => sum + Math.max(0, -(getTransactionListEffect(transaction) ?? 0)), 0);

  // Top categories
  const catMap: Record<string, number> = {};
  transactions.forEach((t) => {
    if (t.type === "expense" || t.type === "refund") {
      catMap[t.categoryId ?? "other"] = (catMap[t.categoryId ?? "other"] ?? 0) + getExpenseReportEffect(t);
    }
  });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      {!hideHeader && <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: 0, color: theme.colors.text, marginBottom: 16 }}>Financial Dashboard</div>}

      {/* Net Worth */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <StatBox label="Net Worth" value={fmtCAD(netWorth)} color={netWorth >= 0 ? "#1a7f3c" : "#a31515"} sub="Assets − All Debt" />
        <StatBox label="Total Bank" value={fmtCAD(totalBank)} color="#1a5fa8" />
        <StatBox label="Total Debt" value={fmtCAD(totalDebt)} color="#a31515" sub={craDebt > 0 ? `incl. ${fmtCAD(craDebt)} CRA` : undefined} />
        <StatBox label="CRA Arrears" value={fmtCAD(craDebt)} color="#a31515" sub="outstanding" />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <StatBox label="Monthly Fixed Costs" value={fmtCAD(monthlyFixed)} color="#a05c00" />
        <StatBox label="Month Income" value={fmtCAD(mIn)} color="#1a7f3c" />
        <StatBox label="Month Expenses" value={fmtCAD(mOut)} color="#a31515" />
        <StatBox label="Month Net" value={fmtCAD(mIn - mOut)} color={mIn - mOut >= 0 ? "#1a7f3c" : "#a31515"} />
      </div>

      {/* Alerts */}
      {(upcomingCRA.length > 0 || leasesEndingSoon.length > 0) && (
        <Card accent="#a05c00">
          {upcomingCRA.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#a05c00", marginBottom: 8 }}>⚠ CRA Payments Due Within 30 Days</div>
              {upcomingCRA.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #fef3e2" }}>
                  <span>{p.label}</span>
<span style={{ fontWeight: 600, color: "#a05c00" }}>
  {fmtCAD(p.amount)} · {fmtDate(p.plannedDate ?? p.dueDate)}
</span>

                </div>
              ))}
            </>
          )}
          {leasesEndingSoon.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#a05c00", marginTop: upcomingCRA.length > 0 ? 12 : 0, marginBottom: 8 }}>⚠ Leases Ending Within 90 Days</div>
              {leasesEndingSoon.map((v) => (
                <div key={v.id} style={{ fontSize: 12, padding: "4px 0" }}>{v.name} — ends {fmtDate(v.leaseEnd)}</div>
              ))}
            </>
          )}
        </Card>
      )}

      {/* This month + CRA Arrears */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Card title={`This Month (${today.toLocaleString("en-CA", { month: "long" })})`}>
          {[["Income Logged", fmtCAD(mIn), "#1a7f3c"], ["Expenses Logged", fmtCAD(mOut), "#a31515"]].map(([l, v, c]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>{l}</span>
              <span style={{ fontWeight: 600, color: c }}>{v}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #e2e4e8", paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Net</span>
            <span style={{ fontWeight: 700, color: mIn - mOut >= 0 ? "#1a7f3c" : "#a31515" }}>{fmtCAD(mIn - mOut)}</span>
          </div>
        </Card>
        <Card title="CRA Arrears">
          {[["HST Arrears", fmtCAD(business.arrearsHST ?? 0)], ["Corporate Tax", fmtCAD(business.arrearsCorp ?? 0)]].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>{l}</span>
              <span style={{ fontWeight: 600, color: "#a31515" }}>{v}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #e2e4e8", paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Total</span>
            <span style={{ fontWeight: 700, color: "#a31515" }}>{fmtCAD(craDebt)}</span>
          </div>
        </Card>
      </div>

      {/* Top spending categories */}
      {topCats.length > 0 && (
        <Card title="Top Spending Categories">
          {topCats.map(([catId, amt]) => (
            <div key={catId} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span>{catName(catId)}</span>
                <span style={{ fontWeight: 600 }}>{fmtCAD(amt)}</span>
              </div>
              <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${(amt / topCats[0][1]) * 100}%`, background: "#1a5fa8", borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Debt overview */}
      <Card title="All Debt Overview">
        {[...houseLoans, ...vehicles.filter((v) => v.vtype === "Finance")].map((l) => (
          <div key={l.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span>{l.name}</span>
              <span style={{ color: "#a31515" }}>{fmtCAD(debtOwing(l))} owing</span>
            </div>
            {l.principal > 0 && (
              <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, ((l.principal - debtOwing(l)) / l.principal) * 100))}%`, background: "#1a5fa8", borderRadius: 99 }} />
              </div>
            )}
          </div>
        ))}
        {cards.map((c) => (
          <div key={c.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span>{c.name}</span>
              <span style={{ color: "#a31515" }}>{fmtCAD(c.openingBalance)} / {fmtCAD(c.limitAmount)}</span>
            </div>
            <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${Math.min(c.limitAmount ? (c.openingBalance / c.limitAmount) * 100 : 0, 100)}%`, background: c.limitAmount && c.openingBalance / c.limitAmount > 0.3 ? "#EF9F27" : "#1a5fa8", borderRadius: 99 }} />
            </div>
          </div>
        ))}
        {houseLoans.length === 0 && vehicles.filter((v) => v.vtype === "Finance").length === 0 && cards.length === 0 && (
          <div style={{ fontSize: 13, color: "#6b7280" }}>No debt recorded yet.</div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECTION SECTION
// ═══════════════════════════════════════════════════════════════════════════════

type HorizonMonths = 1 | 3 | 6 | 9;

const HORIZON_OPTIONS: Array<{ months: HorizonMonths; label: string }> = [
  { months: 1, label: "End of Next Month" },
  { months: 3, label: "3 Months" },
  { months: 6, label: "6 Months" },
  { months: 9, label: "9 Months" },
];

/** Furthest month the monthly view and saved scenarios can plan into. */
const MAX_HORIZON_MONTHS = 9;
const ACTIVE_SCENARIO_KEY = "fos_ui_projection_scenario";

function readActiveScenarioId(): string {
  try { return window.localStorage.getItem(ACTIVE_SCENARIO_KEY) ?? ""; } catch { return ""; }
}

function writeActiveScenarioId(id: string) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_SCENARIO_KEY, id);
    else window.localStorage.removeItem(ACTIVE_SCENARIO_KEY);
  } catch { /* storage unavailable: selection is per-page only */ }
}

function newEntry(type: WhatIfType, todayIso: string): WhatIfEntry {
  return {
    id: `entry-${uid()}`,
    type,
    amount: 0,
    date: addDaysIso(todayIso, 7),
    locId: "",
  };
}

function DayTotals({ totals }: { totals: FlowSummary }) {
  if (!totals.in && !totals.out && !totals.borrowed) return null;
  return (
    <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", fontSize: 11, fontWeight: 650 }}>
      {totals.in > 0 && <span style={{ color: "#1a7f3c" }}>In {fmtCAD(totals.in)}</span>}
      {totals.out > 0 && <span style={{ color: "#a31515" }}>Out {fmtCAD(totals.out)}</span>}
      {totals.borrowed > 0 && <span style={{ color: TYPE_COLORS.borrow }}>Borrowed {fmtCAD(totals.borrowed)}</span>}
      <span style={{ color: totals.net >= 0 ? "#1a7f3c" : "#a31515" }}>Net {totals.net > 0 ? "+" : ""}{fmtCAD(totals.net)}</span>
    </span>
  );
}

function ProjectionPanel({ hideHeader = false }: { hideHeader?: boolean }) {
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { vehicles } = useVehicles();
  const { houseLoans } = useHouseLoans();
  const { fixedPayments } = useFixedPayments();
  const { business } = useBusiness();
  const { transactions } = useTransactions();
  const { categories } = useCategories();

  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [horizonMonths, setHorizonMonths] = useState<HorizonMonths>(1);
  const [threshold, setThreshold] = useState(0);
  const todayIso = useMemo(() => localIsoDate(), []);

  // ── Saved what-if scenarios ────────────────────────────────────────────────
  const [scenarios, setScenarios] = useState<ProjectionScenario[]>(() => projectionScenarioRepository.getAll());
  const [activeScenarioId, setActiveScenarioId] = useState<string>(() => readActiveScenarioId());
  const [scenarioStatus, setScenarioStatus] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<number | null>(null);
  const pendingScenarios = useRef<ProjectionScenario[] | null>(null);

  const flushScenarioSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (!pendingScenarios.current) return;
    projectionScenarioRepository.saveAll(pendingScenarios.current);
    pendingScenarios.current = null;
    setScenarioStatus("saved");
    notifyDataChanged("projectionScenarios");
  }, []);

  // Reload when another tab, a cloud restore, or an import replaces the list.
  useAutoReload(useCallback(() => {
    if (pendingScenarios.current) return;
    setScenarios(projectionScenarioRepository.getAll());
  }, []));

  useEffect(() => () => flushScenarioSave(), [flushScenarioSave]);

  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null;

  function persistScenarios(next: ProjectionScenario[], immediate = false) {
    setScenarios(next);
    pendingScenarios.current = next;
    setScenarioStatus("saving");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    if (immediate) flushScenarioSave();
    else saveTimer.current = window.setTimeout(flushScenarioSave, 700);
  }

  function selectScenario(id: string) {
    flushScenarioSave();
    setActiveScenarioId(id);
    writeActiveScenarioId(id);
  }

  function updateActiveScenario(changes: Partial<Pick<ProjectionScenario, "name" | "entries">>) {
    if (!activeScenario) return;
    const updatedAt = new Date().toISOString();
    persistScenarios(scenarios.map((scenario) => scenario.id === activeScenario.id
      ? { ...scenario, ...changes, updatedAt }
      : scenario));
  }

  function createScenario(source?: ProjectionScenario) {
    if (scenarios.length >= MAX_PROJECTION_SCENARIOS) return;
    const now = new Date().toISOString();
    const scenario: ProjectionScenario = {
      id: `scenario-${uid()}`,
      name: source ? `${source.name} (copy)`.slice(0, 60) : `Scenario ${scenarios.length + 1}`,
      entries: source
        ? source.entries.map((entry, index) => ({ ...entry, id: `entry-${uid()}-${index}` }))
        : [newEntry("income", todayIso)],
      createdAt: now,
      updatedAt: now,
    };
    persistScenarios([...scenarios, scenario], true);
    setActiveScenarioId(scenario.id);
    writeActiveScenarioId(scenario.id);
  }

  function deleteActiveScenario() {
    if (!activeScenario) return;
    if (!window.confirm(`Delete the scenario "${activeScenario.name}"? This cannot be undone.`)) return;
    persistScenarios(scenarios.filter((scenario) => scenario.id !== activeScenario.id), true);
    selectScenario("");
  }

  function updateEntry(id: string, changes: Partial<WhatIfEntry>) {
    if (!activeScenario) return;
    updateActiveScenario({ entries: activeScenario.entries.map((entry) => entry.id === id ? { ...entry, ...changes } : entry) });
  }

  function addEntry() {
    if (!activeScenario) return;
    updateActiveScenario({ entries: [...activeScenario.entries, newEntry("expense", todayIso)] });
  }

  function removeEntry(id: string) {
    if (!activeScenario) return;
    updateActiveScenario({ entries: activeScenario.entries.filter((entry) => entry.id !== id) });
  }

  // ── Dates ──────────────────────────────────────────────────────────────────
  const horizonEndIso = endOfMonthIso(todayIso, horizonMonths);
  const horizonDayCount = daysBetweenIso(todayIso, horizonEndIso) + 1;
  const planningEndIso = endOfMonthIso(todayIso, MAX_HORIZON_MONTHS);
  const [selectedMonth, setSelectedMonth] = useState(() => todayIso.slice(0, 7));
  const [monthlyVisibility, setMonthlyVisibility] = useState<Record<ProjectionVisibility, boolean>>({
    income: true,
    expense: true,
    borrowing: true,
    debt: true,
    tax: false,
    transfer: false,
  });

  const totalBankNow = toFixed2(accounts.reduce((s, a) => s + a.openingBalance, 0));

  const incomes = useMemo(() => [], []); // will be populated when income module is built
  const locCards = useMemo(() => cards.filter((card) => card.active !== false && card.type === "loc"), [cards]);
  const whatIfEntries = useMemo(
    () => scenarios.find((scenario) => scenario.id === activeScenarioId)?.entries ?? [],
    [scenarios, activeScenarioId]
  );

  // All scheduled + scenario events from today to the furthest plannable month end.
  const planningWhatIf = useMemo(
    () => buildWhatIfEvents(whatIfEntries, locCards, todayIso, planningEndIso),
    [whatIfEntries, locCards, todayIso, planningEndIso]
  );
  const allFutureEvents = useMemo(() => [
    ...buildEvents(todayIso, planningEndIso, vehicles, houseLoans, cards, fixedPayments, business, incomes),
    ...planningWhatIf.events,
  ].sort((a, b) => a.date.getTime() - b.date.getTime()), [todayIso, planningEndIso, vehicles, houseLoans, cards, fixedPayments, business, incomes, planningWhatIf]);

  // Horizon-specific figures (debt pressure and unrepaid draws depend on where the horizon ends).
  const horizonWhatIf = useMemo(
    () => buildWhatIfEvents(whatIfEntries, locCards, todayIso, horizonEndIso),
    [whatIfEntries, locCards, todayIso, horizonEndIso]
  );
  const horizonEvents = useMemo(() => [
    ...buildEvents(todayIso, horizonEndIso, vehicles, houseLoans, cards, fixedPayments, business, incomes),
    ...horizonWhatIf.events,
  ].sort((a, b) => a.date.getTime() - b.date.getTime()), [todayIso, horizonEndIso, vehicles, houseLoans, cards, fixedPayments, business, incomes, horizonWhatIf]);
  const debtProjection = useMemo(
    () => buildDebtRepaymentProjection({ cards, fixedPayments, today: isoToLocalNoon(todayIso), days: horizonDayCount - 1 }),
    [cards, fixedPayments, todayIso, horizonDayCount]
  );

  const horizonRows = useMemo(() => {
    const byDay = new Map<string, ProjectionEvent[]>();
    horizonEvents.forEach((event) => {
      const key = eventDateKey(event);
      byDay.set(key, [...(byDay.get(key) ?? []), event]);
    });

    const rows: Array<{ dateStr: string; date: Date; events: ProjectionEvent[]; totals: FlowSummary; balance: number; warning: boolean }> = [];
    for (let i = 0; i < horizonDayCount; i += 1) {
      const dateStr = addDaysIso(todayIso, i);
      const events = byDay.get(dateStr) ?? [];
      const totals = summarizeFlows(events.map((event) => ({ amount: event.amount, borrow: event.type === "borrow" })));
      const balance = toFixed2((rows.at(-1)?.balance ?? totalBankNow) + totals.net);
      rows.push({ dateStr, date: isoToLocalNoon(dateStr), events, totals, balance, warning: balance < threshold });
    }
    return rows;
  }, [horizonEvents, horizonDayCount, totalBankNow, threshold, todayIso]);

  const projectedBalance = horizonRows.at(-1)?.balance ?? totalBankNow;
  const horizonTotals = useMemo(
    () => summarizeFlows(horizonEvents.map((event) => ({ amount: event.amount, borrow: event.type === "borrow" }))),
    [horizonEvents]
  );
  const conservativeProjected = toFixed2(projectedBalance - debtProjection.unplannedExposure - horizonWhatIf.unrepaidDraws);
  const lowDays = horizonRows.filter((d) => d.warning).length;
  const showQuietDays = horizonDayCount <= 62;

  // ── Monthly view ──────────────────────────────────────────────────────────

  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = -6; i <= MAX_HORIZON_MONTHS; i++) {
      const iso = addMonthsIso(`${todayIso.slice(0, 7)}-01`, i);
      opts.push({ value: iso.slice(0, 7), label: isoToLocalNoon(iso).toLocaleString("en-CA", { month: "long", year: "numeric" }) });
    }
    return opts;
  }, [todayIso]);

  const monthlyData = useMemo(() => {
    const monthStartIso = `${selectedMonth}-01`;
    const monthEndIso = endOfMonthIso(monthStartIso);
    const isPast = monthEndIso < todayIso;
    const isFuture = monthStartIso > todayIso;

    // Past: actual transactions grouped by day
    const monthTx = transactions.filter((t) => {
      const d = t.date.slice(0, 7);
      return d === selectedMonth && t.type !== "adjustment";
    }).sort((a, b) => {
      const da = a.date;
      const db = b.date;
      return da > db ? 1 : -1;
    });

    // Current-month posted rows share visibility controls with projections.
    // Past controls are hidden, so historical month lists remain complete.
    const visibleMonthTx = isPast
      ? monthTx
      : monthTx.filter((transaction) => monthlyVisibility[transactionProjectionVisibility(transaction)]);
    const txByDay: Record<string, typeof visibleMonthTx> = {};
    visibleMonthTx.forEach((t) => {
      const d = t.date.slice(0, 10);
      (txByDay[d] = txByDay[d] ?? []).push(t);
    });

    // Future/current: projected events
    const projEvents = isPast
      ? []
      : allFutureEvents.filter((e) => eventDateKey(e).slice(0, 7) === selectedMonth);

    // Group projected events by day
    const visibleProjEvents = projEvents.filter((event) => monthlyVisibility[projectionVisibility(event)]);
    const projByDay: Record<string, typeof visibleProjEvents> = {};
    visibleProjEvents.forEach((e) => {
      const d = eventDateKey(e);
      (projByDay[d] = projByDay[d] ?? []).push(e);
    });

    // Daily totals ignore visibility so they always match the balance.
    const flowsByDay: Record<string, Array<{ amount: number; borrow?: boolean }>> = {};
    monthTx.forEach((t) => {
      const flow = transactionFlow(t);
      if (flow) (flowsByDay[t.date.slice(0, 10)] = flowsByDay[t.date.slice(0, 10)] ?? []).push(flow);
    });
    projEvents.forEach((e) => {
      const d = eventDateKey(e);
      (flowsByDay[d] = flowsByDay[d] ?? []).push({ amount: e.amount, borrow: e.type === "borrow" });
    });

    // Summary
    const actualTotals = summarizeFlows(monthTx.map(transactionFlow).filter((flow): flow is { amount: number; borrow?: boolean } => flow !== null));
    const projectedTotals = summarizeFlows(projEvents.map((e) => ({ amount: e.amount, borrow: e.type === "borrow" })));

    // CRA payments made this month (past)
    const craTx = monthTx.filter((t) =>
      t.tag === "Business"
      && (t.type === "tax_payment" || (t.type === "expense" && t.description?.toLowerCase().includes("cra")))
    );

    // Category breakdown (past)
    const catMap: Record<string, number> = {};
    monthTx.filter((t) => t.type === "expense" || t.type === "refund").forEach((t) => {
      const key = t.categoryId ?? "uncategorized";
      catMap[key] = (catMap[key] ?? 0) + getExpenseReportEffect(t);
    });
    const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Build all days in month
    const daysInSelectedMonth = Number(monthEndIso.slice(8, 10));
    const allDays = Array.from({ length: daysInSelectedMonth }, (_, i) => {
      const dateStr = addDaysIso(monthStartIso, i);
      return {
        dateStr,
        date: isoToLocalNoon(dateStr),
        txns: txByDay[dateStr] ?? [],
        projEvents: projByDay[dateStr] ?? [],
        totals: summarizeFlows(flowsByDay[dateStr] ?? []),
      };
    }).filter((d) => d.txns.length > 0 || d.projEvents.length > 0);

    // Running balance for future months
    let runBal = totalBankNow;
    if (isFuture) {
      const eventsBeforeMonth = allFutureEvents.filter((e) => eventDateKey(e) < monthStartIso);
      runBal = toFixed2(totalBankNow + eventsBeforeMonth.reduce((s, e) => s + e.amount, 0));
    }

    return { isPast, isFuture, actualTotals, projectedTotals, craTx, topCats, allDays, runBal };
  }, [selectedMonth, transactions, todayIso, totalBankNow, allFutureEvents, monthlyVisibility]);

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? id ?? "";
  const accountName = (id?: string) => {
    if (!id) return null;
    const acct = [...accounts, ...cards].find((x) => x.id === id);
    const name = acct ? acct.name : id;
    return /^[0-9a-f-]{20,}$/i.test(name ?? "") ? null : name;
  };
  const scenarioWarnings = horizonWhatIf.warnings.length ? horizonWhatIf.warnings : planningWhatIf.warnings;
  const atScenarioLimit = scenarios.length >= MAX_PROJECTION_SCENARIOS;

  const eventLine = (e: ProjectionEvent, key: string | number, fontSize: number) => {
    const name = accountName(e.account);
    return (
      <div key={key} style={{ fontSize, color: TYPE_COLORS[e.type] ?? "#6b7280", marginLeft: 8, marginBottom: 2, fontWeight: e.type === "borrow" ? 650 : undefined }}>
        {e.type === "transfer" ? "↔" : e.amount > 0 ? "↑" : "↓"} {e.label}: <strong>{fmtCAD(e.displayAmount ?? Math.abs(e.amount))}</strong>
        {e.type === "borrow" && <span style={{ fontSize: 10, marginLeft: 6, padding: "1px 6px", borderRadius: 99, background: "#ffedd5", color: TYPE_COLORS.borrow }}>Borrowing</span>}
        {name && <span style={{ color: "#9ca3af", fontSize: 11 }}> · {name}</span>}
      </div>
    );
  };

  return (
    <div>
      {!hideHeader && (
        <>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Financial Projection</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            Based on all scheduled payments, CRA deadlines, and expected invoice income. Starting balance: {fmtCAD(totalBankNow)}
          </div>
        </>
      )}

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <StatBox label="Current Balance" value={fmtCAD(totalBankNow)} color="#1a7f3c" />
        <StatBox label={`Balance on ${fmtDate(horizonEndIso)}`} value={fmtCAD(projectedBalance)} color={projectedBalance >= threshold ? "#1a7f3c" : "#a31515"} sub={activeScenario ? `includes scenario "${activeScenario.name}"` : "dated income and payments"} />
        <StatBox label="After Debt Exposure" value={fmtCAD(conservativeProjected)} color={conservativeProjected >= threshold ? "#1a7f3c" : "#a31515"} sub="less card/LOC owing with no projected repayment" />
        <StatBox label="Borrowed in Period" value={fmtCAD(horizonTotals.borrowed)} color={horizonTotals.borrowed > 0 ? TYPE_COLORS.borrow : "#1a7f3c"} sub="LOC draws - not income" />
        <StatBox label="Low Balance Days" value={String(lowDays)} color={lowDays > 0 ? "#a31515" : "#1a7f3c"} sub={`through ${fmtDate(horizonEndIso)}`} />
        <StatBox label="Dated Debt Pressure" value={fmtCAD(debtProjection.repaymentPressure)} color={debtProjection.repaymentPressure > 0 ? "#a31515" : "#1a7f3c"} sub="configured card/LOC repayment events" />
        <StatBox label="Unresolved Debt Exposure" value={fmtCAD(debtProjection.unplannedExposure)} color={debtProjection.unplannedExposure > 0 ? "#a05c00" : "#1a7f3c"} sub="not yet covered by a repayment plan" />
      </div>

      {debtProjection.warnings.length > 0 && (
        <Card accent="#a05c00">
          <div style={{ fontWeight: 750, fontSize: 14, color: theme.colors.warning, marginBottom: 4 }}>Card / LOC repayment planning gaps</div>
          <div style={{ fontSize: 12, color: theme.colors.textSoft, marginBottom: 8 }}>
            These amounts are excluded from dated events but deducted in After Debt Exposure so the forecast does not look falsely available.
          </div>
          {debtProjection.warnings.map((warning) => (
            <div key={`${warning.cardId}-${warning.reason}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #fed7aa" }}>
              <span>{warning.name}: {warning.reason === "missing_pay_from" ? "projection enabled but no linked pay-from account" : "owing balance has no repayment strategy"}</span>
              <strong style={{ color: "#a05c00" }}>{fmtCAD(warning.unplannedAmount)}</strong>
            </div>
          ))}
        </Card>
      )}

      {/* Threshold */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Flag days when balance drops below:</span>
          <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 0)}
            style={{ width: 120, padding: "6px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtCAD(threshold)}</span>
        </div>
      </Card>

      {/* Saved what-if scenarios */}
      <Card accent={activeScenario ? "#1a5fa8" : undefined}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 650 }}>What-if scenario:</span>
          <select value={activeScenario ? activeScenario.id : ""} onChange={(e) => selectScenario(e.target.value)}
            aria-label="Active what-if scenario"
            style={{ padding: "7px 10px", border: `1px solid ${theme.colors.border}`, borderRadius: 8, fontSize: 13, background: "#fff", minWidth: 220 }}>
            <option value="">None - scheduled items only</option>
            {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
          </select>
          <Btn variant="secondary" small onClick={() => createScenario()}>New Scenario</Btn>
          {activeScenario && <Btn variant="secondary" small onClick={() => createScenario(activeScenario)}>Duplicate</Btn>}
          {activeScenario && <Btn variant="secondary" small onClick={deleteActiveScenario}>Delete</Btn>}
          <span style={{ fontSize: 11, color: theme.colors.textSoft }}>
            {scenarios.length}/{MAX_PROJECTION_SCENARIOS} saved{atScenarioLimit ? " - delete one to add another" : ""}
            {activeScenario ? ` · ${scenarioStatus === "saving" ? "Saving..." : "All changes saved"}` : ""}
          </span>
        </div>

        {activeScenario && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: theme.colors.textSoft }} htmlFor="scenario-name">Name</label>
              <input id="scenario-name" value={activeScenario.name} maxLength={60}
                onChange={(e) => updateActiveScenario({ name: e.target.value })}
                onBlur={(e) => { if (!e.target.value.trim()) updateActiveScenario({ name: "Untitled scenario" }); }}
                style={{ padding: "7px 9px", border: `1px solid ${theme.colors.border}`, borderRadius: 7, fontSize: 13, minWidth: 240 }} />
              <span style={{ flex: 1 }} />
              <Btn variant="secondary" small onClick={addEntry}>Add Condition</Btn>
            </div>
            {activeScenario.entries.length === 0 && (
              <div style={{ fontSize: 12, color: theme.colors.textSoft }}>No conditions yet. Add one to see its effect on the projection.</div>
            )}
            {activeScenario.entries.map((entry, index) => (
              <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "minmax(145px, 1fr) minmax(100px, 130px) minmax(145px, 170px) minmax(150px, 1fr) auto", gap: 8, alignItems: "center", padding: "9px 10px", border: `1px solid ${entry.type === "loc_draw" ? "#fdba74" : theme.colors.border}`, borderRadius: 8, background: entry.type === "loc_draw" ? "#fff7ed" : theme.colors.surfaceAlt }}>
                <select value={entry.type} onChange={(e) => updateEntry(entry.id, { type: e.target.value as WhatIfType })}
                  aria-label={`Condition ${index + 1} type`} style={{ padding: "7px 9px", border: `1px solid ${theme.colors.border}`, borderRadius: 7, fontSize: 12, background: "#fff" }}>
                  <option value="income">Extra Income</option>
                  <option value="expense">Extra Expense</option>
                  <option value="loc_draw">LOC Withdrawal</option>
                </select>
                <input type="number" min="0" value={entry.amount || ""} onChange={(e) => updateEntry(entry.id, { amount: Math.max(0, Number(e.target.value) || 0) })} placeholder="Amount"
                  aria-label={`Condition ${index + 1} amount`} style={{ padding: "7px 9px", border: `1px solid ${theme.colors.border}`, borderRadius: 7, fontSize: 12 }} />
                <input type="date" value={entry.date} onChange={(e) => updateEntry(entry.id, { date: e.target.value })}
                  aria-label={`Condition ${index + 1} date`} style={{ padding: "7px 9px", border: `1px solid ${theme.colors.border}`, borderRadius: 7, fontSize: 12, background: "#fff" }} />
                {entry.type === "loc_draw" ? (
                  <select value={entry.locId} onChange={(e) => updateEntry(entry.id, { locId: e.target.value })}
                    aria-label={`Condition ${index + 1} LOC`} style={{ padding: "7px 9px", border: `1px solid ${theme.colors.border}`, borderRadius: 7, fontSize: 12, background: "#fff" }}>
                    <option value="">Select LOC</option>
                    {locCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
                  </select>
                ) : <span style={{ fontSize: 11, color: theme.colors.textSoft }}>Projection only</span>}
                <button type="button" onClick={() => removeEntry(entry.id)} aria-label={`Remove condition ${index + 1}`}
                  style={{ width: 30, height: 30, borderRadius: 99, border: "1px solid #fecaca", background: "#fff", color: theme.colors.danger, cursor: "pointer", fontWeight: 800 }}>×</button>
              </div>
            ))}
            {activeScenario.entries.some((entry) => entry.type === "loc_draw") && (
              <div style={{ fontSize: 11, color: TYPE_COLORS.borrow }}>
                LOC withdrawals show as borrowing (orange), not income. Each draw is repaid in full on that LOC&apos;s next payment date after the draw, from its linked account.
              </div>
            )}
            {scenarioWarnings.map((warning) => (
              <div key={warning.entryId} style={{ fontSize: 12, color: theme.colors.warning }}>{warning.message}</div>
            ))}
          </div>
        )}
      </Card>

      {/* View tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Btn variant={view === "daily" ? "primary" : "secondary"} small onClick={() => setView("daily")}>Daily Projection</Btn>
        <Btn variant={view === "monthly" ? "primary" : "secondary"} small onClick={() => setView("monthly")}>Monthly View</Btn>
        {view === "daily" && <span style={{ width: 1, height: 24, background: theme.colors.border, margin: "0 3px" }} />}
        {view === "daily" && HORIZON_OPTIONS.map((option) => (
          <Btn key={option.months} variant={horizonMonths === option.months ? "primary" : "secondary"} small onClick={() => setHorizonMonths(option.months)}>{option.label}</Btn>
        ))}
        {view === "daily" && <span style={{ fontSize: 11, color: theme.colors.textSoft }}>through {fmtDate(horizonEndIso)}</span>}
      </div>

      {view === "daily" && (
        <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, overflow: "hidden" }}>
          {horizonRows.map((d) => {
            const hasEvents = d.events.length > 0;
            const dayLabel = d.date.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
            const showsMonth = d.dateStr.endsWith("-01") || d.dateStr === todayIso;
            const monthHeader = showsMonth && horizonDayCount > 40 ? (
              <div style={{ padding: "6px 12px", background: theme.colors.surfaceAlt, fontSize: 11, fontWeight: 750, color: theme.colors.textSoft, borderBottom: "1px solid #e2e4e8" }}>
                {d.date.toLocaleString("en-CA", { month: "long", year: "numeric" })}
              </div>
            ) : null;
            if (!hasEvents && !d.warning) {
              if (!showQuietDays) return monthHeader ? <div key={d.dateStr}>{monthHeader}</div> : null;
              return (
                <div key={d.dateStr}>
                  {monthHeader}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", borderBottom: "1px solid #f3f4f6", opacity: 0.5 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{dayLabel}</span>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{fmtCAD(d.balance)}</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={d.dateStr}>
                {monthHeader}
                <div style={{
                  padding: "8px 12px", borderBottom: "1px solid #e2e4e8",
                  background: d.warning ? "#fdecea" : "#fff",
                  borderLeft: `3px solid ${d.warning ? "#a31515" : d.totals.borrowed > 0 ? TYPE_COLORS.borrow : d.totals.net > 0 ? "#1a7f3c" : "#e2e4e8"}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: hasEvents ? 4 : 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{dayLabel}{d.dateStr === todayIso ? " (today)" : ""}</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <DayTotals totals={d.totals} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: d.warning ? "#a31515" : "#1a1a1a" }}>{fmtCAD(d.balance)}</span>
                    </div>
                  </div>
                  {d.events.map((e, j) => eventLine(e, j, 11))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Monthly View */}
      {view === "monthly" && (
        <div>
          {/* Month selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>Month:</span>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: "7px 12px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600 }}>
              {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 99, background: monthlyData.isPast ? "#f0fdf4" : monthlyData.isFuture ? "#eff6ff" : "#fef3c7", color: monthlyData.isPast ? "#1a7f3c" : monthlyData.isFuture ? "#1a5fa8" : "#a05c00", fontWeight: 600 }}>
              {monthlyData.isPast ? "Past — Actual" : monthlyData.isFuture ? "Future — Projected" : "Current Month"}
            </span>
          </div>

          {/* Summary */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {monthlyData.isPast ? (
              <>
                <StatBox label="Total Income" value={fmtCAD(monthlyData.actualTotals.in)} color="#1a7f3c" />
                <StatBox label="Total Expenses" value={fmtCAD(monthlyData.actualTotals.out)} color="#a31515" />
                {monthlyData.actualTotals.borrowed > 0 && <StatBox label="Borrowed (LOC)" value={fmtCAD(monthlyData.actualTotals.borrowed)} color={TYPE_COLORS.borrow} sub="not income" />}
                <StatBox label="Net" value={fmtCAD(monthlyData.actualTotals.in - monthlyData.actualTotals.out)} color={monthlyData.actualTotals.in - monthlyData.actualTotals.out >= 0 ? "#1a7f3c" : "#a31515"} sub="income less expenses" />
              </>
            ) : (
              <>
                <StatBox label="Expected Income" value={fmtCAD(monthlyData.projectedTotals.in)} color="#1a7f3c" />
                <StatBox label="Expected Outflows" value={fmtCAD(monthlyData.projectedTotals.out)} color="#a31515" />
                <StatBox label="Borrowing (LOC)" value={fmtCAD(monthlyData.projectedTotals.borrowed)} color={monthlyData.projectedTotals.borrowed > 0 ? TYPE_COLORS.borrow : "#6b7280"} sub="not counted as income" />
                <StatBox label="Projected Net Cash" value={fmtCAD(monthlyData.projectedTotals.net)} color={monthlyData.projectedTotals.net >= 0 ? "#1a7f3c" : "#a31515"} sub="income + borrowing - outflows" />
                <StatBox label="Est. Starting Balance" value={fmtCAD(monthlyData.runBal)} color="#1a5fa8" />
              </>
            )}
          </div>

          {!monthlyData.isPast && (
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.colors.textSoft }}>Show in monthly event list</span>
                {([
                  ["income", "Income"],
                  ["expense", "Expenses"],
                  ["borrowing", "LOC Borrowing"],
                  ["debt", "Debt / CC / LOC"],
                  ["tax", "Tax"],
                  ["transfer", "Internal Transfers"],
                ] as Array<[ProjectionVisibility, string]>).map(([key, label]) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={monthlyVisibility[key]} onChange={(event) => setMonthlyVisibility((current) => ({ ...current, [key]: event.target.checked }))} />
                    {label}
                  </label>
                ))}
                <span style={{ fontSize: 11, color: theme.colors.textSoft }}>Visibility does not change projected totals.</span>
              </div>
            </Card>
          )}

          {/* Category breakdown (past months) */}
          {monthlyData.isPast && monthlyData.topCats.length > 0 && (
            <Card title="Spending by Category">
              {monthlyData.topCats.map(([catId, amt]) => (
                <div key={catId} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span>{catName(catId)}</span>
                    <span style={{ fontWeight: 600 }}>{fmtCAD(amt)}</span>
                  </div>
                  <div style={{ height: 3, background: "#e5e7eb", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${(amt / monthlyData.topCats[0][1]) * 100}%`, background: "#1a5fa8", borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* CRA payments (past) */}
          {monthlyData.isPast && monthlyData.craTx.length > 0 && (
            <Card title="CRA Payments This Month" accent="#4a3ab5">
              {monthlyData.craTx.map((t) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <span>{t.description}</span>
                  <span style={{ fontWeight: 600, color: "#a31515" }}>{fmtCAD(t.amount)}</span>
                </div>
              ))}
            </Card>
          )}

          {/* Day-by-day (past: actual transactions / future: projected events) */}
          <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: "#1e2530", color: "#fff", fontSize: 12, fontWeight: 600 }}>
              {monthlyData.isPast ? "Daily Transactions" : "Projected Daily Events"}
            </div>
            {monthlyData.allDays.length === 0 && (
              <div style={{ textAlign: "center", color: "#6b7280", padding: 24, fontSize: 13 }}>
                {monthlyData.isPast ? "No transactions logged for this month." : "No scheduled events for this month."}
              </div>
            )}
            {monthlyData.allDays.map((day) => (
              <div key={day.dateStr} style={{ padding: "8px 14px", borderBottom: "1px solid #f3f4f6", borderLeft: `3px solid ${day.totals.borrowed > 0 ? TYPE_COLORS.borrow : day.totals.in > 0 ? "#1a7f3c" : "#e2e4e8"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                    {day.date.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <DayTotals totals={day.totals} />
                </div>
                {/* Actual transactions */}
                {day.txns.map((t) => {
                  const flow = transactionFlow(t);
                  const borrow = flow?.borrow === true;
                  const positive = (flow?.amount ?? 0) > 0;
                  const name = accountName(t.sourceId);
                  return (
                    <div key={t.id} style={{ fontSize: 12, color: borrow ? TYPE_COLORS.borrow : positive ? "#1a7f3c" : flow === null ? "#64748b" : "#a31515", marginLeft: 8, marginBottom: 2 }}>
                      {flow === null ? "↔" : positive ? "↑" : "↓"} {t.description || catName(t.categoryId) || "—"}: <strong>{fmtCAD(t.amount)}</strong>
                      {borrow && <span style={{ fontSize: 10, marginLeft: 6, padding: "1px 6px", borderRadius: 99, background: "#ffedd5", color: TYPE_COLORS.borrow }}>Borrowing</span>}
                      {name && <span style={{ color: "#9ca3af", fontSize: 11 }}> · {name}</span>}
                    </div>
                  );
                })}
                {/* Projected events */}
                {day.projEvents.map((e, i) => eventLine(e, i, 12))}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, fontSize: 11, color: "#6b7280", border: "1px solid #e2e4e8" }}>
            <strong>Note:</strong> Past months show actual logged transactions. Future months show scheduled payments, CRA obligations, expected invoice income, and the selected what-if scenario. LOC draws are borrowing, not income. Projections are estimates only.
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardSection() {
  const [tab, setTab] = useState<"overview" | "projection">("overview");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Current financial snapshot and forward-looking projection in one place."
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <Btn variant={tab === "overview" ? "primary" : "secondary"} small onClick={() => setTab("overview")}>
          Overview
        </Btn>
        <Btn variant={tab === "projection" ? "primary" : "secondary"} small onClick={() => setTab("projection")}>
          Projection
        </Btn>
      </div>

      {tab === "overview" ? <DashboardOverviewPanel hideHeader /> : <ProjectionPanel hideHeader />}
    </div>
  );
}
