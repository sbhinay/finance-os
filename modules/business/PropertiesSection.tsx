"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useTransactions } from "@/modules/transactions/useTransactions";
import type { Property } from "@/types/domain";
import type { Transaction } from "@/types/transaction";
import { fmtCAD, fmtDate, toFixed2, toMonthly } from "@/utils/finance";
import { getTransactionListEffect } from "@/utils/transactionSemantics";
import { calculateDebtSummary, matchesMortgagePayment } from "@/utils/debtReporting";
import { theme } from "@/lib/theme";
import { TransactionForm, type TransactionFormInitial } from "./TransactionForm";
import { useHouseLoans, useProperties, usePropertyTax } from "./useAssets";

function Button({
  children,
  onClick,
  variant = "secondary",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
}) {
  const palette = {
    primary: { background: theme.colors.primary, color: "#fff", border: theme.colors.primary },
    secondary: { background: "#fff", color: theme.colors.text, border: theme.colors.border },
    danger: { background: "#fff", color: theme.colors.danger, border: "#fecaca" },
  }[variant];
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 12px",
        borderRadius: 6,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.42)", padding: "4vh 16px", overflowY: "auto" }}>
      <div style={{ width: "min(980px, 100%)", margin: "0 auto", background: "#fff", border: `1px solid ${theme.colors.border}`, borderRadius: 8, boxShadow: theme.shadow.shell }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${theme.colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>{title}</strong>
          <button aria-label="Close property details" onClick={onClose} style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 18, color: theme.colors.textSoft }}>x</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: theme.colors.textSoft }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: 6,
  padding: "8px 10px",
  background: "#fff",
  color: theme.colors.text,
};

function blankProperty(): Property {
  return {
    id: "",
    name: "",
    type: "Primary",
  };
}

function transactionCashOutflow(transaction: Transaction): number {
  if (transaction.type === "refund") return -transaction.amount;
  if (["expense", "loan_payment", "tax_payment"].includes(transaction.type)) return transaction.amount;
  return 0;
}

export function PropertiesSection() {
  const { properties, saveProperty, deleteProperty } = useProperties();
  const { houseLoans } = useHouseLoans();
  const { propertyTaxes } = usePropertyTax();
  const { transactions } = useTransactions();
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Property | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [txInitial, setTxInitial] = useState<TransactionFormInitial | undefined>(undefined);
  const [txOpen, setTxOpen] = useState(false);
  const purchaseDateRef = useRef<HTMLInputElement>(null);
  const insuranceDateRef = useRef<HTMLInputElement>(null);
  const propertyTaxDateRef = useRef<HTMLInputElement>(null);

  const selected = selectedId
    ? properties.find((property) => property.id === selectedId) ?? null
    : null;
  const visible = properties.filter((property) => showArchived || !property.archived);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoDate = oneYearAgo.toISOString().slice(0, 10);

  const propertyMetrics = useMemo(() => Object.fromEntries(properties.map((property) => {
    const mortgages = houseLoans.filter((loan) => loan.propertyId === property.id);
    const linkedTransactions = transactions
      .filter((transaction) => transaction.linkedPropertyId === property.id && transaction.status !== "pending")
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const trailingOutflow = toFixed2(linkedTransactions
      .filter((transaction) => transaction.date >= oneYearAgoDate)
      .reduce((sum, transaction) => sum + transactionCashOutflow(transaction), 0));
    const mortgageBalance = toFixed2(mortgages.reduce((sum, loan) => sum + calculateDebtSummary({
      transactions,
      matches: matchesMortgagePayment(loan.id, property.id, mortgages.length === 1),
      balanceSnapshotAmount: loan.balanceSnapshotAmount,
      balanceSnapshotDate: loan.balanceSnapshotDate,
      fallbackBalance: loan.remaining,
    }).currentOwing, 0));
    const scheduledMortgageMonthly = toFixed2(mortgages.reduce(
      (sum, loan) => sum + toMonthly(loan.payment, loan.schedule),
      0
    ));
    const scheduledInsuranceMonthly = property.insuranceAmount
      ? toFixed2(toMonthly(property.insuranceAmount, property.insuranceSchedule ?? "Monthly"))
      : 0;
    const scheduledPropertyTaxMonthly = property.propertyTaxAmount
      ? toFixed2(toMonthly(property.propertyTaxAmount, property.propertyTaxSchedule ?? "Monthly"))
      : 0;
    return [property.id, {
      mortgages,
      linkedTransactions,
      mortgageBalance,
      trailingOutflow,
      monthlyCarrying: trailingOutflow > 0
        ? toFixed2(trailingOutflow / 12)
        : toFixed2(scheduledMortgageMonthly + scheduledInsuranceMonthly + scheduledPropertyTaxMonthly),
      equity: property.estimatedValue == null
        ? undefined
        : toFixed2(property.estimatedValue - mortgageBalance),
    }];
  })), [houseLoans, oneYearAgoDate, properties, transactions]);

  const selectedMetrics = selected ? propertyMetrics[selected.id] : undefined;
  const selectedTaxRecords = selected
    ? propertyTaxes.filter((record) => record.propertyId === selected.id)
    : [];

  function openProperty(property: Property) {
    setSelectedId(property.id);
    setDraft({ ...property });
  }

  function closeProperty() {
    setSelectedId(null);
    setDraft(null);
  }

  function saveDraft() {
    if (!draft?.name.trim()) return;
    const saved = saveProperty({
      ...draft,
      name: draft.name.trim(),
      address: draft.address?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      purchaseDate: purchaseDateRef.current?.value || undefined,
      insuranceDate: insuranceDateRef.current?.value || undefined,
      propertyTaxDate: propertyTaxDateRef.current?.value || undefined,
    });
    setSelectedId(saved.id);
    setDraft(saved);
  }

  function logExpense(property: Property) {
    setTxInitial({
      type: "expense",
      date: new Date().toISOString().slice(0, 10),
      linkedPropertyId: property.id,
      tag: property.type === "Commercial" ? "Business" : "Personal",
      mode: "Debit",
    });
    setTxOpen(true);
  }

  function editTransaction(transaction: Transaction) {
    setTxInitial({
      ...transaction,
      linkedPropertyId: transaction.linkedPropertyId,
    });
    setTxOpen(true);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0 }}>Properties</div>
          <div style={{ marginTop: 4, fontSize: 13, color: theme.colors.textSoft }}>Property records own real-estate identity; mortgages, taxes, insurance, and expenses link back here.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Hide Archived" : "Show Archived"}</Button>
          <Button variant="primary" onClick={() => { setSelectedId(null); setDraft(blankProperty()); }}>Add Property</Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: 28, border: `1px dashed ${theme.colors.border}`, borderRadius: 8, textAlign: "center", color: theme.colors.textSoft }}>No properties yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {visible.map((property) => {
            const metrics = propertyMetrics[property.id];
            return (
              <div key={property.id} style={{ ...theme.cardStyle("#b45309"), padding: 16, opacity: property.archived ? 0.65 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{property.name}</div>
                    <div style={{ fontSize: 12, color: theme.colors.textSoft, marginTop: 3 }}>{property.type}{property.archived ? " | Archived" : ""}</div>
                    {property.address && <div style={{ fontSize: 12, color: theme.colors.textSoft, marginTop: 3 }}>{property.address}</div>}
                  </div>
                  <Button onClick={() => openProperty(property)}>Details</Button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
                  <div><div style={{ fontSize: 10, color: theme.colors.textSoft }}>VALUE</div><strong>{property.estimatedValue == null ? "--" : fmtCAD(property.estimatedValue)}</strong></div>
                  <div><div style={{ fontSize: 10, color: theme.colors.textSoft }}>MORTGAGE</div><strong>{fmtCAD(metrics.mortgageBalance)}</strong></div>
                  <div><div style={{ fontSize: 10, color: theme.colors.textSoft }}>EQUITY</div><strong>{metrics.equity == null ? "--" : fmtCAD(metrics.equity)}</strong></div>
                  <div><div style={{ fontSize: 10, color: theme.colors.textSoft }}>MONTHLY CARRY</div><strong>{fmtCAD(metrics.monthlyCarrying)}</strong></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <Modal title={selected ? `Property - ${selected.name}` : "Add Property"} onClose={closeProperty}>
          {selected && selectedMetrics && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
              {[
                ["Estimated Value", selected.estimatedValue == null ? "--" : fmtCAD(selected.estimatedValue)],
                ["Mortgage Balance", fmtCAD(selectedMetrics.mortgageBalance)],
                ["Estimated Equity", selectedMetrics.equity == null ? "--" : fmtCAD(selectedMetrics.equity)],
                ["12-Month Outflow", fmtCAD(selectedMetrics.trailingOutflow)],
              ].map(([label, value]) => (
                <div key={label} style={{ padding: 12, background: theme.colors.surfaceAlt, border: `1px solid ${theme.colors.border}`, borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: theme.colors.textSoft }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 17, fontWeight: 750, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <Field label="Name"><input style={inputStyle} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="Type">
              <select style={inputStyle} value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Property["type"] })}>
                <option>Primary</option><option>Rental</option><option>Commercial</option>
              </select>
            </Field>
            <Field label="Address"><input style={inputStyle} value={draft.address ?? ""} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></Field>
            <Field label="Purchase Date"><input ref={purchaseDateRef} type="date" style={inputStyle} value={draft.purchaseDate ?? ""} onChange={(event) => setDraft({ ...draft, purchaseDate: event.target.value || undefined })} /></Field>
            <Field label="Purchase Price ($)"><input type="number" style={inputStyle} value={draft.purchasePrice ?? ""} onChange={(event) => setDraft({ ...draft, purchasePrice: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
            <Field label="Estimated Value ($)"><input type="number" style={inputStyle} value={draft.estimatedValue ?? ""} onChange={(event) => setDraft({ ...draft, estimatedValue: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
          </div>

          <div style={{ fontWeight: 750, marginTop: 18, marginBottom: 8 }}>Insurance</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <Field label="Amount ($)"><input type="number" style={inputStyle} value={draft.insuranceAmount ?? ""} onChange={(event) => setDraft({ ...draft, insuranceAmount: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
            <Field label="Schedule">
              <select style={inputStyle} value={draft.insuranceSchedule ?? "Monthly"} onChange={(event) => setDraft({ ...draft, insuranceSchedule: event.target.value as Property["insuranceSchedule"] })}>
                <option>Monthly</option><option>Annual</option><option>Semi-monthly</option><option>Bi-weekly</option>
              </select>
            </Field>
            <Field label="Next Date"><input ref={insuranceDateRef} type="date" style={inputStyle} value={draft.insuranceDate ?? ""} onChange={(event) => setDraft({ ...draft, insuranceDate: event.target.value || undefined })} /></Field>
            <Field label="Pay From">
              <select style={inputStyle} value={draft.insuranceSource ?? ""} onChange={(event) => setDraft({ ...draft, insuranceSource: event.target.value || undefined })}>
                <option value="">-- Select account/card --</option>
                {[...accounts, ...cards].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ fontWeight: 750, marginTop: 18, marginBottom: 8 }}>Property Tax Schedule</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <Field label="Amount ($)"><input type="number" style={inputStyle} value={draft.propertyTaxAmount ?? ""} onChange={(event) => setDraft({ ...draft, propertyTaxAmount: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
            <Field label="Schedule">
              <select style={inputStyle} value={draft.propertyTaxSchedule ?? "Monthly"} onChange={(event) => setDraft({ ...draft, propertyTaxSchedule: event.target.value as Property["propertyTaxSchedule"] })}>
                <option>Monthly</option><option>Annual</option><option>Semi-monthly</option><option>Bi-weekly</option>
              </select>
            </Field>
            <Field label="Next Date"><input ref={propertyTaxDateRef} type="date" style={inputStyle} value={draft.propertyTaxDate ?? ""} onChange={(event) => setDraft({ ...draft, propertyTaxDate: event.target.value || undefined })} /></Field>
            <Field label="Pay From">
              <select style={inputStyle} value={draft.propertyTaxSource ?? ""} onChange={(event) => setDraft({ ...draft, propertyTaxSource: event.target.value || undefined })}>
                <option value="">-- Select account/card --</option>
                {[...accounts, ...cards].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Roll Number"><input style={inputStyle} value={draft.propertyTaxRollNumber ?? ""} onChange={(event) => setDraft({ ...draft, propertyTaxRollNumber: event.target.value || undefined })} /></Field>
          </div>
          <Field label="Notes"><textarea rows={2} style={{ ...inputStyle, resize: "vertical", marginTop: 10 }} value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {selected && !selected.archived && <Button onClick={() => logExpense(selected)}>Log Expense</Button>}
              {selected && !selected.archived && (
                <Button variant="danger" onClick={() => {
                  const hasRelations = Boolean(
                    selectedMetrics?.mortgages.length
                    || selectedMetrics?.linkedTransactions.length
                    || selectedTaxRecords.length
                  );
                  if (!confirm(`${hasRelations ? "Archive" : "Delete"} ${selected.name}? Linked records will remain intact.`)) return;
                  deleteProperty(selected.id);
                  closeProperty();
                }}>
                  {selectedMetrics?.mortgages.length || selectedMetrics?.linkedTransactions.length || selectedTaxRecords.length ? "Archive" : "Delete"}
                </Button>
              )}
              {selected?.archived && <Button onClick={() => { const restored = saveProperty({ ...selected, archived: false }); setDraft(restored); }}>Restore</Button>}
            </div>
            <Button variant="primary" onClick={saveDraft}>{selected ? "Save Property" : "Create Property"}</Button>
          </div>

          {selected && selectedMetrics && (
            <>
              <div style={{ fontWeight: 750, marginTop: 22, marginBottom: 8 }}>Mortgages</div>
              {selectedMetrics.mortgages.length === 0 ? (
                <div style={{ fontSize: 12, color: theme.colors.textSoft }}>No mortgage linked to this property.</div>
              ) : selectedMetrics.mortgages.map((loan) => (
                <div key={loan.id} style={{ padding: "9px 0", borderTop: `1px solid ${theme.colors.border}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>{loan.name}</span>
                  <strong>{fmtCAD(calculateDebtSummary({
                    transactions,
                    matches: matchesMortgagePayment(
                      loan.id,
                      selected.id,
                      (selectedMetrics?.mortgages.length ?? 0) === 1
                    ),
                    balanceSnapshotAmount: loan.balanceSnapshotAmount,
                    balanceSnapshotDate: loan.balanceSnapshotDate,
                    fallbackBalance: loan.remaining,
                  }).currentOwing)}</strong>
                </div>
              ))}

              <div style={{ fontWeight: 750, marginTop: 18, marginBottom: 8 }}>Property Tax</div>
              {selectedTaxRecords.length === 0 ? (
                <div style={{ fontSize: 12, color: theme.colors.textSoft }}>No property-tax record linked.</div>
              ) : selectedTaxRecords.map((record) => (
                <div key={record.id} style={{ padding: "9px 0", borderTop: `1px solid ${theme.colors.border}` }}>
                  <strong>{record.name}</strong>
                  <div style={{ fontSize: 12, color: theme.colors.textSoft }}>{record.accountNumber || "No account number"} | {(record.payments ?? []).length} payment(s)</div>
                </div>
              ))}

              <div style={{ fontWeight: 750, marginTop: 18, marginBottom: 8 }}>Transaction History</div>
              {selectedMetrics.linkedTransactions.length === 0 ? (
                <div style={{ fontSize: 12, color: theme.colors.textSoft }}>No linked transactions.</div>
              ) : (
                <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: 6, overflow: "hidden" }}>
                  {selectedMetrics.linkedTransactions.map((transaction) => {
                    const effect = getTransactionListEffect(transaction);
                    return (
                      <div key={transaction.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr auto auto", gap: 8, alignItems: "center", padding: 9, borderTop: `1px solid ${theme.colors.border}`, fontSize: 12 }}>
                        <span>{fmtDate(transaction.date)}</span>
                        <span>{transaction.description}</span>
                        <strong style={{ color: effect != null && effect > 0 ? theme.colors.success : theme.colors.danger }}>{effect == null ? "" : `${effect > 0 ? "+" : "-"}${fmtCAD(Math.abs(effect))}`}</strong>
                        <Button onClick={() => editTransaction(transaction)}>Edit</Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      <TransactionForm
        open={txOpen}
        initial={txInitial}
        onClose={() => { setTxOpen(false); setTxInitial(undefined); }}
        onSaved={() => { setTxOpen(false); setTxInitial(undefined); }}
        title="Property Transaction"
      />
    </div>
  );
}
