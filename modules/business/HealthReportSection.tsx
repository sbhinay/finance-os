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
import { TransactionForm } from "./TransactionForm";
import { useLiabilities } from "./useLiabilities";
import { toFixed2 } from "@/utils/finance";
import { isFinanceOsEstimatedSplit } from "@/utils/debtAllocation";
import { ActionButton, MetricCard, MetricGrid, PageHeader, StatusChip } from "@/components/ui";
import { theme } from "@/lib/theme";
import { useBusiness } from "./useBusiness";
import { getCorporateWithdrawalCandidates, isCorporateWithdrawalResolved } from "@/utils/corporateWithdrawals";

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
  openCRAReview?: boolean;
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
  return <ActionButton tone="secondary" compact onClick={onClick}>{children}</ActionButton>;
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
  onOpenCRAReview,
}: {
  onOpenVehicle?: (id: string) => void;
  onOpenHouseLoan?: (id: string) => void;
  onOpenCRAReview?: () => void;
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
  const { liabilities } = useLiabilities();
  const { business } = useBusiness();
  const [categoryFixes, setCategoryFixes] = useState<Record<string, string>>({});
  const [dismissedHealthIssues, setDismissedHealthIssues] = useState<string[]>(loadDismissedHealthIssues);
  const [editTransaction, setEditTransaction] = useState<Transaction | undefined>(undefined);

  const issues = useMemo<HealthIssue[]>(() => {
    const nextIssues: HealthIssue[] = [];

    const accountIds = new Set(accounts.map((a) => a.id));
    const cardIds = new Set(cards.map((c) => c.id));
    const categoryIds = new Set(categories.map((c) => c.id));
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const vehicleIds = new Set(vehicles.map((v) => v.id));
    const houseLoanIds = new Set(houseLoans.map((h) => h.id));
    const propertyIds = new Set(properties.map((property) => property.id));
    const propertyTaxIds = new Set(propertyTaxes.map((p) => p.id));
    const propertyTaxPaymentIds = new Set(propertyTaxes.flatMap((p) => p.payments?.map((payment) => payment.id) ?? []));
    const fixedPaymentIds = new Set(fixedPayments.map((payment) => payment.id));
    const liabilityIds = new Set(liabilities.map((liability) => liability.id));
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
          transactionId: tx.id,
        });
      }

      if (tx.destinationId && !accountOrCardIds.has(tx.destinationId)) {
        nextIssues.push({
          id: `dest-${tx.id}`,
          severity: "high",
          title: "Broken destination account/card reference",
          detail: `${summarizeTx(tx)} - destinationId=${tx.destinationId}`,
          hint: "Transfers and linked postings should keep a valid destination reference.",
          transactionId: tx.id,
        });
      }

      if (tx.categoryId && !categoryIds.has(tx.categoryId)) {
        nextIssues.push({
          id: `cat-${tx.id}`,
          severity: "high",
          title: "Broken category reference",
          detail: `${summarizeTx(tx)} - categoryId=${tx.categoryId}`,
          hint: "Replace or restore the missing category so filters and reports stay accurate.",
          transactionId: tx.id,
        });
      }

      if (tx.linkedVehicleId && !vehicleIds.has(tx.linkedVehicleId)) {
        nextIssues.push({
          id: `veh-${tx.id}`,
          severity: "medium",
          title: "Broken linked vehicle reference",
          detail: `${summarizeTx(tx)} - linkedVehicleId=${tx.linkedVehicleId}`,
          hint: "Vehicle-linked transactions should point to a valid vehicle record.",
          transactionId: tx.id,
        });
      }
      if (
        tx.linkedVehicleId
        && vehicleIds.has(tx.linkedVehicleId)
        && tx.purpose !== "vehicle_lease_payment"
        && tx.purpose !== "vehicle_finance_payment"
        && tx.subType !== "bank_loan"
        && !categoryById.get(tx.categoryId ?? "")?.vehicleLinked
      ) {
        nextIssues.push({
          id: `vehicle-link-suspicious-${tx.id}`,
          severity: "medium",
          title: "Vehicle link looks unrelated to final category",
          detail: summarizeTx(tx),
          hint: "This row is linked to a vehicle, but its current category does not ask for vehicle details. Edit it and clear the vehicle if this was left over from a previous category choice.",
          transactionId: tx.id,
        });
      }

      if (tx.linkedPropertyId && !propertyIds.has(tx.linkedPropertyId)) {
        nextIssues.push({
          id: `prop-${tx.id}`,
          severity: "medium",
          title: "Broken linked property reference",
          detail: `${summarizeTx(tx)} - linkedPropertyId=${tx.linkedPropertyId}`,
          hint: "Property-linked transactions should map to a current house/property record.",
          transactionId: tx.id,
        });
      }
      if (
        tx.linkedPropertyId
        && propertyIds.has(tx.linkedPropertyId)
        && tx.purpose !== "mortgage_payment"
        && tx.subType !== "mortgage"
        && !tx.linkedHouseLoanId
        && !categoryById.get(tx.categoryId ?? "")?.propertyLinked
      ) {
        nextIssues.push({
          id: `property-link-suspicious-${tx.id}`,
          severity: "medium",
          title: "Property link looks unrelated to final category",
          detail: summarizeTx(tx),
          hint: "This row is linked to a property, but its current category does not ask for property details. Edit it and clear the property if this was left over from a previous category choice.",
          transactionId: tx.id,
        });
      }
      if (tx.linkedHouseLoanId && !houseLoanIds.has(tx.linkedHouseLoanId)) {
        nextIssues.push({
          id: `mortgage-link-${tx.id}`,
          severity: "medium",
          title: "Broken linked mortgage reference",
          detail: `${summarizeTx(tx)} - linkedHouseLoanId=${tx.linkedHouseLoanId}`,
          hint: "Mortgage payments should point to a current mortgage record.",
          transactionId: tx.id,
        });
      }
      if (tx.linkedLiabilityId && !liabilityIds.has(tx.linkedLiabilityId)) {
        nextIssues.push({
          id: `liability-link-${tx.id}`,
          severity: "high",
          title: "Broken linked lender reference",
          detail: `${summarizeTx(tx)} - linkedLiabilityId=${tx.linkedLiabilityId}`,
          hint: "Relink this borrowing or repayment to an existing lender, or remove the stale reference.",
          transactionId: tx.id,
        });
      }
      if (
        (tx.type === "loan_receipt" || (tx.type === "loan_payment" && tx.subType !== "mortgage" && !tx.linkedVehicleId))
        && !tx.linkedLiabilityId
      ) {
        nextIssues.push({
          id: `loan-unlinked-${tx.id}`,
          severity: "medium",
          title: "Loan transaction has no lender",
          detail: summarizeTx(tx),
          hint: "Link the row to its lender so current owing and lender history remain complete.",
          transactionId: tx.id,
        });
      }
      if (
        tx.type === "loan_payment"
        && (tx.principalAmount != null || tx.interestAmount != null)
        && toFixed2((tx.principalAmount ?? 0) + (tx.interestAmount ?? 0)) !== toFixed2(tx.amount)
      ) {
        nextIssues.push({
          id: `loan-split-invalid-${tx.id}`,
          severity: "high",
          title: "Debt payment split does not equal cash payment",
          detail: summarizeTx(tx),
          hint: "Correct principal and interest so their sum exactly matches the payment amount.",
          transactionId: tx.id,
        });
      }

      if ((tx.recurringOriginType && !tx.recurringOriginId) || (!tx.recurringOriginType && tx.recurringOriginId)) {
        nextIssues.push({
          id: `recurring-origin-incomplete-${tx.id}`,
          severity: "medium",
          title: "Recurring transaction has incomplete origin metadata",
          detail: summarizeTx(tx),
          hint: "Recurring-origin type and id should always be stored together.",
          transactionId: tx.id,
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
            transactionId: tx.id,
          });
        }
      }

      if (tx.type === "loan_payment" && tx.subType === "mortgage" && isFinanceOsEstimatedSplit(tx)) {
        nextIssues.push({
          id: `mort-generated-split-${tx.id}`,
          severity: "low",
          title: "Mortgage payment has a stored generated split",
          detail: summarizeTx(tx),
          hint: "Debt Details now recalculates estimated splits dynamically. Edit and save this row to remove the legacy generated override if it was not statement-confirmed.",
          transactionId: tx.id,
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
          transactionId: tx.id,
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

    const corporateWithdrawalReviews = business.craReviewProfile?.corporateWithdrawalReviews ?? {};
    getCorporateWithdrawalCandidates(transactions, accounts, corporateWithdrawalReviews)
      .filter((candidate) => !isCorporateWithdrawalResolved(candidate.review))
      .forEach(({ transaction, source, destination }) => {
        nextIssues.push({
          id: `corporate-withdrawal-${transaction.id}`,
          severity: "medium",
          title: "Corporate withdrawal needs purpose review",
          detail: `${transaction.date} - ${transaction.description || "Corporate withdrawal"} - ${transaction.amount.toFixed(2)} - ${source.name} to ${destination?.name ?? "external / unrecorded destination"}`,
          hint: "Classify the legal/tax purpose separately in CRA Review. The original ledger transaction and balances will remain unchanged.",
          openCRAReview: true,
        });
      });

    return nextIssues.filter((issue) => !dismissedHealthIssues.includes(issue.id)).sort((a, b) => {
      const rank: Record<HealthSeverity, number> = { high: 0, medium: 1, low: 2 };
      return rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title);
    });
  }, [accounts, business.craReviewProfile?.corporateWithdrawalReviews, cards, categories, dismissedHealthIssues, fixedPayments, houseLoans, liabilities, properties, propertyTaxes, transactions, vehicles]);

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

  function restoreDismissedIssues() {
    setDismissedHealthIssues([]);
    saveDismissedHealthIssues([]);
  }

  const severityTone: Record<HealthSeverity, "danger" | "warning" | "primary"> = {
    high: "danger",
    medium: "warning",
    low: "primary",
  };

  const severityAccent: Record<HealthSeverity, string> = {
    high: theme.colors.danger,
    medium: theme.colors.warning,
    low: theme.colors.primary,
  };

  return (
    <div>
      <PageHeader
        title="Health Report"
        subtitle="Warning-first data quality scan with canonical edit, delete, relink, and dismissal controls."
      />
      {dismissedHealthIssues.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <FixButton onClick={restoreDismissedIssues}>Restore {dismissedHealthIssues.length} Dismissed Warning{dismissedHealthIssues.length === 1 ? "" : "s"}</FixButton>
        </div>
      )}

      <MetricGrid>
        <MetricCard label="Total Issues" value={String(issues.length)} tone={highCount > 0 ? "danger" : "success"} />
        <MetricCard label="Uncategorized" value={String(uncategorizedCount)} tone="warning" />
        <MetricCard label="Broken References" value={String(brokenRefCount)} tone="danger" />
        <MetricCard label="Stale Schedules" value={String(staleScheduleCount)} tone="primary" />
        <MetricCard label="Recurring Gaps" value={String(recurringCount)} tone="secondary" />
        <MetricCard label="Duplicates" value={String(duplicateCount)} tone="warning" />
      </MetricGrid>

      {issues.length === 0 ? (
        <div className="finance-card" style={{ padding: 18, border: "1px solid #d1fae5", background: theme.colors.successSoft, borderRadius: theme.radius.md, color: "#065f46", fontSize: 13 }}>
          No issues detected right now. The ledger, links, and recurring metadata all passed the current health checks.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="finance-card"
              style={{
                border: `1px solid ${theme.colors.border}`,
                borderLeft: `4px solid ${severityAccent[issue.severity]}`,
                background: "rgba(255,255,255,0.94)",
                borderRadius: theme.radius.md,
                padding: 15,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                <div style={{ fontWeight: 760, fontSize: 14, color: theme.colors.text }}>{issue.title}</div>
                <StatusChip tone={severityTone[issue.severity]}>{issue.severity}</StatusChip>
              </div>
              <div style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: issue.hint ? 4 : 0 }}>{issue.detail}</div>
              {issue.hint && <div style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 1.45 }}>{issue.hint}</div>}
              {issue.duplicateTransactions && (
                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  {issue.duplicateTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: theme.colors.surfaceAlt }}
                    >
                      <div style={{ fontSize: 12, color: theme.colors.textSoft }}>
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
                    style={{ minWidth: 220, padding: "7px 10px", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: theme.colors.surface, fontSize: 12 }}
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
              {issue.transactionId && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <FixButton onClick={() => {
                    const transaction = transactions.find((item) => item.id === issue.transactionId);
                    if (transaction) setEditTransaction(transaction);
                  }}>Edit / Relink Transaction</FixButton>
                  <FixButton onClick={() => deleteTransactionFromHealth(issue.transactionId!)}>Delete Transaction</FixButton>
                </div>
              )}
              {!issue.duplicateTransactions && issue.severity !== "high" && (
                <div style={{ marginTop: 10 }}>
                  <FixButton onClick={() => dismissHealthIssue(issue.id)}>Dismiss Warning</FixButton>
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
              {issue.openCRAReview && onOpenCRAReview && (
                <div style={{ marginTop: 10 }}>
                  <FixButton onClick={onOpenCRAReview}>Open CRA Review</FixButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <TransactionForm
        open={Boolean(editTransaction)}
        initial={editTransaction}
        title="Correct Transaction"
        onClose={() => setEditTransaction(undefined)}
        onSaved={() => {
          setEditTransaction(undefined);
          reloadTransactions();
        }}
      />
    </div>
  );
}
