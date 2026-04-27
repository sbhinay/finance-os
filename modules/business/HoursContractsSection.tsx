"use client";

import { useState, useMemo } from "react";
import { Contract, Invoice, RateSettings } from "@/types/business";
import { Account } from "@/types/account";
import { useBusiness } from "./useBusiness";
import {
  fmtCAD,
  fmtDate,
  getRateOnDate,
  toFixed2,
  getBizDaysInMonth,
  currentWorkFiscalYear,
} from "@/utils/finance";
import { validateInvoice } from "@/rules/validationRules";

// ─── Shared primitives ────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 11, fontWeight: 600, letterSpacing: ".05em",
      textTransform: "uppercase" as const, color: "#6b7280",
      display: "block", marginBottom: 4,
    }}>
      {children}
    </label>
  );
}

function Inp({
  label, type = "text", value, onChange, placeholder, step, style,
}: {
  label?: string; type?: string; value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; step?: string; style?: React.CSSProperties;
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input
        type={type} value={value ?? ""} onChange={onChange}
        placeholder={placeholder} step={step}
        style={{
          width: "100%", padding: "8px 10px",
          border: "1px solid #e2e4e8", borderRadius: 8,
          background: "#fff", fontSize: 13, boxSizing: "border-box" as const,
          ...style,
        }}
      />
    </div>
  );
}

function Sel({
  label, value, onChange, options,
}: {
  label?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string | number; label: string } | string>;
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <select
        value={value ?? ""}
        onChange={onChange}
        style={{
          width: "100%", padding: "8px 10px",
          border: "1px solid #e2e4e8", borderRadius: 8,
          background: "#fff", fontSize: 13,
        }}
      >
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </div>
  );
}

function Btn({
  children, onClick, variant = "primary", small, disabled, style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "green";
  small?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const colors = {
    primary: { bg: "#1a5fa8", color: "#fff" },
    secondary: { bg: "#f3f4f6", color: "#374151" },
    danger: { bg: "#fef2f2", color: "#a31515" },
    green: { bg: "#f0fdf4", color: "#1a7f3c" },
  };
  const c = colors[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? "4px 10px" : "8px 16px",
        fontSize: small ? 12 : 13,
        fontWeight: 600, borderRadius: 8, border: "1px solid transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        background: c.bg, color: c.color, opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Modal({
  title, onClose, children, wide,
}: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.4)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, width: "100%",
        maxWidth: wide ? 720 : 480, maxHeight: "90vh",
        overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #e2e4e8",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, background: "#fff", zIndex: 1,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 20,
            cursor: "pointer", color: "#6b7280", lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label, value, sub, color,
}: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 120, padding: "12px 14px",
      background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10,
    }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, color: color ?? "#1a1a1a" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  const map: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#dcfce7", fg: "#1a7f3c" },
    blue: { bg: "#dbeafe", fg: "#1a5fa8" },
    amber: { bg: "#fef3c7", fg: "#a05c00" },
    gray: { bg: "#f3f4f6", fg: "#6b7280" },
    red: { bg: "#fee2e2", fg: "#a31515" },
  };
  const c = map[color] ?? map.gray;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.fg,
    }}>
      {children}
    </span>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {children}
    </div>
  );
}
function Grid3({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      {children}
    </div>
  );
}

// ─── allocateHours — mirrors prototype exactly ────────────────────────────────

function allocateHours(
  totalHours: number,
  fiscalYear: number
): Array<{ year: number; month: number; bizDays: number; allocatedHours: number }> {
  const months: Array<{ year: number; month: number }> = [];
  for (let m = 4; m <= 12; m++) months.push({ year: fiscalYear - 1, month: m });
  for (let m = 1; m <= 3; m++) months.push({ year: fiscalYear, month: m });
  const totalBiz = months.reduce(
    (s, x) => s + getBizDaysInMonth(x.year, x.month), 0
  );
  return months.map((x) => {
    const biz = getBizDaysInMonth(x.year, x.month);
    return {
      ...x,
      bizDays: biz,
      allocatedHours: totalBiz > 0 ? toFixed2(Math.round((biz / totalBiz) * totalHours * 100) / 100) : 0,
    };
  });
}

// ─── AutoOverrideField ────────────────────────────────────────────────────────

function AutoOverrideField({
  label, autoValue, value, onChange,
}: {
  label: string;
  autoValue: number;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const isOverridden = value !== null;
  const display = isOverridden ? value ?? 0 : autoValue;
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="number"
          value={display}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          style={{
            flex: 1, padding: "8px 10px", border: `1px solid ${isOverridden ? "#a05c00" : "#e2e4e8"}`,
            borderRadius: 8, background: "#fff", fontSize: 13,
          }}
        />
        {isOverridden ? (
          <button
            onClick={() => onChange(null)}
            title="Reset to auto"
            style={{
              padding: "6px 10px", fontSize: 11, borderRadius: 8,
              border: "1px solid #e2e4e8", background: "#f9fafb",
              cursor: "pointer", color: "#6b7280",
            }}
          >
            Auto
          </button>
        ) : (
          <span style={{ fontSize: 11, color: "#9ca3af" }}>Auto</span>
        )}
      </div>
      {!isOverridden && (
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
          From rate settings: {fmtCAD(autoValue)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACTS MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

function ContractsManager({
  business,
  hooks,
}: {
  business: ReturnType<typeof useBusiness>["business"];
  hooks: ReturnType<typeof useBusiness>;
}) {
  const contracts = business.contracts ?? [];
  const emptyContract = {
    id: "", name: "", client: "", status: "Active" as Contract["status"],
    startDate: "", endDate: "",
  };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyContract);
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!form.name) return;
    if (form.id) {
      const existing = contracts.find((c) => c.id === form.id);
      if (existing) {
        hooks.updateContract({
          ...existing,
          name: form.name,
          client: form.client,
          status: form.status as Contract["status"],
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
        });
      }
    } else {
      hooks.addContract({
        name: form.name,
        client: form.client,
        status: form.status as Contract["status"],
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      });
    }
    setShowForm(false);
    setForm(emptyContract);
  }

  function getStatus(c: Contract): string {
    if (c.status === "Ended") return "Ended";
    if (c.endDate && new Date(c.endDate + "T12:00:00") < new Date()) return "Ended";
    if (c.endDate) {
      const days = (new Date(c.endDate + "T12:00:00").getTime() - Date.now()) / 86400000;
      if (days <= 90) return "Ending Soon";
    }
    return c.status ?? "Active";
  }

  const statusColor: Record<string, string> = {
    Active: "green", Ended: "gray", Paused: "amber", "Ending Soon": "amber",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Contracts ({contracts.length})</div>
        <Btn small onClick={() => { setForm(emptyContract); setShowForm(true); }}>+ Add Contract</Btn>
      </div>
      <div style={{
        fontSize: 12, color: "#6b7280", marginBottom: 12,
        background: "#f0f9ff", padding: "8px 12px", borderRadius: 8, border: "1px solid #bae6fd",
      }}>
        💡 One contract per client engagement. Add rate history entries when your rate changes — don't
        create a new contract. Annual Hours Allocation sets the billable cap per fiscal year (Apr–Mar).
      </div>

      {contracts.map((c) => {
        const st = getStatus(c);
        const currentRate = c.rateHistory?.length
          ? [...c.rateHistory].sort((a, b) => (b.effectiveFrom > a.effectiveFrom ? 1 : -1))[0]
          : null;
        return (
          <div key={c.id} style={{
            border: `1px solid #e2e4e8`, borderRadius: 10, marginBottom: 12,
            borderLeft: `4px solid ${st === "Active" ? "#1a7f3c" : st === "Ending Soon" ? "#a05c00" : "#9ca3af"}`,
            padding: "14px 16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {c.client}
                  {currentRate ? ` · Current rate: ${fmtCAD(currentRate.rate)}/hr` : ""}
                  {c.startDate ? ` · Started: ${fmtDate(c.startDate)}` : ""}
                  {c.endDate ? ` · Ends: ${fmtDate(c.endDate)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Pill color={statusColor[st] ?? "gray"}>{st}</Pill>
                <Btn variant="secondary" small onClick={() => setForm({ startDate: "", endDate: "", ...c, id: c.id, status: c.status as "Active" | "Ended" | "Paused" })}>Edit</Btn>
                <Btn variant="danger" small onClick={() => {
                  const count = business.invoices.filter((i) => i.contractId === c.id).length;
                  if (confirm(`Delete "${c.name}"?${count > 0 ? `\n\n⚠ ${count} invoice(s) will lose contract link.` : ""}`))
                    hooks.deleteContract(c.id);
                }}>✕</Btn>
              </div>
            </div>

            {/* Rate History */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>HOURLY RATE HISTORY</div>
                <Btn variant="secondary" small onClick={() => hooks.addContractRate(c.id)}>+ Rate</Btn>
              </div>
              {[...(c.rateHistory ?? [])].sort((a, b) => (b.effectiveFrom > a.effectiveFrom ? 1 : -1)).map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input
                    type="number" value={r.rate}
                    onChange={(e) => hooks.updateContractRate(c.id, r.id, "rate", e.target.value)}
                    style={{ width: 90, padding: "4px 8px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 12 }}
                  />
                  <span style={{ fontSize: 11, color: "#6b7280" }}>/hr from</span>
                  <input
                    type="date" value={r.effectiveFrom}
                    onChange={(e) => hooks.updateContractRate(c.id, r.id, "effectiveFrom", e.target.value)}
                    style={{ padding: "4px 8px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 12, background: "#fff" }}
                  />
                  <input
                    value={r.note ?? ""} placeholder="Note"
                    onChange={(e) => hooks.updateContractRate(c.id, r.id, "note", e.target.value)}
                    style={{ flex: 1, padding: "4px 8px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 12 }}
                  />
                  <button onClick={() => hooks.deleteContractRate(c.id, r.id)} style={{
                    background: "none", border: "none", cursor: "pointer", color: "#a31515", fontSize: 14,
                  }}>✕</button>
                </div>
              ))}
            </div>

            {/* Hours Allocations */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                  ANNUAL HOURS ALLOCATION{" "}
                  <span style={{ fontWeight: 400, color: "#9ca3af" }}>(billable cap per fiscal year Apr–Mar)</span>
                </div>
                <Btn variant="secondary" small onClick={() => hooks.addHoursAllocation(c.id)}>+ Year</Btn>
              </div>
              {[...(c.hoursAllocations ?? [])].sort((a, b) => b.fiscalYear - a.fiscalYear).map((a) => {
                const fyInvs = business.invoices.filter((i) => {
                  if (i.contractId !== c.id) return false;
                  const wm = Number(i.workMonth) || 1;
                  const wy = Number(i.workYear) || 2026;
                  return (wm >= 4 ? wy + 1 : wy) === a.fiscalYear;
                });
                const billed = toFixed2(fyInvs.reduce((s, i) => s + (Number(i.hours) || 0), 0));
                const pct = a.totalHours > 0 ? toFixed2((billed / a.totalHours) * 100) : 0;
                return (
                  <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#6b7280", minWidth: 28 }}>FY</span>
                    <input
                      type="number" value={a.fiscalYear}
                      onChange={(e) => hooks.updateHoursAllocation(c.id, a.id, "fiscalYear", Number(e.target.value))}
                      style={{ width: 70, padding: "4px 8px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 12 }}
                    />
                    <input
                      type="number" value={a.totalHours}
                      onChange={(e) => hooks.updateHoursAllocation(c.id, a.id, "totalHours", Number(e.target.value))}
                      style={{ width: 90, padding: "4px 8px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 12 }}
                    />
                    <span style={{ fontSize: 11, color: "#6b7280" }}>hrs cap</span>
                    <span style={{ fontSize: 11, color: pct > 100 ? "#a31515" : "#1a7f3c", flex: 1 }}>
                      {billed}h billed ({pct}%)
                    </span>
                    <button onClick={() => hooks.deleteHoursAllocation(c.id, a.id)} style={{
                      background: "none", border: "none", cursor: "pointer", color: "#a31515", fontSize: 14,
                    }}>✕</button>
                  </div>
                );
              })}
              {!c.hoursAllocations?.length && (
                <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
                  No years added yet. Click + Year to add a fiscal year cap.
                </div>
              )}
            </div>
          </div>
        );
      })}

      {contracts.length === 0 && (
        <div style={{ textAlign: "center", color: "#6b7280", padding: 24, fontSize: 13 }}>
          No contracts yet. Add your first contract above.
        </div>
      )}

      {showForm && (
        <Modal title={form.id ? "Edit Contract" : "Add Contract"} onClose={() => setShowForm(false)}>
          <Grid2>
            <Inp label="Contract Name" value={form.name} onChange={f("name")} placeholder="e.g. VTRAC Contract" />
            <Inp label="Client Name" value={form.client} onChange={f("client")} placeholder="e.g. VTRAC" />
          </Grid2>
          <Grid3>
            <Sel label="Status" value={form.status} onChange={f("status")} options={["Active", "Paused", "Ended"]} />
            <Inp label="Start Date (optional)" type="date" value={form.startDate ?? ""} onChange={f("startDate")} />
            <Inp label="End Date (optional)" type="date" value={form.endDate ?? ""} onChange={f("endDate")} />
          </Grid3>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Leave End Date blank for active/ongoing contracts.
          </div>
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
// HOUR ALLOCATION VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function HourAllocationView({
  business,
  selectedContractId,
  onSelectContract,
}: {
  business: ReturnType<typeof useBusiness>["business"];
  selectedContractId: string | null;
  onSelectContract: (id: string) => void;
}) {
  const contracts = business.contracts ?? [];
  const contract = contracts.find((c) => c.id === selectedContractId) ?? contracts[0] ?? null;
  const [fy, setFy] = useState(currentWorkFiscalYear());
  const now = new Date();

  const alloc = contract
    ? (contract.hoursAllocations ?? []).find((a) => a.fiscalYear === fy)
    : null;
  const totalHours = alloc?.totalHours ?? 0;
  const allocation = totalHours > 0 ? allocateHours(totalHours, fy) : [];

  const fyInvs = business.invoices.filter((i) => {
    const wm = Number(i.workMonth) || 1;
    const wy = Number(i.workYear) || 2026;
    return (wm >= 4 ? wy + 1 : wy) === fy;
  });
  const billedTotal = toFixed2(fyInvs.reduce((s, i) => s + (Number(i.hours) || 0), 0));
  const remaining = toFixed2(totalHours - billedTotal);

  const fyOptions = Array.from({ length: 6 }, (_, i) => {
    const y = now.getFullYear() - 2 + i;
    return { value: y, label: `FY${y} (Apr ${y - 1}–Mar ${y})` };
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        {contracts.length > 1 && (
          <div style={{ minWidth: 200 }}>
            <Label>Contract</Label>
            <select
              value={selectedContractId ?? ""}
              onChange={(e) => onSelectContract(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13 }}
            >
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <Label>Fiscal Year</Label>
          <select
            value={fy}
            onChange={(e) => setFy(Number(e.target.value))}
            style={{ padding: "7px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13 }}
          >
            {fyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {!totalHours ? (
        <div style={{
          background: "#fef3e2", padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#a05c00",
        }}>
          No hours allocation set for FY{fy}. Go to Contracts tab to add one.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <StatBox label="Total Allocated" value={`${totalHours}h`} />
            <StatBox label="Billed So Far" value={`${billedTotal}h`} color="#1a7f3c" />
            <StatBox label="Remaining" value={`${remaining}h`} color={remaining < 0 ? "#a31515" : "#1a5fa8"} />
            <StatBox label="Utilisation" value={`${toFixed2((billedTotal / totalHours) * 100)}%`} color={billedTotal > totalHours ? "#a31515" : "#1a7f3c"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {allocation.map((m) => {
              const inv = fyInvs.find((i) => Number(i.workMonth) === m.month && Number(i.workYear) === m.year);
              const billedHrs = inv ? Number(inv.hours) : 0;
              const pct = m.allocatedHours > 0 ? Math.min((billedHrs / m.allocatedHours) * 100, 100) : 0;
              const isCurrent = m.year === now.getFullYear() && m.month === now.getMonth() + 1;
              return (
                <div key={`${m.year}-${m.month}`} style={{
                  textAlign: "center",
                  background: isCurrent ? "#e3f1fd" : "#f9fafb",
                  borderRadius: 8, padding: 8,
                  border: `1px solid ${isCurrent ? "#1a5fa8" : "#e2e4e8"}`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: isCurrent ? "#1a5fa8" : "#6b7280", textTransform: "uppercase" }}>
                    {MONTHS[m.month - 1].slice(0, 3)}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{m.year}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginTop: 2 }}>
                    {Math.round(m.allocatedHours)}h
                  </div>
                  <div style={{ height: 3, background: "#e5e7eb", borderRadius: 99, marginTop: 4 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#1a7f3c" : "#1a5fa8", borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 10, color: billedHrs > 0 ? "#1a7f3c" : "#6b7280", marginTop: 2 }}>
                    {billedHrs > 0 ? `${billedHrs}h` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE LOG
// ═══════════════════════════════════════════════════════════════════════════════

function InvoiceLog({
  business,
  hooks,
  accounts,
  activeContract,
}: {
  business: ReturnType<typeof useBusiness>["business"];
  hooks: ReturnType<typeof useBusiness>;
  accounts: Account[];
  activeContract: Contract | null;
}) {
  const today = new Date().toISOString().split("T")[0];
  const rs = business.rateSettings;

  const defaultDraw = useMemo(() => {
    const e = getRateOnDate(rs.payrollDraw, today);
    return e?.value ?? 0;
  }, [rs, today]);

  const defaultInstalment = useMemo(() => {
    const e = getRateOnDate(rs.corpTaxInstalment, today);
    return e?.value ?? 2038;
  }, [rs, today]);

  const contractRate = useMemo(() => {
    if (!activeContract?.rateHistory?.length) return 74;
    return [...activeContract.rateHistory].sort(
      (a, b) => (b.effectiveFrom > a.effectiveFrom ? 1 : -1)
    )[0].rate;
  }, [activeContract]);

  const now = new Date();
  const emptyForm = {
    id: undefined as string | undefined,
    invoiceNumber: "",
    workMonth: now.getMonth() + 1,
    workYear: now.getFullYear(),
    hours: "" as string | number,
    hourlyRate: contractRate,
    invoiceDate: today,
    paymentDate: "",
    clientName: activeContract?.client ?? business.clientName ?? "",
    depositAccount: "",
    note: "",
    personalDraw: null as number | null,
    corpTaxReserve: null as number | null,
    contractId: activeContract?.id ?? null,
  };

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [printInv, setPrintInv] = useState<Invoice | null>(null);
  const [selectedFY, setSelectedFY] = useState<number | "all">(0); // 0 = use currentFY
  const [formError, setFormError] = useState<string | null>(null);

  const currentFY = currentWorkFiscalYear();

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  // Live calc — mirrors prototype's useMemo calc
  const calc = useMemo(() => {
    return hooks.calcInvoiceFields(
      Number(form.hours) || 0,
      Number(form.hourlyRate) || 0,
      form.invoiceDate,
      form.paymentDate || undefined,
      Number(form.workMonth),
      Number(form.workYear),
      rs
    );
  }, [form.hours, form.hourlyRate, form.invoiceDate, form.paymentDate, form.workMonth, form.workYear, rs]);

  function openNew() {
    setForm({
      ...emptyForm,
      hourlyRate: contractRate,
      clientName: activeContract?.client ?? business.clientName ?? "",
      contractId: activeContract?.id ?? null,
      invoiceNumber: hooks.getNextInvoiceNumber(now.getFullYear()),
    });
    setShowForm(true);
    setFormError(null);
  }

  function save() {
    const err = validateInvoice(
      Number(form.hours), Number(form.hourlyRate), Number(form.workMonth), Number(form.workYear)
    );
    if (err) { setFormError(err); return; }

    hooks.saveInvoice({
      id: form.id,
      invoiceNumber: form.invoiceNumber || hooks.getNextInvoiceNumber(Number(form.workYear)),
      contractId: form.contractId ?? "",
      workMonth: Number(form.workMonth),
      workYear: Number(form.workYear),
      hours: Number(form.hours),
      hourlyRate: Number(form.hourlyRate),
      invoiceDate: form.invoiceDate,
      paymentDate: form.paymentDate || undefined,
      clientName: form.clientName,
      depositAccount: form.depositAccount,
      note: form.note,
      personalDraw: form.personalDraw,
      corpTaxReserve: form.corpTaxReserve,
    });
    setShowForm(false);
    setForm(emptyForm);
    setFormError(null);
  }

  // Group invoices by work fiscal year
  const fyGroups: Record<number, Invoice[]> = {};
  business.invoices.forEach((i) => {
    const wm = Number(i.workMonth) || 1;
    const wy = Number(i.workYear) || 2026;
    const wfy = wm >= 4 ? wy + 1 : wy;
    (fyGroups[wfy] = fyGroups[wfy] ?? []).push(i);
  });

  const activeFY = selectedFY === "all" ? currentFY : (selectedFY || currentFY);
  const fyInvoices = selectedFY === "all"
    ? Object.values(fyGroups).flat()
    : fyGroups[activeFY] ?? [];
  const totalRevenue = fyInvoices.reduce((s, i) => s + i.subtotal, 0);
  const totalHST = fyInvoices.reduce((s, i) => s + i.hst, 0);
  const totalToRemit = fyInvoices.reduce((s, i) => s + i.hstToRemit, 0);
  const totalHours = toFixed2(fyInvoices.reduce((s, i) => s + (Number(i.hours) || 0), 0));

  const acctOpts = [
    { value: "", label: "— Select deposit account —" },
    ...accounts.map((a) => ({ value: a.name, label: a.name })),
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label={selectedFY === "all" ? "All Years Revenue" : `FY${activeFY} Revenue`} value={fmtCAD(totalRevenue)} color="#1a7f3c" />
        <StatBox label="HST Collected" value={fmtCAD(totalHST)} color="#1a5fa8" />
        <StatBox label="HST to Remit" value={fmtCAD(totalToRemit)} color="#a05c00" />
        <StatBox label="Total Hours" value={`${totalHours}h`} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Fiscal Year:</span>
          <select
            value={selectedFY === "all" ? "all" : selectedFY || currentFY}
            onChange={(e) => setSelectedFY(e.target.value === "all" ? "all" : Number(e.target.value))}
            style={{ padding: "5px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, background: "#fff" }}
          >
            <option value="all">All Years</option>
            {Object.keys(fyGroups).sort((a, b) => Number(b) - Number(a)).map((fy) => (
              <option key={fy} value={fy}>FY{fy} (Apr {Number(fy)-1}–Mar {fy})</option>
            ))}
          </select>
        </div>
        <Btn small onClick={openNew}>+ New Invoice</Btn>
      </div>

      {Object.keys(fyGroups)
        .filter((fy) => selectedFY === "all" || Number(fy) === (selectedFY || currentFY))
        .sort((a, b) => Number(b) - Number(a))
        .map((fy) => (
          <div key={fy}>
            <div style={{
              fontWeight: 600, fontSize: 13, marginBottom: 8,
              color: "#6b7280", borderBottom: "1px solid #e2e4e8", paddingBottom: 6,
            }}>
              FY{fy} (Apr {Number(fy) - 1} – Mar {fy})
            </div>
            {fyGroups[Number(fy)].length === 0 ? (
              <div style={{ textAlign: "center", color: "#6b7280", padding: 16, fontSize: 13 }}>No invoices for FY{fy}.</div>
            ) : [...fyGroups[Number(fy)]].sort((a, b) => {
              const da = a.paymentDate ?? a.invoiceDate ?? "";
              const db = b.paymentDate ?? b.invoiceDate ?? "";
              return db > da ? 1 : -1;
            }).map((inv) => (
              <div key={inv.id} style={{
                background: "#fff", border: "1px solid #e2e4e8",
                borderRadius: 10, padding: "12px 14px", marginBottom: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {inv.invoiceNumber} — {MONTHS[(Number(inv.workMonth) || 1) - 1]} {inv.workYear}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {inv.hours}h × {fmtCAD(inv.hourlyRate)}/hr
                      {inv.invoiceDate ? ` · Sent: ${fmtDate(inv.invoiceDate)}` : ""}
                      {inv.paymentDate
                        ? <span style={{ color: "#1a7f3c" }}> · Received: {fmtDate(inv.paymentDate)}</span>
                        : <span style={{ color: "#a05c00" }}> · ⏳ Awaiting payment</span>}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12 }}>Net: <strong>{fmtCAD(inv.subtotal)}</strong></span>
                      <span style={{ fontSize: 12 }}>HST: <strong style={{ color: "#1a5fa8" }}>{fmtCAD(inv.hst)}</strong></span>
                      <span style={{ fontSize: 12 }}>Total: <strong style={{ color: "#1a7f3c" }}>{fmtCAD(inv.total)}</strong></span>
                      <span style={{ fontSize: 12 }}>Remit: <strong style={{ color: "#a05c00" }}>{fmtCAD(inv.hstToRemit)}</strong></span>
                    </div>
                    {inv.depositAccount && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>→ {inv.depositAccount}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
                    <Btn variant="secondary" small onClick={() => setPrintInv(inv)}>Print</Btn>
                    <Btn variant="secondary" small onClick={() => {
                      setForm({ ...emptyForm, ...inv, id: inv.id, paymentDate: inv.paymentDate ?? "", hours: inv.hours });
                      setShowForm(true);
                      setFormError(null);
                    }}>Edit</Btn>
                    <Btn variant="danger" small onClick={() => {
                      if (confirm(`Delete invoice ${inv.invoiceNumber}?`)) hooks.deleteInvoice(inv.id);
                    }}>✕</Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

      {business.invoices.length === 0 && (
        <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>
          No invoices yet. Click + New Invoice above.
        </div>
      )}

      {/* Invoice Form Modal */}
      {showForm && (
        <Modal title={form.id ? "Edit Invoice" : "New Invoice"} onClose={() => setShowForm(false)} wide>
          {formError && (
            <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 8, fontSize: 13, color: "#a31515" }}>
              {formError}
            </div>
          )}
          <Grid3>
            <Inp label="Invoice #" value={form.invoiceNumber} onChange={f("invoiceNumber")} />
            <Sel label="Work Month" value={form.workMonth} onChange={f("workMonth")}
              options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} />
            <Sel label="Work Year" value={form.workYear} onChange={f("workYear")}
              options={[2024, 2025, 2026, 2027].map((y) => ({ value: y, label: String(y) }))} />
          </Grid3>
          <Grid2>
            <Inp label="Hours Worked" type="number" value={form.hours} onChange={f("hours")} placeholder="e.g. 160" />
            <Inp label="Hourly Rate ($)" type="number" value={form.hourlyRate} onChange={f("hourlyRate")} />
          </Grid2>
          <Grid3>
            <Inp label="Invoice Sent Date" type="date" value={form.invoiceDate} onChange={f("invoiceDate")} />
            <Inp label="Payment Received Date" type="date" value={form.paymentDate} onChange={f("paymentDate")}
              style={{ borderColor: form.paymentDate ? "#1a7f3c" : "#e2e4e8" }} />
            <Sel label="Deposit Account" value={form.depositAccount} onChange={f("depositAccount")} options={acctOpts} />
          </Grid3>
          <Inp label="Client Name" value={form.clientName} onChange={f("clientName")} />
          <Grid2>
            <AutoOverrideField
              label="Personal Draw This Month ($)"
              autoValue={defaultDraw}
              value={form.personalDraw}
              onChange={(v) => setForm((p) => ({ ...p, personalDraw: v }))}
            />
            <AutoOverrideField
              label="Corp Tax Reserve ($)"
              autoValue={toFixed2(defaultInstalment / 3)}
              value={form.corpTaxReserve}
              onChange={(v) => setForm((p) => ({ ...p, corpTaxReserve: v }))}
            />
          </Grid2>
          <Inp label="Notes (optional)" value={form.note} onChange={f("note")} placeholder="Optional" />

          {/* Auto-calc preview */}
          <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a5fa8", marginBottom: 8 }}>AUTO-CALCULATED</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                ["Subtotal", fmtCAD(calc.subtotal), "#1a1a1a"],
                [`HST (${(calc.hstRateVal * 100).toFixed(1)}%)`, fmtCAD(calc.hst), "#1a5fa8"],
                ["Total Invoice", fmtCAD(calc.total), "#1a7f3c"],
                [`To Remit (${(calc.qmRateVal * 100).toFixed(1)}%)`, fmtCAD(calc.hstToRemit), "#a05c00"],
                ["HST Kept", fmtCAD(calc.hstKept), "#1a7f3c"],
                ["Quarter", calc.quarter, "#4a3ab5"],
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: "#fff", borderRadius: 8, padding: "8px 10px", border: "1px solid #e2e4e8" }}>
                  <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>{l}</div>
                  <div style={{ fontWeight: 700, color: c, fontSize: 13 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn onClick={save}>Save Invoice</Btn>
          </div>
        </Modal>
      )}

      {/* Print Preview Modal */}
      {printInv && (
        <Modal title="Invoice Preview" onClose={() => setPrintInv(null)} wide>
          <div style={{ fontFamily: "Georgia, serif", padding: 20, border: "2px solid #e2e4e8", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 22, color: "#1a5fa8" }}>INVOICE</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{printInv.invoiceNumber}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Date: {fmtDate(printInv.invoiceDate)}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>From</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Contractor / Corporation</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>Bill To</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{printInv.clientName}</div>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <thead>
                <tr style={{ background: "#1a5fa8", color: "#fff" }}>
                  {["Description", "Hrs", "Rate", "Amount"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: h === "Description" ? "left" : "right", fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: "#f9fafb" }}>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    Professional Services — {MONTHS[(Number(printInv.workMonth) || 1) - 1]} {printInv.workYear}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13 }}>{printInv.hours}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13 }}>{fmtCAD(printInv.hourlyRate)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, fontWeight: 600 }}>{fmtCAD(printInv.subtotal)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ width: 280 }}>
                {[
                  ["Subtotal", fmtCAD(printInv.subtotal)],
                  ["HST (13%)", fmtCAD(printInv.hst)],
                  ["TOTAL", fmtCAD(printInv.total)],
                ].map(([l, v], i) => (
                  <div key={l} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "6px 0", borderBottom: i < 2 ? "1px solid #e2e4e8" : "none",
                    fontWeight: i === 2 ? 700 : 400, fontSize: i === 2 ? 15 : 13,
                  }}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => window.print()}>Print</Btn>
            <Btn variant="secondary" onClick={() => setPrintInv(null)}>Close</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export function HoursContractsSection({ accounts }: { accounts: Account[] }) {
  const hooks = useBusiness();
  const { business } = hooks;

  const [tab, setTab] = useState<"invoices" | "hours" | "contracts">("invoices");
  const contracts = business.contracts ?? [];
  const activeContract = contracts.find((c) => c.status === "Active") ?? contracts[0] ?? null;
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    activeContract?.id ?? null
  );

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Hours & Contracts</div>

      {hooks.error && (
        <div style={{
          padding: "8px 12px", background: "#fee2e2", borderRadius: 8,
          fontSize: 13, color: "#a31515", marginBottom: 12,
        }}>
          {hooks.error}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {(["invoices", "hours", "contracts"] as const).map((t) => (
          <Btn key={t} variant={tab === t ? "primary" : "secondary"} small onClick={() => setTab(t)}>
            {t === "invoices" ? "Invoice Log" : t === "hours" ? "Hour Allocation" : "Contracts"}
          </Btn>
        ))}
      </div>

      {tab === "contracts" && (
        <ContractsManager business={business} hooks={hooks} />
      )}
      {tab === "hours" && (
        <HourAllocationView
          business={business}
          selectedContractId={selectedContractId}
          onSelectContract={setSelectedContractId}
        />
      )}
      {tab === "invoices" && (
        <InvoiceLog
          business={business}
          hooks={hooks}
          accounts={accounts}
          activeContract={activeContract}
        />
      )}
    </div>
  );
}
