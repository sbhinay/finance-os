"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useCategories } from "@/modules/categories/useCategories";
import { useHouseLoans, useProperties, useVehicles } from "./useAssets";
import { useLiabilities } from "./useLiabilities";
import { detectCategory, learnedRulesRepository, uncategorizedRepository } from "@/rules/categoryRules";
import { buildSourceOptions, fmtCAD, toFixed2, uid } from "@/utils/finance";
import { deleteCanonicalTransaction, persistCanonicalTransaction } from "@/services/transactionPipeline";
import { inferTransactionPurpose } from "@/utils/transactionSemantics";
import { isFinanceOsEstimatedSplit } from "@/utils/debtAllocation";
import {
  Transaction, TransactionType, TransactionSubType, TransactionMode,
  TYPE_LABELS, SUB_TYPE_OPTIONS, USER_FACING_TYPES, getSubTypeLabel,
  requiresDestination, requiresSubType, isExpenseReportable, isIncomeReportable,
  deriveTaxYear, TransactionPurpose,
  RecurringOriginType,
} from "@/types/transaction";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionFormInitial {
  id?: string;
  type?: TransactionType;
  subType?: TransactionSubType;
  purpose?: TransactionPurpose;
  amount?: number;
  date?: string;
  createdAt?: string;
  description?: string;
  notes?: string;
  sourceId?: string;
  destinationId?: string;
  categoryId?: string;
  tag?: "Personal" | "Business";
  mode?: string;
  linkedVehicleId?: string;
  linkedPropertyId?: string;
  linkedHouseLoanId?: string;
  linkedLiabilityId?: string;
  recurringOriginType?: RecurringOriginType;
  recurringOriginId?: string;
  odometer?: string;
  interestAmount?: number;
  principalAmount?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: TransactionFormInitial;
  scheduledAmount?: number;
  lockType?: TransactionType;
  title?: string;
  onSaved?: (txn: Transaction) => void;
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "#6b7280", display: "block", marginBottom: 4 }}>
      {children}{required && <span style={{ color: "#a31515", marginLeft: 2 }}>*</span>}
    </label>
  );
}
function Inp({ label, type = "text", value, onChange, placeholder, disabled, required }: {
  label?: string; type?: string; value: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; disabled?: boolean; required?: boolean;
}) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      <input type={type} value={value ?? ""} onChange={onChange} placeholder={placeholder} disabled={disabled}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: disabled ? "#f9fafb" : "#fff", fontSize: 13, boxSizing: "border-box" as const }} />
    </div>
  );
}
function Sel({ label, value, onChange, options, disabled, required }: {
  label?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean; required?: boolean;
}) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      <select value={value ?? ""} onChange={onChange} disabled={disabled}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, background: disabled ? "#f9fafb" : "#fff", fontSize: 13 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function Btn({ children, onClick, variant = "primary", disabled }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "danger"; disabled?: boolean;
}) {
  const c = { primary: { bg: "#1a5fa8", color: "#fff" }, secondary: { bg: "#f3f4f6", color: "#374151" }, danger: { bg: "#fef2f2", color: "#a31515" } }[variant];
  return <button onClick={onClick} disabled={disabled} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, background: c.bg, color: c.color }}>{children}</button>;
}
function Grid2({ children }: { children: React.ReactNode }) { return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>; }
function Alert({ type, children }: { type: "warning" | "error" | "info"; children: React.ReactNode }) {
  const s = {
    warning: { bg: "#fef3c7", border: "#fde68a", color: "#a05c00" },
    error:   { bg: "#fef2f2", border: "#fecaca", color: "#a31515" },
    info:    { bg: "#f0f9ff", border: "#bae6fd", color: "#1a5fa8" },
  }[type];
  return <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>{children}</div>;
}

// ─── Type colour coding ───────────────────────────────────────────────────────
const TYPE_COLORS: Partial<Record<TransactionType, string>> = {
  expense:              "#a31515",
  income:               "#1a7f3c",
  transfer:             "#1a5fa8",
  refund:               "#065f46",
  dividend:             "#4a3ab5",
  tax_payment:          "#a05c00",
  loan_receipt:         "#0369a1",
  loan_payment:         "#7c3aed",
  withdrawal:           "#c2410c",
  adjustment:           "#6b7280",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function TransactionForm({ open, onClose, initial, scheduledAmount, lockType, title, onSaved }: Props) {
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { categories } = useCategories();
  const { vehicles } = useVehicles();
  const { properties } = useProperties();
  const { houseLoans } = useHouseLoans();
  const { liabilities } = useLiabilities();

  const now = new Date();
  const todayLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    const emptyForm = useMemo(() => ({
    id:              undefined as string | undefined,
    type:            "expense" as TransactionType,
    subType:         "" as string,
    amount:          "" as string | number,
    interestAmount:  "" as string | number,
    principalAmount: "" as string | number,
    date:            todayLocal,
    description:     "",
    notes:           "",
    sourceId:        "",
    destinationId:   "",
    categoryId:      "",
    tag:             "Personal" as "Personal" | "Business",
    mode:            "Debit" as string,
    linkedVehicleId: "",
    linkedPropertyId: "",
    linkedHouseLoanId: "",
    linkedLiabilityId: "",
    odometer:        "",
  }), [todayLocal]);

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [showLoanDetails, setShowLoanDetails] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  function canonicalizeInitial(initialValue?: TransactionFormInitial): TransactionFormInitial | undefined {
    if (!initialValue) return initialValue;
    if (initialValue.type === "loan_receipt" && initialValue.subType === "line_of_credit") {
      return {
        ...initialValue,
        type: "transfer",
        subType: "loc_draw",
        mode: initialValue.mode ?? "Bank Transfer",
      };
    }
    return initialValue;
  }

  const txType = form.type as TransactionType;
  const isTransfer = txType === "transfer";
  const isCreditCardPayTransfer = isTransfer && form.subType === "cc_payment";
  const hasLoanSplit = Number(form.interestAmount) > 0 || Number(form.principalAmount) > 0;
  const selectedCatById = categories.find((c) => c.id === form.categoryId);
  const sourceName = [...accounts, ...cards].find((x) => x.id === form.sourceId)?.name ?? "";
  const destinationName = [...accounts, ...cards].find((x) => x.id === form.destinationId)?.name ?? "";
  const selectedVehicle = vehicles.find((v) => v.id === form.linkedVehicleId);
  const selectedProperty = properties.find((property) => property.id === form.linkedPropertyId);
  const selectedHouseLoan = houseLoans.find((loan) => loan.id === form.linkedHouseLoanId);
  const selectedLiability = liabilities.find((liability) => liability.id === form.linkedLiabilityId);
  const selectedSubTypeLabel = form.subType
    ? getSubTypeLabel(txType, form.subType as TransactionSubType)
    : "";

  const generatedDescription = useMemo(() => {
    if (txType === "transfer") {
      if (form.subType === "cc_payment") return `Credit Card Payment${destinationName ? ` - ${destinationName}` : ""}`;
      if (form.subType === "loc_draw") return `LOC Draw${destinationName ? ` - ${destinationName}` : ""}`;
      if (selectedSubTypeLabel) return destinationName ? `${selectedSubTypeLabel} - ${destinationName}` : selectedSubTypeLabel;
      if (sourceName && destinationName) return `Transfer - ${sourceName} to ${destinationName}`;
      return "Transfer";
    }

    if (txType === "loan_payment") {
      if (selectedHouseLoan?.name) return `Mortgage Payment - ${selectedHouseLoan.name}`;
      if (selectedLiability?.name) return `${selectedSubTypeLabel || "Loan Payment"} - ${selectedLiability.name}`;
      if (selectedProperty?.name) return `${selectedSubTypeLabel || "Loan Payment"} - ${selectedProperty.name}`;
      if (selectedVehicle?.name) return `${selectedSubTypeLabel || "Loan Payment"} - ${selectedVehicle.name}`;
      return selectedSubTypeLabel || "Loan Payment";
    }

    if (txType === "loan_receipt") {
      const receiptLabel = selectedSubTypeLabel ? `${selectedSubTypeLabel} Receipt` : "Loan Receipt";
      if (selectedLiability?.name) return `${receiptLabel} - ${selectedLiability.name}`;
      return receiptLabel;
    }

    if (
      selectedVehicle?.name
      && selectedCatById?.name.trim().toLowerCase() === "vehicle lease"
    ) {
      return `Vehicle Lease Payment - ${selectedVehicle.name}`;
    }
    if (selectedVehicle?.name && selectedCatById?.name) return `${selectedCatById.name} - ${selectedVehicle.name}`;
    if (selectedProperty?.name && selectedCatById?.name) return `${selectedCatById.name} - ${selectedProperty.name}`;
    if (selectedCatById?.name && sourceName) return `${selectedCatById.name} - ${sourceName}`;
    if (selectedCatById?.name) return selectedCatById.name;
    if (selectedSubTypeLabel) return selectedSubTypeLabel;
    if (sourceName && TYPE_LABELS[txType]) return `${TYPE_LABELS[txType]} - ${sourceName}`;
    return TYPE_LABELS[txType] ?? "Transaction";
  }, [txType, form.subType, sourceName, destinationName, selectedVehicle, selectedProperty, selectedHouseLoan, selectedLiability, selectedCatById, selectedSubTypeLabel]);

  const effectiveDescription = useMemo(() => (form.description || generatedDescription).trim(), [form.description, generatedDescription]);

  const autoDetectedCat = useMemo(() => {
    if (!effectiveDescription) return undefined;
    return detectCategory(effectiveDescription.toLowerCase().trim());
  }, [effectiveDescription]);

  const warnings = useMemo(() => {
    const w: string[] = [];
    const amt = Number(form.amount);

    if ((form.type === "income" || form.type === "dividend") && cards.some((c) => c.id === form.sourceId)) {
      w.push("Income to a credit card is unusual. Did you mean a transfer?");
    }
    if (form.type === "transfer" && form.subType === "cc_payment") {
      if (cards.some((c) => c.id === form.sourceId)) {
        w.push("Source should be a bank account for a credit card payment. Please change the source to the account the payment came from.");
      }
      if (form.destinationId && !cards.some((c) => c.id === form.destinationId)) {
        w.push("Destination should be a credit card for a credit card payment. Please select which credit card was paid.");
      }
    }
    if (scheduledAmount && amt > 0 && amt !== scheduledAmount) {
      w.push(`Amount differs from scheduled ${fmtCAD(scheduledAmount)} by ${fmtCAD(toFixed2(Math.abs(amt - scheduledAmount)))}.`);
    }
    if (! (form.categoryId || autoDetectedCat) && amt > 0 && isExpenseReportable(form.type as TransactionType)) {
      w.push("No category — this will appear as uncategorized in reports.");
    }
    if (requiresSubType(form.type as TransactionType) && !form.subType) {
      w.push("Please select a sub-type for accurate reporting.");
    }
    if (requiresDestination(form.type as TransactionType) && !form.destinationId) {
      w.push("Please select a destination account or card.");
    }
    if (form.type === "loan_payment" && hasLoanSplit && Number(form.interestAmount) + Number(form.principalAmount) !== amt && amt > 0) {
      const split = toFixed2(Number(form.interestAmount) + Number(form.principalAmount));
      if (split > 0) w.push(`Interest + Principal (${fmtCAD(split)}) does not equal total amount (${fmtCAD(amt)}).`);
    }

    return w;
  }, [form, scheduledAmount, cards, autoDetectedCat, hasLoanSplit]);

  // Pre-fill when modal opens
    useEffect(() => {
    if (!open) return;

    const normalizedInitial = canonicalizeInitial(initial);

    if (normalizedInitial) {
      const raw = normalizedInitial.date;
      let dateVal = todayLocal;

      if (raw) {
        if (raw.endsWith("Z") || raw.endsWith("z")) {
          const d = new Date(raw);
          const pad = (n: number) => String(n).padStart(2, "0");
          dateVal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        } else {
          dateVal = raw.slice(0, 10);
        }
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        id:              normalizedInitial.id,
        type:            normalizedInitial.type ?? "expense",
        subType:         normalizedInitial.subType ?? "",
        amount:          normalizedInitial.amount ?? "",
        interestAmount:  normalizedInitial.interestAmount ?? "",
        principalAmount: normalizedInitial.principalAmount ?? "",
        date:            dateVal,
        description:     normalizedInitial.description ?? "",
        notes:           normalizedInitial.notes ?? "",
        sourceId:        normalizedInitial.sourceId ?? "",
        destinationId:   normalizedInitial.destinationId ?? "",
        categoryId:      normalizedInitial.categoryId ?? "",
        tag:             normalizedInitial.tag ?? "Personal",
        mode:            normalizedInitial.mode ?? "Debit",
        linkedVehicleId: normalizedInitial.linkedVehicleId ?? "",
        linkedPropertyId: normalizedInitial.linkedPropertyId ?? "",
        linkedHouseLoanId: normalizedInitial.linkedHouseLoanId ?? "",
        linkedLiabilityId: normalizedInitial.linkedLiabilityId ?? "",
        odometer:        normalizedInitial.odometer ?? "",
      });
      setShowLoanDetails(Number(normalizedInitial.interestAmount) > 0 || Number(normalizedInitial.principalAmount) > 0);
      setShowNotes(Boolean(normalizedInitial.notes));
    } else {
      setForm(emptyForm);
      setShowLoanDetails(false);
      setShowNotes(false);
    }

    setErrors([]);
  }, [open, initial, emptyForm, todayLocal]);

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  // Derived state
  const activeCats = categories.filter((c) => !c.archived);
  const catList = activeCats.filter((c) =>
    isIncomeReportable(txType) ? (c.type === "income" || c.type === "both")
    : (c.type === "expense" || c.type === "both")
  );
  const selectedCat = selectedCatById;
  const isVehicleCat = selectedCat?.vehicleLinked;
  const isPropertyCat = selectedCat?.propertyLinked;
  const showCategory = isExpenseReportable(txType) || isIncomeReportable(txType);
  const showDestination = txType === "transfer" || txType === "adjustment";
  const isMortgagePayment = txType === "loan_payment" && form.subType === "mortgage";
  const isManualSplitEdit = Boolean(
    initial
    && initial.type === "loan_payment"
    && initial.subType === "mortgage"
    && (initial.principalAmount != null || initial.interestAmount != null)
    && !isFinanceOsEstimatedSplit(initial as Transaction)
  );
  const showLoanSplit = txType === "loan_payment" && !isMortgagePayment;
  const showMortgageLink = txType === "loan_payment" && form.subType === "mortgage";
  const showLiability = txType === "loan_receipt" || (txType === "loan_payment" && form.subType !== "mortgage");
  const loanDetailsVisible = showLoanSplit && showLoanDetails;
  const subTypeOptions = SUB_TYPE_OPTIONS[txType] ?? [];
  const showVehicleLink = txType === "expense" && isVehicleCat;
  const showPropertyLink =
    (txType === "expense" && isPropertyCat)
    || Boolean(form.linkedPropertyId);
  const isHistoricalEdit = !!form.id && form.date < todayLocal;
  const showBalancePreview = Boolean(form.sourceId && Number(form.amount) > 0 && !isHistoricalEdit);

  const paymentSources = isCreditCardPayTransfer
    ? [
        { value: "", label: "— Select bank account —" },
        ...accounts.filter((a) => a.primary).map((a) => ({ value: a.id, label: `★ ${a.name} (${a.type})` })),
        ...accounts.filter((a) => !a.primary).map((a) => ({ value: a.id, label: `${a.name} (${a.type})` })),
      ]
    : buildSourceOptions(accounts, cards);
  const destinationOptions = isCreditCardPayTransfer
    ? [
        { value: "", label: "— Select card —" },
        ...cards.map((c) => ({ value: c.id, label: `${c.primary ? "★ " : ""}${c.name} (Credit)` })),
      ]
    : [
        { value: "", label: "— Select destination —" },
        ...accounts.filter((a) => a.id !== form.sourceId).map((a) => ({ value: a.id, label: `${a.primary ? "★ " : ""}${a.name} (${a.type})` })),
        ...cards.filter((c) => c.id !== form.sourceId).map((c) => ({ value: c.id, label: `${c.primary ? "★ " : ""}${c.name} (Credit)` })),
      ];

  const typeColor = TYPE_COLORS[txType] ?? "#1a5fa8";

  function validate(): string[] {
    const errs: string[] = [];
    if (!Number(form.amount) || Number(form.amount) <= 0) errs.push("Amount must be greater than zero.");
    if (!form.sourceId) errs.push("Please select an account or card.");
    if (requiresDestination(txType) && !form.destinationId) errs.push("Please select a destination account or card.");
    if (requiresSubType(txType) && !form.subType) errs.push("Please select a sub-type.");
    if (txType === "loan_payment" && form.subType === "mortgage" && !form.linkedHouseLoanId) {
      errs.push("Please select the mortgage this payment belongs to.");
    }
    if (
      txType === "loan_payment"
      && hasLoanSplit
      && toFixed2(Number(form.principalAmount) + Number(form.interestAmount)) !== toFixed2(Number(form.amount))
    ) {
      errs.push("Principal and interest must equal the payment amount.");
    }
    if (isCreditCardPayTransfer) {
      if (cards.some((c) => c.id === form.sourceId)) {
        errs.push("Source must be a bank account (not a credit card) for a credit card payment.");
      }
      if (form.destinationId && cards.some((c) => c.id === form.destinationId) === false) {
        errs.push("Destination must be a credit card for a credit card payment.");
      }
      if (form.destinationId && form.sourceId === form.destinationId) {
        errs.push("Source and destination cannot be the same for a credit card payment.");
      }
    }
    return errs;
  }

  function save() {
    const errs = validate();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);

    const amount = toFixed2(Number(form.amount));
    const finalDescription = effectiveDescription;
    const desc = finalDescription.toLowerCase().trim();
    const categoryId = showCategory ? (form.categoryId || autoDetectedCat) : undefined;
    const finalCategory = categories.find((category) => category.id === categoryId);
    const unchangedClassification = initial?.type === txType
      && (initial?.subType ?? "") === (form.subType ?? "");
    const purpose = unchangedClassification
      ? initial?.purpose
      : undefined;
    const finalPurpose = purpose
      ?? (
        txType === "expense"
        && finalCategory?.name.trim().toLowerCase() === "vehicle lease"
        && form.linkedVehicleId
          ? "vehicle_lease_payment"
          : inferTransactionPurpose({
              type: txType,
              subType: form.subType ? (form.subType as TransactionSubType) : undefined,
            })
      );
    const allowVehicleLink = Boolean(
      form.linkedVehicleId
      && (
        finalCategory?.vehicleLinked
        || finalPurpose === "vehicle_lease_payment"
        || finalPurpose === "vehicle_finance_payment"
      )
    );
    const allowMortgageLink = txType === "loan_payment" && form.subType === "mortgage";
    const allowPropertyLink = Boolean(
      form.linkedPropertyId
      && (
        finalCategory?.propertyLinked
        || allowMortgageLink
      )
    );
    const allowLiabilityLink = txType === "loan_receipt" || (txType === "loan_payment" && form.subType !== "mortgage");

    if (categoryId && finalDescription) {
      learnedRulesRepository.add({ id: uid(), description: desc, categoryId });
      uncategorizedRepository.remove(desc);
    } else if (!categoryId && finalDescription && showCategory) {
      uncategorizedRepository.add(desc);
    }

    const txn: Transaction = {
      id:              form.id ?? uid(),
      type:            txType,
      subType:         form.subType ? (form.subType as TransactionSubType) : undefined,
      purpose:         finalPurpose,
      amount,
      interestAmount:  showLoanSplit && Number(form.interestAmount) > 0
        ? toFixed2(Number(form.interestAmount))
        : isManualSplitEdit
          ? initial?.interestAmount
          : undefined,
      principalAmount: showLoanSplit && Number(form.principalAmount) > 0
        ? toFixed2(Number(form.principalAmount))
        : isManualSplitEdit
          ? initial?.principalAmount
          : undefined,
      date:            form.date.slice(0, 10),
      createdAt:       initial?.createdAt ?? new Date().toISOString(),
      description:     finalDescription,
      notes:           form.notes || undefined,
      sourceId:        form.sourceId,
      destinationId:   form.destinationId || undefined,
      categoryId:      categoryId || undefined,
      tag:             form.tag,
      mode:            form.mode as TransactionMode,
      currency:        "CAD",
      status:          "cleared",
      taxYear:         deriveTaxYear(form.date.slice(0, 10)),
      linkedVehicleId:  allowVehicleLink ? form.linkedVehicleId : undefined,
      linkedPropertyId: allowPropertyLink ? form.linkedPropertyId : undefined,
      linkedHouseLoanId: allowMortgageLink ? form.linkedHouseLoanId || undefined : undefined,
      linkedLiabilityId: allowLiabilityLink ? form.linkedLiabilityId || undefined : undefined,
      recurringOriginType: initial?.recurringOriginType,
      recurringOriginId: initial?.recurringOriginId,
      odometer:         allowVehicleLink ? form.odometer || undefined : undefined,
    };

    const saved = persistCanonicalTransaction(txn);
    onSaved?.(saved);
    onClose();
  }

  function handleDelete() {
    if (!form.id) return;
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    deleteCanonicalTransaction(form.id);
    onClose();
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.3)" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e4e8", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", borderTop: `3px solid ${typeColor}` }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: typeColor }}>
            {title ?? (form.id ? "Edit Transaction" : "New Transaction")}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>

        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Errors */}
          {errors.length > 0 && <Alert type="error">{errors.map((e, i) => <div key={i}>• {e}</div>)}</Alert>}

          {/* Warnings */}
          {warnings.map((w, i) => <Alert key={i} type="warning">⚠ {w}</Alert>)}

          {/* Amount + Date */}
          <Grid2>
            <Inp label="Amount ($)" type="number" value={form.amount} onChange={f("amount")} placeholder="0.00" required />
            <Inp label="Date" type="date" value={form.date} onChange={f("date")} required />
          </Grid2>

          {/* Type + SubType */}
          <Grid2>
            <Sel label="Type" value={form.type} onChange={(e) => {
              const newType = e.target.value as TransactionType;
              const keepCategory = ["expense", "income", "refund", "dividend"].includes(newType);
              setForm((p) => ({
                ...p,
                type: newType,
                subType: "",
                sourceId: "",
                destinationId: "",
                mode: newType === "transfer" ? "Bank Transfer" : p.mode,
                ...(keepCategory ? {} : { categoryId: "", linkedVehicleId: "", linkedPropertyId: "", linkedHouseLoanId: "", linkedLiabilityId: "", odometer: "" }),
              }));
            }}
              disabled={!!lockType}
              options={USER_FACING_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
              required />
            {subTypeOptions.length > 0 && (
              <Sel label="Sub-type" value={form.subType} onChange={(e) => {
                const nextSubType = e.target.value;
                setForm((p) => ({
                  ...p,
                  subType: nextSubType,
                  mode: txType === "transfer" && nextSubType === "cc_payment" ? "Bank Transfer" : p.mode,
                  linkedLiabilityId: txType === "loan_payment" && nextSubType === "mortgage" ? "" : p.linkedLiabilityId,
                  linkedHouseLoanId: txType === "loan_payment" && nextSubType !== "mortgage" ? "" : p.linkedHouseLoanId,
                  linkedPropertyId: txType === "loan_payment" && nextSubType !== "mortgage" ? "" : p.linkedPropertyId,
                  ...(txType === "transfer" ? { categoryId: "", linkedVehicleId: "", linkedPropertyId: "", linkedHouseLoanId: "", linkedLiabilityId: "", odometer: "" } : {}),
                }));
              }}
                options={[{ value: "", label: "— Select sub-type —" }, ...subTypeOptions]}
                required={requiresSubType(txType)} />
            )}
          </Grid2>

          {/* Mode + Tag */}
          <Grid2>
            <Sel label="Payment Mode" value={form.mode} onChange={f("mode")}
              options={["Cash", "Debit", "Credit Card", "Bank Transfer", "E-Transfer", "Cheque", "Direct Deposit", "Pre-authorized"].map((m) => ({ value: m, label: m }))}
              />
            <Sel label="Tag" value={form.tag} onChange={f("tag")}
              options={[{ value: "Personal", label: "Personal" }, { value: "Business", label: "Business" }]}
              />
          </Grid2>

          {/* Description + Notes */}
          <div>
            <Label>Description</Label>
            <input value={form.description || generatedDescription} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Transaction label"
             
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, background: "#fff" }} />
            {!form.description && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                Auto-generated from the selected type, category, accounts, and linked item. Edit it only if you want a custom label.
              </div>
            )}
            {autoDetectedCat && !form.categoryId && (
              <div style={{ fontSize: 11, color: "#1a5fa8", marginTop: 3 }}>
                🔍 Auto-detected: {categories.find((c) => c.id === autoDetectedCat)?.name ?? autoDetectedCat}
              </div>
            )}
          </div>
          {showNotes ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Label>Notes (optional)</Label>
                {(
                  <button
                    type="button"
                    onClick={() => {
                      setForm((p) => ({ ...p, notes: "" }));
                      setShowNotes(false);
                    }}
                    style={{ border: "none", background: "none", color: "#6b7280", fontSize: 11, cursor: "pointer", padding: 0 }}
                  >
                    Hide notes
                  </button>
                )}
              </div>
              <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Reference number, extra context, or something you want to remember later"
               
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, background: "#fff" }} />
            </div>
          ) : (
            (
              <div>
                <button
                  type="button"
                  onClick={() => setShowNotes(true)}
                  style={{ border: "none", background: "none", color: "#1a5fa8", fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 600 }}
                >
                  + Add note
                </button>
              </div>
            )
          )}

          {/* Category + Source */}
          <Grid2>
            {showCategory ? (
              <div>
                <Label>Category</Label>
                <select value={form.categoryId} onChange={(e) => {
                  const nextCategory = categories.find((category) => category.id === e.target.value);
                  setForm((p) => ({
                    ...p,
                    categoryId: e.target.value,
                    linkedVehicleId: nextCategory?.vehicleLinked ? p.linkedVehicleId : "",
                    odometer: nextCategory?.vehicleLinked ? p.odometer : "",
                    linkedPropertyId: nextCategory?.propertyLinked ? p.linkedPropertyId : "",
                  }));
                }}
                 
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${form.categoryId ? "#1a7f3c" : "#e2e4e8"}`, borderRadius: 8, background: "#fff", fontSize: 13 }}>
                  <option value="">— Select category —</option>
                  {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ) : <div />}
            <Sel
              label={txType === "loan_receipt" ? "Receiving Account" : txType === "loan_payment" ? "Pay From Account" : "Account / Card"}
              value={form.sourceId}
              onChange={f("sourceId")}
              options={paymentSources}
              required
            />
          </Grid2>

          {/* Destination — for transfers, adjustments, loans */}
          {showDestination && (
            <Sel label="Destination Account / Card" value={form.destinationId} onChange={f("destinationId")}
              options={destinationOptions} required={requiresDestination(txType)} />
          )}

          {showLiability && liabilities.length > 0 && (
            <Sel
              label="Loan / Lender"
              value={form.linkedLiabilityId}
              onChange={f("linkedLiabilityId")}
              options={[
                { value: "", label: "-- Select loan or lender --" },
                ...liabilities.filter((liability) => !liability.archived).map((liability) => ({
                  value: liability.id,
                  label: liability.name,
                })),
              ]}
            />
          )}

          {/* Loan payment split */}
          {showLoanSplit && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Alert type="info">
                Regular mode: log the full payment amount and source account only. Detailed mode is optional and lets you split the payment into principal and interest for richer reports later.
              </Alert>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {form.subType === "mortgage"
                    ? "Cash planning uses the full mortgage payment; only interest is expense-like in detailed reporting."
                    : "Cash planning uses the full debt payment; principal and interest are optional details."}
                </div>
                <Btn
                  variant="secondary"
                  onClick={() => setShowLoanDetails((v) => !v)}
                 
                >
                  {showLoanDetails ? "Hide Detailed Split" : "Add Detailed Split"}
                </Btn>
              </div>
              {loanDetailsVisible && (
                <Grid2>
                  <Inp label="Principal Amount ($)" type="number" value={form.principalAmount} onChange={f("principalAmount")} placeholder="0.00" />
                  <Inp label="Interest Amount ($)" type="number" value={form.interestAmount} onChange={f("interestAmount")} placeholder="0.00" />
                </Grid2>
              )}
            </div>
          )}

          {/* Vehicle link */}
          {showVehicleLink && (
            <Grid2>
              <Sel label="Vehicle (optional)" value={form.linkedVehicleId} onChange={f("linkedVehicleId")}
                options={[{ value: "", label: "-- Select vehicle --" }, ...vehicles.map((v) => ({ value: v.id, label: v.name }))]} />
              <Inp label="Odometer (km)" type="number" value={form.odometer} onChange={f("odometer")} placeholder="e.g. 42500" />
            </Grid2>
          )}

          {showMortgageLink && (
            <Sel
              label="Mortgage"
              value={form.linkedHouseLoanId}
              onChange={(event) => {
                const mortgage = houseLoans.find((loan) => loan.id === event.target.value);
                setForm((previous) => ({
                  ...previous,
                  linkedHouseLoanId: event.target.value,
                  linkedPropertyId: mortgage?.propertyId ?? previous.linkedPropertyId,
                }));
              }}
              options={[
                { value: "", label: "— Select mortgage —" },
                ...houseLoans.map((loan) => ({ value: loan.id, label: loan.name })),
              ]}
              required
            />
          )}

          {/* Property link */}
          {showPropertyLink && (
            <Sel label="Property (optional)" value={form.linkedPropertyId} onChange={f("linkedPropertyId")}
              options={[{ value: "", label: "— Select property —" }, ...properties.filter((property) => !property.archived).map((property) => ({ value: property.id, label: property.name }))]} />
          )}

          {/* Balance preview */}
          {showBalancePreview && (() => {
            const amt = toFixed2(Number(form.amount));
            const srcAcct = accounts.find((a) => a.id === form.sourceId);
            const srcCard = cards.find((c) => c.id === form.sourceId);
            const dstAcct = accounts.find((a) => a.id === form.destinationId);
            const dstCard = cards.find((c) => c.id === form.destinationId);

            const isIncoming = ["income", "refund", "dividend", "loan_receipt"].includes(txType);
            const isOutgoing = ["expense", "tax_payment", "loan_payment", "withdrawal"].includes(txType);

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {srcAcct && (
                  <div style={{ fontSize: 12, color: isIncoming ? "#1a7f3c" : "#a31515" }}>
                    {srcAcct.name}: {fmtCAD(toFixed2(srcAcct.openingBalance + (isIncoming ? amt : -amt)))} after
                    <span style={{ color: "#9ca3af" }}> (currently {fmtCAD(srcAcct.openingBalance)})</span>
                  </div>
                )}
                {srcCard && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {srcCard.name}: {fmtCAD(toFixed2(srcCard.openingBalance + (isOutgoing ? amt : -amt)))} owed after
                    <span style={{ color: "#9ca3af" }}> (currently {fmtCAD(srcCard.openingBalance)})</span>
                  </div>
                )}
                {dstAcct && (
                  <div style={{ fontSize: 12, color: "#1a7f3c" }}>
                    → {dstAcct.name}: {fmtCAD(toFixed2(dstAcct.openingBalance + amt))} after
                    <span style={{ color: "#9ca3af" }}> (currently {fmtCAD(dstAcct.openingBalance)})</span>
                  </div>
                )}
                {dstCard && (
                  <div style={{ fontSize: 12, color: "#1a7f3c" }}>
                    → {dstCard.name}: {fmtCAD(toFixed2(dstCard.openingBalance - amt))} owed after
                    <span style={{ color: "#9ca3af" }}> (currently {fmtCAD(dstCard.openingBalance)})</span>
                  </div>
                )}
              </div>
            );
          })()}
          {isHistoricalEdit && (
            <Alert type="info">
              Historical transactions do not show a current balance preview because the posted result depends on ledger replay, not the current snapshot.
            </Alert>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}>
            <div>{form.id && <Btn variant="danger" onClick={handleDelete}>Delete</Btn>}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
              <Btn onClick={save}>{form.id ? "Save Changes" : "Add Entry"}</Btn>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
