"use client";

import { useState, useMemo } from "react";
import { TransactionForm } from "./TransactionForm";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { useCategories } from "@/modules/categories/useCategories";
import { useVehicles } from "./useAssets";
import { useHouseLoans } from "./useAssets";
import { useFixedPayments } from "./useFixedPayments";
import { PendingBanner } from "./FixedPaymentsSection";
import { detectCategory, learnedRulesRepository, uncategorizedRepository } from "@/rules/categoryRules";
import { fmtCAD, fmtDate, toFixed2, uid, buildSourceOptions } from "@/utils/finance";
import { Transaction } from "@/types/transaction";
import { Account } from "@/types/account";
import { CreditCard } from "@/types/creditCard";
import { transactionRepository } from "@/repositories/transactionRepository";
import { notifyDataChanged } from "@/utils/events";
import { syncBalances } from "@/utils/syncBalances";

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
  variant?: "primary" | "secondary" | "danger" | "ghost"; small?: boolean; style?: React.CSSProperties;
}) {
  const c = {
    primary: { bg: "#1a5fa8", color: "#fff" },
    secondary: { bg: "#f3f4f6", color: "#374151" },
    danger: { bg: "#fef2f2", color: "#a31515" },
    ghost: { bg: "transparent", color: "#1a5fa8" },
  }[variant];
  return <button onClick={onClick} style={{ padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", background: c.bg, color: c.color, ...style }}>{children}</button>;
}
function Grid2({ children }: { children: React.ReactNode }) { return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>; }
function Grid3({ children }: { children: React.ReactNode }) { return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>{children}</div>; }
function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 110, padding: "12px 14px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: color ?? "#1a1a1a" }}>{value}</div>
    </div>
  );
}
function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  const m: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#dcfce7", fg: "#1a7f3c" }, red: { bg: "#fee2e2", fg: "#a31515" },
    blue: { bg: "#dbeafe", fg: "#1a5fa8" }, orange: { bg: "#ffedd5", fg: "#c2410c" },
    purple: { bg: "#ede9fe", fg: "#4a3ab5" }, gray: { bg: "#f3f4f6", fg: "#6b7280" },
  };
  const c = m[color] ?? m.gray;
  return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>{children}</span>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e4e8", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════════
// DAILY LOG SECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function DailyLogSection() {
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { transactions } = useTransactions();
  const { categories } = useCategories();
  const { vehicles } = useVehicles();
  const { houseLoans } = useHouseLoans();
  const fixedHooks = useFixedPayments();

  const now = new Date();
  const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  const todayStr = now.toISOString().split("T")[0];

  const emptyForm = {
    id: undefined as string | undefined,
    amount: "" as string | number,
    date: localISO,
    type: "expense" as "income" | "expense",
    mode: "Debit" as Transaction["mode"],
    sourceId: "",
    description: "",
    categoryId: "",
    tag: "Personal" as "Personal" | "Business",
    linkedVehicleId: "",
    linkedPropertyId: "",
    odometer: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<unknown>(undefined);
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [search, setSearch] = useState("");
  const [viewDate, setViewDate] = useState(todayStr);
  const [showAll, setShowAll] = useState(false);
  const [addToFixed, setAddToFixed] = useState<Transaction | null>(null);

  const autoDetectedCat = useMemo(() => {
    if (!form.description) return undefined;
    return detectCategory(form.description.toLowerCase().trim());
  }, [form.description]);

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  // Category lists
  const activeCats = categories.filter((c) => !c.archived);
  const currentCatList = activeCats.filter((c) =>
    form.type === "expense" ? c.type === "expense" || c.type === "both"
      : c.type === "income" || c.type === "both"
  );
  const selectedCat = activeCats.find((c) => c.id === form.categoryId);
  const isVehicleCat = selectedCat?.vehicleLinked;
  const isPropertyCat = selectedCat?.propertyLinked;

  // Payment sources
  const paymentSources = buildSourceOptions(accounts, cards);

  function save() {
    if (!form.amount || Number(form.amount) <= 0) return;
    if (!form.sourceId) {
      alert("Please select an account or card.");
      return;
    }
    const amount = toFixed2(Number(form.amount));
    const desc = form.description.toLowerCase().trim();

    const categoryId = form.categoryId || autoDetectedCat;

    // Learn category rule if user explicitly chose one
    if (categoryId && form.description) {
      learnedRulesRepository.add({ id: uid(), description: desc, categoryId });
      uncategorizedRepository.remove(desc);
    } else if (!categoryId && form.description) {
      uncategorizedRepository.add(desc);
    }

    const txn: Transaction = {
      id: form.id ?? uid(),
      type: form.type,
      amount,
      description: form.description,
      sourceId: form.sourceId,
      // Store local datetime as-is without UTC conversion
      createdAt: typeof form.date === "string" && form.date.length >= 16
        ? form.date.slice(0, 16) + ":00"
        : new Date().toISOString(),
      // @ts-expect-error Transaction type may not include currency in some contexts
      currency: "CAD",
      status: "cleared" as const,
      date: form.date.slice(0, 10),
      categoryId: categoryId || undefined,
      tag: form.tag,
      mode: form.mode,
      linkedVehicleId: form.linkedVehicleId || undefined,
      linkedPropertyId: form.linkedPropertyId || undefined,
      odometer: form.odometer || undefined,
    };

    if (editId) {
      transactionRepository.saveAll(
        transactionRepository.getAll().map((t) => t.id === editId ? txn : t)
      );
    } else {
      transactionRepository.add(txn);
    }

    syncBalances();
    notifyDataChanged("transactions");
    setForm(emptyForm);
    setEditId(null);
  }

  function startEdit(t: Transaction) {
    console.log('startEdit createdAt:', t.createdAt, 'date:', t.date);

    // Use universal TransactionForm for editing
    setTxFormInitial({
      id: t.id,
      amount: t.amount,
      date: t.date ?? t.createdAt?.slice(0, 10),
      createdAt: t.createdAt,
      type: t.type,
      mode: t.mode ?? "Debit",
      sourceId: t.sourceId ?? "",
      description: t.description ?? "",
      categoryId: t.categoryId ?? "",
      tag: t.tag ?? "Personal",
      linkedVehicleId: t.linkedVehicleId ?? "",
      linkedPropertyId: t.linkedPropertyId ?? "",
      odometer: t.odometer ?? "",
    });
    setTxFormOpen(true);
  }

  function del(t: Transaction) {
    if (!confirm("Delete this entry?")) return;
    transactionRepository.saveAll(transactionRepository.getAll().filter((x) => x.id !== t.id));
    syncBalances();
    notifyDataChanged("transactions");
  }

  // Stats
  const monthStr = now.toISOString().slice(0, 7);
  const todayTx = transactions.filter((t) => (t.date ?? t.createdAt ?? "").startsWith(todayStr));
  const monthTx = transactions.filter((t) => (t.date ?? t.createdAt ?? "").startsWith(monthStr));
  const tIn = todayTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const tOut = todayTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0); // transfers excluded
  const mIn = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const mOut = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0); // transfers excluded

  // Filtered list
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const dateStr = (t.date ?? t.createdAt ?? "").slice(0, 10);
      if (!showAll && !search && dateStr !== viewDate) return false;
      if (filter !== "all" && t.type !== filter) return false;
      if (search) {
        const hay = `${t.description}${t.sourceId}${t.categoryId ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => {
      const da = a.createdAt ?? a.date ?? "";
      const db = b.createdAt ?? b.date ?? "";
      return db > da ? 1 : -1;
    });
  }, [transactions, showAll, search, viewDate, filter]);

  const acctName = (id: string) => {
  if (!id) return "—";
  const found = [...accounts, ...cards].find((x) => x.id === id);
  return found ? found.name : "Unknown Account";
};

  const catName = (id?: string) =>
    categories.find((c) => c.id === id)?.name ?? "";

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Daily Log</div>

      {/* Pending banner */}
      {fixedHooks.pending.length > 0 && (
        <PendingBanner
          pending={fixedHooks.pending}
          accounts={accounts}
          cards={cards}
          hooks={fixedHooks}
        />
      )}

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="Today In" value={fmtCAD(tIn)} color="#1a7f3c" />
        <StatBox label="Today Out" value={fmtCAD(tOut)} color="#a31515" />
        <StatBox label="Month In" value={fmtCAD(mIn)} color="#1a7f3c" />
        <StatBox label="Month Out" value={fmtCAD(mOut)} color="#a31515" />
      </div>

      {/* Entry form */}
      <div style={{
        background: "#fff", border: `2px solid ${editId ? "#a05c00" : "#1a5fa8"}`,
        borderRadius: 12, padding: "16px 18px", marginBottom: 16,
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: editId ? "#a05c00" : "#1a5fa8", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{editId ? "✏ Edit Entry" : "New Entry"}</span>
        </div>

        <Grid2>
          <Inp label="Amount ($) *" type="number" value={form.amount} onChange={f("amount")} placeholder="0.00" />
          <Inp label="Date & Time" type="datetime-local" value={form.date} onChange={f("date")} />
        </Grid2>
        <Grid3>
          <Sel label="Type *" value={form.type} onChange={f("type")}
            options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} />
          <Sel label="Payment Mode" value={form.mode ?? ""} onChange={f("mode")}
            options={["Cash", "Debit", "Credit Card", "Bank Transfer", "E-Transfer"]} />
          <Sel label="Tag" value={form.tag} onChange={f("tag")} options={["Personal", "Business"]} />
        </Grid3>

        {/* Description with auto-detect indicator */}
        <div>
          <Label>Note / Description</Label>
          <div style={{ position: "relative" }}>
            <input
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value, categoryId: p.categoryId }))}
              placeholder="Optional description — category auto-detected as you type"
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          {autoDetectedCat && (
            <div style={{ fontSize: 11, color: "#1a5fa8", marginTop: 3 }}>
              🔍 Auto-detected: {catName(autoDetectedCat) || autoDetectedCat}
            </div>
          )}
        </div>

        <Grid2>
          <div>
            <Label>Category</Label>
            <select value={form.categoryId} onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${form.categoryId ? "#1a7f3c" : "#e2e4e8"}`, borderRadius: 8, background: "#fff", fontSize: 13 }}>
              <option value="">— Select category —</option>
              {currentCatList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <Sel label="Account / Card" value={form.sourceId} onChange={f("sourceId")} options={paymentSources} />
        </Grid2>

        {isVehicleCat && (
          <Grid2>
            <Sel label="Vehicle (optional)" value={form.linkedVehicleId}
              onChange={f("linkedVehicleId")}
              options={[{ value: "", label: "— Select vehicle —" }, ...vehicles.map((v) => ({ value: v.id, label: v.name }))]} />
            <Inp label="Odometer (km) — optional" type="number" value={form.odometer}
              onChange={f("odometer")} placeholder="e.g. 42500" />
          </Grid2>
        )}
        {isPropertyCat && (
          <Sel label="Property (optional)" value={form.linkedPropertyId}
            onChange={f("linkedPropertyId")}
            options={[{ value: "", label: "— Select property —" }, ...houseLoans.map((h) => ({ value: h.id, label: h.name }))]} />
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Btn onClick={save}>{editId ? "Update Entry" : "Add Entry"}</Btn>
          {editId && <Btn variant="secondary" onClick={() => { setForm(emptyForm); setEditId(null); }}>Cancel Edit</Btn>}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Viewing:</div>
        <input type="date" value={viewDate}
          onChange={(e) => { setViewDate(e.target.value); setShowAll(false); }}
          style={{ padding: "5px 8px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 12, background: "#fff" }} />
        <Btn variant={showAll ? "primary" : "secondary"} small onClick={() => setShowAll((p) => !p)}>
          {showAll ? "Showing All" : "Show All"}
        </Btn>
        <Btn variant="secondary" small onClick={() => { setViewDate(todayStr); setShowAll(false); }}>Today</Btn>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {(["all", "income", "expense"] as const).map((v) => (
          <Btn key={v} variant={filter === v ? "primary" : "secondary"} small onClick={() => setFilter(v)}>
            {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
          </Btn>
        ))}
        <input value={search}
          onChange={(e) => { setSearch(e.target.value); if (e.target.value) setShowAll(true); }}
          placeholder="Search…"
          style={{ padding: "5px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 12, flex: 1, minWidth: 120 }} />
      </div>

      {/* Transaction list */}
      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, overflow: "hidden" }}>
        {filtered.slice(0, 60).map((t) => {
          const veh = t.linkedVehicleId ? vehicles.find((v) => v.id === t.linkedVehicleId) : null;
          const prop = t.linkedPropertyId ? houseLoans.find((h) => h.id === t.linkedPropertyId) : null;
          const dateStr = (t.date ?? t.createdAt ?? "").slice(0, 10);

          return (
            <div key={t.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              padding: "10px 14px", borderBottom: "1px solid #f3f4f6",
              background: editId === t.id ? "#fffbeb" : "transparent",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {t.description || catName(t.categoryId) || "—"}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{fmtDate(dateStr)}</span>
                  {t.mode && <span>· {t.mode}</span>}
                  {t.sourceId && <span>· {acctName(t.sourceId)}</span>}
                  {catName(t.categoryId) && <span>· {catName(t.categoryId)}</span>}
                  {t.tag === "Business" && <Pill color="blue">Biz</Pill>}
                  {veh && <Pill color="orange">{veh.name}</Pill>}
                  {prop && <Pill color="purple">{prop.name}</Pill>}
                  {t.odometer && <span>· {Number(t.odometer).toLocaleString()} km</span>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                <Pill color={t.type === "income" ? "green" : t.type === "transfer" ? "gray" : "red"}>
                  {t.type === "income" ? "+" : t.type === "transfer" ? "⇄" : "-"}{fmtCAD(t.amount)}
                </Pill>
                <Btn variant="ghost" small onClick={() => setAddToFixed(t)} style={{ fontSize: 11 }}>+ Fixed</Btn>
                <Btn variant="secondary" small onClick={() => startEdit(t)}>Edit</Btn>
                <Btn variant="danger" small onClick={() => del(t)}>✕</Btn>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#6b7280", padding: 24, fontSize: 13 }}>
            {showAll || search ? "No entries found." : "No entries for this date. Use date picker or Show All."}
          </div>
        )}
        {filtered.length > 60 && (
          <div style={{ textAlign: "center", color: "#6b7280", fontSize: 12, padding: 8 }}>
            Showing 60 of {filtered.length} entries
          </div>
        )}
      </div>

      {/* Add to Fixed Payments quick modal */}
      {/* Universal TransactionForm for edit */}
      <TransactionForm
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setTxFormInitial(undefined); }}
        initial={txFormInitial}
        onSaved={() => { setTxFormOpen(false); setTxFormInitial(undefined); }}
      />

      {addToFixed && (
        <Modal title="Add to Fixed Payments" onClose={() => setAddToFixed(null)}>
          <div style={{ background: "#f0f9ff", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
            Creating a recurring entry based on: <strong>{addToFixed.description || catName(addToFixed.categoryId)}</strong> — {fmtCAD(addToFixed.amount)}
          </div>
          <QuickAddFixed
            txn={addToFixed}
            accounts={accounts}
            cards={cards}
            onSave={(fp) => {
              fixedHooks.addFixedPayment(fp);
              setAddToFixed(null);
            }}
            onClose={() => setAddToFixed(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Quick Add Fixed Payment from transaction ─────────────────────────────────

function QuickAddFixed({
  txn, accounts, cards, onSave, onClose,
}: {
  txn: Transaction;
  accounts: Account[];
  cards: CreditCard[];
  onSave: (fp: unknown) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: txn.description || "",
    amount: txn.amount,
    schedule: "Monthly" as const,
    date: new Date().toISOString().split("T")[0],
    endDate: "",
    source: txn.sourceId ?? "",
  });
  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const acctOpts = [
    { value: "", label: "— No account —" },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
    ...cards.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Label>Description</Label>
        <input value={form.name} onChange={f("name")}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
      </div>
      <Grid2>
        <div>
          <Label>Amount ($)</Label>
          <input type="number" value={form.amount} onChange={f("amount")}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
        </div>
        <div>
          <Label>Schedule</Label>
          <select value={form.schedule} onChange={f("schedule")}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13 }}>
            {["Monthly", "Bi-weekly", "Weekly", "Annual", "One-time"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </Grid2>
      <Grid2>
        <div>
          <Label>Next Payment Date</Label>
          <input type="date" value={form.date} onChange={f("date")}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
        </div>
        <div>
          <Label>End Date (optional)</Label>
          <input type="date" value={form.endDate} onChange={f("endDate")}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
        </div>
      </Grid2>
      <div>
        <Label>Pay From</Label>
        <select value={form.source} onChange={f("source")}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13 }}>
          {acctOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", background: "#f3f4f6", color: "#374151" }}>Cancel</button>
        <button onClick={() => onSave({ ...form, amount: toFixed2(Number(form.amount)), endDate: form.endDate || undefined })}
          style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", background: "#1a5fa8", color: "#fff" }}>
          Add to Fixed Payments
        </button>
      </div>
    </div>
  );
}
