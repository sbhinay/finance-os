"use client";

import { TransactionForm } from "./TransactionForm";
import { useState } from "react";
import { FixedPayment, PendingTransaction, PaymentSchedule, RecurringKind, getFixedPaymentKind } from "@/types/domain";
import { Account } from "@/types/account";
import { CreditCard } from "@/types/creditCard";
import { useFixedPayments, calculateBackfillDates } from "./useFixedPayments";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useCategories } from "@/modules/categories/useCategories";
import { fmtCAD, fmtDate, getNextOccurrence, toFixed2 } from "@/utils/finance";
import { SUB_TYPE_OPTIONS, type TransactionSubType, type TransactionType } from "@/types/transaction";
type TransactionFormInitial = React.ComponentProps<typeof TransactionForm>["initial"];

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
  variant?: "primary" | "secondary" | "danger" | "green" | "amber"; small?: boolean; style?: React.CSSProperties;
}) {
  const c = {
    primary: { bg: "#1a5fa8", color: "#fff" },
    secondary: { bg: "#f3f4f6", color: "#374151" },
    danger: { bg: "#fef2f2", color: "#a31515" },
    green: { bg: "#1a7f3c", color: "#fff" },
    amber: { bg: "#fef3c7", color: "#a05c00" },
  }[variant];
  return <button onClick={onClick} style={{ padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", background: c.bg, color: c.color, ...style }}>{children}</button>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e4e8", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
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

type FixedPaymentsSectionProps = {
  title?: string;
  introText?: string;
};

const SCHEDULES: PaymentSchedule[] = ["Monthly", "Bi-weekly", "Weekly", "Semi-monthly", "Annual", "One-time"];
const RECURRING_KINDS: Array<{ value: RecurringKind; label: string }> = [
  { value: "general", label: "General Recurring" },
  { value: "subscription", label: "Subscription" },
  { value: "utility", label: "Utility" },
  { value: "insurance", label: "Insurance" },
  { value: "property_tax", label: "Property Tax" },
  { value: "planned_payment", label: "Planned Payment" },
  { value: "account_fee", label: "Account Fee" },
  { value: "card_fee", label: "Card Fee" },
];

const KIND_LABELS: Record<RecurringKind, string> = {
  general: "General",
  subscription: "Subscription",
  utility: "Utility",
  insurance: "Insurance",
  property_tax: "Property Tax",
  planned_payment: "Planned Payment",
  account_fee: "Account Fee",
  card_fee: "Card Fee",
};

const KIND_PLACEHOLDERS: Record<RecurringKind, string> = {
  general: "e.g. Rogers Internet",
  subscription: "e.g. YouTube Premium",
  utility: "e.g. Hydro",
  insurance: "e.g. Life Insurance",
  property_tax: "e.g. Primary Property Tax",
  planned_payment: "e.g. Monthly Family Support",
  account_fee: "e.g. Account Fees - Scotia Personal",
  card_fee: "e.g. Annual Fee - Avion",
};

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING BANNER
// ═══════════════════════════════════════════════════════════════════════════════

export function PendingBanner({
  pending, accounts, cards, hooks,
}: {
  pending: PendingTransaction[];
  accounts: Account[];
  cards: CreditCard[];
  hooks: ReturnType<typeof useFixedPayments>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    amount: number; account: string; tag: "Personal" | "Business"; mode: string;
  }>({ amount: 0, account: "", tag: "Personal", mode: "Debit" });

  if (!pending.length) return null;

  const typeIcon: Record<string, string> = {
    fixed: "📅", vehicle: "🚗", loan: "🏠",
    cra_payroll: "💼", cra_corp: "🏛", cra_hst: "📊", propertytax: "🏡",
  };

  const isCRA = (p: PendingTransaction) =>
    ["cra_payroll", "cra_corp", "cra_hst"].includes(p.sourceType);

  const acctOpts = [
    { value: "", label: "— Select account —" },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.type})` })),
    ...cards.map((c) => ({ value: c.id, label: `${c.name} (CC)` })),
  ];

  // Resolve account/card ID to name
  const resolveAccount = (id: string) =>
    [...accounts, ...cards].find((x) => x.id === id)?.name ?? (id || "No account");

  return (
    <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #fde68a", background: "#fef3c7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>⏳</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>
            {pending.length} Pending {pending.length === 1 ? "Transaction" : "Transactions"} — Confirm or Dismiss
          </span>
        </div>
        <Btn variant="secondary" small onClick={hooks.dismissAllPending}
          style={{ fontSize: 11, color: "#92400e", borderColor: "#f59e0b" }}>
          Dismiss All
        </Btn>
      </div>

      {pending.map((p) => (
        <div key={p.id} style={{ padding: "10px 14px", borderBottom: "1px solid #fde68a" }}>
          {editingId === p.id ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 8 }}>
                {typeIcon[p.sourceType] ?? "📋"} Editing: {p.name} — {fmtDate(p.dueDate)}
              </div>
              <Grid2>
                <Inp label="Amount ($)" type="number" value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
                <Sel label="Account" value={editForm.account}
                  onChange={(e) => setEditForm((f) => ({ ...f, account: e.target.value }))}
                  options={acctOpts} />
              </Grid2>
              <Grid2>
                <Sel label="Tag" value={editForm.tag}
                  onChange={(e) => setEditForm((f) => ({ ...f, tag: e.target.value as "Personal" | "Business" }))}
                  options={["Personal", "Business"]} />
                <Sel label="Mode" value={editForm.mode}
                  onChange={(e) => setEditForm((f) => ({ ...f, mode: e.target.value }))}
                  options={["Cash", "Debit", "Credit Card", "Bank Transfer", "E-Transfer"]} />
              </Grid2>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn onClick={() => {
                  hooks.confirmPending({ ...p, ...editForm, amount: toFixed2(editForm.amount) });
                  setEditingId(null);
                }}>✓ Confirm</Btn>
                <Btn variant="secondary" onClick={() => setEditingId(null)}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1c1c1e" }}>
                  {typeIcon[p.sourceType] ?? "📋"} {p.name}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  {fmtDate(p.dueDate)}
                  {p.account ? ` · ${resolveAccount(p.account)}` : isCRA(p) ? " · Select account to confirm" : ""}
                </div>
                {isCRA(p) && (
                  <div style={{ fontSize: 11, color: "#4a3ab5", marginTop: 2 }}>
                    ℹ Confirm via Tax Obligations page for full tracking
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, color: "#a31515", fontSize: 14 }}>{fmtCAD(p.amount)}</span>
                {!isCRA(p) && (
                  <>
                    <Btn small onClick={() => {
                      setEditingId(p.id);
                      setEditForm({ amount: p.amount, account: p.account ?? "", tag: p.tag ?? "Personal", mode: p.mode ?? "Debit" });
                    }}>Edit</Btn>
                    <Btn variant="green" small onClick={() => {
                      if (!p.account) {
                        setEditingId(p.id);
                        setEditForm({ amount: p.amount, account: "", tag: p.tag ?? "Personal", mode: p.mode ?? "Debit" });
                        return;
                      }
                      hooks.confirmPending(p);
                    }}>✓ Confirm</Btn>
                  </>
                )}
                <Btn variant="danger" small onClick={() => hooks.dismissPending(p.key)}>✕</Btn>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECURRING PAYMENTS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function FixedPaymentsSection({
  title = "Recurring Payments",
  introText = "Shared recurring engine for subscriptions, utilities, insurance, planned payments, and legacy recurring items that do not yet live under a stronger parent record.",
}: FixedPaymentsSectionProps = {}) {
  // Internal hooks — no props needed
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { categories } = useCategories();
  const hooks = useFixedPayments();
  const { fixedPayments, pending } = hooks;
  const subscriptionCategoryId = categories.find((c) => c.name.toLowerCase() === "subscriptions")?.id ?? "";
  const accountFeesCategoryId = categories.find((c) => c.name.toLowerCase() === "account fees")?.id ?? "";
  const plannedTransferSubTypes = (SUB_TYPE_OPTIONS.transfer ?? []).filter((option) =>
    ["tfsa_contribution", "rrsp_contribution", "bank_to_bank", "e_transfer"].includes(option.value)
  );
  const emptyForm = {
    id: "" as string | undefined,
    name: "", amount: 0 as number,
    kind: "general" as RecurringKind,
    ownerType: undefined as FixedPayment["ownerType"] | undefined,
    ownerId: undefined as string | undefined,
    schedule: "Monthly" as PaymentSchedule,
    date: new Date().toISOString().split("T")[0],
    startDate: new Date().toISOString().split("T")[0], // for backfill
    endDate: "", source: "",
    destinationId: "",
    transactionType: "expense" as "expense" | "transfer",
    subType: "" as TransactionSubType | "",
    categoryId: "", mode: "Debit" as string,
    tag: "Personal" as "Personal" | "Business",
  };

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<TransactionFormInitial>(undefined);
  const [txScheduledAmount, setTxScheduledAmount] = useState<number | undefined>();
  const [kindFilter, setKindFilter] = useState<RecurringKind | "all">("all");

  // Backfill state
  const [backfillModal, setBackfillModal] = useState<{ fp: FixedPayment; dates: string[] } | null>(null);
  const [backfillAccountId, setBackfillAccountId] = useState("");
  const [backfillDone, setBackfillDone] = useState<number | null>(null);
  const lockedCategoryId =
    form.kind === "subscription"
      ? subscriptionCategoryId
      : (form.kind === "account_fee" || form.kind === "card_fee")
        ? accountFeesCategoryId
        : "";
  const isCategoryLocked = !!lockedCategoryId;
  const isPlannedPayment = form.kind === "planned_payment";
  const isTransferPlannedPayment = isPlannedPayment && form.transactionType === "transfer";

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const acctOpts = [
    { value: "", label: "— No account —" },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.type})` })),
    ...cards.map((c) => ({ value: c.id, label: `${c.name} (CC)` })),
  ];

  function save() {
    if (!form.name) return;
    if (form.transactionType === "transfer" && !form.destinationId) return;
    if (form.transactionType === "transfer" && !form.subType) return;
    const inferredCategoryId =
      lockedCategoryId ||
      (form.transactionType === "expense" ? form.categoryId : "") ||
      ((form.kind === "account_fee" || form.kind === "card_fee")
        ? accountFeesCategoryId
        : "");

    const fp: FixedPayment = {
      id: form.id || "",
      name: form.name,
      kind: form.kind,
      ownerType: form.ownerType,
      ownerId: form.ownerId,
      amount: toFixed2(Number(form.amount)),
      schedule: form.schedule,
      date: form.date,
      endDate: form.endDate || undefined,
      source: form.source,
      destinationId: form.transactionType === "transfer" ? form.destinationId || undefined : undefined,
      transactionType: form.kind === "planned_payment" ? form.transactionType : undefined,
      subType: form.transactionType === "transfer" ? (form.subType || undefined) : undefined,
      categoryId: form.transactionType === "expense" ? (inferredCategoryId || undefined) : undefined,
      mode: form.mode || "Debit",
      tag: form.tag || "Personal",
    };
    if (form.id) {
      hooks.updateFixedPayment(fp);
    } else {
      hooks.addFixedPayment({
        name: fp.name,
        kind: fp.kind,
        ownerType: fp.ownerType,
        ownerId: fp.ownerId,
        amount: fp.amount,
        schedule: fp.schedule,
        date: fp.date,
        endDate: fp.endDate,
        source: fp.source,
        destinationId: fp.destinationId,
        transactionType: fp.transactionType,
        subType: fp.subType,
        categoryId: fp.categoryId,
        mode: fp.mode,
        tag: fp.tag,
      });
    }
    setShowForm(false);
    setForm(emptyForm);
  }

  function openLog(fp: FixedPayment) {
    const next = getNextOccurrence(fp.date, fp.schedule);
    const postingType: TransactionType = fp.transactionType ?? "expense";
    setTxFormInitial({
      type: postingType,
      subType: postingType === "transfer" ? fp.subType : undefined,
      amount: fp.amount,
      date: next ?? new Date().toISOString().split("T")[0],
      sourceId: fp.source ?? "",
      destinationId: postingType === "transfer" ? (fp.destinationId ?? "") : "",
      categoryId: postingType === "expense" ? (fp.categoryId ?? "") : "",
      mode: fp.mode ?? "Debit",
      tag: (form.tag as "Personal" | "Business") ?? "Personal",
      description: fp.name,
    });
    setTxScheduledAmount(fp.amount);
    setTxFormOpen(true);
  }

  function openBackfill(fp: FixedPayment) {
    // Calculate all dates from start to today
    const startDate = fp.date; // use anchor date as start
    const dates = calculateBackfillDates(startDate, fp.schedule, fp.endDate);
    // Only show past dates (up to yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastDates = dates.filter((d) => d <= yesterday.toISOString().split("T")[0]);
    if (pastDates.length === 0) {
      alert("No historical payments to backfill — all dates are in the future.");
      return;
    }
    setBackfillAccountId(fp.source ?? "");
    setBackfillModal({ fp, dates: pastDates });
    setBackfillDone(null);
  }

  const totalMonthly = fixedPayments
    .filter((p) => !p.endDate || new Date(p.endDate + "T12:00:00") >= new Date())
    .reduce((s, p) => {
      const m: Partial<Record<PaymentSchedule, number>> = { Weekly: 52 / 12, "Bi-weekly": 26 / 12, "Semi-monthly": 2, Monthly: 1, Annual: 1 / 12 };
      return s + p.amount * (m[p.schedule] ?? 1);
    }, 0);

  const activeKindFilter = kindFilter;
  const visiblePayments = fixedPayments.filter((p) => activeKindFilter === "all" ? true : getFixedPaymentKind(p) === activeKindFilter);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{title}</div>

      {pending.length > 0 && (
        <PendingBanner pending={pending} accounts={accounts} cards={cards} hooks={hooks} />
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Monthly Commitments</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#a31515" }}>{fmtCAD(toFixed2(totalMonthly))}</div>
        </div>
        <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Active Payments</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {fixedPayments.filter((p) => !p.endDate || new Date(p.endDate + "T12:00:00") >= new Date()).length}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12, background: "#f0f9ff", padding: "8px 12px", borderRadius: 8, border: "1px solid #bae6fd" }}>
        💡 {introText}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn small variant={kindFilter === "all" ? "primary" : "secondary"} onClick={() => setKindFilter("all")}>All</Btn>
          {RECURRING_KINDS.map((kind) => (
            <Btn
              key={kind.value}
              small
              variant={kindFilter === kind.value ? "primary" : "secondary"}
              onClick={() => setKindFilter(kind.value)}
            >
              {kind.label}
            </Btn>
          ))}
        </div>
        <Btn small onClick={() => { setForm({ ...emptyForm }); setShowForm(true); }}>+ Add Recurring Item</Btn>
      </div>

      {visiblePayments.map((p) => {
        const isEnded = !!p.endDate && new Date(p.endDate + "T12:00:00") < new Date();
        const next = getNextOccurrence(p.date, p.schedule);
        const nextLabel = p.schedule === "One-time" ? fmtDate(p.date) : (next ? fmtDate(next) : "—");
        const linkedAcct = accounts.find((a) => a.id === p.source);
        const recurringKind = getFixedPaymentKind(p);

        return (
          <div key={p.id} style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "12px 14px", marginBottom: 8, opacity: isEnded ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: "#f3f4f6", color: "#4b5563" }}>
                    {KIND_LABELS[recurringKind]}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {p.schedule} · Next: {nextLabel}
                  {p.endDate ? ` · Ends: ${fmtDate(p.endDate)}` : ""}
                  {linkedAcct ? ` · From: ${linkedAcct.name}` : ""}
                </div>
                {isEnded && <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: "#f3f4f6", color: "#6b7280" }}>Ended</span>}
                {!isEnded && linkedAcct && (
                  <div style={{ fontSize: 12, color: linkedAcct.openingBalance >= p.amount ? "#1a7f3c" : "#a31515", marginTop: 4 }}>
                    Account balance: {fmtCAD(linkedAcct.openingBalance)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{fmtCAD(p.amount)}</div>
                {!isEnded && (
                  <Btn variant="secondary" small onClick={() => openLog(p)} style={{ fontSize: 11, color: "#1a7f3c" }}>+ Log</Btn>
                )}
                <Btn variant="amber" small onClick={() => openBackfill(p)} style={{ fontSize: 11 }}>⟳ Backfill</Btn>
                <Btn variant="secondary" small onClick={() => {
                  setForm({ ...emptyForm, ...p, id: p.id, startDate: p.date, endDate: p.endDate ?? "", tag: (p.tag ?? "Personal") as "Personal" | "Business", categoryId: lockedCategoryId || p.categoryId || "" });
                  setShowForm(true);
                }}>Edit</Btn>
                <Btn variant="danger" small onClick={() => { if (confirm(`Delete "${p.name}"?`)) hooks.deleteFixedPayment(p.id); }}>✕</Btn>
              </div>
            </div>
          </div>
        );
      })}

      {visiblePayments.length === 0 && (
        <div style={{ textAlign: "center", color: "#6b7280", padding: 24 }}>
          {activeKindFilter === "all" ? "No recurring items yet." : `No ${KIND_LABELS[activeKindFilter]} items yet.`}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <Modal title={form.id ? "Edit Recurring Item" : "Add Recurring Item"} onClose={() => setShowForm(false)}>
          <Sel label="Recurring Type" value={form.kind} onChange={f("kind")} options={RECURRING_KINDS} />
          {isPlannedPayment && (
            <Sel
              label="Posting Type"
              value={form.transactionType}
              onChange={(e) => setForm((p) => ({
                ...p,
                transactionType: e.target.value as "expense" | "transfer",
                categoryId: e.target.value === "expense" ? p.categoryId : "",
                destinationId: e.target.value === "transfer" ? p.destinationId : "",
                subType: e.target.value === "transfer" ? p.subType : "",
              }))}
              options={[
                { value: "expense", label: "Expense" },
                { value: "transfer", label: "Transfer" },
              ]}
            />
          )}
          <Inp label="Description" value={form.name} onChange={f("name")} placeholder={KIND_PLACEHOLDERS[form.kind]} />
          <Inp label="Amount ($)" type="number" value={form.amount} onChange={f("amount")} />
          <Sel label="Schedule" value={form.schedule} onChange={f("schedule")} options={SCHEDULES.map((s) => ({ value: s, label: s }))} />
          <Grid2>
            <Inp label="Next Payment Date" type="date" value={form.date} onChange={f("date")} />
            <Inp label="End Date (optional)" type="date" value={form.endDate ?? ""} onChange={f("endDate")} />
          </Grid2>
          <Sel label="Pay From" value={form.source} onChange={f("source")} options={acctOpts} />
          {isTransferPlannedPayment && (
            <Grid2>
              <Sel label="Transfer Sub-type" value={form.subType} onChange={f("subType")} options={[{ value: "", label: "— Select transfer type —" }, ...plannedTransferSubTypes]} />
              <Sel label="Destination Account / Card" value={form.destinationId} onChange={f("destinationId")} options={acctOpts} />
            </Grid2>
          )}
          <Grid2>
            <div>
              <Label>Category</Label>
              {isTransferPlannedPayment ? (
                <div style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#f9fafb", fontSize: 13, color: "#6b7280" }}>
                  Not used for transfer-based planned payments
                </div>
              ) : (
                <select
                  value={lockedCategoryId || form.categoryId}
                  disabled={isCategoryLocked}
                  onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${(lockedCategoryId || form.categoryId) ? "#1a7f3c" : "#e2e4e8"}`, borderRadius: 8, background: isCategoryLocked ? "#f9fafb" : "#fff", fontSize: 13, color: isCategoryLocked ? "#374151" : "#111827" }}>
                  {!isCategoryLocked && <option value="">— Select category —</option>}
                  {categories.filter((c) => c.type === "expense" || c.type === "both").map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <Sel label="Payment Mode" value={form.mode} onChange={f("mode")}
              options={["Cash", "Debit", "Credit Card", "Bank Transfer", "E-Transfer"]} />
          </Grid2>
          <Sel label="Tag" value={form.tag} onChange={f("tag")} options={["Personal", "Business"]} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn onClick={save}>Save</Btn>
          </div>
        </Modal>
      )}

      {/* Backfill modal */}
      {backfillModal && (
        <Modal title={`Backfill — ${backfillModal.fp.name}`} onClose={() => setBackfillModal(null)}>
          {backfillDone !== null ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{backfillDone} transaction{backfillDone !== 1 ? "s" : ""} logged</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Historical payments have been added to your transaction log.</div>
              <div style={{ marginTop: 16 }}>
                <Btn onClick={() => setBackfillModal(null)}>Done</Btn>
              </div>
            </div>
          ) : (
            <>
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1a5fa8" }}>
                Found <strong>{backfillModal.dates.length} historical payments</strong> from {fmtDate(backfillModal.dates[0])} to {fmtDate(backfillModal.dates[backfillModal.dates.length - 1])}.
                These will be logged as transactions in your history.
              </div>

              {/* Preview list */}
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e2e4e8", borderRadius: 8 }}>
                {backfillModal.dates.map((d) => (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
                    <span>{fmtDate(d)}</span>
                    <span style={{ fontWeight: 600, color: "#a31515" }}>{fmtCAD(backfillModal.fp.amount)}</span>
                  </div>
                ))}
              </div>

              <div>
                <Label>Pay From Account</Label>
                <select value={backfillAccountId} onChange={(e) => setBackfillAccountId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${backfillAccountId ? "#1a7f3c" : "#e2e4e8"}`, borderRadius: 8, background: "#fff", fontSize: 13 }}>
                  <option value="">— Select account —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({fmtCAD(a.openingBalance)})</option>)}
                  {cards.map((c) => <option key={c.id} value={c.id}>{c.name} (CC)</option>)}
                </select>
              </div>

              <div style={{ fontSize: 12, color: "#6b7280" }}>
                ⚠ Existing transactions with the same description and date will be skipped automatically.
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn variant="secondary" onClick={() => setBackfillModal(null)}>Cancel</Btn>
                <Btn onClick={() => {
                  if (!backfillAccountId) { alert("Please select an account."); return; }
                  const count = hooks.backfillPayments(backfillModal.fp, backfillModal.dates, backfillAccountId);
                  setBackfillDone(count);
                }}>Log {backfillModal.dates.length} Payments</Btn>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Log payment via TransactionForm */}
      <TransactionForm
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setTxFormInitial(undefined); setTxScheduledAmount(undefined); }}
        initial={txFormInitial}
        scheduledAmount={txScheduledAmount}
        title="Log Fixed Payment"
        onSaved={() => { setTxFormOpen(false); setTxFormInitial(undefined); setTxScheduledAmount(undefined); }}
      />
    </div>
  );
}
