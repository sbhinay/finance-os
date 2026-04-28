"use client";

import { TransactionForm } from "./TransactionForm";
import { useState } from "react";
import { Vehicle, HouseLoan, PaymentSchedule } from "@/types/domain";
import { Account } from "@/types/account";
import { useVehicles, useHouseLoans, usePropertyTax } from "./useAssets";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCategories } from "@/modules/categories/useCategories";
import { fmtCAD, fmtDate, getNextOccurrence, toFixed2, toMonthly } from "@/utils/finance";
import { Transaction } from "@/types/transaction";
type TransactionFormInitial = React.ComponentProps<typeof TransactionForm>["initial"];

// ─── Primitives ───────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "#6b7280", display: "block", marginBottom: 4 }}>{children}</label>;
}
function Inp({ label, type = "text", value, onChange, placeholder }: {
  label?: string; type?: string; value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string;
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input type={type} value={value ?? ""} onChange={onChange} placeholder={placeholder}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13, boxSizing: "border-box" as const }} />
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
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13 }}>
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
  const c = { primary: { bg: "#1a5fa8", color: "#fff" }, secondary: { bg: "#f3f4f6", color: "#374151" }, danger: { bg: "#fef2f2", color: "#a31515" }, green: { bg: "#1a7f3c", color: "#fff" } }[variant];
  return <button onClick={onClick} style={{ padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", background: c.bg, color: c.color, ...style }}>{children}</button>;
}
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: wide ? 680 : 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e4e8", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}
function Grid2({ children }: { children: React.ReactNode }) { return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>; }
function Grid3({ children }: { children: React.ReactNode }) { return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>{children}</div>; }
function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: color ?? "#1a1a1a" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
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

// ─── Mileage projection (mirrors prototype exactly) ───────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════════
// VEHICLES SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function VehiclesSection({ accounts, transactions }: { accounts: Account[]; transactions: Transaction[] }) {
  const { vehicles, addVehicle, updateVehicle, deleteVehicle } = useVehicles();

  const emptyForm = {
    id: "" as string | undefined,
    name: "", year: "", make: "", model: "",
    vtype: "Lease" as Vehicle["vtype"],
    payment: 0, schedule: "Monthly" as PaymentSchedule,
    source: "", leaseStart: "", leaseEnd: "",
    nextPaymentDate: "", mileageAllowance: 20000,
    excessRate: 0.15, residual: 0,
    endOfLeaseOption: "Return" as Vehicle["endOfLeaseOption"],
    principal: 0, remaining: 0, interestRate: 0, status: "Active",
  };

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detail, setDetail] = useState<Vehicle | null>(null);

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!form.name) return;
    const v = { ...form, payment: toFixed2(Number(form.payment)), principal: toFixed2(Number(form.principal)), remaining: toFixed2(Number(form.remaining)) };
    if (form.id) { updateVehicle(v as Vehicle); }
    else { addVehicle(v as Omit<Vehicle, "id">); }
    setShowForm(false); setForm(emptyForm);
  }

  const acctOpts = [{ value: "", label: "— Select account —" }, ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.type})` }))];
  const statusColor: Record<string, string> = { Active: "green", "Ending Soon": "amber", Ended: "gray", "Paid Off": "teal" };
  const totalMonthly = vehicles.reduce((s, v) => s + toMonthly(v.payment, v.schedule), 0);

  // Helper to get account name from ID
  const getAccountName = (accountId: string) => {
    return accounts.find((a) => a.id === accountId)?.name ?? accountId;
  };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Vehicles</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
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
        return (
          <div key={v.id} style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</div>
                  <Pill color={statusColor[st] ?? "gray"}>{st}</Pill>
                  <Pill color={v.vtype === "Lease" ? "purple" : "blue"}>{v.vtype}</Pill>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{v.year} {v.make} {v.model}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {fmtCAD(v.payment)}/{v.schedule}
                  {v.source ? ` · From: ${getAccountName(v.source)}` : ""}
                  {v.nextPaymentDate
                    ? ` · Next: ${fmtDate(next ?? v.nextPaymentDate)}`
                    : " · ⚠ Set next payment date"}
                </div>
                {v.vtype === "Lease" && v.leaseEnd && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Lease ends: {fmtDate(v.leaseEnd)}{mp && mp.daysLeft > 0 ? ` · ${mp.daysLeft} days left` : ""}
                  </div>
                )}
                {v.vtype === "Finance" && v.principal > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99, width: 200 }}>
                      <div style={{ height: "100%", width: `${Math.min(100 - ((v.remaining / v.principal) * 100), 100)}%`, background: "#1a5fa8", borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      {fmtCAD(v.principal - v.remaining)} paid · {fmtCAD(v.remaining)} remaining
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", marginLeft: 12 }}>
                <Btn variant="secondary" small onClick={() => setDetail(v)}>View History</Btn>
                <Btn variant="secondary" small onClick={() => { setForm({ ...emptyForm, ...v }); setShowForm(true); }}>Edit</Btn>
                <Btn variant="danger" small onClick={() => { if (confirm(`Delete ${v.name}?`)) deleteVehicle(v.id); }}>✕</Btn>
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
            <Inp label="Start Date" type="date" value={form.leaseStart} onChange={f("leaseStart")} />
            <Inp label={form.vtype === "Lease" ? "Lease End Date" : "Loan End Date"} type="date" value={form.leaseEnd} onChange={f("leaseEnd")} />
            <Inp label="Next Payment Date" type="date" value={form.nextPaymentDate ?? ""} onChange={f("nextPaymentDate")} />
          </Grid3>
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

      {detail && (
        <Modal title={`${detail.name} — Expense History`} onClose={() => setDetail(null)} wide>
          {(() => {
            const txns = transactions.filter((t) => t.linkedVehicleId === detail.id && t.type !== "adjustment");
            const total = txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
            return (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <StatBox label="Total Spent" value={fmtCAD(total + detail.payment)} sub="incl. monthly payments" />
                  <StatBox label="Expense Entries" value={String(txns.length)} />
                </div>
                {txns.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>No expenses logged for this vehicle yet.</div>}
                {txns.map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{t.description || t.categoryId || "—"}</span>
                      <span style={{ color: "#6b7280", fontSize: 11 }}> · {fmtDate((t.date ?? t.createdAt ?? "").slice(0, 10))}</span>
                      {t.odometer && <span style={{ color: "#1a5fa8", fontSize: 11 }}> · {Number(t.odometer).toLocaleString()} km</span>}
                    </div>
                    <Pill color="red">{fmtCAD(t.amount)}</Pill>
                  </div>
                ))}
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOUSE LOANS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function HouseLoansSection({ accounts }: { accounts: Account[] }) {
  const { houseLoans, addHouseLoan, updateHouseLoan, deleteHouseLoan } = useHouseLoans();

  const emptyForm = {
    id: "" as string | undefined,
    name: "", address: "", principal: 0, remaining: 0,
    payment: 0, schedule: "Bi-weekly" as PaymentSchedule,
    source: "", startDate: "", endDate: "",
    nextPaymentDate: "", interestRate: 0,
  };

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!form.name) return;
    const l = { ...form, principal: toFixed2(Number(form.principal)), remaining: toFixed2(Number(form.remaining)), payment: toFixed2(Number(form.payment)) };
    if (form.id) { updateHouseLoan(l as HouseLoan); }
    else { addHouseLoan(l as Omit<HouseLoan, "id">); }
    setShowForm(false); setForm(emptyForm);
  }

  const acctOpts = [{ value: "", label: "— Select —" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))];
  const totalRemaining = houseLoans.reduce((s, l) => s + l.remaining, 0);
  const totalMonthly = houseLoans.reduce((s, l) => s + toMonthly(l.payment, l.schedule), 0);

  // Helper to get account name from ID
  const getAccountName = (accountId: string) => {
    return accounts.find((a) => a.id === accountId)?.name ?? accountId;
  };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>House Loans / Mortgages</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12, background: "#f0f9ff", padding: "8px 12px", borderRadius: 8, border: "1px solid #bae6fd" }}>
        💡 Define your mortgage/loan details here. Do not duplicate in Fixed Payments.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
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
          <div key={l.id} style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</div>
                {l.address && <div style={{ fontSize: 12, color: "#6b7280" }}>{l.address}</div>}
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {fmtCAD(l.payment)}/{l.schedule}
                  {l.source ? ` · From: ${getAccountName(l.source)}` : ""}
                  {l.nextPaymentDate
                    ? ` · Next: ${fmtDate(next ?? l.nextPaymentDate)}`
                    : " · ⚠ Set next payment date"}
                </div>
                {acct && (
                  <div style={{ fontSize: 12, color: acct.openingBalance >= l.payment ? "#1a7f3c" : "#a31515", marginTop: 2 }}>
                    Account balance: {fmtCAD(acct.openingBalance)}
                  </div>
                )}
                {l.principal > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99, width: 200 }}>
                      <div style={{ height: "100%", width: `${Math.min(100 - ((l.remaining / l.principal) * 100), 100)}%`, background: "#1a5fa8", borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      {fmtCAD(l.principal - l.remaining)} paid · {fmtCAD(l.remaining)} remaining
                    </div>
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", marginLeft: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#a31515" }}>{fmtCAD(l.remaining)}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                  <Btn variant="secondary" small onClick={() => { setForm({ ...emptyForm, ...l, id: l.id }); setShowForm(true); }}>Edit</Btn>
                  <Btn variant="danger" small onClick={() => { if (confirm(`Delete ${l.name}?`)) deleteHouseLoan(l.id); }}>✕</Btn>
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
          <Sel label="Payment From (Account)" value={form.source} onChange={f("source")} options={acctOpts} />
          <Grid3>
            <Inp label="Start Date" type="date" value={form.startDate} onChange={f("startDate")} />
            <Inp label="End Date / Maturity" type="date" value={form.endDate} onChange={f("endDate")} />
            <Inp label="Next Payment Date" type="date" value={form.nextPaymentDate ?? ""} onChange={f("nextPaymentDate")} />
          </Grid3>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn onClick={save}>Save</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPERTY TAX SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function PropertyTaxSection() {
  const { propertyTaxes, addProperty, updateProperty, deleteProperty, addPayment, deletePayment, markPaid } = usePropertyTax();

  const [showPropForm, setShowPropForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [propForm, setPropForm] = useState({ id: "", name: "", accountNumber: "" });
  const [payForm, setPayForm] = useState({ propertyId: "", amount: 0, date: new Date().toISOString().split("T")[0], note: "" });
  const [markingPaid, setMarkingPaid] = useState<{ propId: string; payId: string; amount: number; propName: string } | null>(null);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<TransactionFormInitial>(undefined);

  const allPayments = propertyTaxes.flatMap((p) =>
    (p.payments ?? []).map((pay) => ({ ...pay, propertyName: p.name }))
  );
  const totalPaid = toFixed2(allPayments.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0));
  const totalPlanned = toFixed2(allPayments.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0));
  const today = new Date().toISOString().split("T")[0];
  const upcoming = allPayments.filter((p) => !p.paid && p.date >= today).sort((a, b) => a.date > b.date ? 1 : -1);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Property Tax</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="Total Paid" value={fmtCAD(totalPaid)} color="#1a7f3c" />
        <StatBox label="Upcoming Planned" value={fmtCAD(totalPlanned)} color="#a05c00" />
        <StatBox label="Properties" value={String(propertyTaxes.length)} />
      </div>

      {upcoming.length > 0 && (
        <div style={{ background: "#fff8f0", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#a05c00", marginBottom: 8 }}>Upcoming Property Tax Payments</div>
          {upcoming.slice(0, 5).map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #fef3e2" }}>
              <span>{p.propertyName}{p.note ? ` · ${p.note}` : ""}</span>
              <span style={{ fontWeight: 600, color: "#a05c00" }}>{fmtCAD(p.amount)} · {fmtDate(p.date)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn variant="secondary" small onClick={() => { setPropForm({ id: "", name: "", accountNumber: "" }); setShowPropForm(true); }}>+ Add Property</Btn>
      </div>

      {propertyTaxes.map((prop) => (
        <div key={prop.id} style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{prop.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Roll # {prop.accountNumber}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small onClick={() => { setPayForm({ propertyId: prop.id, amount: 0, date: today, note: "" }); setShowPayForm(true); }}>+ Schedule</Btn>
              <Btn variant="secondary" small onClick={() => { setPropForm({ id: prop.id, name: prop.name, accountNumber: prop.accountNumber }); setShowPropForm(true); }}>Edit</Btn>
              <Btn variant="danger" small onClick={() => { if (confirm(`Delete ${prop.name}?`)) deleteProperty(prop.id); }}>✕</Btn>
            </div>
          </div>

          {[...(prop.payments ?? [])].sort((a, b) => b.date > a.date ? 1 : -1).map((pay) => (
            <div key={pay.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 10px", background: pay.paid ? "#f0fdf4" : "#fffbeb",
              borderRadius: 8, marginBottom: 6,
              border: `1px solid ${pay.paid ? "#bbf7d0" : "#fde68a"}`,
            }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{fmtCAD(pay.amount)}</span>
                <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>
                  {pay.paid ? `Paid: ${fmtDate(pay.paidDate ?? pay.date)}` : `Planned: ${fmtDate(pay.date)}`}
                </span>
                {pay.note && <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 6 }}>· {pay.note}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {!pay.paid ? (
                  <Btn variant="green" small onClick={() => {
                    setMarkingPaid({ propId: prop.id, payId: pay.id, amount: pay.amount, propName: prop.name });
                    setTxFormInitial({
                      type: "expense",
                      amount: pay.amount,
                      date: pay.date,
                      description: `Property Tax — ${prop.name}`,
                      mode: "Bank Transfer",
                      tag: "Personal",
                    });
                    setTxFormOpen(true);
                  }}>Mark Paid</Btn>
                ) : (
                  <Btn variant="secondary" small onClick={() => markPaid(prop.id, pay.id, false)}>Undo</Btn>
                )}
                <Btn variant="danger" small onClick={() => deletePayment(prop.id, pay.id)}>✕</Btn>
              </div>
            </div>
          ))}
          {!prop.payments?.length && (
            <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center", padding: 12 }}>No payments logged yet.</div>
          )}
        </div>
      ))}

      {propertyTaxes.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>No properties yet.</div>}

      {showPropForm && (
        <Modal title={propForm.id ? "Edit Property" : "Add Property"} onClose={() => setShowPropForm(false)}>
          <Inp label="Property Name" value={propForm.name} onChange={(e) => setPropForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Primary Residence" />
          <Inp label="Account / Roll Number" value={propForm.accountNumber} onChange={(e) => setPropForm((p) => ({ ...p, accountNumber: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowPropForm(false)}>Cancel</Btn>
            <Btn onClick={() => {
              if (!propForm.name) return;
              if (propForm.id) updateProperty(propForm.id, propForm.name, propForm.accountNumber);
              else addProperty(propForm.name, propForm.accountNumber);
              setShowPropForm(false);
            }}>Save Property</Btn>
          </div>
        </Modal>
      )}

      {/* TransactionForm handles mark paid */}
      <TransactionForm
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setMarkingPaid(null); setTxFormInitial(undefined); }}
        initial={txFormInitial}
        scheduledAmount={markingPaid?.amount}
        title={markingPaid ? `Mark Paid — ${markingPaid.propName}` : "Mark Paid"}
        onSaved={(txn) => {
          if (markingPaid) {
            markPaid(markingPaid.propId, markingPaid.payId, true, txn.date ?? new Date().toISOString().split("T")[0]);
          }
          setTxFormOpen(false);
          setMarkingPaid(null);
          setTxFormInitial(undefined);
        }}
      />

            {showPayForm && (
        <Modal title="Schedule Property Tax Payment" onClose={() => setShowPayForm(false)}>
          <Sel label="Property" value={payForm.propertyId} onChange={(e) => setPayForm((p) => ({ ...p, propertyId: e.target.value }))}
            options={[{ value: "", label: "— Select property —" }, ...propertyTaxes.map((p) => ({ value: p.id, label: p.name }))]} />
          <Grid2>
            <Inp label="Amount ($)" type="number" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: Number(e.target.value) }))} />
            <Inp label="Date (paid or planned)" type="date" value={payForm.date} onChange={(e) => setPayForm((p) => ({ ...p, date: e.target.value }))} />
          </Grid2>
          <Inp label="Note (optional)" value={payForm.note} onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))} placeholder="e.g. Q1 instalment" />
          <div style={{ fontSize: 12, color: "#6b7280", background: "#f0f9ff", padding: "8px 12px", borderRadius: 8 }}>
            💡 This schedules a planned payment. Click <strong>Mark Paid</strong> on the entry when you actually pay it — that creates the transaction.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowPayForm(false)}>Cancel</Btn>
            <Btn onClick={() => {
              if (!payForm.amount || !payForm.propertyId) return;
              addPayment(payForm.propertyId, { amount: payForm.amount, date: payForm.date, paid: false, note: payForm.note });
              setShowPayForm(false);
            }}>Save Payment</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
