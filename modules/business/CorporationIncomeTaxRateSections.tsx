"use client";

import { useState } from "react";
import { useBusiness } from "./useBusiness";
import { Transaction } from "@/types/transaction";
import { RateEntry, PayrollDrawEntry } from "@/types/business";
import { fmtCAD, fmtDate, getRateOnDate, toFixed2 } from "@/utils/finance";

// ─── Shared primitives ────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 11, fontWeight: 600, letterSpacing: ".05em",
      textTransform: "uppercase" as const, color: "#6b7280", display: "block", marginBottom: 4,
    }}>{children}</label>
  );
}

function Btn({
  children, onClick, variant = "primary", small,
}: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "danger"; small?: boolean;
}) {
  const c = {
    primary: { bg: "#1a5fa8", color: "#fff" },
    secondary: { bg: "#f3f4f6", color: "#374151" },
    danger: { bg: "#fef2f2", color: "#a31515" },
  }[variant];
  return (
    <button onClick={onClick} style={{
      padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13,
      fontWeight: 600, borderRadius: 8, border: "1px solid transparent",
      cursor: "pointer", background: c.bg, color: c.color,
    }}>{children}</button>
  );
}

function Inp({
  label, type = "text", value, onChange, placeholder, step,
}: {
  label?: string; type?: string; value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; step?: string;
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input type={type} value={value ?? ""} onChange={onChange} placeholder={placeholder} step={step}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13, boxSizing: "border-box" as const }} />
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e4e8", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
}

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
    gray: { bg: "#f3f4f6", fg: "#6b7280" },
  };
  const c = m[color] ?? m.gray;
  return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>{children}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORPORATION INCOME SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function CorporationIncomeSection({ transactions }: { transactions: Transaction[] }) {
  const { business } = useBusiness();
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const rs = business.rateSettings;

  // Group invoices by payment received month (cash basis — never use work month)
  const invoicesWithPayment = business.invoices.filter((i) => i.paymentDate);
  const monthGroups: Record<string, typeof invoicesWithPayment> = {};
  invoicesWithPayment.forEach((i) => {
    const pd = new Date(i.paymentDate!.slice(0, 10) + "T12:00:00");
    const key = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}`;
    (monthGroups[key] = monthGroups[key] ?? []).push(i);
  });

  const allYears = [...new Set(Object.keys(monthGroups).map((k) => Number(k.slice(0, 4))))].sort((a, b) => b - a);
  if (!allYears.length) allYears.push(new Date().getFullYear());

  // Build 12-row table for selected year
  const rows = Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    const key = `${viewYear}-${String(m).padStart(2, "0")}`;
    const invs = monthGroups[key] ?? [];
    if (!invs.length) return { key, month: m, year: viewYear, empty: true as const };

    const gross = toFixed2(invs.reduce((s, i) => s + i.total, 0));
    const netRev = toFixed2(invs.reduce((s, i) => s + i.subtotal, 0));
    const hstCollected = toFixed2(invs.reduce((s, i) => s + i.hst, 0));
    const hstToRemit = toFixed2(invs.reduce((s, i) => s + i.hstToRemit, 0));
    const hstKept = toFixed2(invs.reduce((s, i) => s + i.hstKept, 0));

    const payDateStr = invs[0].paymentDate!.slice(0, 10);
    const drawEntry = getRateOnDate(rs.payrollDraw, payDateStr);
    const defaultDraw = drawEntry?.value ?? 0;
    const draw = toFixed2(invs.reduce((s, i) => s + (i.personalDraw != null ? i.personalDraw : defaultDraw), 0) / invs.length);

    const instEntry = getRateOnDate(rs.corpTaxInstalment, payDateStr);
    const instAmt = instEntry?.value ?? 2038;
    const defaultReserve = toFixed2(instAmt / 3);
    const reserve = toFixed2(invs.reduce((s, i) => s + (i.corpTaxReserve != null ? i.corpTaxReserve : defaultReserve), 0) / invs.length);

    const bizExp = toFixed2(
      (transactions ?? [])
        .filter((t) => t.tag === "Business" && t.type === "expense" && ((t as any).date ?? t.createdAt?.slice(0,10) ?? "").startsWith(key))
        .reduce((s, t) => s + t.amount, 0)
    );
    const netRetained = toFixed2(netRev - draw - hstToRemit - reserve - bizExp);

    return { key, month: m, year: viewYear, empty: false as const, gross, netRev, hstCollected, hstToRemit, hstKept, draw, reserve, bizExp, netRetained, invoices: invs };
  });

  const nonEmpty = rows.filter((r) => !r.empty) as Array<Exclude<(typeof rows)[0], { empty: true }>>;
  const totals = nonEmpty.reduce((s, r) => ({
    gross: toFixed2(s.gross + r.gross),
    netRev: toFixed2(s.netRev + r.netRev),
    hstCollected: toFixed2(s.hstCollected + r.hstCollected),
    hstToRemit: toFixed2(s.hstToRemit + r.hstToRemit),
    hstKept: toFixed2(s.hstKept + r.hstKept),
    draw: toFixed2(s.draw + r.draw),
    reserve: toFixed2(s.reserve + r.reserve),
    bizExp: toFixed2(s.bizExp + r.bizExp),
    netRetained: toFixed2(s.netRetained + r.netRetained),
  }), { gross: 0, netRev: 0, hstCollected: 0, hstToRemit: 0, hstKept: 0, draw: 0, reserve: 0, bizExp: 0, netRetained: 0 });

  const cols: Array<{ key: string; label: string; color?: string; bold?: boolean }> = [
    { key: "month", label: "Month" },
    { key: "gross", label: "Total Received", color: "#1a7f3c", bold: true },
    { key: "netRev", label: "Net Revenue" },
    { key: "hstToRemit", label: "HST to Remit", color: "#a05c00" },
    { key: "hstKept", label: "HST Kept", color: "#1a7f3c" },
    { key: "draw", label: "Personal Draw", color: "#1a5fa8" },
    { key: "reserve", label: "Corp Tax Reserve", color: "#a05c00" },
    { key: "bizExp", label: "Biz Expenses", color: "#a31515" },
    { key: "netRetained", label: "Net Retained", bold: true },
  ];

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Corporation Income</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12, background: "#f0f9ff", padding: "8px 12px", borderRadius: 8, border: "1px solid #bae6fd" }}>
        Cash basis — grouped by payment received date. This is when income counts for tax purposes.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <Label>Calendar Year:</Label>
        <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}
          style={{ padding: "6px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13 }}>
          {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="Total Received" value={fmtCAD(totals.gross)} color="#1a7f3c" />
        <StatBox label="HST to Remit" value={fmtCAD(totals.hstToRemit)} color="#a05c00" />
        <StatBox label="Personal Draw" value={fmtCAD(totals.draw)} color="#1a5fa8" />
        <StatBox label="Net Retained" value={fmtCAD(totals.netRetained)} color={totals.netRetained >= 0 ? "#1a7f3c" : "#a31515"} />
        <StatBox label="Months Received" value={`${nonEmpty.length}/12`} />
      </div>

      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 800 }}>
          <thead>
            <tr style={{ background: "#1e2530", color: "#fff" }}>
              {cols.map((c) => (
                <th key={c.key} style={{ padding: "8px 10px", textAlign: c.key === "month" ? "left" : "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9fa", opacity: r.empty ? 0.4 : 1 }}>
                {cols.map((c) => {
                  if (c.key === "month") {
                    return (
                      <td key="month" style={{ padding: "7px 10px", color: "#1a1a1a" }}>
                        {MONTHS[r.month - 1]} {r.year}
                      </td>
                    );
                  }
                  if (r.empty) {
                    return <td key={c.key} style={{ padding: "7px 10px", textAlign: "right", color: "#9ca3af" }}>—</td>;
                  }
                  const row = r as Exclude<typeof r, { empty: true }>;
                  const val = row[c.key as keyof typeof row] as number;
                  const color = c.key === "netRetained" ? (val < 0 ? "#a31515" : "#1a7f3c") : c.color;
                  return (
                    <td key={c.key} style={{ padding: "7px 10px", textAlign: "right", color: color ?? "#1a1a1a", fontWeight: c.bold ? 700 : 400 }}>
                      {fmtCAD(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Totals row */}
            <tr style={{ background: "#1e2530", color: "#fff", fontWeight: 700 }}>
              {cols.map((c) => (
                <td key={c.key} style={{ padding: "8px 10px", textAlign: c.key === "month" ? "left" : "right" }}>
                  {c.key === "month" ? "Total" : fmtCAD(totals[c.key as keyof typeof totals] ?? 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, fontSize: 12, color: "#6b7280", border: "1px solid #e2e4e8" }}>
        <strong>How to read this:</strong> Total Received = Net Revenue + HST. HST to Remit (Quick Method) goes to CRA quarterly.
        HST Kept is retained by the corporation. Net Retained = Net Revenue − Personal Draw − HST to Remit − Corp Tax Reserve − Business Expenses.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIST SETTINGS (HST Rate, Quick Method Rate, Corp Tax Instalment)
// ═══════════════════════════════════════════════════════════════════════════════

function RateListSettings({
  label, entries, onChange, isPercent, defaultValue, note,
}: {
  label: string;
  entries: RateEntry[];
  onChange: (arr: RateEntry[]) => void;
  isPercent?: boolean;
  defaultValue?: number;
  note?: string;
}) {
  const emptyForm = { id: "", value: defaultValue ?? 0, effectiveFrom: new Date().toISOString().split("T")[0], note: "" };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function save() {
    if (!form.effectiveFrom) return;
    const e: RateEntry = { ...form, id: form.id || String(Math.random().toString(36).slice(2)), value: Number(form.value) || (defaultValue ?? 0) };
    onChange(form.id ? entries.map((x) => (x.id === form.id ? e : x)) : [...entries, e]);
    setShowForm(false); setForm(emptyForm);
  }

  const sorted = [...entries].sort((a, b) => (b.effectiveFrom > a.effectiveFrom ? 1 : -1));

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <Btn small onClick={() => { setForm(emptyForm); setShowForm(true); }}>+ Add Entry</Btn>
      </div>
      {note && <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{note}</div>}
      {sorted.map((e, i) => (
        <div key={e.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "9px 14px", background: i === 0 ? "#f0fdf4" : "#fff",
          border: `1px solid ${i === 0 ? "#bbf7d0" : "#e2e4e8"}`, borderRadius: 10, marginBottom: 6,
        }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
              {i === 0 && <Pill color="green">Current</Pill>}
              <span style={{ fontWeight: 600 }}>
                {isPercent ? `${(e.value * 100).toFixed(3)}%` : fmtCAD(e.value)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Effective from: {fmtDate(e.effectiveFrom)}{e.note ? ` · ${e.note}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn variant="secondary" small onClick={() => { setForm({...e, note: e.note ?? ""}); setShowForm(true); }}>Edit</Btn>
            {entries.length > 1 && (
              <Btn variant="danger" small onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>✕</Btn>
            )}
          </div>
        </div>
      ))}
      {showForm && (
        <Modal title={`${form.id ? "Edit" : "Add"} ${label} Entry`} onClose={() => setShowForm(false)}>
          <Inp label={isPercent ? "Rate (decimal, e.g. 0.13 for 13%)" : "Value"} type="number"
            value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: Number(e.target.value) }))} step="0.001" />
          <Inp label="Effective From Date" type="date" value={form.effectiveFrom}
            onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))} />
          <Inp label="Note (optional)" value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn onClick={save}>Save</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Payroll Draw Settings ────────────────────────────────────────────────────

function PayrollDrawSettings({
  entries, onChange,
}: {
  entries: PayrollDrawEntry[];
  onChange: (arr: PayrollDrawEntry[]) => void;
}) {
  const emptyForm = { id: "", value: 0, craRemittance: 0, effectiveFrom: new Date().toISOString().split("T")[0], note: "" };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function save() {
    if (!form.effectiveFrom) return;
    const e: PayrollDrawEntry = {
      ...form,
      id: form.id || String(Math.random().toString(36).slice(2)),
      value: toFixed2(Number(form.value)),
      craRemittance: toFixed2(Number(form.craRemittance)),
    };
    onChange(form.id ? entries.map((x) => (x.id === form.id ? e : x)) : [...entries, e]);
    setShowForm(false); setForm(emptyForm);
  }

  const sorted = [...entries].sort((a, b) => (b.effectiveFrom > a.effectiveFrom ? 1 : -1));

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Personal Draw & CRA Payroll Remittance</div>
        <Btn small onClick={() => { setForm(emptyForm); setShowForm(true); }}>+ Add Entry</Btn>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, background: "#fef3e2", padding: "8px 10px", borderRadius: 6 }}>
        These two values are linked. When your draw changes, your CRA remittance changes too. Add one entry per change.
      </div>
      {sorted.map((e, i) => (
        <div key={e.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 14px", background: i === 0 ? "#f0fdf4" : "#fff",
          border: `1px solid ${i === 0 ? "#bbf7d0" : "#e2e4e8"}`, borderRadius: 10, marginBottom: 8,
        }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
              {i === 0 && <Pill color="green">Current</Pill>}
              <span style={{ fontWeight: 600, fontSize: 14 }}>{fmtCAD(e.value)}/mo draw</span>
              <span style={{ color: "#6b7280", fontSize: 13 }}>→</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#4a3ab5" }}>{fmtCAD(e.craRemittance)}/mo to CRA</span>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Effective from: {fmtDate(e.effectiveFrom)}{e.note ? ` · ${e.note}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn variant="secondary" small onClick={() => { setForm({...e, note: e.note ?? ""}); setShowForm(true); }}>Edit</Btn>
            {entries.length > 1 && (
              <Btn variant="danger" small onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>✕</Btn>
            )}
          </div>
        </div>
      ))}
      {showForm && (
        <Modal title={form.id ? "Edit Draw & Remittance" : "Add Draw & Remittance Entry"} onClose={() => setShowForm(false)}>
          <div style={{ background: "#f0f9ff", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#1a5fa8" }}>
            Enter both the personal draw and the CRA payroll remittance your accountant calculated for that draw amount.
          </div>
          <Grid2>
            <Inp label="Personal Draw ($/month)" type="number" value={form.value}
              onChange={(e) => setForm((p) => ({ ...p, value: Number(e.target.value) }))} placeholder="e.g. 4000" />
            <Inp label="CRA Payroll Remittance ($/month)" type="number" value={form.craRemittance}
              onChange={(e) => setForm((p) => ({ ...p, craRemittance: Number(e.target.value) }))} placeholder="e.g. 684.66" />
          </Grid2>
          <Inp label="Effective From Date" type="date" value={form.effectiveFrom}
            onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))} />
          <Inp label="Note (optional)" value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="e.g. Draw increase from Jan 2027" />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn onClick={save}>Save Entry</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAX RATE SETTINGS SECTION — ROOT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export function TaxRateSettingsSection() {
  const hooks = useBusiness();
  const { business } = hooks;
  const rs = business.rateSettings;
  const [tab, setTab] = useState<"payroll" | "hst" | "corp">("payroll");
  const today = new Date().toISOString().split("T")[0];

  const currentDraw = getRateOnDate(rs.payrollDraw, today);
  const currentHST = getRateOnDate(rs.hstRate, today);
  const currentQM = getRateOnDate(rs.quickMethodRate, today);
  const currentCorp = getRateOnDate(rs.corpTaxInstalment, today);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Tax & Rate Settings</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12, background: "#f0f9ff", padding: "8px 12px", borderRadius: 8, border: "1px solid #bae6fd" }}>
        All rates and values here drive calculations across the entire app. Add a new entry when a value changes —
        old entries are kept for historical accuracy. The system uses the correct value for each date automatically.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="Current Draw" value={fmtCAD(currentDraw?.value ?? 0)} sub={`CRA: ${fmtCAD((currentDraw as PayrollDrawEntry | null)?.craRemittance ?? 0)}/mo`} color="#1a5fa8" />
        <StatBox label="HST Rate" value={currentHST ? `${(currentHST.value * 100).toFixed(1)}%` : "Not set"} sub="Ontario" />
        <StatBox label="Quick Method" value={currentQM ? `${(currentQM.value * 100).toFixed(1)}%` : "Not set"} sub="of gross invoiced" />
        <StatBox label="Corp Instalment" value={currentCorp ? fmtCAD(currentCorp.value) : "Not set"} sub="per quarter" />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {(["payroll", "hst", "corp"] as const).map((t) => (
          <Btn key={t} variant={tab === t ? "primary" : "secondary"} small onClick={() => setTab(t)}>
            {t === "payroll" ? "Personal Draw & Payroll" : t === "hst" ? "HST Rates" : "Corp Tax Instalment"}
          </Btn>
        ))}
      </div>

      {tab === "payroll" && (
        <PayrollDrawSettings
          entries={rs.payrollDraw ?? []}
          onChange={(arr) => hooks.updateRateSettings("payrollDraw", arr)}
        />
      )}

      {tab === "hst" && (
        <>
          <RateListSettings
            label="HST Rate"
            entries={rs.hstRate ?? []}
            onChange={(arr) => hooks.updateRateSettings("hstRate", arr)}
            isPercent defaultValue={0.13}
            note="Ontario HST rate (decimal e.g. 0.13 = 13%)"
          />
          <RateListSettings
            label="Quick Method Remittance Rate"
            entries={rs.quickMethodRate ?? []}
            onChange={(arr) => hooks.updateRateSettings("quickMethodRate", arr)}
            isPercent defaultValue={0.088}
            note="CRA Quick Method rate (decimal e.g. 0.088 = 8.8%)"
          />
        </>
      )}

      {tab === "corp" && (
        <RateListSettings
          label="Corp Tax Instalment"
          entries={rs.corpTaxInstalment ?? []}
          onChange={(arr) => hooks.updateRateSettings("corpTaxInstalment", arr)}
          defaultValue={2038}
          note="Quarterly instalment amount ($). Add a new entry when your accountant sets a new amount."
        />
      )}
    </div>
  );
}
