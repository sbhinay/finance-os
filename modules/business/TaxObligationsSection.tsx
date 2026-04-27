"use client";
import { TransactionForm } from "./TransactionForm";

import { useState, useEffect } from "react";
import { useBusiness, calcHSTFromInvoices } from "./useBusiness";
import { Account } from "@/types/account";
import { ArrearsType } from "@/types/business";
import { fmtCAD, fmtDate } from "@/utils/finance";

// ─── Shared primitives (same tokens as HoursContractsSection) ────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 11, fontWeight: 600, letterSpacing: ".05em",
      textTransform: "uppercase" as const, color: "#6b7280", display: "block", marginBottom: 4,
    }}>{children}</label>
  );
}

function Btn({
  children, onClick, variant = "primary", small, disabled,
}: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "green"; small?: boolean; disabled?: boolean;
}) {
  const c = {
    primary: { bg: "#1a5fa8", color: "#fff" },
    secondary: { bg: "#f3f4f6", color: "#374151" },
    danger: { bg: "#fef2f2", color: "#a31515" },
    green: { bg: "#f0fdf4", color: "#1a7f3c" },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13,
      fontWeight: 600, borderRadius: 8, border: "1px solid transparent",
      cursor: disabled ? "not-allowed" : "pointer", background: c.bg, color: c.color, opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

function Inp({
  label, type = "text", value, onChange, placeholder,
}: {
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

function Sel({
  label, value, onChange, options,
}: {
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

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>{children}</div>;
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
    green: { bg: "#dcfce7", fg: "#1a7f3c" }, blue: { bg: "#dbeafe", fg: "#1a5fa8" },
    amber: { bg: "#fef3c7", fg: "#a05c00" }, gray: { bg: "#f3f4f6", fg: "#6b7280" },
    red: { bg: "#fee2e2", fg: "#a31515" }, purple: { bg: "#ede9fe", fg: "#4a3ab5" },
    teal: { bg: "#d1fae5", fg: "#065f46" },
  };
  const c = m[color] ?? m.gray;
  return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>{children}</span>;
}

// ─── Obligation type (combined view) ─────────────────────────────────────────

type ObligationType = "HST" | "Corp Tax" | "Payroll";
interface FlatObligation {
  id: string;
  type: ObligationType;
  label: string;
  amount: number;
  dueDate: string;
  plannedDate?: string;
  paid: boolean;
  paidDate?: string | null;
  txnId?: string | null;
  note?: string;
  autoAmount?: number; // HST only
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBLIGATIONS LIST
// ═══════════════════════════════════════════════════════════════════════════════

function ObligationsList({
  obligations, hooks, accounts,
}: {
  obligations: FlatObligation[];
  hooks: ReturnType<typeof useBusiness>;
  accounts: Account[];
}) {
  const [markingPaid, setMarkingPaid] = useState<FlatObligation | null>(null);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<any>(undefined);

  // Pre-select business account for CRA payments
  const defaultCRAAccountId = (() => {
    const biz = accounts.find((a) => a.type === "business" || a.name.toLowerCase().includes("business"));
    return biz?.id ?? accounts[0]?.id ?? "";
  })();

  // Add Corp Tax Year
  const [showAddCorp, setShowAddCorp] = useState(false);
  const [newCorpYear, setNewCorpYear] = useState(new Date().getFullYear() + 1);
  const [newCorpAmt, setNewCorpAmt] = useState(2038);

  // Add Payroll Month
  const [showAddPayroll, setShowAddPayroll] = useState(false);
  const [payrollMonth, setPayrollMonth] = useState("");
  const [payrollAmt, setPayrollAmt] = useState(684.66);

  const today = new Date().toISOString().split("T")[0];
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  function getStatus(o: FlatObligation): { label: string; color: string } {
    if (o.paid) return { label: "Paid", color: "green" };
    const d = o.plannedDate ?? o.dueDate;
    if (d < today) return { label: "Overdue", color: "red" };
    if (d <= in30) return { label: "Due Soon", color: "amber" };
    return { label: "Upcoming", color: "gray" };
  }

  function openMarkPaid(o: FlatObligation) {
    setMarkingPaid(o);
    setTxFormInitial({
      type: "expense",
      amount: o.amount,
      date: o.plannedDate ?? o.dueDate,
      description: o.label,
      sourceId: defaultCRAAccountId,
      tag: "Business",
      mode: "Bank Transfer",
    });
    setTxFormOpen(true);
  }

  function unpay(o: FlatObligation) {
    if (!confirm("Undo this payment? The linked transaction and bank balance change will be reversed.")) return;
    hooks.unpayObligation(o.id, o.type, o.txnId);
    if (!o.txnId) {
      alert("Payment marked as unpaid. Note: the original transaction was created before transaction-linking was added — delete it manually from Daily Log if needed.");
    }
  }

  const typeColors: Record<string, string> = { HST: "blue", "Corp Tax": "purple", Payroll: "teal" };
  const unpaid = obligations.filter((o) => !o.paid);
  const paid = obligations.filter((o) => o.paid);
  const acctOpts = [
    { value: "", label: "— Select account —" },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${fmtCAD(a.openingBalance)})` })),
  ];

  return (
    <div>
      {/* Add actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Btn variant="secondary" small onClick={() => setShowAddCorp((p) => !p)}>+ Corp Tax Year</Btn>
        <Btn variant="secondary" small onClick={() => setShowAddPayroll((p) => !p)}>+ Payroll Month</Btn>
      </div>

      {showAddCorp && (
        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <Grid3>
            <Inp label="Year" type="number" value={newCorpYear} onChange={(e) => setNewCorpYear(Number(e.target.value))} />
            <Inp label="Amount per Quarter ($)" type="number" value={newCorpAmt} onChange={(e) => setNewCorpAmt(Number(e.target.value))} />
            <div style={{ paddingTop: 20 }}>
              <Btn small onClick={() => { hooks.addCorpTaxYear(newCorpYear, newCorpAmt); setShowAddCorp(false); }}>Add</Btn>
            </div>
          </Grid3>
        </div>
      )}

      {showAddPayroll && (
        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <Label>Month</Label>
              <input type="month" value={payrollMonth} onChange={(e) => setPayrollMonth(e.target.value)}
                style={{ padding: "7px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13 }} />
            </div>
            <div>
              <Label>Amount ($)</Label>
              <input type="number" value={payrollAmt} onChange={(e) => setPayrollAmt(Number(e.target.value))}
                style={{ width: 110, padding: "7px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13 }} />
            </div>
            <Btn small onClick={() => {
              if (payrollMonth) { hooks.addPayrollMonth(payrollMonth, payrollAmt); setShowAddPayroll(false); setPayrollMonth(""); }
            }}>Add</Btn>
            <Btn variant="secondary" small onClick={() => setShowAddPayroll(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {unpaid.length === 0 && (
        <div style={{ textAlign: "center", color: "#1a7f3c", padding: 24, fontSize: 14, fontWeight: 600 }}>
          ✓ All obligations paid — nothing outstanding
        </div>
      )}

      {unpaid.map((o) => {
        const st = getStatus(o);
        const borderColor = st.color === "red" ? "#a31515" : st.color === "amber" ? "#EF9F27" : "#9ca3af";
        return (
          <div key={o.id} style={{
            background: "#fff", border: "1px solid #e2e4e8", borderLeft: `4px solid ${borderColor}`,
            borderRadius: 10, padding: "12px 14px", marginBottom: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{o.label}</span>
                  <Pill color={typeColors[o.type] ?? "gray"}>{o.type}</Pill>
                  <Pill color={st.color}>{st.label}</Pill>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Due: {fmtDate(o.dueDate)}
                  {o.plannedDate && o.plannedDate !== o.dueDate
                    ? <span style={{ color: "#a05c00" }}> · Planned: {fmtDate(o.plannedDate)}</span>
                    : ""}
                </div>
                {o.type === "HST" && (o.autoAmount ?? 0) > 0 && (
                  <div style={{ fontSize: 12, color: "#1a5fa8", marginTop: 2 }}>
                    Auto-calc from invoices: {fmtCAD(o.autoAmount!)}
                  </div>
                )}
                {/* Inline planned date + amount edit */}
                <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>Planned:</span>
                    <input type="date" value={o.plannedDate ?? ""}
                      onChange={(e) => hooks.updateObligationPlannedDate(o.id, o.type, e.target.value)}
                      style={{ padding: "3px 7px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 11, background: "#fff", color: o.plannedDate ? "#1a5fa8" : "#9ca3af" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>Amount:</span>
                    <input type="number" value={o.amount ?? ""}
                      onChange={(e) => hooks.updateObligationAmount(o.id, o.type, Number(e.target.value))}
                      style={{ width: 100, padding: "3px 7px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 11 }} />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: "#a31515" }}>{fmtCAD(o.amount ?? 0)}</span>
                <Btn variant="green" small onClick={() => openMarkPaid(o)}>Mark Paid</Btn>
              </div>
            </div>

            {/* TransactionForm handles mark paid */}
          </div>
        );
      })}

      <TransactionForm
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setMarkingPaid(null); setTxFormInitial(undefined); }}
        initial={txFormInitial}
        scheduledAmount={markingPaid?.amount}
        lockType="expense"
        title={markingPaid ? `Pay CRA — ${markingPaid.label}` : "CRA Payment"}
        onSaved={(txn) => {
          if (markingPaid) {
            hooks.markObligationPaid(
              markingPaid.id, markingPaid.type, markingPaid.amount,
              txn.sourceId ?? "", (txn as any).date ?? new Date().toISOString().split("T")[0],
              markingPaid.label
            );
          }
          setTxFormOpen(false);
          setMarkingPaid(null);
          setTxFormInitial(undefined);
        }}
      />

      {/* Paid obligations (compact) */}
      {paid.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>PAID ({paid.length})</div>
          {paid.slice(0, 5).map((o) => (
            <div key={o.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, marginBottom: 6,
            }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{o.label}</span>
                <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>Paid: {fmtDate(o.paidDate ?? "")}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "#1a7f3c" }}>{fmtCAD(o.amount ?? 0)}</span>
                <Btn variant="secondary" small onClick={() => unpay(o)}>Undo</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARREARS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function ArrearsSection({
  hooks, accounts,
}: {
  hooks: ReturnType<typeof useBusiness>;
  accounts: Account[];
}) {
  const { business } = hooks;
  const empty = { amount: 0, date: new Date().toISOString().split("T")[0], type: "HST" as ArrearsType, note: "" };
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ...empty, accountId: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<typeof addForm | null>(null);
  const [editArrears, setEditArrears] = useState(false);
  const [hstVal, setHstVal] = useState(business.arrearsHST ?? 0);
  const [corpVal, setCorpVal] = useState(business.arrearsCorp ?? 0);

  const totalArrears = (business.arrearsHST ?? 0) + (business.arrearsCorp ?? 0);
  const totalPaid = business.arrearsPayments.reduce((s, p) => s + p.amount, 0);
  const pct = totalPaid > 0 && totalPaid + totalArrears > 0
    ? Math.round((totalPaid / (totalPaid + totalArrears)) * 100) : 0;

  const bizAcct = accounts.find((a) => a.type === "business" || a.name.toLowerCase().includes("business"));
  const acctOpts = [
    { value: "", label: "— No account (balance unchanged) —" },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>CRA Arrears</div>
        <Btn variant="secondary" small onClick={() => setEditArrears((p) => !p)}>
          {editArrears ? "Cancel" : "Edit Opening Balances"}
        </Btn>
      </div>

      {editArrears && (
        <div style={{ background: "#fff8f0", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#a05c00", marginBottom: 10 }}>
            Set the opening arrears balances. These are manually entered — enter whatever CRA has told you is outstanding.
          </div>
          <Grid2>
            <Inp label="HST Arrears ($)" type="number" value={hstVal} onChange={(e) => setHstVal(Number(e.target.value))} />
            <Inp label="Corporate Tax Arrears ($)" type="number" value={corpVal} onChange={(e) => setCorpVal(Number(e.target.value))} />
          </Grid2>
          <Btn small onClick={() => { hooks.setArrearsOpeningBalances(hstVal, corpVal); setEditArrears(false); }}>
            Save Opening Balances
          </Btn>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="HST Arrears" value={fmtCAD(business.arrearsHST ?? 0)} color="#a31515" />
        <StatBox label="Corp Tax Arrears" value={fmtCAD(business.arrearsCorp ?? 0)} color="#a31515" />
        <StatBox label="Total Outstanding" value={fmtCAD(totalArrears)} color="#a31515" />
        <StatBox label="Total Paid" value={fmtCAD(totalPaid)} color="#1a7f3c" />
      </div>

      {totalPaid > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 8, background: "#e5e7eb", borderRadius: 99 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#1a7f3c", borderRadius: 99, transition: "width .5s" }} />
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{pct}% paid down from opening balance</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Payment Log</div>
        <Btn small onClick={() => { setShowAdd(true); setAddForm({ ...empty, accountId: bizAcct?.id ?? "" }); }}>+ Log Payment</Btn>
      </div>

      {showAdd && (
        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <Grid3>
            <Inp label="Amount ($)" type="number" value={addForm.amount}
              onChange={(e) => setAddForm((p) => ({ ...p, amount: Number(e.target.value) }))} />
            <Inp label="Date" type="date" value={addForm.date}
              onChange={(e) => setAddForm((p) => ({ ...p, date: e.target.value }))} />
            <div>
              <Label>Applied To</Label>
              <select value={addForm.type} onChange={(e) => setAddForm((p) => ({ ...p, type: e.target.value as ArrearsType }))}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13 }}>
                {["HST", "Corporate", "Both"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </Grid3>
          <Grid2>
            <Inp label="Note (optional)" value={addForm.note}
              onChange={(e) => setAddForm((p) => ({ ...p, note: e.target.value }))} placeholder="e.g. CRA online payment" />
            <Sel label="Pay From Account" value={addForm.accountId}
              onChange={(e) => setAddForm((p) => ({ ...p, accountId: e.target.value }))} options={acctOpts} />
          </Grid2>
          {addForm.accountId
            ? <div style={{ fontSize: 12, color: "#1a7f3c", marginBottom: 8, background: "#f0fdf4", padding: "6px 10px", borderRadius: 6 }}>
                ✓ A transaction will be auto-logged and the account balance reduced.
              </div>
            : <div style={{ fontSize: 12, color: "#a05c00", marginBottom: 8, background: "#fef3e2", padding: "6px 10px", borderRadius: 6 }}>
                ⚠ No account selected — payment recorded but bank balance won't change.
              </div>
          }
          <div style={{ display: "flex", gap: 6 }}>
            <Btn small onClick={() => {
              if (!addForm.amount) return;
              hooks.addArrearsPayment(
                { amount: addForm.amount, date: addForm.date, type: addForm.type, note: addForm.note },
                addForm.accountId || undefined
              );
              setShowAdd(false); setAddForm({ ...empty, accountId: "" });
            }}>Save Payment</Btn>
            <Btn variant="secondary" small onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {[...business.arrearsPayments].reverse().map((p) => {
        if (editingId === p.id && editForm) {
          return (
            <div key={p.id} style={{ background: "#fff8f0", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                Editing: {p.note || `${p.type} Arrears Payment`} — {fmtDate(p.date)}
              </div>
              <Grid3>
                <Inp label="Amount ($)" type="number" value={editForm.amount}
                  onChange={(e) => setEditForm((f) => f ? { ...f, amount: Number(e.target.value) } : f)} />
                <Inp label="Date" type="date" value={editForm.date}
                  onChange={(e) => setEditForm((f) => f ? { ...f, date: e.target.value } : f)} />
                <div>
                  <Label>Applied To</Label>
                  <select value={editForm.type} onChange={(e) => setEditForm((f) => f ? { ...f, type: e.target.value as ArrearsType } : f)}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13 }}>
                    {["HST", "Corporate", "Both"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </Grid3>
              <Grid2>
                <Inp label="Note" value={editForm.note}
                  onChange={(e) => setEditForm((f) => f ? { ...f, note: e.target.value } : f)} />
                <Sel label="Pay From Account" value={editForm.accountId}
                  onChange={(e) => setEditForm((f) => f ? { ...f, accountId: e.target.value } : f)} options={acctOpts} />
              </Grid2>
              <div style={{ fontSize: 11, color: "#a05c00", marginBottom: 8 }}>
                ⚠ Saving will reverse the old transaction and create a new one.
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn small onClick={() => {
                  if (!editForm) return;
                  hooks.editArrearsPayment(
                    p.id,
                    { amount: editForm.amount, date: editForm.date, type: editForm.type, note: editForm.note },
                    editForm.accountId || undefined
                  );
                  setEditingId(null); setEditForm(null);
                }}>Save Changes</Btn>
                <Btn variant="secondary" small onClick={() => setEditingId(null)}>Cancel</Btn>
              </div>
            </div>
          );
        }

        return (
          <div key={p.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 12px", background: "#fff", border: "1px solid #e2e4e8", borderRadius: 8, marginBottom: 6,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{p.note || `${p.type} Arrears Payment`}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {fmtDate(p.date)} · {p.type}
                {p.account ? ` · ${accounts.find((a) => a.id === p.account)?.name ?? p.account}` : ""}
                {p.txnId
                  ? <span style={{ color: "#1a7f3c" }}> · ✓ txn linked</span>
                  : <span style={{ color: "#9ca3af" }}> · no txn link</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontWeight: 600, color: "#1a7f3c", fontSize: 13 }}>-{fmtCAD(p.amount)}</span>
              <Btn variant="secondary" small onClick={() => {
                setEditingId(p.id);
                setEditForm({ amount: p.amount, date: p.date, type: p.type, note: p.note ?? "", accountId: p.account ?? "" });
              }}>Edit</Btn>
              <Btn variant="danger" small onClick={() => {
                if (confirm("Delete this arrears payment? All related balance changes will be reversed."))
                  hooks.deleteArrearsPayment(p.id);
              }}>✕</Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAID HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

function PaidHistory({ obligations, arrearsPayments, accounts }: {
  obligations: FlatObligation[];
  arrearsPayments: ReturnType<typeof useBusiness>["business"]["arrearsPayments"];
  accounts: Account[];
}) {
  const sorted = [...obligations].sort((a, b) => (b.paidDate ?? "") > (a.paidDate ?? "") ? 1 : -1);
  const arrears = [...arrearsPayments].sort((a, b) => b.date > a.date ? 1 : -1);
  const typeColors: Record<string, string> = { HST: "blue", "Corp Tax": "purple", Payroll: "teal" };

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
        Paid Tax History ({obligations.length})
      </div>
      {sorted.length === 0 && arrears.length === 0 && (
        <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>No paid obligations yet.</div>
      )}
      {sorted.map((o) => (
        <div key={o.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "9px 14px", background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, marginBottom: 8,
        }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{o.label}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Paid: {fmtDate(o.paidDate ?? "")} · Due was: {fmtDate(o.dueDate)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Pill color={typeColors[o.type] ?? "gray"}>{o.type}</Pill>
            <span style={{ fontWeight: 700, color: "#1a7f3c" }}>{fmtCAD(o.amount ?? 0)}</span>
          </div>
        </div>
      ))}
      {arrears.length > 0 && (
        <>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, marginTop: 16, paddingTop: 12, borderTop: "1px solid #e2e4e8" }}>
            Arrears Payments ({arrears.length})
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, background: "#f0f9ff", padding: "6px 10px", borderRadius: 6 }}>
            💡 These payments reduce your outstanding CRA arrears balance. Separate from quarterly obligations above.
          </div>
          {arrears.map((p) => (
            <div key={p.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "9px 14px", background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, marginBottom: 8,
            }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{p.note || `${p.type} Arrears Payment`}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  {fmtDate(p.date)} · {p.type}
                  {p.account ? ` · ${accounts.find((a) => a.id === p.account)?.name ?? p.account}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Pill color="amber">Arrears</Pill>
                <span style={{ fontWeight: 700, color: "#1a7f3c" }}>{fmtCAD(p.amount)}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export function TaxObligationsSection({ accounts }: { accounts: Account[] }) {
  const hooks = useBusiness();
  const { business } = hooks;
  const [tab, setTab] = useState<"obligations" | "arrears" | "history">("obligations");
  const today = new Date().toISOString().split("T")[0];

  // Flatten all obligations into a single sorted list
  const allObligations: FlatObligation[] = [
    ...business.hstRemittances.map((h) => ({
      ...h,
      type: "HST" as ObligationType,
      label: `HST — ${h.period}`,
      autoAmount: calcHSTFromInvoices(h.quarter, business.invoices),
    })),
    ...business.corporateInstalments.map((i) => ({
      ...i,
      type: "Corp Tax" as ObligationType,
      label: `Corp Tax ${i.year} ${i.quarter}`,
    })),
    ...business.payrollRemittances.map((p) => ({
      ...p,
      type: "Payroll" as ObligationType,
      label: `Payroll — ${p.month}`,
    })),
  ].sort((a, b) => {
    const da = a.plannedDate ?? a.dueDate;
    const db = b.plannedDate ?? b.dueDate;
    return da > db ? 1 : -1;
  });

  const unpaid = allObligations.filter((o) => !o.paid);
  const totalOwing = unpaid.reduce((s, o) => s + (o.amount ?? 0), 0);
  const totalPaidYear = allObligations
    .filter((o) => o.paid && (o.paidDate ?? "").startsWith(new Date().getFullYear().toString()))
    .reduce((s, o) => s + (o.amount ?? 0), 0);
  const nextDue = unpaid.find((o) => (o.amount ?? 0) > 0);
  const totalArrears = (business.arrearsHST ?? 0) + (business.arrearsCorp ?? 0);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Tax Obligations</div>

      {hooks.error && (
        <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 8, fontSize: 13, color: "#a31515", marginBottom: 12 }}>
          {hooks.error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="Total Owing" value={fmtCAD(totalOwing)} color="#a31515" sub="current obligations" />
        <StatBox label="Next Due" value={nextDue ? fmtCAD(nextDue.amount ?? 0) : "—"} color="#a05c00"
          sub={nextDue ? fmtDate(nextDue.plannedDate ?? nextDue.dueDate) : "nothing due"} />
        <StatBox label="Paid This Year" value={fmtCAD(totalPaidYear)} color="#1a7f3c" />
        <StatBox label="CRA Arrears" value={fmtCAD(totalArrears)} color={totalArrears > 0 ? "#a31515" : "#1a7f3c"} sub="outstanding balance" />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["obligations", "arrears", "history"] as const).map((t) => (
          <Btn key={t} variant={tab === t ? "primary" : "secondary"} small onClick={() => setTab(t)}>
            {t === "obligations" ? "Obligations" : t === "arrears" ? "Arrears" : "Paid History"}
          </Btn>
        ))}
      </div>

      {tab === "obligations" && (
        <ObligationsList obligations={allObligations} hooks={hooks} accounts={accounts} />
      )}
      {tab === "arrears" && (
        <ArrearsSection hooks={hooks} accounts={accounts} />
      )}
      {tab === "history" && (
        <PaidHistory
          obligations={allObligations.filter((o) => o.paid)}
          arrearsPayments={business.arrearsPayments}
          accounts={accounts}
        />
      )}
    </div>
  );
}
