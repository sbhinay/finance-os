"use client";

import { TransactionForm } from "./TransactionForm";
import { useEffect, useMemo, useState } from "react";
import { Vehicle, HouseLoan, PaymentSchedule } from "@/types/domain";
import { Account } from "@/types/account";
import { useCategories } from "@/modules/categories/useCategories";
import { useVehicles, useHouseLoans } from "./useAssets";
import { advanceOneInterval, fmtCAD, fmtDate, getNextOccurrence, toFixed2, toMonthly, uid } from "@/utils/finance";
import { Transaction } from "@/types/transaction";
import { transactionRepository } from "@/repositories/transactionRepository";
import { notifyDataChanged } from "@/utils/events";
import { syncBalances } from "@/utils/syncBalances";
import { calculateBackfillDates } from "./useFixedPayments";
import { theme } from "@/lib/theme";
type TransactionFormInitial = React.ComponentProps<typeof TransactionForm>["initial"];

// Primitives

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" as const, color: theme.colors.textSoft, display: "block", marginBottom: 6 }}>{children}</label>;
}
function Inp({ label, type = "text", value, onChange, placeholder }: {
  label?: string; type?: string; value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string;
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input type={type} value={value ?? ""} onChange={onChange} placeholder={placeholder}
        style={{ width: "100%", padding: "10px 12px", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, background: "#fff", fontSize: 13, boxSizing: "border-box" as const, color: theme.colors.text }} />
    </div>
  );
}
function Sel({ label, value, onChange, options }: {
  label?: string; value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string } | string>;
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <select value={value ?? ""} onChange={onChange}
        style={{ width: "100%", padding: "10px 12px", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, background: "#fff", fontSize: 13, color: theme.colors.text }}>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </div>
  );
}
function Btn({ children, onClick, variant = "primary", small, style }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "green"; small?: boolean; style?: React.CSSProperties;
}) {
  const c = {
    primary: { bg: theme.colors.primary, color: "#fff", border: theme.colors.primary },
    secondary: { bg: "rgba(255,255,255,0.92)", color: theme.colors.text, border: theme.colors.border },
    danger: { bg: theme.colors.dangerSoft, color: theme.colors.danger, border: "#f7c8c4" },
    green: { bg: theme.colors.success, color: "#fff", border: theme.colors.success },
  }[variant];
  return <button onClick={onClick} style={{ padding: small ? "6px 12px" : "10px 16px", fontSize: small ? 12 : 13, fontWeight: 700, borderRadius: 999, border: `1px solid ${c.border}`, cursor: "pointer", background: c.bg, color: c.color, boxShadow: variant === "secondary" ? "none" : theme.shadow.soft, ...style }}>{children}</button>;
}
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: theme.radius.lg, width: "100%", maxWidth: wide ? 720 : 520, maxHeight: "90vh", overflowY: "auto", boxShadow: theme.shadow.shell, border: `1px solid ${theme.colors.border}` }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${theme.colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: theme.colors.text }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: "22px", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
      </div>
    </div>
  );
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>{children}</div>;
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>{children}</div>;
}
function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...theme.cardStyle(), flex: 1, minWidth: 150, padding: "16px 18px", background: theme.colors.surfaceAlt }}>
      <div style={{ fontSize: 11, color: theme.colors.textSoft, fontWeight: 700, textTransform: "uppercase", marginBottom: 6, letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 21, color: color ?? theme.colors.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  const m: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#dcfce7", fg: "#1a7f3c" }, amber: { bg: "#fef3c7", fg: "#a05c00" },
    gray: { bg: "#f3f4f6", fg: "#6b7280" }, blue: { bg: "#dbeafe", fg: "#1a5fa8" },
    purple: { bg: "#ede9fe", fg: "#4a3ab5" }, teal: { bg: "#d1fae5", fg: "#065f46" },
    red: { bg: "#fee2e2", fg: "#a31515" },
  };
  const c = m[color] ?? m.gray;
  return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>{children}</span>;
}

const SCHEDULES: PaymentSchedule[] = ["Monthly", "Bi-weekly", "Weekly", "Semi-monthly", "Annual"];

// Mileage projection (mirrors prototype exactly)

function mileageProjection(v: Vehicle) {
  if (!v.leaseStart || !v.leaseEnd || !v.mileageAllowance) return null;
  const start = new Date(v.leaseStart + "T12:00:00");
  const end = new Date(v.leaseEnd + "T12:00:00");
  const now = new Date();
  if (now < start) return null;
  const totalDays = (end.getTime() - start.getTime()) / 86400000;
  const elapsed = (now.getTime() - start.getTime()) / 86400000;
  const pct = Math.min(elapsed / totalDays, 1);
  const totalAllowed = toFixed2(v.mileageAllowance * (totalDays / 365));
  const allowedSoFar = toFixed2(pct * totalAllowed);
  return { allowedSoFar, totalAllowed, daysLeft: Math.max(0, Math.round(totalDays - elapsed)) };
}

function getVehicleStatus(v: Vehicle): string {
  if (v.vtype === "Finance") {
    if (v.remaining <= 0 && v.principal > 0) return "Paid Off";
    return "Active";
  }
  if (!v.leaseEnd) return v.status ?? "Active";
  const daysLeft = (new Date(v.leaseEnd + "T12:00:00").getTime() - Date.now()) / 86400000;
  if (daysLeft < 0) return "Ended";
  if (daysLeft <= 90) return "Ending Soon";
  return "Active";
}

function pickLeaseVehicleCategoryId(categories: Array<{ id: string; name: string }>): string | undefined {
  const preferredNames = ["Vehicle Lease", "Transportation", "Car Maintenance"];
  for (const name of preferredNames) {
    const match = categories.find((category) => category.name === name);
    if (match) return match.id;
  }
  return undefined;
}

// -----------------------------------------------------------------------------
// VEHICLES SECTION
// -----------------------------------------------------------------------------

export function VehiclesSection({
  accounts,
  transactions,
  editVehicleId,
  onEditHandled,
}: {
  accounts: Account[];
  transactions: Transaction[];
  editVehicleId?: string | null;
  onEditHandled?: () => void;
}) {
  const { vehicles, addVehicle, updateVehicle, deleteVehicle } = useVehicles();
  const { categories } = useCategories();

  const emptyForm = useMemo(() => ({
    id: "" as string | undefined,
    name: "", year: "", make: "", model: "",
    vtype: "Lease" as Vehicle["vtype"],
    payment: 0, schedule: "Monthly" as PaymentSchedule,
    source: "", leaseStart: "", leaseEnd: "",
    nextPaymentDate: "", mileageAllowance: 20000,
    excessRate: 0.15, residual: 0,
    endOfLeaseOption: "Return" as Vehicle["endOfLeaseOption"],
    principal: 0, remaining: 0, interestRate: 0,
    insuranceAmount: 0, insuranceSchedule: "Monthly" as PaymentSchedule, insuranceDate: "", insuranceSource: "",
    status: "Active",
  }), []);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detail, setDetail] = useState<Vehicle | null>(null);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<TransactionFormInitial>(undefined);
  const [txScheduledAmount, setTxScheduledAmount] = useState<number | undefined>();
  const [backfillModal, setBackfillModal] = useState<{ vehicle: Vehicle; dates: string[] } | null>(null);
  const [backfillAccountId, setBackfillAccountId] = useState("");
  const [backfillDone, setBackfillDone] = useState<number | null>(null);

  useEffect(() => {
    if (!editVehicleId) return;
    const vehicle = vehicles.find((v) => v.id === editVehicleId);
    if (!vehicle) return;
    const frame = window.requestAnimationFrame(() => {
      setForm({ ...emptyForm, ...vehicle });
      setShowForm(true);
      onEditHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editVehicleId, vehicles, onEditHandled, emptyForm]);

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  function openLog(vehicle: Vehicle) {
    const nextDate = vehicle.nextPaymentDate
      ? (getNextOccurrence(vehicle.nextPaymentDate, vehicle.schedule) ?? vehicle.nextPaymentDate)
      : new Date().toISOString().split("T")[0];
    const isFinanced = vehicle.vtype === "Finance";
    const leaseCategoryId = !isFinanced ? pickLeaseVehicleCategoryId(categories) : undefined;
    setTxFormInitial({
      type: isFinanced ? "loan_payment" : "expense",
      subType: isFinanced ? "bank_loan" : undefined,
      amount: vehicle.payment,
      date: nextDate,
      sourceId: vehicle.source ?? "",
      description: isFinanced ? `Vehicle Finance Payment - ${vehicle.name}` : `Vehicle Lease Payment - ${vehicle.name}`,
      linkedVehicleId: vehicle.id,
      categoryId: leaseCategoryId,
      mode: "Debit",
      tag: "Personal",
    });
    setTxScheduledAmount(vehicle.payment);
    setTxFormOpen(true);
  }

  function openBackfill(vehicle: Vehicle) {
    const anchorDate = vehicle.leaseStart || vehicle.nextPaymentDate;
    if (!anchorDate) {
      alert("Please set a vehicle start date or next payment date first.");
      return;
    }

    const dates = calculateBackfillDates(anchorDate, vehicle.schedule, vehicle.leaseEnd);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const cutoff = yesterday.toISOString().split("T")[0];
    const pastDates = dates.filter((d) => d <= cutoff);

    if (pastDates.length === 0) {
      alert("No historical vehicle payments to backfill - all scheduled dates are in the future.");
      return;
    }

    setBackfillAccountId(vehicle.source ?? "");
    setBackfillModal({ vehicle, dates: pastDates });
    setBackfillDone(null);
  }

  function backfillVehiclePayments(vehicle: Vehicle, dates: string[], accountId: string): number {
    if (!dates.length || !accountId) return 0;

    const existing = transactionRepository.getAll();
    const existingDates = new Set(
      existing
        .filter((tx) => tx.linkedVehicleId === vehicle.id)
        .map((tx) => tx.date)
    );

    let inserted = 0;
    dates.forEach((date) => {
      if (existingDates.has(date)) return;
      const isFinanced = vehicle.vtype === "Finance";
      const leaseCategoryId = !isFinanced ? pickLeaseVehicleCategoryId(categories) : undefined;
      const tx: Transaction = {
        id: uid(),
        type: isFinanced ? "loan_payment" : "expense",
        subType: isFinanced ? "bank_loan" : undefined,
        amount: toFixed2(vehicle.payment),
        date,
        createdAt: new Date(`${date}T12:00:00`).toISOString(),
        description: isFinanced ? `Vehicle Finance Payment - ${vehicle.name}` : `Vehicle Lease Payment - ${vehicle.name}`,
        sourceId: accountId,
        categoryId: leaseCategoryId,
        tag: "Personal",
        mode: "Debit",
        currency: "CAD",
        status: "cleared",
        linkedVehicleId: vehicle.id,
      };
      existing.push(tx);
      inserted += 1;
    });

    if (inserted > 0) {
      transactionRepository.saveAll(existing);
      const advancedDate = getNextOccurrence(vehicle.nextPaymentDate || vehicle.leaseStart, vehicle.schedule)
        ?? advanceOneInterval(dates[dates.length - 1], vehicle.schedule);
      updateVehicle({
        ...vehicle,
        source: accountId,
        nextPaymentDate: advancedDate,
      });
      syncBalances();
      notifyDataChanged("transactions");
    }

    return inserted;
  }

  function save() {
    if (!form.name) return;
    const v = {
      ...form,
      payment: toFixed2(Number(form.payment)),
      principal: toFixed2(Number(form.principal)),
      remaining: toFixed2(Number(form.remaining)),
      insuranceAmount: toFixed2(Number(form.insuranceAmount || 0)),
    };
    if (form.id) { updateVehicle(v as Vehicle); }
    else { addVehicle(v as Omit<Vehicle, "id">); }
    setShowForm(false); setForm(emptyForm);
  }

  const acctOpts = [{ value: "", label: "-- Select account --" }, ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.type})` }))];
  const statusColor: Record<string, string> = { Active: "green", "Ending Soon": "amber", Ended: "gray", "Paid Off": "teal" };
  const totalMonthly = vehicles.reduce((s, v) => s + toMonthly(v.payment, v.schedule), 0);

  // Helper to get account name from ID
  const getAccountName = (accountId: string) => {
    return accounts.find((a) => a.id === accountId)?.name ?? accountId;
  };

  function getVehicleSpendByCategory(vehicleId: string) {
    const totals = new Map<string, number>();
    transactions
      .filter((t) => t.linkedVehicleId === vehicleId && t.type === "expense")
      .forEach((t) => {
        const key = categories.find((c) => c.id === t.categoryId)?.name ?? "Uncategorized";
        totals.set(key, (totals.get(key) ?? 0) + t.amount);
      });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", color: theme.colors.text, marginBottom: 16 }}>Vehicles</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <StatBox label="Total Vehicles" value={String(vehicles.length)} />
        <StatBox label="Active Leases" value={String(vehicles.filter((v) => v.vtype === "Lease" && getVehicleStatus(v) !== "Ended").length)} />
        <StatBox label="Financed" value={String(vehicles.filter((v) => v.vtype === "Finance").length)} />
        <StatBox label="Monthly Cost" value={fmtCAD(toFixed2(totalMonthly))} color="#a31515" sub="all vehicles combined" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn small onClick={() => { setForm(emptyForm); setShowForm(true); }}>+ Add Vehicle</Btn>
      </div>

      {vehicles.map((v) => {
        const st = getVehicleStatus(v);
        const mp = mileageProjection(v);
        const next = getNextOccurrence(v.nextPaymentDate, v.schedule);
        const categorySpend = getVehicleSpendByCategory(v.id);
        const totalSpent = categorySpend.reduce((sum, [, amount]) => sum + amount, 0);
        return (
          <div key={v.id} style={{ ...theme.cardStyle(), padding: "16px 18px", marginBottom: 12, background: theme.colors.surface }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</div>
                  <Pill color={statusColor[st] ?? "gray"}>{st}</Pill>
                  <Pill color={v.vtype === "Lease" ? "purple" : "blue"}>{v.vtype}</Pill>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{v.year} {v.make} {v.model}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {fmtCAD(v.payment)}/{v.schedule}
                  {v.source ? ` - From: ${getAccountName(v.source)}` : ""}
                  {v.nextPaymentDate
                    ? ` - Next: ${fmtDate(next ?? v.nextPaymentDate)}`
                    : " - Set next payment date"}
                </div>
                {!!v.insuranceAmount && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    Insurance: {fmtCAD(v.insuranceAmount)}/{v.insuranceSchedule ?? "Monthly"}
                    {v.insuranceSource ? ` - From: ${getAccountName(v.insuranceSource)}` : ""}
                    {v.insuranceDate ? ` - Next: ${fmtDate(v.insuranceDate)}` : ""}
                  </div>
                )}
                {v.vtype === "Lease" && v.leaseEnd && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Lease ends: {fmtDate(v.leaseEnd)}{mp && mp.daysLeft > 0 ? ` - ${mp.daysLeft} days left` : ""}
                  </div>
                )}
                {v.vtype === "Finance" && v.principal > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99, width: 200 }}>
                      <div style={{ height: "100%", width: `${Math.min(100 - ((v.remaining / v.principal) * 100), 100)}%`, background: "#1a5fa8", borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      {fmtCAD(v.principal - v.remaining)} paid - {fmtCAD(v.remaining)} remaining
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.colors.border}` }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: categorySpend.length ? 8 : 0 }}>
                    <StatBox label="Spent To Date" value={fmtCAD(totalSpent)} sub="logged expenses only" color="#a31515" />
                    <StatBox label="Expense Entries" value={String(transactions.filter((t) => t.linkedVehicleId === v.id && t.type === "expense").length)} />
                  </div>
                  {categorySpend.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {categorySpend.slice(0, 4).map(([name, amount]) => (
                        <Pill key={`${v.id}-${name}`} color="gray">{name}: {fmtCAD(toFixed2(amount))}</Pill>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", marginLeft: "auto", minWidth: 120 }}>
                <Btn variant="green" small onClick={() => openLog(v)}>Log Payment</Btn>
                <Btn variant="secondary" small onClick={() => openBackfill(v)}>Backfill</Btn>
                <Btn variant="secondary" small onClick={() => setDetail(v)}>View History</Btn>
                <Btn variant="secondary" small onClick={() => { setForm({ ...emptyForm, ...v }); setShowForm(true); }}>Edit</Btn>
                <Btn variant="danger" small onClick={() => { if (confirm(`Delete ${v.name}?`)) deleteVehicle(v.id); }}>Delete</Btn>
              </div>
            </div>
          </div>
        );
      })}

      {vehicles.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>No vehicles yet.</div>}

      {showForm && (
        <Modal title={form.id ? "Edit Vehicle" : "Add Vehicle"} onClose={() => setShowForm(false)} wide>
          <Grid2>
            <Inp label="Vehicle Name / Nickname" value={form.name} onChange={f("name")} placeholder="e.g. CX-5 Lease" />
            <Sel label="Type" value={form.vtype} onChange={f("vtype")} options={[{ value: "Lease", label: "Lease" }, { value: "Finance", label: "Finance / Loan" }]} />
          </Grid2>
          <Grid3>
            <Inp label="Year" value={form.year} onChange={f("year")} placeholder="2023" />
            <Inp label="Make" value={form.make} onChange={f("make")} placeholder="Mazda" />
            <Inp label="Model" value={form.model} onChange={f("model")} placeholder="CX-5" />
          </Grid3>
          <Grid3>
            <Inp label="Payment ($)" type="number" value={form.payment} onChange={f("payment")} />
            <Sel label="Schedule" value={form.schedule} onChange={f("schedule")} options={SCHEDULES.map((s) => ({ value: s, label: s }))} />
            <Sel label="Payment From" value={form.source} onChange={f("source")} options={acctOpts} />
          </Grid3>
          <Grid3>
            <Inp label="Insurance ($, optional)" type="number" value={form.insuranceAmount} onChange={f("insuranceAmount")} />
            <Sel label="Insurance Schedule" value={form.insuranceSchedule} onChange={f("insuranceSchedule")} options={SCHEDULES.map((s) => ({ value: s, label: s }))} />
            <Sel label="Insurance From" value={form.insuranceSource || form.source} onChange={f("insuranceSource")} options={acctOpts} />
          </Grid3>
          <Grid3>
            <Inp label="Start Date" type="date" value={form.leaseStart} onChange={f("leaseStart")} />
            <Inp label={form.vtype === "Lease" ? "Lease End Date" : "Loan End Date"} type="date" value={form.leaseEnd} onChange={f("leaseEnd")} />
            <Inp label="Next Payment Date" type="date" value={form.nextPaymentDate ?? ""} onChange={f("nextPaymentDate")} />
          </Grid3>
          <Inp label="Insurance Next Due (optional)" type="date" value={form.insuranceDate ?? ""} onChange={f("insuranceDate")} />
          {form.vtype === "Lease" && (
            <>
              <Grid3>
                <Inp label="Mileage Allowance (km/yr)" type="number" value={form.mileageAllowance} onChange={f("mileageAllowance")} />
                <Inp label="Excess Rate ($/km)" type="number" value={form.excessRate} onChange={f("excessRate")} placeholder="0.15" />
                <Inp label="Residual / Buyout ($)" type="number" value={form.residual} onChange={f("residual")} />
              </Grid3>
              <Sel label="End of Lease Plan" value={form.endOfLeaseOption} onChange={f("endOfLeaseOption")} options={["Return", "Buy Out", "Extend", "Undecided"]} />
            </>
          )}
          {form.vtype === "Finance" && (
            <Grid3>
              <Inp label="Original Loan ($)" type="number" value={form.principal} onChange={f("principal")} />
              <Inp label="Remaining Balance ($)" type="number" value={form.remaining} onChange={f("remaining")} />
              <Inp label="Interest Rate (%)" type="number" value={form.interestRate} onChange={f("interestRate")} />
            </Grid3>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn onClick={save}>Save Vehicle</Btn>
          </div>
        </Modal>
      )}

      {backfillModal && (
        <Modal title={`Backfill - ${backfillModal.vehicle.name}`} onClose={() => setBackfillModal(null)}>
          {backfillDone !== null ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>Done</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{backfillDone} transaction{backfillDone !== 1 ? "s" : ""} logged</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Historical vehicle payments have been added to your transaction log.</div>
              <div style={{ marginTop: 16 }}>
                <Btn onClick={() => setBackfillModal(null)}>Done</Btn>
              </div>
            </div>
          ) : (
            <>
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1a5fa8" }}>
                Found <strong>{backfillModal.dates.length} scheduled vehicle payments</strong> from {fmtDate(backfillModal.dates[0])} to {fmtDate(backfillModal.dates[backfillModal.dates.length - 1])}. Existing matching transactions will be skipped automatically.
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e2e4e8", borderRadius: 8 }}>
                {backfillModal.dates.map((d) => (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
                    <span>{fmtDate(d)}</span>
                    <span style={{ fontWeight: 600, color: "#a31515" }}>{fmtCAD(backfillModal.vehicle.payment)}</span>
                  </div>
                ))}
              </div>
              <div>
                <Label>Pay From Account</Label>
                <select
                  value={backfillAccountId}
                  onChange={(e) => setBackfillAccountId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${backfillAccountId ? "#1a7f3c" : "#e2e4e8"}`, borderRadius: 8, background: "#fff", fontSize: 13 }}
                >
                  <option value="">-- Select account --</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({fmtCAD(a.openingBalance)})</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn variant="secondary" onClick={() => setBackfillModal(null)}>Cancel</Btn>
                <Btn onClick={() => {
                  if (!backfillAccountId) { alert("Please select an account."); return; }
                  const count = backfillVehiclePayments(backfillModal.vehicle, backfillModal.dates, backfillAccountId);
                  setBackfillDone(count);
                }}>Log {backfillModal.dates.length} Payments</Btn>
              </div>
            </>
          )}
        </Modal>
      )}

      {detail && (
        <Modal title={`${detail.name} - Expense History`} onClose={() => setDetail(null)} wide>
          {(() => {
            const txns = transactions
              .filter((t) => t.linkedVehicleId === detail.id && t.type !== "adjustment")
              .sort((a, b) => {
                const aTime = Date.parse(a.date ?? a.createdAt ?? "") || 0;
                const bTime = Date.parse(b.date ?? b.createdAt ?? "") || 0;
                if (bTime !== aTime) return bTime - aTime;
                return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
              });
            const expenseTxns = txns.filter((t) => t.type === "expense");
            const total = expenseTxns.reduce((s, t) => s + t.amount, 0);
            const spendByCategory = expenseTxns.reduce<Record<string, number>>((acc, t) => {
              const key = categories.find((c) => c.id === t.categoryId)?.name ?? "Uncategorized";
              acc[key] = (acc[key] ?? 0) + t.amount;
              return acc;
            }, {});
            const categoryRows = Object.entries(spendByCategory).sort((a, b) => b[1] - a[1]);
            return (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <StatBox label="Total Spent" value={fmtCAD(total + detail.payment)} sub="incl. monthly payments" />
                  <StatBox label="Expense Entries" value={String(txns.length)} />
                </div>
                {categoryRows.length > 0 && (
                  <div style={{ background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Spent By Category</div>
                    {categoryRows.map(([name, amount]) => (
                      <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
                        <span>{name}</span>
                        <span style={{ fontWeight: 600 }}>{fmtCAD(toFixed2(amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {txns.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>No expenses logged for this vehicle yet.</div>}
                {txns.map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{t.description || t.categoryId || "--"}</span>
                      <span style={{ color: "#6b7280", fontSize: 11 }}> - {fmtDate((t.date ?? t.createdAt ?? "").slice(0, 10))}</span>
                      {t.odometer && <span style={{ color: "#1a5fa8", fontSize: 11 }}> - {Number(t.odometer).toLocaleString()} km</span>}
                    </div>
                    <Pill color="red">{fmtCAD(t.amount)}</Pill>
                  </div>
                ))}
              </>
            );
          })()}
        </Modal>
      )}

      <TransactionForm
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setTxFormInitial(undefined); setTxScheduledAmount(undefined); }}
        initial={txFormInitial}
        scheduledAmount={txScheduledAmount}
        title={txFormInitial?.subType === "bank_loan" ? "Log Vehicle Finance Payment" : "Log Vehicle Payment"}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// HOUSE LOANS SECTION
// -----------------------------------------------------------------------------

export function HouseLoansSection({
  accounts,
  editHouseLoanId,
  onEditHandled,
}: {
  accounts: Account[];
  editHouseLoanId?: string | null;
  onEditHandled?: () => void;
}) {
  const { houseLoans, addHouseLoan, updateHouseLoan, deleteHouseLoan } = useHouseLoans();

  const emptyForm = useMemo(() => ({
    id: "" as string | undefined,
    name: "", address: "", principal: 0, remaining: 0,
    payment: 0, schedule: "Bi-weekly" as PaymentSchedule,
    source: "", startDate: "", endDate: "",
    nextPaymentDate: "", interestRate: 0,
    propertyTaxAmount: 0,
    propertyTaxSchedule: "Monthly" as PaymentSchedule,
    propertyTaxDate: "",
    propertyTaxSource: "",
    propertyTaxRollNumber: "",
  }), []);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<TransactionFormInitial>(undefined);
  const [txScheduledAmount, setTxScheduledAmount] = useState<number | undefined>();
  const [backfillModal, setBackfillModal] = useState<{ loan: HouseLoan; dates: string[] } | null>(null);
  const [backfillAccountId, setBackfillAccountId] = useState("");
  const [backfillDone, setBackfillDone] = useState<number | null>(null);

  useEffect(() => {
    if (!editHouseLoanId) return;
    const loan = houseLoans.find((h) => h.id === editHouseLoanId);
    if (!loan) return;
    const frame = window.requestAnimationFrame(() => {
      setForm({ ...emptyForm, ...loan, id: loan.id });
      setShowForm(true);
      onEditHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editHouseLoanId, houseLoans, onEditHandled, emptyForm]);
  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!form.name) return;
    const l = {
      ...form,
      principal: toFixed2(Number(form.principal)),
      remaining: toFixed2(Number(form.remaining)),
      payment: toFixed2(Number(form.payment)),
      propertyTaxAmount: toFixed2(Number(form.propertyTaxAmount || 0)),
    };
    if (form.id) { updateHouseLoan(l as HouseLoan); }
    else { addHouseLoan(l as Omit<HouseLoan, "id">); }
    setShowForm(false); setForm(emptyForm);
  }

  const acctOpts = [{ value: "", label: "-- Select account --" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))];
  const totalRemaining = houseLoans.reduce((s, l) => s + l.remaining, 0);
  const totalMonthly = houseLoans.reduce((s, l) => s + toMonthly(l.payment, l.schedule), 0);

  // Helper to get account name from ID
  const getAccountName = (accountId: string) => {
    return accounts.find((a) => a.id === accountId)?.name ?? accountId;
  };
  const sourceExists = form.source ? accounts.some((a) => a.id === form.source) : true;
  const propertyTaxSourceExists = form.propertyTaxSource
    ? accounts.some((a) => a.id === form.propertyTaxSource)
    : true;
  const formAcctOpts = sourceExists
    ? acctOpts
    : [
        { value: "", label: "-- Select account --" },
        { value: form.source, label: `Legacy source (${form.source})` },
        ...accounts.map((a) => ({ value: a.id, label: a.name })),
      ];
  const formPropertyTaxAcctOpts = propertyTaxSourceExists
    ? acctOpts
    : [
        { value: "", label: "-- Select account --" },
        { value: form.propertyTaxSource ?? "", label: `Legacy source (${form.propertyTaxSource})` },
        ...accounts.map((a) => ({ value: a.id, label: a.name })),
      ];

  function openLog(loan: HouseLoan) {
    const nextDate = loan.nextPaymentDate
      ? (getNextOccurrence(loan.nextPaymentDate, loan.schedule) ?? loan.nextPaymentDate)
      : new Date().toISOString().split("T")[0];

    setTxFormInitial({
      type: "loan_payment",
      subType: "mortgage",
      amount: loan.payment,
      date: nextDate,
      sourceId: loan.source ?? "",
      description: `${loan.name} Mortgage Payment`,
      mode: "Debit",
      tag: "Personal",
    });
    setTxScheduledAmount(loan.payment);
    setTxFormOpen(true);
  }

  function openBackfill(loan: HouseLoan) {
    const anchorDate = loan.startDate || loan.nextPaymentDate;
    if (!anchorDate) {
      alert("Please set a mortgage start date or next payment date first.");
      return;
    }

    const dates = calculateBackfillDates(anchorDate, loan.schedule, loan.endDate);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const cutoff = yesterday.toISOString().split("T")[0];
    const pastDates = dates.filter((d) => d <= cutoff);

    if (pastDates.length === 0) {
      alert("No historical mortgage payments to backfill - all scheduled dates are in the future.");
      return;
    }

    setBackfillAccountId(loan.source ?? "");
    setBackfillModal({ loan, dates: pastDates });
    setBackfillDone(null);
  }

  function backfillLoanPayments(loan: HouseLoan, dates: string[], accountId: string): number {
    if (!dates.length || !accountId) return 0;

    const existing = transactionRepository.getAll();
    const existingDates = new Set(
      existing
        .filter((t) =>
          t.sourceId === accountId &&
          toFixed2(t.amount) === toFixed2(loan.payment) &&
          (t.description === `${loan.name} Mortgage Payment` || t.description?.includes(loan.name))
        )
        .map((t) => t.date ?? t.createdAt?.slice(0, 10))
    );

    let count = 0;
    dates.forEach((date) => {
      if (existingDates.has(date)) return;

      const txn: Transaction = {
        id: uid(),
        type: "loan_payment",
        subType: "mortgage",
        amount: toFixed2(loan.payment),
        description: `${loan.name} Mortgage Payment`,
        sourceId: accountId,
        date,
        createdAt: new Date().toISOString(),
        currency: "CAD",
        status: "cleared",
        tag: "Personal",
        mode: "Debit",
      };

      transactionRepository.add(txn);
      count++;
    });

    if (count > 0) {
      syncBalances();
      notifyDataChanged("transactions");
    }

    return count;
  }

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", color: theme.colors.text, marginBottom: 16 }}>House Loans / Mortgages</div>
      <div style={{ fontSize: 12, color: theme.colors.textSoft, marginBottom: 14, background: "#f0f9ff", padding: "10px 14px", borderRadius: 12, border: `1px solid ${theme.colors.border}` }}>
        Define your mortgage/loan details here. Do not duplicate them in Recurring Payments.
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <StatBox label="Total Remaining" value={fmtCAD(totalRemaining)} color="#a31515" />
        <StatBox label="Monthly Equiv." value={fmtCAD(toFixed2(totalMonthly))} color="#a05c00" />
        <StatBox label="Properties" value={String(houseLoans.length)} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn small onClick={() => { setForm(emptyForm); setShowForm(true); }}>+ Add Mortgage</Btn>
      </div>

      {houseLoans.map((l) => {
        const next = getNextOccurrence(l.nextPaymentDate, l.schedule);
        const acct = accounts.find((a) => a.id === l.source);
        return (
          <div key={l.id} style={{ ...theme.cardStyle(), padding: "16px 18px", marginBottom: 12, background: theme.colors.surface }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: theme.colors.text }}>{l.name}</div>
                {l.address && <div style={{ fontSize: 12, color: theme.colors.textSoft }}>{l.address}</div>}
                <div style={{ fontSize: 12, color: theme.colors.textSoft, marginTop: 4 }}>
                  {fmtCAD(l.payment)}/{l.schedule}
                  {l.source ? ` - From: ${getAccountName(l.source)}` : ""}
                  {l.nextPaymentDate
                    ? ` - Next: ${fmtDate(next ?? l.nextPaymentDate)}`
                    : " - Set next payment date"}
                </div>
                {l.source && !accounts.some((a) => a.id === l.source) && (
                  <div style={{ fontSize: 11, color: "#a05c00", marginTop: 3 }}>
                    Legacy payment source is no longer linked to a current account. Edit and re-select the right account.
                  </div>
                )}
                {acct && (
                  <div style={{ fontSize: 12, color: acct.openingBalance >= l.payment ? "#1a7f3c" : "#a31515", marginTop: 4 }}>
                    Account balance: {fmtCAD(acct.openingBalance)}
                  </div>
                )}
                {!!l.propertyTaxAmount && (
                  <div style={{ fontSize: 12, color: theme.colors.textSoft, marginTop: 4 }}>
                    Property tax: {fmtCAD(l.propertyTaxAmount)}/{l.propertyTaxSchedule ?? "Monthly"}
                    {l.propertyTaxSource ? ` - From: ${getAccountName(l.propertyTaxSource)}` : ""}
                    {l.propertyTaxDate ? ` - Next: ${fmtDate(l.propertyTaxDate)}` : ""}
                    {l.propertyTaxRollNumber ? ` - Roll #: ${l.propertyTaxRollNumber}` : ""}
                  </div>
                )}
                {l.principal > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99, width: 200 }}>
                      <div style={{ height: "100%", width: `${Math.min(100 - ((l.remaining / l.principal) * 100), 100)}%`, background: "#1a5fa8", borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 11, color: theme.colors.textSoft, marginTop: 4 }}>
                      {fmtCAD(l.principal - l.remaining)} paid - {fmtCAD(l.remaining)} remaining
                    </div>
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", marginLeft: "auto", minWidth: 150 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#a31515" }}>{fmtCAD(l.remaining)}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                  <Btn variant="green" small onClick={() => openLog(l)}>Log Payment</Btn>
                  <Btn variant="secondary" small onClick={() => openBackfill(l)}>Backfill</Btn>
                  <Btn variant="secondary" small onClick={() => { setForm({ ...emptyForm, ...l, id: l.id }); setShowForm(true); }}>Edit</Btn>
                  <Btn variant="danger" small onClick={() => { if (confirm(`Delete ${l.name}?`)) deleteHouseLoan(l.id); }}>Delete</Btn>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {houseLoans.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>No mortgages yet.</div>}

      {showForm && (
        <Modal title={form.id ? "Edit Mortgage" : "Add Mortgage"} onClose={() => setShowForm(false)} wide>
          <Grid2>
            <Inp label="Property Name" value={form.name} onChange={f("name")} placeholder="e.g. Primary Residence" />
            <Inp label="Address (optional)" value={form.address ?? ""} onChange={f("address")} />
          </Grid2>
          <Grid2>
            <Inp label="Original Principal ($)" type="number" value={form.principal} onChange={f("principal")} />
            <Inp label="Remaining Balance ($)" type="number" value={form.remaining} onChange={f("remaining")} />
          </Grid2>
          <Grid3>
            <Inp label="Payment Amount ($)" type="number" value={form.payment} onChange={f("payment")} />
            <Sel label="Schedule" value={form.schedule} onChange={f("schedule")} options={SCHEDULES.map((s) => ({ value: s, label: s }))} />
            <Inp label="Interest Rate (%)" type="number" value={form.interestRate} onChange={f("interestRate")} />
          </Grid3>
          <Sel label="Payment From (Account)" value={form.source} onChange={f("source")} options={formAcctOpts} />
          <Grid3>
            <Inp label="Property Tax ($, optional)" type="number" value={form.propertyTaxAmount} onChange={f("propertyTaxAmount")} />
            <Sel label="Property Tax Schedule" value={form.propertyTaxSchedule} onChange={f("propertyTaxSchedule")} options={SCHEDULES.map((s) => ({ value: s, label: s }))} />
            <Sel label="Property Tax From" value={form.propertyTaxSource ?? ""} onChange={f("propertyTaxSource")} options={formPropertyTaxAcctOpts} />
          </Grid3>
          <Grid3>
            <Inp label="Start Date" type="date" value={form.startDate} onChange={f("startDate")} />
            <Inp label="End Date / Maturity" type="date" value={form.endDate} onChange={f("endDate")} />
            <Inp label="Next Payment Date" type="date" value={form.nextPaymentDate ?? ""} onChange={f("nextPaymentDate")} />
          </Grid3>
          <Grid2>
            <Inp label="Property Tax Next Due (optional)" type="date" value={form.propertyTaxDate ?? ""} onChange={f("propertyTaxDate")} />
            <Inp label="Property Tax Roll Number (optional)" value={form.propertyTaxRollNumber ?? ""} onChange={f("propertyTaxRollNumber")} placeholder="e.g. municipal roll number" />
          </Grid2>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn onClick={save}>Save</Btn>
          </div>
        </Modal>
      )}
      {backfillModal && (
        <Modal title={`Backfill - ${backfillModal.loan.name}`} onClose={() => setBackfillModal(null)}>
          {backfillDone !== null ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>Done</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{backfillDone} transaction{backfillDone !== 1 ? "s" : ""} logged</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Historical mortgage payments have been added to your transaction log.</div>
              <div style={{ marginTop: 16 }}>
                <Btn onClick={() => setBackfillModal(null)}>Done</Btn>
              </div>
            </div>
          ) : (
            <>
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1a5fa8" }}>
                Found <strong>{backfillModal.dates.length} scheduled mortgage payments</strong> from {fmtDate(backfillModal.dates[0])} to {fmtDate(backfillModal.dates[backfillModal.dates.length - 1])}. Existing matching transactions will be skipped automatically.
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e2e4e8", borderRadius: 8 }}>
                {backfillModal.dates.map((d) => (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
                    <span>{fmtDate(d)}</span>
                    <span style={{ fontWeight: 600, color: "#a31515" }}>{fmtCAD(backfillModal.loan.payment)}</span>
                  </div>
                ))}
              </div>
              <div>
                <Label>Pay From Account</Label>
                <select
                  value={backfillAccountId}
                  onChange={(e) => setBackfillAccountId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${backfillAccountId ? "#1a7f3c" : "#e2e4e8"}`, borderRadius: 8, background: "#fff", fontSize: 13 }}
                >
                  <option value="">-- Select account --</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({fmtCAD(a.openingBalance)})</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn variant="secondary" onClick={() => setBackfillModal(null)}>Cancel</Btn>
                <Btn onClick={() => {
                  if (!backfillAccountId) { alert("Please select an account."); return; }
                  const count = backfillLoanPayments(backfillModal.loan, backfillModal.dates, backfillAccountId);
                  setBackfillDone(count);
                }}>Log {backfillModal.dates.length} Payments</Btn>
              </div>
            </>
          )}
        </Modal>
      )}

      <TransactionForm
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setTxFormInitial(undefined); setTxScheduledAmount(undefined); }}
        initial={txFormInitial}
        scheduledAmount={txScheduledAmount}
        title="Log Mortgage Payment"
        onSaved={() => { setTxFormOpen(false); setTxFormInitial(undefined); setTxScheduledAmount(undefined); }}
      />
    </div>
  );
}

