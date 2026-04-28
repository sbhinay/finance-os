"use client";

import { useState, useEffect, useMemo } from "react";
import { TransactionForm } from "./TransactionForm";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { useCategories } from "@/modules/categories/useCategories";
import { useVehicles, useHouseLoans } from "./useAssets";
import { useFixedPayments } from "./useFixedPayments";
import { Account } from "@/types/account";
import { CreditCard } from "@/types/creditCard";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { transactionRepository } from "@/repositories/transactionRepository";
import { fmtCAD, toFixed2 } from "@/utils/finance";
import { notifyDataChanged, DATA_CHANGED_EVENT } from "@/utils/events";
import { syncBalances } from "@/utils/syncBalances";
type TransactionFormInitial = React.ComponentProps<typeof TransactionForm>["initial"];

// ─── Primitives ───────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "#6b7280", display: "block", marginBottom: 4 }}>{children}</label>;
}
function Inp({ label, type = "text", value, onChange, placeholder, disabled }: {
  label?: string; type?: string; value: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; disabled?: boolean;
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input type={type} value={value ?? ""} onChange={onChange} placeholder={placeholder} disabled={disabled}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: disabled ? "#f9fafb" : "#fff", fontSize: 13, boxSizing: "border-box" as const }} />
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
function Btn({ children, onClick, variant = "primary", small, disabled, style }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "green"; small?: boolean; disabled?: boolean; style?: React.CSSProperties;
}) {
  const c = { primary: { bg: "#1a5fa8", color: "#fff" }, secondary: { bg: "#f3f4f6", color: "#374151" }, danger: { bg: "#fef2f2", color: "#a31515" }, green: { bg: "#1a7f3c", color: "#fff" } }[variant];
  return <button onClick={onClick} disabled={disabled} style={{ padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, borderRadius: 8, border: "1px solid transparent", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, background: c.bg, color: c.color, ...style }}>{children}</button>;
}
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: wide ? 640 : 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
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
function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 110, padding: "12px 14px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: color ?? "#1a1a1a" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  const m: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#dcfce7", fg: "#1a7f3c" }, red: { bg: "#fee2e2", fg: "#a31515" },
    blue: { bg: "#dbeafe", fg: "#1a5fa8" }, amber: { bg: "#fef3c7", fg: "#a05c00" },
    purple: { bg: "#ede9fe", fg: "#4a3ab5" }, teal: { bg: "#d1fae5", fg: "#065f46" },
    orange: { bg: "#ffedd5", fg: "#c2410c" }, gray: { bg: "#f3f4f6", fg: "#6b7280" },
  };
  const c = m[color] ?? m.gray;
  return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>{children}</span>;
}

// ─── Hook that auto-reloads on data changed event ─────────────────────────────

function useAutoReload(reload: () => void) {
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, [reload]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BANK ACCOUNTS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function BankAccountsSection() {
  const { accounts, addAccount, updateAccount, deleteAccount, reloadAccounts } = useAccounts();
  const { fixedPayments } = useFixedPayments();
  const { vehicles } = useVehicles();
  const { houseLoans } = useHouseLoans();

  useAutoReload(reloadAccounts);

  const now = new Date();
  const todayLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const emptyForm = { id: "" as string | undefined, name: "", bank: "", type: "Chequing" as Account["type"], openingBalance: 0, accountNumber: "" };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reconcile, setReconcile] = useState<Account | null>(null);
  const [reconAmt, setReconAmt] = useState(0);
  const [reconDate, setReconDate] = useState(todayLocal);

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!form.name) return;
    if (form.id) {
      updateAccount({
        id: form.id!,
        name: form.name,
        type: form.type as Account["type"],
        openingBalance: toFixed2(Number(form.openingBalance)),
        balanceBase: toFixed2(Number(form.openingBalance)),
        reconciledBalance: undefined,
        reconciledDate: undefined,
        active: true,
        currency: "CAD",
        createdAt: new Date().toISOString(),
      });
    } else {
      addAccount(form.name, form.type as Account["type"], toFixed2(Number(form.openingBalance)));
    }
    setShowForm(false); setForm(emptyForm);
    notifyDataChanged("accounts");
  }

  // Outflow calculation — next 30 days from fixed payments, vehicles, house loans
  function getOutflows(accountId: string, days: number) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today.getTime() + days * 86400000);
    const items: Array<{ label: string; amount: number; date: Date }> = [];
    const acct = accounts.find((a) => a.id === accountId);
    if (!acct) return items;

    fixedPayments.filter((p) => p.source === accountId || p.source === acct.name).forEach((p) => {
      if (!p.amount || !p.date) return;
      if (p.endDate && new Date(p.endDate + "T12:00:00") < today) return;
      if (p.schedule === "One-time") {
        const d = new Date(p.date + "T12:00:00");
        if (d >= today && d <= end) items.push({ label: p.name, amount: p.amount, date: d });
        return;
      }
      const schedDays: Record<string, number> = { Weekly: 7, "Bi-weekly": 14, "Semi-monthly": 15, Monthly: 30, Annual: 365, "One-time": 0 };
      const interval = schedDays[p.schedule] ?? 30;
      let d = new Date(p.date + "T12:00:00");
      while (d <= end) { if (d >= today) items.push({ label: p.name, amount: p.amount, date: new Date(d) }); d = new Date(d.getTime() + interval * 86400000); }
    });

    vehicles.filter((v) => v.source === accountId || v.source === acct.name).forEach((v) => {
      if (!v.nextPaymentDate) return;
      const interval = ({ Weekly: 7, "Bi-weekly": 14, "Semi-monthly": 15, Monthly: 30, Annual: 365 } as Record<string,number>)[v.schedule] ?? 30;
      let d = new Date(v.nextPaymentDate + "T12:00:00");
      while (d <= end) { if (d >= today) items.push({ label: v.name, amount: v.payment, date: new Date(d) }); d = new Date(d.getTime() + interval * 86400000); }
    });

    houseLoans.filter((l) => l.source === accountId || l.source === acct.name).forEach((l) => {
      if (!l.nextPaymentDate) return;
      const interval = ({ Weekly: 7, "Bi-weekly": 14, "Semi-monthly": 15, Monthly: 30, Annual: 365 } as Record<string,number>)[l.schedule] ?? 30;
      let d = new Date(l.nextPaymentDate + "T12:00:00");
      while (d <= end) { if (d >= today) items.push({ label: l.name, amount: l.payment, date: new Date(d) }); d = new Date(d.getTime() + interval * 86400000); }
    });

    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const totalBalance = accounts.reduce((s, a) => s + a.openingBalance, 0);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Bank Accounts</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="Total Balance" value={fmtCAD(totalBalance)} color="#1a7f3c" />
        <StatBox label="Accounts" value={String(accounts.length)} />
        <StatBox label="Chequing" value={fmtCAD(accounts.filter((a) => a.type === "bank").reduce((s, a) => s + a.openingBalance, 0))} />
        <StatBox label="Business" value={fmtCAD(accounts.filter((a) => a.type === "business").reduce((s, a) => s + a.openingBalance, 0))} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn small onClick={() => { setForm(emptyForm); setShowForm(true); }}>+ Add Account</Btn>
      </div>

      {accounts.map((a) => {
        const outflows30 = getOutflows(a.id, 30);
        const outflows7 = getOutflows(a.id, 7);
        const t7 = toFixed2(outflows7.reduce((s, x) => s + x.amount, 0));
        const t30 = toFixed2(outflows30.reduce((s, x) => s + x.amount, 0));
        const bal30 = toFixed2(a.openingBalance - t30);

        return (
          <div key={a.id} style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                  {a.primary && <span style={{ fontSize: 10, fontWeight: 700, background: "#1a7f3c", color: "#fff", padding: "1px 7px", borderRadius: 99 }}>PRIMARY</span>}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{a.type}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: a.openingBalance >= 0 ? "#1a7f3c" : "#a31515" }}>
                  {fmtCAD(a.openingBalance)}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <Btn variant="secondary" small onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                    {expanded === a.id ? "▲ Hide" : "▼ Outflows"}
                  </Btn>
                  <Btn variant="secondary" small onClick={() => { setReconcile(a); setReconAmt(a.openingBalance); setReconDate(a.reconciledDate ?? todayLocal); }}>Reconcile</Btn>
                  <button onClick={() => { updateAccount({ ...a, primary: !a.primary }); notifyDataChanged("accounts"); }}
                    style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none", cursor: "pointer", background: a.primary ? "#1a7f3c" : "#f3f4f6", color: a.primary ? "#fff" : "#6b7280" }}>
                    {a.primary ? "★ Primary" : "☆ Primary"}
                  </button>
                  <Btn variant="secondary" small onClick={() => { setForm({ ...emptyForm, ...a, id: a.id }); setShowForm(true); }}>Edit</Btn>
                  <Btn variant="danger" small onClick={() => { if (confirm(`Delete ${a.name}?`)) { deleteAccount(a.id); notifyDataChanged("accounts"); } }}>✕</Btn>
                </div>
              </div>
            </div>

            {expanded === a.id && (
              <div style={{ marginTop: 10, borderTop: "1px solid #e2e4e8", paddingTop: 10 }}>
                <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <div style={{ background: "#fef3e2", borderRadius: 8, padding: "8px 12px", flex: 1, minWidth: 110 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#a05c00", textTransform: "uppercase", marginBottom: 2 }}>Next 7 Days Out</div>
                    <div style={{ fontWeight: 700, color: "#a05c00" }}>{fmtCAD(t7)}</div>
                  </div>
                  <div style={{ background: "#fdecea", borderRadius: 8, padding: "8px 12px", flex: 1, minWidth: 110 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#a31515", textTransform: "uppercase", marginBottom: 2 }}>Next 30 Days Out</div>
                    <div style={{ fontWeight: 700, color: "#a31515" }}>{fmtCAD(t30)}</div>
                  </div>
                  <div style={{ background: bal30 >= 0 ? "#e6f4ea" : "#fdecea", borderRadius: 8, padding: "8px 12px", flex: 1, minWidth: 110 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: bal30 >= 0 ? "#1a7f3c" : "#a31515", textTransform: "uppercase", marginBottom: 2 }}>Balance After 30 Days</div>
                    <div style={{ fontWeight: 700, color: bal30 >= 0 ? "#1a7f3c" : "#a31515" }}>{fmtCAD(bal30)}</div>
                  </div>
                </div>
                {outflows30.length === 0
                  ? <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center", padding: 8 }}>No scheduled outflows in the next 30 days.</div>
                  : outflows30.map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
                      <span>{item.label}</span>
                      <span style={{ color: "#a31515", fontWeight: 500 }}>
                        {fmtCAD(item.amount)} · {item.date.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}

      {accounts.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>No accounts yet.</div>}

      {reconcile && (
        <Modal title={`Reconcile — ${reconcile.name}`} onClose={() => setReconcile(null)}>
          <div style={{ background: "#fef3e2", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#a05c00" }}>
            Set the actual current balance from your bank statement. This overrides the calculated balance baseline.
          </div>
          <div style={{ fontSize: 13 }}>Current system balance: <strong>{fmtCAD(reconcile.openingBalance)}</strong></div>
          <Grid2>
            <Inp label="Actual Balance from Statement ($)" type="number" value={reconAmt} onChange={(e) => setReconAmt(Number(e.target.value))} />
            <Inp label="Statement Date" type="date" value={reconDate} onChange={(e) => setReconDate(e.target.value)} />
          </Grid2>
          {reconAmt === 0 && (
            <div style={{ background: "#fef2f2", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#a31515" }}>
              Warning: Setting balance to $0.00. This will reset the account balance to zero.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setReconcile(null)}>Cancel</Btn>
            <Btn onClick={() => {
              if (!reconcile) return;
              const updated = {
                ...reconcile,
                openingBalance: toFixed2(reconAmt),
                balanceBase: toFixed2(reconAmt),
                reconciledBalance: toFixed2(reconAmt),
                reconciledDate: reconDate,
              };
              updateAccount(updated);

              const diff = toFixed2(reconAmt - reconcile.openingBalance);
              if (diff !== 0) {
                transactionRepository.add({
                  id: Date.now().toString(),
                  type: "adjustment",
                  subType: "reconciliation",
                  amount: Math.abs(diff),
                  description: `Reconciliation — ${reconcile.name}`,
                  sourceId: reconcile.id,
                  destinationId: reconcile.id,
                  date: reconDate,
                  createdAt: new Date().toISOString(),
                  currency: "CAD",
                  status: "cleared",
                  tag: "Personal",
                  mode: "Bank Transfer",
                });
              }

              syncBalances();
              notifyDataChanged("accounts");
              setReconcile(null);
            }}>Set Balance</Btn>
          </div>
        </Modal>
      )}

      {showForm && (
        <Modal title={form.id ? "Edit Account" : "Add Bank Account"} onClose={() => setShowForm(false)}>
          <Inp label="Account Name" value={form.name} onChange={f("name")} placeholder="e.g. RBC Business Chequing" />
          <Inp label="Bank / Institution" value={form.bank ?? ""} onChange={f("bank")} />
          <Sel label="Type" value={form.type} onChange={f("type")} options={[
            { value: "bank", label: "Chequing" },
            { value: "cash", label: "Savings / Cash" },
            { value: "business", label: "Business" },
          ]} />
          <Inp label="Current Balance ($)" type="number" value={form.openingBalance} onChange={f("openingBalance")} />
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
// CREDIT CARDS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function CreditCardsSection() {
  const { cards, addCard, deleteCard, reloadCards } = useCreditCards();
  const { accounts, reloadAccounts } = useAccounts();

  useAutoReload(reloadCards);
  useAutoReload(reloadAccounts);

  const now = new Date();
  const todayLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const emptyForm = {
    id: "" as string | undefined,
    name: "", issuer: "",
    type: "personal" as CreditCard["type"],
    limitAmount: 0, openingBalance: 0,
    linkedAccountId: "",
  };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<TransactionFormInitial>(undefined);
  const [pendingPayCard, setPendingPayCard] = useState<CreditCard | null>(null);
  const [reconcileCard, setReconcileCard] = useState<CreditCard | null>(null);
  const [cardReconAmt, setCardReconAmt] = useState(0);
  const [cardReconDate, setCardReconDate] = useState(todayLocal);

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!form.name) return;
    if (form.id) {
      // update via repository directly
      const all = creditCardRepository.getAll();
      creditCardRepository.saveAll(all.map((c) => c.id === form.id ? {
        ...c,
        name: form.name,
        issuer: form.issuer,
        type: form.type,
        limitAmount: toFixed2(Number(form.limitAmount)),
        openingBalance: toFixed2(Number(form.openingBalance)),
        balanceBase: toFixed2(Number(form.openingBalance)),
        reconciledBalance: undefined,
        reconciledDate: undefined,
        linkedAccountId: form.linkedAccountId,
      } : c));
      reloadCards();
    } else {
      addCard(form.name, form.issuer, form.type, toFixed2(Number(form.limitAmount)), toFixed2(Number(form.openingBalance)), form.linkedAccountId);
    }
    setShowForm(false); setForm(emptyForm);
    notifyDataChanged("cards");
  }

  function openPayCard(c: CreditCard) {
    if (!c.linkedAccountId) {
  alert(`No linked bank account set for ${c.name}. Edit the card and set a linked account first.`);
  return;
}
    setPendingPayCard(c);
    setTxFormInitial({
      type: "credit_card_payment",
      amount: c.openingBalance > 0 ? toFixed2(c.openingBalance) : undefined,
      description: `Credit card payment — ${c.name}`,
      sourceId: c.linkedAccountId ?? "",
      destinationId: c.id,
      tag: "Personal",
      mode: "Bank Transfer",
    });
    setTxFormOpen(true);
  }

  const totalOwing = cards.reduce((s, c) => s + c.openingBalance, 0);
  const totalLimit = cards.reduce((s, c) => s + c.limitAmount, 0);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Credit Cards</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="Total Owing" value={fmtCAD(totalOwing)} color="#a31515" />
        <StatBox label="Total Limit" value={fmtCAD(totalLimit)} />
        <StatBox label="Available" value={fmtCAD(totalLimit - totalOwing)} color="#1a7f3c" />
        <StatBox label="Utilization" value={totalLimit ? `${Math.round((totalOwing / totalLimit) * 100)}%` : "0%"}
          color={totalLimit && totalOwing / totalLimit > 0.3 ? "#a05c00" : "#1a7f3c"} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn small onClick={() => { setForm(emptyForm); setShowForm(true); }}>+ Add Card</Btn>
      </div>

      {cards.map((c) => {
        const u = c.limitAmount ? Math.round((c.openingBalance / c.limitAmount) * 100) : 0;
        const linked = accounts.find((a) => a.id === c.linkedAccountId);
        return (
          <div key={c.id} style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  {c.primary && <span style={{ fontSize: 10, fontWeight: 700, background: "#1a7f3c", color: "#fff", padding: "1px 7px", borderRadius: 99 }}>PRIMARY</span>}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                  {c.issuer}
                  <Pill color={c.type === "business" ? "blue" : "purple"}>{c.type}</Pill>
                  {linked && <span>· {linked.name}</span>}
                </div>
                <div style={{ marginTop: 8, height: 4, background: "#e5e7eb", borderRadius: 99, width: 200 }}>
                  <div style={{ height: "100%", width: `${Math.min(u, 100)}%`, background: u > 80 ? "#a31515" : u > 30 ? "#EF9F27" : "#1a7f3c", borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>Utilization: {u}%</div>
              </div>
              <div style={{ textAlign: "right", marginLeft: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#a31515" }}>{fmtCAD(c.openingBalance)}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Limit: {fmtCAD(c.limitAmount)}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <Btn variant="green" small onClick={() => openPayCard(c)}>Pay</Btn>
                  <Btn variant="secondary" small onClick={() => { setReconcileCard(c); setCardReconAmt(c.openingBalance); setCardReconDate(c.reconciledDate ?? todayLocal); }}>Reconcile</Btn>
                  <button onClick={() => {
                    const all = creditCardRepository.getAll();
                    creditCardRepository.saveAll(all.map((x) => ({ ...x, primary: x.id === c.id ? !c.primary : x.primary })));
                    reloadCards(); notifyDataChanged("cards");
                  }} style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none", cursor: "pointer", background: c.primary ? "#1a7f3c" : "#f3f4f6", color: c.primary ? "#fff" : "#6b7280" }}>
                    {c.primary ? "★ Primary" : "☆ Primary"}
                  </button>
                  <Btn variant="secondary" small onClick={() => { setForm({ ...emptyForm, ...c, id: c.id }); setShowForm(true); }}>Edit</Btn>
                  <Btn variant="danger" small onClick={() => { if (confirm(`Delete ${c.name}?`)) { deleteCard(c.id); notifyDataChanged("cards"); } }}>✕</Btn>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {cards.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>No cards yet.</div>}

      <TransactionForm
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setPendingPayCard(null); setTxFormInitial(undefined); }}
        initial={txFormInitial}
        lockType="credit_card_payment"
        title={pendingPayCard ? `Pay — ${pendingPayCard.name}` : "Card Payment"}
        onSaved={() => {
          // syncBalances() in TransactionForm already updated all balances
          reloadCards();
          setTxFormOpen(false);
          setPendingPayCard(null);
          setTxFormInitial(undefined);
        }}
      />

      {reconcileCard && (
        <Modal title={`Reconcile — ${reconcileCard.name}`} onClose={() => setReconcileCard(null)}>
          <div style={{ background: "#fef3e2", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#a05c00" }}>
            Set the actual balance owing from your statement. This establishes a stable credit card balance baseline.
          </div>
          <div style={{ fontSize: 13 }}>Current system balance: <strong>{fmtCAD(reconcileCard.openingBalance)}</strong></div>
          <Grid2>
            <Inp label="Statement Balance Owing ($)" type="number" value={cardReconAmt} onChange={(e) => setCardReconAmt(Number(e.target.value))} />
            <Inp label="Statement Date" type="date" value={cardReconDate} onChange={(e) => setCardReconDate(e.target.value)} />
          </Grid2>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setReconcileCard(null)}>Cancel</Btn>
            <Btn onClick={() => {
              if (!reconcileCard) return;
              const updated = {
                ...reconcileCard,
                openingBalance: toFixed2(cardReconAmt),
                balanceBase: toFixed2(cardReconAmt),
                reconciledBalance: toFixed2(cardReconAmt),
                reconciledDate: cardReconDate,
              };
              creditCardRepository.saveAll(
                creditCardRepository.getAll().map((c) => c.id === updated.id ? updated : c)
              );

              const diff = toFixed2(cardReconAmt - reconcileCard.openingBalance);
              if (diff !== 0) {
                transactionRepository.add({
                  id: Date.now().toString(),
                  type: "adjustment",
                  subType: "reconciliation",
                  amount: Math.abs(diff),
                  description: `Reconciliation — ${reconcileCard.name}`,
                  sourceId: reconcileCard.id,
                  destinationId: reconcileCard.id,
                  date: cardReconDate,
                  createdAt: new Date().toISOString(),
                  currency: "CAD",
                  status: "cleared",
                  tag: "Personal",
                  mode: "Bank Transfer",
                });
              }

              syncBalances();
              reloadCards();
              notifyDataChanged("cards");
              setReconcileCard(null);
            }}>Set Balance</Btn>
          </div>
        </Modal>
      )}

      {showForm && (
        <Modal title={form.id ? "Edit Card" : "Add Credit Card"} onClose={() => setShowForm(false)}>
          <Inp label="Card Name" value={form.name} onChange={f("name")} />
          <Inp label="Issuer" value={form.issuer} onChange={f("issuer")} placeholder="TD, Rogers, Costco…" />
          <Sel label="Type" value={form.type} onChange={f("type")} options={[
            { value: "personal", label: "Personal Credit Card" },
            { value: "business", label: "Business Credit Card" },
          ]} />
          <Sel label="Linked Bank Account" value={form.linkedAccountId ?? ""} onChange={f("linkedAccountId")}
            options={[{ value: "", label: "— None —" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
          <Grid2>
            <Inp label="Credit Limit ($)" type="number" value={form.limitAmount} onChange={f("limitAmount")} />
            <Inp label="Balance Owing ($)" type="number" value={form.openingBalance} onChange={f("openingBalance")} />
          </Grid2>
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
// TRANSACTION HISTORY SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function TransactionHistorySection() {
  const { transactions, reloadTransactions } = useTransactions();
  const { accounts, reloadAccounts } = useAccounts();
  const { cards } = useCreditCards();
  const { categories } = useCategories();
  const { vehicles } = useVehicles();
  const { houseLoans } = useHouseLoans();

  useAutoReload(reloadTransactions as () => void);
  useAutoReload(reloadAccounts);

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(now.toISOString().split("T")[0]);
  const [filter, setFilter] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editTx, setEditTx] = useState<TransactionFormInitial>(undefined);
  const [txFormOpen, setTxFormOpen] = useState(false);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const d = (t.date ?? t.createdAt ?? "").slice(0, 10);
      if (d < dateFrom || d > dateTo) return false;
      if (filter !== "all" && t.type !== filter) return false;
      if (catFilter && t.categoryId !== catFilter) return false;
      if (search && !`${t.description}${t.sourceId}${t.categoryId ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      const da = (a.date ?? a.createdAt ?? "");
      const db = (b.date ?? b.createdAt ?? "");
      return db > da ? 1 : -1;
    });
  }, [transactions, dateFrom, dateTo, filter, catFilter, search]);

  const totalIn = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0); // transfers excluded
  const totalTransfers = filtered.filter((t) => t.type === "transfer").reduce((s, t) => s + t.amount, 0);

  // Top categories bar chart
  const catMap: Record<string, number> = {};
  filtered.filter((t) => t.type === "expense").forEach((t) => {
    const key = t.categoryId ?? "uncategorized";
    catMap[key] = (catMap[key] ?? 0) + t.amount;
  });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

  function exportCSV() {
    const rows = [["Date", "Type", "Amount", "Category", "Account", "Mode", "Tag", "Description", "Vehicle", "Property"]];
    filtered.forEach((t) => {
      const veh = t.linkedVehicleId ? vehicles.find((v) => v.id === t.linkedVehicleId)?.name ?? "" : "";
      const prop = t.linkedPropertyId ? houseLoans.find((h) => h.id === t.linkedPropertyId)?.name ?? "" : "";
      const acct = [...accounts, ...cards].find((x) => x.id === t.sourceId)?.name ?? t.sourceId;
      const cat = categories.find((c) => c.id === t.categoryId)?.name ?? "";
      rows.push([(t.date ?? t.createdAt ?? "").slice(0, 10), t.type, String(t.amount), cat, acct, t.mode ?? "", t.tag ?? "", t.description ?? "", veh, prop]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `Transactions_${dateFrom}_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? id ?? "";
  const acctName = (id: string) => [...accounts, ...cards].find((x) => x.id === id)?.name ?? id;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Transaction History</div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1px solid #1a5fa8", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
        <Grid2>
          <Inp label="From Date" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Inp label="To Date" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Grid2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          {(["all", "income", "expense", "transfer"] as const).map((v) => (
            <Btn key={v} variant={filter === v ? "primary" : "secondary"} small onClick={() => setFilter(v)}>
              {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
            </Btn>
          ))}
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            style={{ padding: "5px 8px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 12, background: "#fff" }}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            style={{ padding: "5px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 12, flex: 1, minWidth: 120 }} />
          <Btn variant="secondary" small onClick={exportCSV}>⬇ Export CSV</Btn>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <StatBox label="Income" value={fmtCAD(totalIn)} color="#1a7f3c" />
        <StatBox label="Expenses" value={fmtCAD(totalOut)} color="#a31515" />
        <StatBox label="Transfers" value={fmtCAD(totalTransfers)} color="#6b7280" sub="not counted in net" />
        <StatBox label="Net" value={fmtCAD(totalIn - totalOut)} color={totalIn - totalOut >= 0 ? "#1a7f3c" : "#a31515"} />
        <StatBox label="Entries" value={String(filtered.length)} />
      </div>

      {/* Category chart */}
      {topCats.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Spending by Category</div>
          {topCats.map(([catId, amt]) => (
            <div key={catId} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span>{catName(catId)}</span>
                <span style={{ fontWeight: 600 }}>{fmtCAD(amt)}</span>
              </div>
              <div style={{ height: 3, background: "#e5e7eb", borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${(amt / topCats[0][1]) * 100}%`, background: "#1a5fa8", borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transaction list */}
      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, overflow: "hidden" }}>
        {filtered.slice(0, 200).map((t) => {
          const veh = t.linkedVehicleId ? vehicles.find((v) => v.id === t.linkedVehicleId) : null;
          const prop = t.linkedPropertyId ? houseLoans.find((h) => h.id === t.linkedPropertyId) : null;
          return (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.description || catName(t.categoryId) || "—"}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{(t.date ?? t.createdAt ?? "").slice(0, 10)}</span>
                  {catName(t.categoryId) && <span>· {catName(t.categoryId)}</span>}
                  {t.mode && <span>· {t.mode}</span>}
                  {t.sourceId && <span>· {acctName(t.sourceId)}</span>}
                  {t.tag === "Business" && <Pill color="blue">Biz</Pill>}
                  {veh && <Pill color="orange">{veh.name}</Pill>}
                  {prop && <Pill color="purple">{prop.name}</Pill>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Pill color={t.type === "income" ? "green" : t.type === "transfer" ? "gray" : "red"}>
                  {t.type === "income" ? "+" : t.type === "transfer" ? "⇄" : "-"}{fmtCAD(t.amount)}
                </Pill>
                <button onClick={() => {
                  setEditTx({
                    id: t.id, type: t.type, amount: t.amount,
                    date: t.date ?? t.createdAt?.slice(0, 10),
                    createdAt: t.createdAt,
                    description: t.description, sourceId: t.sourceId,
                    categoryId: t.categoryId, tag: t.tag, mode: t.mode,
                    linkedVehicleId: t.linkedVehicleId, linkedPropertyId: t.linkedPropertyId,
                    odometer: t.odometer,
                  });
                  setTxFormOpen(true);
                }} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer", background: "#f3f4f6", color: "#374151" }}>
                  Edit
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: 24, fontSize: 13 }}>No transactions in this date range.</div>}
        {filtered.length > 200 && <div style={{ textAlign: "center", color: "#6b7280", fontSize: 12, padding: 8 }}>Showing 200 of {filtered.length} — export CSV for full data</div>}
      </div>

      <TransactionForm
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setEditTx(undefined); }}
        initial={editTx}
        onSaved={() => { setTxFormOpen(false); setEditTx(undefined); }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function OverviewSection() {
  const { accounts, reloadAccounts } = useAccounts();
  const { cards, reloadCards } = useCreditCards();
  const { transactions } = useTransactions();

  useAutoReload(reloadAccounts);
  useAutoReload(reloadCards);

  const totalAccounts = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const totalCards = cards.reduce((s, c) => s + c.openingBalance, 0);
  const totalLimit = cards.reduce((s, c) => s + c.limitAmount, 0);
  const net = totalAccounts - totalCards;
  const now = new Date();
  const monthStr = now.toISOString().slice(0, 7);
  const monthTx = transactions.filter((t) => (t.date ?? t.createdAt ?? "").startsWith(monthStr));
  const mIn = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const mOut = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0); // transfers excluded

  const summaryItems = [
    { label: "Accounts Total", value: fmtCAD(totalAccounts), color: "#1a7f3c" },
    { label: "Card Balance", value: fmtCAD(totalCards), color: "#a31515" },
    { label: "Available Credit", value: fmtCAD(totalLimit - totalCards), color: "#1a5fa8" },
    { label: "Net Cash Position", value: fmtCAD(net), color: net >= 0 ? "#1a7f3c" : "#a31515" },
    { label: "Month Income", value: fmtCAD(mIn), color: "#1a7f3c" },
    { label: "Month Expenses", value: fmtCAD(mOut), color: "#a31515" },
    { label: "Month Net", value: fmtCAD(mIn - mOut), color: mIn - mOut >= 0 ? "#1a7f3c" : "#a31515" },
    { label: "Transactions", value: String(transactions.length) },
  ];

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Overview</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {summaryItems.map((item) => (
          <div key={item.label} style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "16px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: item.color ?? "#1a1a1a" }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Account balances quick view */}
      {accounts.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Account Balances</div>
          {accounts.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
              <span>{a.name} <span style={{ fontSize: 11, color: "#9ca3af" }}>({a.type})</span></span>
              <span style={{ fontWeight: 600, color: a.openingBalance >= 0 ? "#1a7f3c" : "#a31515" }}>{fmtCAD(a.openingBalance)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Card balances quick view */}
      {cards.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Card Balances</div>
          {cards.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
              <span>{c.name} <span style={{ fontSize: 11, color: "#9ca3af" }}>({fmtCAD(c.limitAmount)} limit)</span></span>
              <span style={{ fontWeight: 600, color: "#a31515" }}>{fmtCAD(c.openingBalance)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}