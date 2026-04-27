"use client";

import { useState, useMemo } from "react";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { useCategories } from "@/modules/categories/useCategories";
import { useVehicles, useHouseLoans } from "./useAssets";
import { useFixedPayments } from "./useFixedPayments";
import { useBusiness } from "./useBusiness";
import { fmtCAD, fmtDate, toFixed2, toMonthly } from "@/utils/finance";
import { DATA_CHANGED_EVENT } from "@/utils/events";
import { useEffect } from "react";

// ─── Primitives ───────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 130, padding: "14px 16px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: color ?? "#1a1a1a" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Card({ title, children, accent }: { title?: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderLeft: accent ? `4px solid ${accent}` : "1px solid #e2e4e8", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
      {title && <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{title}</div>}
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", small }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary"; small?: boolean;
}) {
  const c = { primary: { bg: "#1a5fa8", color: "#fff" }, secondary: { bg: "#f3f4f6", color: "#374151" } }[variant];
  return <button onClick={onClick} style={{ padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, borderRadius: 8, border: "none", cursor: "pointer", background: c.bg, color: c.color }}>{children}</button>;
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
  type: "vehicle" | "loan" | "fixed" | "cra" | "income" | "invoice";
  account?: string;
}

function buildEvents(
  days: number,
  vehicles: ReturnType<typeof useVehicles>["vehicles"],
  houseLoans: ReturnType<typeof useHouseLoans>["houseLoans"],
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

    if (p.schedule === "One-time") {
      const d = new Date(p.date + "T12:00:00");
      if (d >= today && d <= end) {
        events.push({
          date: d,
          label: p.name,
          amount: -p.amount,
          type: "fixed",
          account: p.source,
        });
      }
      return;
    }

    const interval = schedDays[p.schedule] ?? 30;
    let d = new Date(p.date + "T12:00:00");

    while (d <= end) {
      if (d >= today && (!p.endDate || new Date(p.endDate + "T12:00:00") >= d)) {
        events.push({
          date: new Date(d),
          label: p.name,
          amount: -p.amount,
          type: "fixed",
          account: p.source,
        });
      }
      d = new Date(d.getTime() + interval * 86400000);
    }
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
};

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function DashboardSection() {
  const { accounts, reloadAccounts } = useAccounts();
  const { cards } = useCreditCards();
  const { transactions } = useTransactions();
  const { categories } = useCategories();
  const { vehicles } = useVehicles();
  const { houseLoans } = useHouseLoans();
  const { business } = useBusiness();
  const hstRemittances = business.hstRemittances ?? [];
  const corporateInstalments = business.corporateInstalments ?? [];
  const payrollRemittances = business.payrollRemittances ?? [];

  useAutoReload(reloadAccounts);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const monthStr = today.toISOString().slice(0, 7);
  const in30 = new Date(today.getTime() + 30 * 86400000);

  // Net worth
  const totalBank = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const totalAssets = toFixed2(totalBank);
  const ccDebt = cards.reduce((s, c) => s + c.openingBalance, 0);
  const loanDebt = houseLoans.reduce((s, l) => s + l.remaining, 0);
  const vehicleDebt = vehicles.filter((v) => v.vtype === "Finance").reduce((s, v) => s + v.remaining, 0);
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
  const monthTx = transactions.filter((t) => (t.date ?? t.createdAt ?? "").startsWith(monthStr));
  const mIn = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const mOut = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0); // transfers excluded

  // Top categories
  const catMap: Record<string, number> = {};
  transactions.forEach((t) => { if (t.type === "expense") catMap[t.categoryId ?? "other"] = (catMap[t.categoryId ?? "other"] ?? 0) + t.amount; });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Financial Dashboard</div>

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
              <span style={{ color: "#a31515" }}>{fmtCAD(l.remaining)} remaining</span>
            </div>
            {l.principal > 0 && (
              <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${((l.principal - l.remaining) / l.principal) * 100}%`, background: "#1a5fa8", borderRadius: 99 }} />
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

export function ProjectionSection() {
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
  const [wiAmount, setWiAmount] = useState(0);
  const [wiDate, setWiDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]);
  const [wiType, setWiType] = useState<"income" | "expense">("income");

  // Monthly view state — past 6 / future 6
  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => now.toISOString().slice(0, 7));

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const totalBankNow = toFixed2(accounts.reduce((s, a) => s + a.openingBalance, 0));

  const incomes = useMemo(() => [], []); // will be populated when income module is built

  // 30-day events
  const events30 = useMemo(() => {
    let evts = buildEvents(30, vehicles, houseLoans, fixedPayments, business, incomes, today);
    if (whatIf && wiAmount > 0) {
      evts = [...evts, {
        date: new Date(wiDate + "T12:00:00"),
        label: `What-if: ${wiType === "income" ? "Extra Income" : "Extra Expense"}`,
        amount: wiType === "income" ? Number(wiAmount) : -Number(wiAmount),
        type: (wiType === "income" ? "income" : "fixed") as ProjectionEvent["type"],
      }].sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    return evts;
  }, [vehicles, houseLoans, fixedPayments, business, today, whatIf, wiAmount, wiDate, wiType]);

  // Build 30-day with running balance
  const days30 = useMemo(() => {
    let runBal = totalBankNow;
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today.getTime() + (i + 1) * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      const dayEvents = events30.filter((e) => e.date.toISOString().split("T")[0] === dateStr);
      const flow = toFixed2(dayEvents.reduce((s, e) => s + e.amount, 0));
      runBal = toFixed2(runBal + flow);
      return { date: d, dateStr, events: dayEvents, flow, balance: runBal, warning: runBal < threshold };
    });
  }, [events30, totalBankNow, threshold, today]);

  const projected30 = days30[29]?.balance ?? totalBankNow;
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
      const d = (t.date ?? t.createdAt ?? "").slice(0, 7);
      return d === selectedMonth;
    }).sort((a, b) => {
      const da = a.date ?? a.createdAt ?? "";
      const db = b.date ?? b.createdAt ?? "";
      return da > db ? 1 : -1;
    });

    // Group transactions by date
    const txByDay: Record<string, typeof monthTx> = {};
    monthTx.forEach((t) => {
      const d = (t.date ?? t.createdAt ?? "").slice(0, 10);
      (txByDay[d] = txByDay[d] ?? []).push(t);
    });

    // Future/current: projected events
    const projEvents = isFuture || !isPast
      ? buildEvents(365, vehicles, houseLoans, fixedPayments, business, incomes, today)
          .filter((e) => {
            const d = e.date.toISOString().slice(0, 7);
            return d === selectedMonth;
          })
      : [];

    // Group projected events by day
    const projByDay: Record<string, typeof projEvents> = {};
    projEvents.forEach((e) => {
      const d = e.date.toISOString().split("T")[0];
      (projByDay[d] = projByDay[d] ?? []).push(e);
    });

    // Summary
    const totalIn = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalOut = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const projIn = projEvents.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const projOut = projEvents.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);

    // CRA payments made this month (past)
    const craTx = monthTx.filter((t) => t.tag === "Business" && t.type === "expense" && t.description?.toLowerCase().includes("cra"));

    // Category breakdown (past)
    const catMap: Record<string, number> = {};
    monthTx.filter((t) => t.type === "expense").forEach((t) => {
      const key = t.categoryId ?? "uncategorized";
      catMap[key] = (catMap[key] ?? 0) + t.amount;
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
      const eventsBeforeMonth = buildEvents(365, vehicles, houseLoans, fixedPayments, business, incomes, today)
        .filter((e) => e.date < monthStart);
      runBal = toFixed2(totalBankNow + eventsBeforeMonth.reduce((s, e) => s + e.amount, 0));
    }

    return { isPast, isFuture, totalIn, totalOut, projIn, projOut, craTx, topCats, allDays, runBal };
  }, [selectedMonth, transactions, vehicles, houseLoans, fixedPayments, business, incomes, today, totalBankNow]);

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? id ?? "";

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Financial Projection</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        Based on all scheduled payments, CRA deadlines, and expected invoice income. Starting balance: {fmtCAD(totalBankNow)}
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <StatBox label="Current Balance" value={fmtCAD(totalBankNow)} color="#1a7f3c" />
        <StatBox label="30-Day Projected" value={fmtCAD(projected30)} color={projected30 >= threshold ? "#1a7f3c" : "#a31515"} />
        <StatBox label="Low Balance Days" value={String(lowDays)} color={lowDays > 0 ? "#a31515" : "#1a7f3c"} sub="next 30 days" />
      </div>

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
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
            <input type="checkbox" checked={whatIf} onChange={(e) => setWhatIf(e.target.checked)} />
            What-if scenario
          </label>
          {whatIf && (
            <>
              <select value={wiType} onChange={(e) => setWiType(e.target.value as "income" | "expense")}
                style={{ padding: "5px 8px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 12, background: "#fff" }}>
                <option value="income">Extra Income</option>
                <option value="expense">Extra Expense</option>
              </select>
              <input type="number" value={wiAmount} onChange={(e) => setWiAmount(Number(e.target.value))} placeholder="Amount"
                style={{ width: 110, padding: "5px 8px", border: "1px solid #1a5fa8", borderRadius: 6, fontSize: 12 }} />
              <span style={{ fontSize: 12, color: "#6b7280" }}>on</span>
              <input type="date" value={wiDate} onChange={(e) => setWiDate(e.target.value)}
                style={{ padding: "5px 8px", border: "1px solid #1a5fa8", borderRadius: 6, fontSize: 12, background: "#fff" }} />
            </>
          )}
        </div>
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
                    {e.amount > 0 ? "↑" : "↓"} {e.label}: <strong>{fmtCAD(Math.abs(e.amount))}</strong>
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
                    {e.amount > 0 ? "↑" : "↓"} {e.label}: <strong>{fmtCAD(Math.abs(e.amount))}</strong>
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