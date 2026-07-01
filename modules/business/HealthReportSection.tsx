"use client";

import { useMemo, useState } from "react";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useCategories } from "@/modules/categories/useCategories";
import { useFixedPayments } from "@/modules/business/useFixedPayments";
import { useHouseLoans, useProperties, usePropertyTax, useVehicles } from "@/modules/business/useAssets";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { FixedPayment, getFixedPaymentKind } from "@/types/domain";
import { TYPE_LABELS, getSubTypeLabel, type Transaction } from "@/types/transaction";
import type { Category } from "@/types/category";
import { deleteCanonicalTransaction } from "@/services/transactionPipeline";
import { isSemanticDuplicate, transactionFingerprint } from "@/utils/transactionSemantics";

const DISMISSED_HEALTH_ISSUES_KEY = "finance_os_dismissed_health_issues";

type HealthSeverity = "high" | "medium" | "low";

type HealthIssue = {
  id: string;
  severity: HealthSeverity;
  title: string;
  detail: string;
  hint?: string;
  transactionId?: string;
  transactionType?: Transaction["type"];
  duplicateTransactions?: Transaction[];
  vehicleId?: string;
  houseLoanId?: string;
};

function loadDismissedHealthIssues() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_HEALTH_ISSUES_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveDismissedHealthIssues(ids: string[]) {
  localStorage.setItem(DISMISSED_HEALTH_ISSUES_KEY, JSON.stringify(ids));
}

function latestDate(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return [...dates].sort((a, b) => a.localeCompare(b)).at(-1) ?? null;
}

function summarizeTx(tx: Transaction): string {
  const type = TYPE_LABELS[tx.type];
  const subType = tx.subType ? getSubTypeLabel(tx.type, tx.subType) : undefined;
  return `${tx.date} - ${type}${subType ? ` / ${subType}` : ""} - ${tx.description}`;
}

function recurringLabel(fp: FixedPayment): string {
  const kind = getFixedPaymentKind(fp)
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
  return `${fp.name} (${kind})`;
}

function FixButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 8,
        border: "1px solid #d1d5db",
        background: "#fff",
        color: "#1f2937",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function categoryOptions(categories: Category[], txType: Transaction["type"]) {
  return categories.filter((category) => {
    if (txType === "expense") return category.type === "expense" || category.type === "both";
    if (txType === "income") return category.type === "income" || category.type === "both";
    return false;
  });
}

export function HealthReportSection({
  onOpenVehicle,
  onOpenHouseLoan,
}: {
  onOpenVehicle?: (id: string) => void;
  onOpenHouseLoan?: (id: string) => void;
}) {
  const { transactions, updateTransaction, reloadTransactions } = useTransactions();
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { categories } = useCategories();
  const { vehicles } = useVehicles();
  const { houseLoans } = useHouseLoans();
  const { properties } = useProperties();
  const { propertyTaxes } = usePropertyTax();
  const { fixedPayments } = useFixedPayments();
  const [categoryFixes, setCategoryFixes] = useState<Record<string, string>>({});
  const [dismissedHealthIssues, setDismissedHealthIssues] = useState<string[]>(loadDismissedHealthIssues);

  const issues = useMemo<HealthIssue[]>(() => {
    const nextIssues: HealthIssue[] = [];

    const accountIds = new Set(accounts.map((a) => a.id));
    const cardIds = new Set(cards.map((c) => c.id));
    const categoryIds = new Set(categories.map((c) => c.id));
    const vehicleIds = new Set(vehicles.map((v) => v.id));
    const houseLoanIds = new Set(houseLoans.map((h) => h.id));
    const propertyIds = new Set(properties.map((property) => property.id));
    const propertyTaxIds = new Set(propertyTaxes.map((p) => p.id));
    const propertyTaxPaymentIds = new Set(propertyTaxes.flatMap((p) => p.payments?.map((payment) => payment.id) ?? []));
    const fixedPaymentIds = new Set(fixedPayments.map((payment) => payment.id));
    const accountOrCardIds = new Set([...accountIds, ...cardIds]);

    transactions.forEach((tx) => {
      if ((tx.type === "expense" || tx.type === "income") && !tx.categoryId) {
        nextIssues.push({
          id: `uncat-${tx.id}`,
          severity: "high",
          title: "Uncategorized expense or income",
          detail: summarizeTx(tx),
          hint: "Assign a category so reporting and category filters stay reliable.",
          transactionId: tx.id,
          transactionType: tx.type,
        });
      }

      if (!accountOrCardIds.has(tx.sourceId)) {
        nextIssues.push({
          id: `src-${tx.id}`,
          severity: "high",
          title: "Broken source account/card reference",
          detail: `${summarizeTx(tx)} - sourceId=${tx.sourceId}`,
          hint: "This transaction points to an account or card that no longer exists.",
        });
      }

      if (tx.destinationId && !accountOrCardIds.has(tx.destinationId)) {
        nextIssues.push({
          id: `dest-${tx.id}`,
          severity: "high",
          title: "Broken destination account/card reference",
          detail: `${summarizeTx(tx)} - destinationId=${tx.destinationId}`,
          hint: "Transfers and linked postings should keep a valid destination reference.",
        });
      }

      if (tx.categoryId && !categoryIds.has(tx.categoryId)) {
        nextIssues.push({
          id: `cat-${tx.id}`,
          severity: "high",
          title: "Broken category reference",
          detail: `${summarizeTx(tx)} - categoryId=${tx.categoryId}`,
          hint: "Replace or restore the missing category so filters and reports stay accurate.",
        });
      }

      if (tx.linkedVehicleId && !vehicleIds.has(tx.linkedVehicleId)) {
        nextIssues.push({
          id: `veh-${tx.id}`,
          severity: "medium",
          title: "Broken linked vehicle reference",
          detail: `${summarizeTx(tx)} - linkedVehicleId=${tx.linkedVehicleId}`,
          hint: "Vehicle-linked transactions should point to a valid vehicle record.",
        });
      }

      if (tx.linkedPropertyId && !propertyIds.has(tx.linkedPropertyId)) {
        nextIssues.push({
          id: `prop-${tx.id}`,
          severity: "medium",
          title: "Broken linked property reference",
          detail: `${summarizeTx(tx)} - linkedPropertyId=${tx.linkedPropertyId}`,
          hint: "Property-linked transactions should map to a current house/property record.",
        });
      }
      if (tx.linkedHouseLoanId && !houseLoanIds.has(tx.linkedHouseLoanId)) {
        nextIssues.push({
          id: `mortgage-link-${tx.id}`,
          severity: "medium",
          title: "Broken linked mortgage reference",
          detail: `${summarizeTx(tx)} - linkedHouseLoanId=${tx.linkedHouseLoanId}`,
          hint: "Mortgage payments should point to a current mortgage record.",
        });
      }

      if ((tx.recurringOriginType && !tx.recurringOriginId) || (!tx.recurringOriginType && tx.recurringOriginId)) {
        nextIssues.push({
          id: `recurring-origin-incomplete-${tx.id}`,
          severity: "medium",
          title: "Recurring transaction has incomplete origin metadata",
          detail: summarizeTx(tx),
          hint: "Recurring-origin type and id should always be stored together.",
        });
      } else if (tx.recurringOriginType && tx.recurringOriginId && tx.recurringOriginType !== "tax_obligation") {
        const originExists = tx.recurringOriginType === "fixed_payment"
          ? fixedPaymentIds.has(tx.recurringOriginId)
          : tx.recurringOriginType === "vehicle"
            ? vehicleIds.has(tx.recurringOriginId)
            : tx.recurringOriginType === "house_loan"
              ? houseLoanIds.has(tx.recurringOriginId)
              : propertyTaxIds.has(tx.recurringOriginId) || propertyTaxPaymentIds.has(tx.recurringOriginId);
        if (!originExists) {
          nextIssues.push({
            id: `recurring-origin-broken-${tx.id}`,
            severity: "medium",
            title: "Broken recurring-origin reference",
            detail: `${summarizeTx(tx)} - origin=${tx.recurringOriginType}:${tx.recurringOriginId}`,
            hint: "The posted row points to a recurring parent that no longer exists.",
          });
        }
      }

      if (tx.type === "loan_payment" && tx.subType === "mortgage" && tx.principalAmount == null && tx.interestAmount == null) {
        nextIssues.push({
          id: `mort-split-${tx.id}`,
          severity: "low",
          title: "Mortgage payment has no principal or interest split",
          detail: summarizeTx(tx),
          hint: "Regular mode is fine without this, but detailed debt reporting will be less precise.",
        });
      }
      if (
        tx.type === "loan_payment"
        && tx.subType === "bank_loan"
        && tx.linkedVehicleId
        && tx.principalAmount == null
        && tx.interestAmount == null
      ) {
        nextIssues.push({
          id: `vehicle-split-${tx.id}`,
          severity: "low",
          title: "Financed-vehicle payment has no principal or interest split",
          detail: summarizeTx(tx),
          hint: "Cash reporting remains correct, but the vehicle liability cannot be reduced until the split is supplied.",
        });
      }
    });

    properties.forEach((property) => {
      if (!property.id) {
        nextIssues.push({
          id: `property-empty-id-${property.name}`,
          severity: "high",
          title: "Property has no stable id",
          detail: property.name || "Unnamed property",
          hint: "Property records need stable ids before mortgages, taxes, and transactions can link safely.",
        });
      }
    });

    houseLoans.forEach((loan) => {
      if (!loan.propertyId || !propertyIds.has(loan.propertyId)) {
        nextIssues.push({
          id: `loan-property-${loan.id}`,
          severity: "high",
          title: "Mortgage has no valid Property parent",
          detail: `${loan.name} - propertyId=${loan.propertyId ?? "missing"}`,
          hint: "Link the mortgage to a Property so debt and carrying-cost reporting stay coherent.",
          houseLoanId: loan.id,
        });
      }
    });

    propertyTaxes.forEach((record) => {
      if (!record.propertyId || !propertyIds.has(record.propertyId)) {
        nextIssues.push({
          id: `tax-property-${record.id}`,
          severity: "high",
          title: "Property-tax record has no valid Property parent",
          detail: `${record.name} - propertyId=${record.propertyId ?? "missing"}`,
          hint: "Link the tax record to a Property so tax history is not orphaned.",
        });
      }
    });

    const duplicateGroups: Transaction[][] = [];
    transactions.forEach((tx) => {
      if (tx.status === "pending" || tx.type === "adjustment") return;
      const group = duplicateGroups.find((candidateGroup) =>
        isSemanticDuplicate(tx, candidateGroup[0])
      );
      if (group) group.push(tx);
      else duplicateGroups.push([tx]);
    });

    duplicateGroups.forEach((group) => {
      if (group.length < 2) return;
      const key = transactionFingerprint(group[0]);
      const issueId = `duplicate-${key}-${group.map((tx) => tx.id).sort().join("-")}`;
      if (dismissedHealthIssues.includes(issueId)) return;
      const [first] = group;
      nextIssues.push({
        id: issueId,
        severity: "medium",
        title: "Possible duplicate transactions",
        detail: `${first.date} - ${TYPE_LABELS[first.type]} - ${Number(first.amount).toFixed(2)} - ${group.length} matching rows`,
        hint: "Same purpose, date, amount, accounts, and linked item. Delete the extra row, or dismiss this warning if both rows are legitimate.",
        duplicateTransactions: group,
      });
    });

    vehicles.forEach((vehicle) => {
      const latestVehicleTx = latestDate(
        transactions
          .filter((tx) => tx.linkedVehicleId === vehicle.id || tx.description.includes(vehicle.name))
          .map((tx) => tx.date)
      );
      if (latestVehicleTx && vehicle.nextPaymentDate && vehicle.nextPaymentDate < latestVehicleTx) {
        nextIssues.push({
          id: `vehicle-next-${vehicle.id}`,
          severity: "medium",
          title: "Vehicle next payment date looks stale",
          detail: `${vehicle.name} - nextPaymentDate=${vehicle.nextPaymentDate} - latest linked activity=${latestVehicleTx}`,
          hint: "Next due date should usually move forward as lease or finance payments are logged.",
          vehicleId: vehicle.id,
        });
      }
    });

    houseLoans.forEach((loan) => {
      const latestMortgageTx = latestDate(
        transactions
          .filter((tx) =>
            tx.subType === "mortgage"
            && (
              tx.linkedHouseLoanId === loan.id
              || (tx.recurringOriginType === "house_loan" && tx.recurringOriginId === loan.id)
              || tx.linkedPropertyId === loan.propertyId
              || tx.description.includes(loan.name)
            )
          )
          .map((tx) => tx.date)
      );
      if (latestMortgageTx && loan.nextPaymentDate && loan.nextPaymentDate < latestMortgageTx) {
        nextIssues.push({
          id: `loan-next-${loan.id}`,
          severity: "medium",
          title: "House loan next payment date looks stale",
          detail: `${loan.name} - nextPaymentDate=${loan.nextPaymentDate} - latest mortgage activity=${latestMortgageTx}`,
          hint: "This usually means schedule metadata drifted behind the posted ledger.",
          houseLoanId: loan.id,
        });
      }
    });

    fixedPayments.forEach((fp) => {
      if (fp.ownerType && !fp.ownerId) {
        nextIssues.push({
          id: `owner-${fp.id}`,
          severity: "medium",
          title: "Recurring item has an owner type but no owner id",
          detail: recurringLabel(fp),
          hint: "Parent-owned recurring rows should keep both ownerType and ownerId together.",
        });
      }
      if (fp.ownerType && fp.ownerId) {
        const ownerExists = fp.ownerType === "account"
          ? accountIds.has(fp.ownerId)
          : fp.ownerType === "card"
            ? cardIds.has(fp.ownerId)
            : fp.ownerType === "vehicle"
              ? vehicleIds.has(fp.ownerId)
              : fp.ownerType === "house_loan"
                ? houseLoanIds.has(fp.ownerId)
                : propertyIds.has(fp.ownerId);
        if (!ownerExists) {
          nextIssues.push({
            id: `owner-broken-${fp.id}`,
            severity: "medium",
            title: "Recurring item has a broken parent reference",
            detail: recurringLabel(fp),
            hint: `Owner ${fp.ownerType}:${fp.ownerId} was not found.`,
          });
        }
      }
      if (getFixedPaymentKind(fp) === "planned_payment" && fp.transactionType === "transfer") {
        if (!fp.destinationId) {
          nextIssues.push({
            id: `planned-dest-${fp.id}`,
            severity: "high",
            title: "Planned transfer is missing destination",
            detail: recurringLabel(fp),
            hint: "Transfer-style planned payments should always specify where the money is going.",
          });
        }
        if (!fp.subType) {
          nextIssues.push({
            id: `planned-sub-${fp.id}`,
            severity: "medium",
            title: "Planned transfer is missing transfer subtype",
            detail: recurringLabel(fp),
            hint: "Subtypes like TFSA, RRSP, or bank transfer make these items easier to track and filter.",
          });
        }
      }
      if ((getFixedPaymentKind(fp) === "subscription" || getFixedPaymentKind(fp) === "property_tax") && !fp.categoryId && fp.transactionType !== "transfer") {
        nextIssues.push({
          id: `recur-cat-${fp.id}`,
          severity: "low",
          title: "Recurring expense has no default category",
          detail: recurringLabel(fp),
          hint: "This will still log, but reports may be less clear until a category is chosen.",
        });
      }
    });

    return nextIssues.sort((a, b) => {
      const rank: Record<HealthSeverity, number> = { high: 0, medium: 1, low: 2 };
      return rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title);
    });
  }, [accounts, cards, categories, dismissedHealthIssues, fixedPayments, houseLoans, properties, propertyTaxes, transactions, vehicles]);

  const highCount = issues.filter((issue) => issue.severity === "high").length;
  const uncategorizedCount = issues.filter((issue) => issue.title === "Uncategorized expense or income").length;
  const brokenRefCount = issues.filter((issue) => issue.title.includes("Broken")).length;
  const staleScheduleCount = issues.filter((issue) => issue.title.includes("stale")).length;
  const recurringCount = issues.filter((issue) => issue.title.includes("Recurring") || issue.title.includes("Planned transfer")).length;
  const duplicateCount = issues.filter((issue) => issue.title === "Possible duplicate transactions").length;
  const uncategorizedMap = new Map(
    transactions
      .filter((tx) => (tx.type === "expense" || tx.type === "income") && !tx.categoryId)
      .map((tx) => [tx.id, tx] as const)
  );

  function deleteTransactionFromHealth(transactionId: string) {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    deleteCanonicalTransaction(transactionId);
    reloadTransactions();
  }

  function dismissHealthIssue(issueId: string) {
    const next = [...new Set([...dismissedHealthIssues, issueId])];
    setDismissedHealthIssues(next);
    saveDismissedHealthIssues(next);
  }

  const statCard = (label: string, value: number, color: string) => (
    <div style={{ flex: 1, minWidth: 160, padding: "12px 14px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 18, color }}>{value}</div>
    </div>
  );

  const severityColor: Record<HealthSeverity, { bg: string; fg: string }> = {
    high: { bg: "#fee2e2", fg: "#991b1b" },
    medium: { bg: "#fef3c7", fg: "#92400e" },
    low: { bg: "#dbeafe", fg: "#1d4ed8" },
  };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Health Report</div>
      <div style={{ color: "#556070", fontSize: 13, marginBottom: 16 }}>
        Warning-first data quality scan. This page is read-only and highlights integrity, schedule, and modeling gaps without blocking normal use.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {statCard("Total Issues", issues.length, highCount > 0 ? "#a31515" : "#1a7f3c")}
        {statCard("Uncategorized", uncategorizedCount, "#a05c00")}
        {statCard("Broken References", brokenRefCount, "#a31515")}
        {statCard("Stale Schedules", staleScheduleCount, "#1a5fa8")}
        {statCard("Recurring Gaps", recurringCount, "#6b21a8")}
        {statCard("Duplicates", duplicateCount, "#a05c00")}
      </div>

      {issues.length === 0 ? (
        <div style={{ padding: 18, border: "1px solid #d1fae5", background: "#ecfdf5", borderRadius: 10, color: "#065f46", fontSize: 13 }}>
          No issues detected right now. The ledger, links, and recurring metadata all passed the current health checks.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {issues.map((issue) => (
            <div key={issue.id} style={{ border: "1px solid #e2e4e8", background: "#fff", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{issue.title}</div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: severityColor[issue.severity].bg,
                    color: severityColor[issue.severity].fg,
                  }}
                >
                  {issue.severity}
                </span>
              </div>
              <div style={{ color: "#334155", fontSize: 13, marginBottom: issue.hint ? 4 : 0 }}>{issue.detail}</div>
              {issue.hint && <div style={{ color: "#6b7280", fontSize: 12 }}>{issue.hint}</div>}
              {issue.duplicateTransactions && (
                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  {issue.duplicateTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" }}
                    >
                      <div style={{ fontSize: 12, color: "#334155" }}>
                        <strong>{tx.description}</strong> - {tx.date} - {Number(tx.amount).toFixed(2)} - id={tx.id}
                      </div>
                      <FixButton onClick={() => deleteTransactionFromHealth(tx.id)}>Delete This Row</FixButton>
                    </div>
                  ))}
                  <div>
                    <FixButton onClick={() => dismissHealthIssue(issue.id)}>Dismiss as Legit Duplicate</FixButton>
                  </div>
                </div>
              )}
              {issue.transactionId && issue.transactionType && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                  <select
                    value={categoryFixes[issue.transactionId] ?? ""}
                    onChange={(e) => setCategoryFixes((current) => ({ ...current, [issue.transactionId!]: e.target.value }))}
                    style={{ minWidth: 220, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 12 }}
                  >
                    <option value="">Select category...</option>
                    {categoryOptions(categories, issue.transactionType).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <FixButton
                    onClick={() => {
                      const tx = uncategorizedMap.get(issue.transactionId!);
                      const categoryId = categoryFixes[issue.transactionId!];
                      if (!tx || !categoryId) return;
                      updateTransaction({ ...tx, categoryId });
                    }}
                  >
                    Save Category
                  </FixButton>
                </div>
              )}
              {issue.vehicleId && onOpenVehicle && (
                <div style={{ marginTop: 10 }}>
                  <FixButton onClick={() => onOpenVehicle(issue.vehicleId!)}>Open Vehicle</FixButton>
                </div>
              )}
              {issue.houseLoanId && onOpenHouseLoan && (
                <div style={{ marginTop: 10 }}>
                  <FixButton onClick={() => onOpenHouseLoan(issue.houseLoanId!)}>Open Mortgage</FixButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
