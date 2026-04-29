"use client";

import { useState, useMemo } from "react";
import { TransactionForm } from "./TransactionForm";
import type { FixedPayment } from "@/types/domain";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { useCategories } from "@/modules/categories/useCategories";
import { useVehicles, useHouseLoans } from "./useAssets";
import { useFixedPayments } from "./useFixedPayments";
import { PendingBanner } from "./FixedPaymentsSection";
import { fmtCAD, fmtDate } from "@/utils/finance";
import { Transaction } from "@/types/transaction";
import { Account } from "@/types/account";
import { CreditCard } from "@/types/creditCard";
import { transactionRepository } from "@/repositories/transactionRepository";
import { notifyDataChanged } from "@/utils/events";
import { syncBalances } from "@/utils/syncBalances";

type TransactionFormInitial = React.ComponentProps<typeof TransactionForm>["initial"];

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "#6b7280", display: "block", marginBottom: 4 }}>{children}</label>;
}

function Btn({ children, onClick, variant = "primary", small, style }: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  small?: boolean;
  style?: React.CSSProperties;
}) {
  const colors = {
    primary: { bg: "#1a5fa8", color: "#fff" },
    secondary: { bg: "#f3f4f6", color: "#374151" },
    danger: { bg: "#fef2f2", color: "#a31515" },
    ghost: { bg: "transparent", color: "#1a5fa8" },
  }[variant];

  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? "4px 10px" : "8px 16px",
        fontSize: small ? 12 : 13,
        fontWeight: 600,
        borderRadius: 8,
        border: "1px solid transparent",
        cursor: "pointer",
        background: colors.bg,
        color: colors.color,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 110, padding: "12px 14px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: color ?? "#1a1a1a" }}>{value}</div>
    </div>
  );
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#dcfce7", fg: "#1a7f3c" },
    red: { bg: "#fee2e2", fg: "#a31515" },
    blue: { bg: "#dbeafe", fg: "#1a5fa8" },
    orange: { bg: "#ffedd5", fg: "#c2410c" },
    purple: { bg: "#ede9fe", fg: "#4a3ab5" },
    gray: { bg: "#f3f4f6", fg: "#6b7280" },
  };
  const c = palette[color] ?? palette.gray;
  return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>{children}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e4e8", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>x</button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export function DailyLogSection() {
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { transactions } = useTransactions();
  const { categories } = useCategories();
  const { vehicles } = useVehicles();
  const { houseLoans } = useHouseLoans();
  const fixedHooks = useFixedPayments();

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormInitial, setTxFormInitial] = useState<TransactionFormInitial>(undefined);
  const [filter, setFilter] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [search, setSearch] = useState("");
  const [viewDate, setViewDate] = useState(todayStr);
  const [showAll, setShowAll] = useState(false);
  const [addToFixed, setAddToFixed] = useState<Transaction | null>(null);

  function openNewEntry() {
    setTxFormInitial({
      type: "expense",
      date: todayStr,
      mode: "Debit",
      tag: "Personal",
    });
    setTxFormOpen(true);
  }

  function startEdit(t: Transaction) {
    setTxFormInitial({
      id: t.id,
      amount: t.amount,
      date: t.date ?? t.createdAt?.slice(0, 10),
      createdAt: t.createdAt,
      type: t.type,
      mode: t.mode ?? "Debit",
      sourceId: t.sourceId ?? "",
      description: t.description ?? "",
      notes: t.notes ?? "",
      destinationId: t.destinationId ?? "",
      categoryId: t.categoryId ?? "",
      subType: t.subType,
      tag: t.tag ?? "Personal",
      linkedVehicleId: t.linkedVehicleId ?? "",
      linkedPropertyId: t.linkedPropertyId ?? "",
      odometer: t.odometer ?? "",
      interestAmount: t.interestAmount,
      principalAmount: t.principalAmount,
    });
    setTxFormOpen(true);
  }

  function del(t: Transaction) {
    if (!confirm("Delete this entry?")) return;
    transactionRepository.saveAll(transactionRepository.getAll().filter((x) => x.id !== t.id));
    syncBalances();
    notifyDataChanged("transactions");
  }

  const monthStr = now.toISOString().slice(0, 7);
  const todayTx = transactions.filter((t) => (t.date ?? t.createdAt ?? "").startsWith(todayStr));
  const monthTx = transactions.filter((t) => (t.date ?? t.createdAt ?? "").startsWith(monthStr));
  const tIn = todayTx.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const tOut = todayTx.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const mIn = monthTx.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const mOut = monthTx.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => {
        const dateStr = (t.date ?? t.createdAt ?? "").slice(0, 10);
        if (!showAll && !search && dateStr !== viewDate) return false;
        if (filter !== "all" && t.type !== filter) return false;
        if (search) {
          const hay = `${t.description}${t.sourceId}${t.categoryId ?? ""}`.toLowerCase();
          if (!hay.includes(search.toLowerCase())) return false;
        }
        if (t.type === "adjustment") return false;
        return true;
      })
      .sort((a, b) => {
        const da = a.createdAt ?? a.date ?? "";
        const db = b.createdAt ?? b.date ?? "";
        return db > da ? 1 : -1;
      });
  }, [transactions, showAll, search, viewDate, filter]);

  const acctName = (id: string) => {
    if (!id) return "-";
    const found = [...accounts, ...cards].find((x) => x.id === id);
    return found ? found.name : "Unknown Account";
  };

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? "";

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Daily Log</div>

      {fixedHooks.pending.length > 0 && (
        <PendingBanner
          pending={fixedHooks.pending}
          accounts={accounts}
          cards={cards}
          hooks={fixedHooks}
        />
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="Today In" value={fmtCAD(tIn)} color="#1a7f3c" />
        <StatBox label="Today Out" value={fmtCAD(tOut)} color="#a31515" />
        <StatBox label="Month In" value={fmtCAD(mIn)} color="#1a7f3c" />
        <StatBox label="Month Out" value={fmtCAD(mOut)} color="#a31515" />
      </div>

      <div style={{ background: "#fff", border: "2px solid #1a5fa8", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a5fa8", marginBottom: 8 }}>New Entry</div>
        <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 12 }}>
          Open the shared transaction form so labels, validation, and balance updates stay consistent with the rest of FinanceOS.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Btn onClick={openNewEntry}>Open Transaction Form</Btn>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Viewing:</div>
        <input
          type="date"
          value={viewDate}
          onChange={(e) => { setViewDate(e.target.value); setShowAll(false); }}
          style={{ padding: "5px 8px", border: "1px solid #e2e4e8", borderRadius: 6, fontSize: 12, background: "#fff" }}
        />
        <Btn variant={showAll ? "primary" : "secondary"} small onClick={() => setShowAll((p) => !p)}>
          {showAll ? "Showing All" : "Show All"}
        </Btn>
        <Btn variant="secondary" small onClick={() => { setViewDate(todayStr); setShowAll(false); }}>Today</Btn>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {(["all", "income", "expense", "transfer"] as const).map((v) => (
          <Btn key={v} variant={filter === v ? "primary" : "secondary"} small onClick={() => setFilter(v)}>
            {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
          </Btn>
        ))}
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); if (e.target.value) setShowAll(true); }}
          placeholder="Search..."
          style={{ padding: "5px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: "#fff", fontSize: 12, flex: 1, minWidth: 120 }}
        />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, overflow: "hidden" }}>
        {filtered.slice(0, 60).map((t) => {
          const veh = t.linkedVehicleId ? vehicles.find((v) => v.id === t.linkedVehicleId) : null;
          const prop = t.linkedPropertyId ? houseLoans.find((h) => h.id === t.linkedPropertyId) : null;
          const dateStr = (t.date ?? t.createdAt ?? "").slice(0, 10);

          return (
            <div
              key={t.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 14px", borderBottom: "1px solid #f3f4f6", background: "transparent" }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {t.description || catName(t.categoryId) || "-"}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{fmtDate(dateStr)}</span>
                  {t.mode && <span>- {t.mode}</span>}
                  {t.sourceId && <span>- {acctName(t.sourceId)}</span>}
                  {catName(t.categoryId) && <span>- {catName(t.categoryId)}</span>}
                  {t.tag === "Business" && <Pill color="blue">Biz</Pill>}
                  {veh && <Pill color="orange">{veh.name}</Pill>}
                  {prop && <Pill color="purple">{prop.name}</Pill>}
                  {t.odometer && <span>- {Number(t.odometer).toLocaleString()} km</span>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                <Pill color={t.type === "income" ? "green" : t.type === "transfer" ? "gray" : "red"}>
                  {t.type === "income" ? "+" : t.type === "transfer" ? "<>" : "-"}{fmtCAD(t.amount)}
                </Pill>
                <Btn variant="ghost" small onClick={() => setAddToFixed(t)} style={{ fontSize: 11 }}>+ Fixed</Btn>
                <Btn variant="secondary" small onClick={() => startEdit(t)}>Edit</Btn>
                <Btn variant="danger" small onClick={() => del(t)}>x</Btn>
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

      <TransactionForm
        open={txFormOpen}
        onClose={() => { setTxFormOpen(false); setTxFormInitial(undefined); }}
        initial={txFormInitial}
        onSaved={() => { setTxFormOpen(false); setTxFormInitial(undefined); }}
      />

      {addToFixed && (
        <Modal title="Add to Fixed Payments" onClose={() => setAddToFixed(null)}>
          <div style={{ background: "#f0f9ff", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
            Creating a recurring entry based on: <strong>{addToFixed.description || catName(addToFixed.categoryId)}</strong> - {fmtCAD(addToFixed.amount)}
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

function QuickAddFixed({
  txn, accounts, cards, onSave, onClose,
}: {
  txn: Transaction;
  accounts: Account[];
  cards: CreditCard[];
  onSave: (fp: Omit<FixedPayment, "id">) => void;
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
    { value: "", label: "- No account -" },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
    ...cards.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Label>Description</Label>
        <input
          value={form.name}
          onChange={f("name")}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
        />
      </div>
      <Grid2>
        <div>
          <Label>Amount ($)</Label>
          <input
            type="number"
            value={form.amount}
            onChange={f("amount")}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
        <div>
          <Label>Schedule</Label>
          <select
            value={form.schedule}
            onChange={f("schedule")}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13 }}
          >
            {["Monthly", "Bi-weekly", "Weekly", "Annual", "One-time"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </Grid2>
      <Grid2>
        <div>
          <Label>Next Payment Date</Label>
          <input
            type="date"
            value={form.date}
            onChange={f("date")}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
        <div>
          <Label>End Date (optional)</Label>
          <input
            type="date"
            value={form.endDate}
            onChange={f("endDate")}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
      </Grid2>
      <div>
        <Label>Pay From</Label>
        <select
          value={form.source}
          onChange={f("source")}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13 }}
        >
          {acctOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave({ ...form, amount: Number(form.amount) })}>Save</Btn>
      </div>
    </div>
  );
}
