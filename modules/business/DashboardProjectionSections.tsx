"use client";

import { useState, useMemo } from "react";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { useCategories } from "@/modules/categories/useCategories";
import { useProperties, useVehicles, useHouseLoans } from "./useAssets";
import { useFixedPayments } from "./useFixedPayments";
import { useBusiness } from "./useBusiness";
import { fmtCAD, fmtDate, toFixed2, toMonthly } from "@/utils/finance";
import { DATA_CHANGED_EVENT } from "@/utils/events";
import { useEffect } from "react";
import { theme } from "@/lib/theme";
import type { Transaction } from "@/types/transaction";
import { getExpenseReportEffect, getTransactionListEffect, inferTransactionPurpose } from "@/utils/transactionSemantics";
import { calculateDebtSummary, matchesMortgagePayment, matchesVehicleFinancePayment } from "@/utils/debtReporting";
import { buildDebtRepaymentProjection } from "@/utils/debtProjection";
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

interface ProjectionEvent {
  date: Date;
  label: string;
  amount: number; // positive = income, negative = expense
  type: "vehicle" | "loan" | "fixed" | "cra" | "income" | "invoice" | "debt" | "scenario" | "transfer";
  account?: string;
  displayAmount?: number;
}

type ProjectionVisibility = "income" | "expense" | "debt" | "tax" | "transfer";

function projectionVisibility(event: ProjectionEvent): ProjectionVisibility {
  if (event.type === "income" || event.type === "invoice") return "income";
  if (event.type === "loan" || event.type === "debt") return "debt";
  if (event.type === "cra") return "tax";
  if (event.type === "transfer") return "transfer";
  return "expense";
}

function transactionProjectionVisibility(transaction: Transaction): ProjectionVisibility {
  const purpose = inferTransactionPurpose(transaction);
  if (transaction.type === "tax_payment") return "tax";
  if (transaction.type === "loan_payment" || transaction.type === "loan_receipt") return "debt";
  if (purpose === "credit_card_payment" || purpose === "loc_payment" || purpose === "loc_draw") return "debt";
  if (transaction.type === "transfer") return "transfer";
  if (transaction.type === "income" || transaction.type === "dividend" || transaction.type === "refund") return "income";
  return "expense";
}

type WhatIfType = "income" | "expense" | "loc_draw";

interface WhatIfScenario {
  id: string;
  type: WhatIfType;
  amount: number;
  date: string;
  locId: string;
}

function buildEvents(
  days: number,
  vehicles: ReturnType<typeof useVehicles>["vehicles"],
  houseLoans: ReturnType<typeof useHouseLoans>["houseLoans"],
  cards: ReturnType<typeof useCreditCards>["cards"],
  fixedPayments: ReturnType<typeof useFixedPayments>["fixedPayments"],
  business: ReturnType<typeof useBusiness>["business"],
  incomes: Array<{ id: string; source: string; amount: number; schedule: string; date: string; type: string }>,
  today: Date
): ProjectionEvent[] {
  const events: ProjectionEvent[] = [];
  const end = new Date(today.getTime() + days * 86400000);

  const schedDays: Record<string, number> = {
    Weekly: 7,
    "Bi-weekly": 14,
    "Semi-monthly": 15,
    Monthly: 30,
    Annual: 365,
  };

  const payrollRemittances = business.payrollRemittances ?? [];
  const corporateInstalments = business.corporateInstalments ?? [];
  const hstRemittances = business.hstRemittances ?? [];
  const invoices = business.invoices ?? [];
  const debtProjection = buildDebtRepaymentProjection({ cards, fixedPayments, today, days });

  // Vehicles
  vehicles.forEach((v) => {
    if (!v.payment) return;
    const interval = schedDays[v.schedule] ?? 30;
    let d = v.nextPaymentDate
      ? new Date(v.nextPaymentDate + "T12:00:00")
      : new Date(today.getTime() + interval * 86400000);

    while (d < today) d = new Date(d.getTime() + interval * 86400000);
    while (d <= end) {
      events.push({
        date: new Date(d),
        label: `${v.name} payment`,
        amount: -v.payment,
        type: "vehicle",
        account: v.source,
      });
      d = new Date(d.getTime() + interval * 86400000);
    }
  });

  // House loans
  houseLoans.forEach((l) => {
    if (!l.payment) return;
    const interval = schedDays[l.schedule] ?? 30;
    let d = l.nextPaymentDate
      ? new Date(l.nextPaymentDate + "T12:00:00")
      : new Date(today.getTime() + interval * 86400000);

    while (d < today) d = new Date(d.getTime() + interval * 86400000);
    while (d <= end) {
      events.push({
        date: new Date(d),
        label: `${l.name} payment`,
        amount: -l.payment,
        type: "loan",
        account: l.source,
      });
      d = new Date(d.getTime() + interval * 86400000);
    }
  });

  // Fixed payments
  fixedPayments.forEach((p) => {
    if (!p.amount) return;
    if (p.endDate && new Date(p.endDate + "T12:00:00") < today) return;

    const isTransfer = p.transactionType === "transfer";
    const isLocDraw = p.subType === "loc_draw" || p.purpose === "loc_draw";
    const isDebtPayment = p.subType === "cc_payment" || p.subType === "loc_payment"
      || p.purpose === "credit_card_payment" || p.purpose === "loc_payment";
    const isNeutralTransfer = p.subType === "bank_to_bank" || p.purpose === "bank_transfer";
    const projectedAmount = isLocDraw ? p.amount : isNeutralTransfer ? 0 : -p.amount;
    const projectedType: ProjectionEvent["type"] = isDebtPayment || isLocDraw
      ? "debt"
      : isTransfer
        ? "transfer"
        : "fixed";
    const addFixedEvent = (date: Date) => events.push({
      date,
      label: p.name,
      amount: projectedAmount,
      displayAmount: isNeutralTransfer ? p.amount : undefined,
      type: projectedType,
      account: isLocDraw ? p.destinationId : p.source,
    });

    if (p.schedule === "One-time") {
      const d = new Date(p.date + "T12:00:00");
      if (d >= today && d <= end) {
        addFixedEvent(d);
      }
      return;
    }

    const interval = schedDays[p.schedule] ?? 30;
    let d = new Date(p.date + "T12:00:00");

    while (d <= end) {
      if (d >= today && (!p.endDate || new Date(p.endDate + "T12:00:00") >= d)) {
        addFixedEvent(new Date(d));
      }
      d = new Date(d.getTime() + interval * 86400000);
    }
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
      const d = new Date(dateStr + "T12:00:00");
      if (d >= today && d <= end) {
        events.push({
          date: d,
          label: `CRA Payroll — ${r.month}`,
          amount: -r.amount,
          type: "cra",
        });
      }
    });

  // CRA corp tax
  corporateInstalments
    .filter((i) => !i.paid)
    .forEach((i) => {
      const dateStr = i.plannedDate ?? i.dueDate;
      const d = new Date(dateStr + "T12:00:00");
      if (d >= today && d <= end) {
        events.push({
          date: d,
          label: `Corp Tax ${i.year} ${i.quarter}`,
          amount: -i.amount,
          type: "cra",
        });
      }
    });

  // CRA HST
  hstRemittances
    .filter((h) => !h.paid && h.amount > 0)
    .forEach((h) => {
      const dateStr = h.plannedDate ?? h.dueDate;
      const d = new Date(dateStr + "T12:00:00");
      if (d >= today && d <= end) {
        events.push({
          date: d,
          label: `HST ${h.quarter}`,
          amount: -h.amount,
          type: "cra",
        });
      }
    });

  // Expected invoice income
  invoices
    .filter((i) => !i.paymentDate && i.total > 0)
    .forEach((i) => {
      const estimatedDate = new Date(
        Number(i.workYear || new Date().getFullYear()),
        Number(i.workMonth || new Date().getMonth() + 1),
        15
      );
      if (estimatedDate >= today && estimatedDate <= end) {
        events.push({
          date: estimatedDate,
          label: `Invoice ${i.invoiceNumber} (expected)`,
          amount: i.total,
          type: "invoice",
        });
      }
    });

  // Income sources
  incomes.forEach((inc) => {
    if (!inc.amount || !inc.date) return;

    if (inc.schedule === "One-time") {
      const d = new Date(inc.date + "T12:00:00");
      if (d >= today && d <= end) {
        events.push({
          date: d,
          label: inc.source,
          amount: inc.amount,
          type: "income",
        });
      }
      return;
    }

    const interval = schedDays[inc.schedule] ?? 30;
    let d = new Date(inc.date + "T12:00:00");

    while (d < today) d = new Date(d.getTime() + interval * 86400000);
    while (d <= end) {
      events.push({
        date: new Date(d),
        label: inc.source,
        amount: inc.amount,
        type: "income",
      });
      d = new Date(d.getTime() + interval * 86400000);
    }
  });

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}


const TYPE_COLORS: Record<string, string> = {
  vehicle: "#a05c00", loan: "#a31515", fixed: "#6b7280",
  cra: "#4a3ab5", income: "#1a7f3c", invoice: "#1a7f3c",
  debt: "#b91c1c",
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

function ProjectionPanel({ hideHeader = false }: { hideHeader?: boolean }) {
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { vehicles } = useVehicles();
  const { houseLoans } = useHouseLoans();
  const { fixedPayments } = useFixedPayments();
  const { business } = useBusiness();
  const { transactions } = useTransactions();
  const { categories } = useCategories();

  const [view, setView] = useState<"30day" | "monthly">("30day");
  const [threshold, setThreshold] = useState(0);
  const [whatIf, setWhatIf] = useState(false);
  const [whatIfScenarios, setWhatIfScenarios] = useState<WhatIfScenario[]>(() => [{
    id: "scenario-1",
    type: "income",
    amount: 0,
    date: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    locId: "",
  }]);

  // Monthly view state — past 6 / future 6
  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => now.toISOString().slice(0, 7));
  const [monthlyVisibility, setMonthlyVisibility] = useState<Record<ProjectionVisibility, boolean>>({
    income: true,
    expense: true,
    debt: true,
    tax: false,
    transfer: false,
  });

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const totalBankNow = toFixed2(accounts.reduce((s, a) => s + a.openingBalance, 0));

  const incomes = useMemo(() => [], []); // will be populated when income module is built
  const locCards = useMemo(() => cards.filter((card) => card.active !== false && card.type === "loc"), [cards]);

  const scenarioEvents = useMemo<ProjectionEvent[]>(() => {
    if (!whatIf) return [];
    return whatIfScenarios
      .filter((scenario) => scenario.amount > 0 && scenario.date)
      .map((scenario) => {
        const loc = scenario.type === "loc_draw"
          ? locCards.find((card) => card.id === scenario.locId)
          : undefined;
        return {
          date: new Date(`${scenario.date}T12:00:00`),
          label: scenario.type === "income"
            ? "What-if: Extra income"
            : scenario.type === "expense"
              ? "What-if: Extra expense"
              : `What-if: LOC draw${loc ? ` - ${loc.name}` : ""}`,
          amount: scenario.type === "expense" ? -scenario.amount : scenario.amount,
          type: "scenario" as const,
          account: scenario.type === "loc_draw" ? loc?.linkedAccountId : undefined,
        };
      });
  }, [whatIf, whatIfScenarios, locCards]);

  function updateScenario(id: string, changes: Partial<WhatIfScenario>) {
    setWhatIfScenarios((current) => current.map((scenario) => scenario.id === id ? { ...scenario, ...changes } : scenario));
  }

  function addScenario() {
    setWhatIfScenarios((current) => [...current, {
      id: `scenario-${Date.now()}`,
      type: "expense",
      amount: 0,
      date: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      locId: "",
    }]);
  }

  function removeScenario(id: string) {
    setWhatIfScenarios((current) => current.length === 1
      ? current.map((scenario) => scenario.id === id ? { ...scenario, amount: 0 } : scenario)
      : current.filter((scenario) => scenario.id !== id));
  }

  // 30-day events
  const events30 = useMemo(() => {
    const end = new Date(today.getTime() + 30 * 86400000);
    return [
      ...buildEvents(30, vehicles, houseLoans, cards, fixedPayments, business, incomes, today),
      ...scenarioEvents.filter((event) => event.date >= today && event.date <= end),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [vehicles, houseLoans, cards, fixedPayments, business, incomes, today, scenarioEvents]);
  const debtProjection30 = useMemo(
    () => buildDebtRepaymentProjection({ cards, fixedPayments, today, days: 30 }),
    [cards, fixedPayments, today]
  );

  // Build 30-day with running balance
  const days30 = useMemo(() => {
    const dailyFlows = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today.getTime() + (i + 1) * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      const dayEvents = events30.filter((e) => e.date.toISOString().split("T")[0] === dateStr);
      const flow = toFixed2(dayEvents.reduce((s, e) => s + e.amount, 0));
      return { date: d, dateStr, events: dayEvents, flow };
    });

    return dailyFlows.reduce<Array<{ date: Date; dateStr: string; events: ProjectionEvent[]; flow: number; balance: number; warning: boolean }>>((acc, day) => {
      const previousBalance = acc.length > 0 ? acc[acc.length - 1].balance : totalBankNow;
      const balance = toFixed2(previousBalance + day.flow);
      acc.push({ ...day, balance, warning: balance < threshold });
      return acc;
    }, []);
  }, [events30, totalBankNow, threshold, today]);

  const projected30 = days30[29]?.balance ?? totalBankNow;
  const scenarioLocDebt30 = toFixed2(whatIfScenarios
    .filter((scenario) => whatIf && scenario.type === "loc_draw" && scenario.amount > 0 && scenario.date)
    .filter((scenario) => {
      const date = new Date(`${scenario.date}T12:00:00`);
      return date >= today && date <= new Date(today.getTime() + 30 * 86400000);
    })
    .reduce((sum, scenario) => sum + scenario.amount, 0));
  const conservativeProjected30 = toFixed2(projected30 - debtProjection30.unplannedExposure - scenarioLocDebt30);
  const lowDays = days30.filter((d) => d.warning).length;

  // ── Monthly view ──────────────────────────────────────────────────────────

  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = -6; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push({ value: d.toISOString().slice(0, 7), label: d.toLocaleString("en-CA", { month: "long", year: "numeric" }) });
    }
    return opts;
  }, [now]);

  const monthlyData = useMemo(() => {
    const [yr, mo] = selectedMonth.split("-").map(Number);
    const monthStart = new Date(yr, mo - 1, 1);
    const monthEnd = new Date(yr, mo, 0, 23, 59, 59);
    const isPast = monthEnd < today;
    const isFuture = monthStart > today;

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
      const d = t.date;
      (txByDay[d] = txByDay[d] ?? []).push(t);
    });

    // Future/current: projected events
    const allFutureEvents = [
      ...buildEvents(365, vehicles, houseLoans, cards, fixedPayments, business, incomes, today),
      ...scenarioEvents,
    ].sort((a, b) => a.date.getTime() - b.date.getTime());
    const projEvents = isFuture || !isPast
      ? allFutureEvents
          .filter((e) => {
            const d = e.date.toISOString().slice(0, 7);
            return d === selectedMonth;
          })
      : [];

    // Group projected events by day
    const visibleProjEvents = projEvents.filter((event) => monthlyVisibility[projectionVisibility(event)]);
    const projByDay: Record<string, typeof visibleProjEvents> = {};
    visibleProjEvents.forEach((e) => {
      const d = e.date.toISOString().split("T")[0];
      (projByDay[d] = projByDay[d] ?? []).push(e);
    });

    // Summary
    const totalIn = monthTx.reduce((sum, transaction) => sum + Math.max(0, getTransactionListEffect(transaction) ?? 0), 0);
    const totalOut = monthTx.reduce((sum, transaction) => sum + Math.max(0, -(getTransactionListEffect(transaction) ?? 0)), 0);
    const projIn = projEvents.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const projOut = projEvents.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);

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
    const daysInMonth = monthEnd.getDate();
    const allDays = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(yr, mo - 1, i + 1);
      const dateStr = d.toISOString().split("T")[0];
      return { dateStr, date: d, txns: txByDay[dateStr] ?? [], projEvents: projByDay[dateStr] ?? [] };
    }).filter((d) => d.txns.length > 0 || d.projEvents.length > 0);

    // Running balance for future months
    let runBal = totalBankNow;
    if (isFuture) {
      const eventsBeforeMonth = allFutureEvents
        .filter((e) => e.date < monthStart);
      runBal = toFixed2(totalBankNow + eventsBeforeMonth.reduce((s, e) => s + e.amount, 0));
    }

    return { isPast, isFuture, totalIn, totalOut, projIn, projOut, craTx, topCats, allDays, runBal };
  }, [selectedMonth, transactions, vehicles, houseLoans, cards, fixedPayments, business, incomes, today, totalBankNow, scenarioEvents, monthlyVisibility]);

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? id ?? "";

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
        <StatBox label="30-Day Scheduled" value={fmtCAD(projected30)} color={projected30 >= threshold ? "#1a7f3c" : "#a31515"} sub="dated income and payments" />
        <StatBox label="After Debt Exposure" value={fmtCAD(conservativeProjected30)} color={conservativeProjected30 >= threshold ? "#1a7f3c" : "#a31515"} sub="scheduled less unresolved card/LOC owing" />
        <StatBox label="Low Balance Days" value={String(lowDays)} color={lowDays > 0 ? "#a31515" : "#1a7f3c"} sub="next 30 days" />
        <StatBox label="Dated Debt Pressure" value={fmtCAD(debtProjection30.repaymentPressure)} color={debtProjection30.repaymentPressure > 0 ? "#a31515" : "#1a7f3c"} sub="configured card/LOC repayment events" />
        <StatBox label="Unresolved Debt Exposure" value={fmtCAD(debtProjection30.unplannedExposure)} color={debtProjection30.unplannedExposure > 0 ? "#a05c00" : "#1a7f3c"} sub="not yet covered by a repayment plan" />
      </div>

      {debtProjection30.warnings.length > 0 && (
        <Card accent="#a05c00">
          <div style={{ fontWeight: 750, fontSize: 14, color: theme.colors.warning, marginBottom: 4 }}>Card / LOC repayment planning gaps</div>
          <div style={{ fontSize: 12, color: theme.colors.textSoft, marginBottom: 8 }}>
            These amounts are excluded from dated events but deducted in After Debt Exposure so the forecast does not look falsely available.
          </div>
          {debtProjection30.warnings.map((warning) => (
            <div key={`${warning.cardId}-${warning.reason}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #fed7aa" }}>
              <span>{warning.name}: {warning.reason === "missing_pay_from" ? "projection enabled but no linked pay-from account" : "owing balance has no repayment strategy"}</span>
              <strong style={{ color: "#a05c00" }}>{fmtCAD(warning.unplannedAmount)}</strong>
            </div>
          ))}
        </Card>
      )}

      {/* Threshold + What-if */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Flag days when balance drops below:</span>
          <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 0)}
            style={{ width: 120, padding: "6px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtCAD(threshold)}</span>
        </div>
      </Card>

      <Card accent={whatIf ? "#1a5fa8" : undefined}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
            <input type="checkbox" checked={whatIf} onChange={(e) => setWhatIf(e.target.checked)} />
            What-if scenario
          </label>
          {whatIf && <Btn variant="secondary" small onClick={addScenario}>Add Condition</Btn>}
        </div>
        {whatIf && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {whatIfScenarios.map((scenario, index) => (
              <div key={scenario.id} style={{ display: "grid", gridTemplateColumns: "minmax(145px, 1fr) minmax(100px, 130px) minmax(145px, 170px) minmax(150px, 1fr) auto", gap: 8, alignItems: "center", padding: "9px 10px", border: `1px solid ${theme.colors.border}`, borderRadius: 8, background: theme.colors.surfaceAlt }}>
                <select value={scenario.type} onChange={(e) => updateScenario(scenario.id, { type: e.target.value as WhatIfType })}
                  aria-label={`Condition ${index + 1} type`} style={{ padding: "7px 9px", border: `1px solid ${theme.colors.border}`, borderRadius: 7, fontSize: 12, background: "#fff" }}>
                  <option value="income">Extra Income</option>
                  <option value="expense">Extra Expense</option>
                  <option value="loc_draw">LOC Withdrawal</option>
                </select>
                <input type="number" min="0" value={scenario.amount || ""} onChange={(e) => updateScenario(scenario.id, { amount: Math.max(0, Number(e.target.value) || 0) })} placeholder="Amount"
                  aria-label={`Condition ${index + 1} amount`} style={{ padding: "7px 9px", border: `1px solid ${theme.colors.border}`, borderRadius: 7, fontSize: 12 }} />
                <input type="date" value={scenario.date} onChange={(e) => updateScenario(scenario.id, { date: e.target.value })}
                  aria-label={`Condition ${index + 1} date`} style={{ padding: "7px 9px", border: `1px solid ${theme.colors.border}`, borderRadius: 7, fontSize: 12, background: "#fff" }} />
                {scenario.type === "loc_draw" ? (
                  <select value={scenario.locId} onChange={(e) => updateScenario(scenario.id, { locId: e.target.value })}
                    aria-label={`Condition ${index + 1} LOC`} style={{ padding: "7px 9px", border: `1px solid ${theme.colors.border}`, borderRadius: 7, fontSize: 12, background: "#fff" }}>
                    <option value="">Select LOC</option>
                    {locCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
                  </select>
                ) : <span style={{ fontSize: 11, color: theme.colors.textSoft }}>Projection only</span>}
                <button type="button" onClick={() => removeScenario(scenario.id)} aria-label={`Remove condition ${index + 1}`}
                  style={{ width: 30, height: 30, borderRadius: 99, border: "1px solid #fecaca", background: "#fff", color: theme.colors.danger, cursor: "pointer", fontWeight: 800 }}>×</button>
              </div>
            ))}
            {scenarioLocDebt30 > 0 && (
              <div style={{ fontSize: 11, color: theme.colors.textSoft }}>
                LOC withdrawals add cash to the scheduled projection and add the same amount to debt exposure.
              </div>
            )}
          </div>
        )}
      </Card>

      {/* View tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <Btn variant={view === "30day" ? "primary" : "secondary"} small onClick={() => setView("30day")}>30-Day Daily</Btn>
        <Btn variant={view === "monthly" ? "primary" : "secondary"} small onClick={() => setView("monthly")}>Monthly View</Btn>
      </div>

      {/* 30-Day Daily */}
      {view === "30day" && (
        <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, overflow: "hidden" }}>
          {days30.map((d) => {
            const hasEvents = d.events.length > 0;
            if (!hasEvents && !d.warning) {
              return (
                <div key={d.dateStr} style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", borderBottom: "1px solid #f3f4f6", opacity: 0.5 }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{d.date.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{fmtCAD(d.balance)}</span>
                </div>
              );
            }
            return (
              <div key={d.dateStr} style={{
                padding: "8px 12px", borderBottom: "1px solid #e2e4e8",
                background: d.warning ? "#fdecea" : "#fff",
                borderLeft: `3px solid ${d.warning ? "#a31515" : d.flow > 0 ? "#1a7f3c" : "#e2e4e8"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasEvents ? 4 : 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{d.date.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</span>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {d.flow !== 0 && <span style={{ fontSize: 12, color: d.flow > 0 ? "#1a7f3c" : "#a31515", fontWeight: 600 }}>{d.flow > 0 ? "+" : ""}{fmtCAD(d.flow)}</span>}
                    <span style={{ fontSize: 13, fontWeight: 700, color: d.warning ? "#a31515" : "#1a1a1a" }}>{fmtCAD(d.balance)}</span>
                  </div>
                </div>
                {d.events.map((e, j) => (
                  <div key={j} style={{ fontSize: 11, color: TYPE_COLORS[e.type] ?? "#6b7280", marginLeft: 8 }}>
                    {e.type === "transfer" ? "↔" : e.amount > 0 ? "↑" : "↓"} {e.label}: <strong>{fmtCAD(e.displayAmount ?? Math.abs(e.amount))}</strong>
                    {e.account && (() => {
                      // Resolve ID to name if possible
                      const acct = [...accounts, ...cards].find((x) => x.id === e.account);
                      const displayName = acct ? acct.name : e.account;
                      // Don't show if it looks like a raw UUID
                      const isUUID = /^[0-9a-f-]{20,}$/i.test(displayName ?? "");
                      return !isUUID && displayName
                        ? <span style={{ color: "#9ca3af" }}> · {displayName}</span>
                        : null;
                    })()}
                  </div>
                ))}
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
                <StatBox label="Total Income" value={fmtCAD(monthlyData.totalIn)} color="#1a7f3c" />
                <StatBox label="Total Expenses" value={fmtCAD(monthlyData.totalOut)} color="#a31515" />
                <StatBox label="Net" value={fmtCAD(monthlyData.totalIn - monthlyData.totalOut)} color={monthlyData.totalIn - monthlyData.totalOut >= 0 ? "#1a7f3c" : "#a31515"} />
              </>
            ) : (
              <>
                <StatBox label="Expected Income" value={fmtCAD(monthlyData.projIn)} color="#1a7f3c" />
                <StatBox label="Expected Outflows" value={fmtCAD(monthlyData.projOut)} color="#a31515" />
                <StatBox label="Projected Net" value={fmtCAD(monthlyData.projIn - monthlyData.projOut)} color={monthlyData.projIn - monthlyData.projOut >= 0 ? "#1a7f3c" : "#a31515"} />
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
              <div key={day.dateStr} style={{ padding: "8px 14px", borderBottom: "1px solid #f3f4f6", borderLeft: `3px solid ${day.projEvents.some((e) => e.amount > 0) || day.txns.some((t) => t.type === "income") ? "#1a7f3c" : "#e2e4e8"}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                  {day.date.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
                </div>
                {/* Actual transactions */}
                {day.txns.map((t) => (
                  <div key={t.id} style={{ fontSize: 12, color: t.type === "income" ? "#1a7f3c" : "#a31515", marginLeft: 8, marginBottom: 2 }}>
                    {t.type === "income" ? "↑" : "↓"} {t.description || catName(t.categoryId) || "—"}: <strong>{fmtCAD(t.amount)}</strong>
                    {t.sourceId && (() => {
                      const acct = [...accounts, ...cards].find((x) => x.id === t.sourceId);
                      const name = acct ? acct.name : t.sourceId;
                      const isUUID = /^[0-9a-f-]{20,}$/i.test(name ?? "");
                      return !isUUID ? <span style={{ color: "#9ca3af", fontSize: 11 }}> · {name}</span> : null;
                    })()}
                  </div>
                ))}
                {/* Projected events */}
                {day.projEvents.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: TYPE_COLORS[e.type] ?? "#6b7280", marginLeft: 8, marginBottom: 2 }}>
                    {e.type === "transfer" ? "↔" : e.amount > 0 ? "↑" : "↓"} {e.label}: <strong>{fmtCAD(e.displayAmount ?? Math.abs(e.amount))}</strong>
                    {e.account && (() => {
                      const acct = [...accounts, ...cards].find((x) => x.id === e.account);
                      const name = acct ? acct.name : e.account;
                      const isUUID = /^[0-9a-f-]{20,}$/i.test(name ?? "");
                      return !isUUID ? <span style={{ color: "#9ca3af", fontSize: 11 }}> · {name}</span> : null;
                    })()}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, fontSize: 11, color: "#6b7280", border: "1px solid #e2e4e8" }}>
            <strong>Note:</strong> Past months show actual logged transactions. Future months show scheduled payments, CRA obligations, and expected invoice income. Projections are estimates only.
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
