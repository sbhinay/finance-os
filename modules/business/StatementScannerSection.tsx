"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useCategories } from "@/modules/categories/useCategories";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { persistCanonicalTransactions } from "@/services/transactionPipeline";
import type { StatementExtractionResult, StatementScannerCandidate } from "@/types/statementScanner";
import type { TransactionPurpose } from "@/types/transaction";
import { fmtCAD, uid } from "@/utils/finance";
import { classifyScannerDuplicate, scannerCandidateToTransaction } from "@/utils/statementScanner";
import { theme } from "@/lib/theme";
import { ActionButton, PageHeader, StatusChip, SurfaceCard, Toolbar } from "@/components/ui";

const PURPOSE_OPTIONS: Array<{ value: StatementScannerCandidate["purpose"]; label: string }> = [
  { value: "general_expense", label: "Expense" },
  { value: "general_income", label: "Income" },
  { value: "purchase_refund", label: "Refund" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit_card_payment", label: "Credit Card Payment" },
  { value: "loc_draw", label: "LOC Draw" },
];

interface ScannerStatus {
  provider: string;
  configured: boolean;
  mode: "external" | "local_fixture";
  message: string;
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "8px 10px",
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  background: theme.colors.surface,
  color: theme.colors.text,
  fontSize: 12,
};

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return <ActionButton tone={variant === "primary" ? "primary" : "secondary"} onClick={onClick} disabled={disabled}>{children}</ActionButton>;
}

function requiresDestination(purpose: TransactionPurpose) {
  return ["bank_transfer", "credit_card_payment", "loc_draw"].includes(purpose);
}

export function StatementScannerSection() {
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { categories } = useCategories();
  const { transactions, reloadTransactions } = useTransactions();
  const [statementAccountId, setStatementAccountId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<StatementScannerCandidate[]>([]);
  const [providerInfo, setProviderInfo] = useState("");
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus | null>(null);
  const [summary, setSummary] = useState<{ added: number; skipped: number; attention: number } | null>(null);

  const sources = useMemo(() => [
    ...accounts.filter((account) => account.active !== false).map((account) => ({ id: account.id, name: account.name, kind: "account" as const })),
    ...cards.filter((card) => card.active !== false).map((card) => ({ id: card.id, name: card.name, kind: "card" as const })),
  ], [accounts, cards]);

  useEffect(() => {
    let cancelled = false;
    async function loadScannerStatus() {
      try {
        const response = await fetch("/api/statement-scanner", { method: "GET", cache: "no-store" });
        const payload = await response.json() as ScannerStatus;
        if (!cancelled) setScannerStatus(payload);
      } catch {
        if (!cancelled) {
          setScannerStatus({
            provider: "unknown",
            configured: false,
            mode: "external",
            message: "Scanner provider status is unavailable.",
          });
        }
      }
    }
    void loadScannerStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  function classify(candidate: StatementScannerCandidate) {
    return { ...candidate, ...classifyScannerDuplicate(candidate, transactions) };
  }

  function updateCandidate(id: string, patch: Partial<StatementScannerCandidate>) {
    setCandidates((current) => current.map((candidate) =>
      candidate.id === id ? classify({ ...candidate, ...patch }) : candidate
    ));
    setSummary(null);
  }

  async function scan() {
    if (!statementAccountId || !files.length || !privacyAccepted || scannerStatus?.configured === false) return;
    setLoading(true);
    setError("");
    setSummary(null);
    try {
      const body = new FormData();
      files.forEach((file) => body.append("images", file));
      body.append("categories", JSON.stringify(categories.map(({ id, name, type }) => ({ id, name, type }))));
      body.append("accounts", JSON.stringify(sources.map((source) => ({
        ...source,
        last4: source.kind === "account"
          ? accounts.find((account) => account.id === source.id)?.accountNumber?.slice(-4)
          : undefined,
      }))));
      const response = await fetch("/api/statement-scanner", { method: "POST", body });
      const payload = await response.json() as StatementExtractionResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Statement extraction failed.");

      const next = payload.transactions.map((transaction) => {
        const isCardPayment = transaction.purpose === "credit_card_payment";
        const categoryExists = categories.some((category) => category.id === transaction.suggestedCategoryId);
        const candidate: StatementScannerCandidate = {
          ...transaction,
          id: uid(),
          enabled: true,
          sourceId: isCardPayment ? "" : statementAccountId,
          destinationId: isCardPayment ? statementAccountId : undefined,
          categoryId: categoryExists ? transaction.suggestedCategoryId : undefined,
          tag: "Personal",
        };
        const classified = classify(candidate);
        return classified.duplicateLevel === "definite"
          ? { ...classified, enabled: false }
          : classified;
      });
      setCandidates(next);
      setProviderInfo(`${payload.provider} | ${payload.model}${payload.accountHint ? ` | hint: ${payload.accountHint}` : ""}`);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Statement extraction failed.");
    } finally {
      setLoading(false);
    }
  }

  function validateRows() {
    const errors: string[] = [];
    candidates.filter((candidate) => candidate.enabled).forEach((candidate, index) => {
      if (!candidate.sourceId) errors.push(`Row ${index + 1} needs a source account/card.`);
      if (!(candidate.amount > 0)) errors.push(`Row ${index + 1} needs a positive amount.`);
      if (!candidate.date || !candidate.description.trim()) errors.push(`Row ${index + 1} needs a date and description.`);
      if (requiresDestination(candidate.purpose) && !candidate.destinationId) errors.push(`Row ${index + 1} needs a destination.`);
      if (candidate.sourceId && candidate.sourceId === candidate.destinationId) errors.push(`Row ${index + 1} source and destination must differ.`);
    });
    return errors;
  }

  function confirmImport() {
    const enabled = candidates.filter((candidate) => candidate.enabled);
    const rowErrors = validateRows();
    if (rowErrors.length) {
      setError(rowErrors.join(" "));
      return;
    }
    const built = enabled.map(scannerCandidateToTransaction);
    const persisted = persistCanonicalTransactions(built);
    const attention = enabled.filter((candidate) =>
      candidate.confidence !== "high"
      || (["general_expense", "general_income", "purchase_refund"].includes(candidate.purpose) && !candidate.categoryId)
    ).length;
    setSummary({
      added: persisted.length,
      skipped: candidates.length - enabled.length + (enabled.length - persisted.length),
      attention,
    });
    reloadTransactions();
    setCandidates([]);
    setFiles([]);
    setProviderInfo("");
    setError("");
  }

  return (
    <div>
      <PageHeader
        title="Scan Statement"
        subtitle="Extract statement images into editable transaction candidates before anything is written."
      />
      <SurfaceCard style={{ padding: 12, background: "#f0f9ff", fontSize: 12, color: "#0c4a6e", lineHeight: 1.5, marginBottom: 14 }}>
        Selected images are sent to the configured external AI provider for extraction. FinanceOS does not save the images, and candidate transactions remain temporary until you confirm import. Provider-side handling and retention follow your provider account and API terms.
      </SurfaceCard>
      {scannerStatus && (
        <SurfaceCard style={{
          padding: 10,
          border: `1px solid ${scannerStatus.configured ? "#bbf7d0" : "#fecaca"}`,
          background: scannerStatus.configured ? "#f0fdf4" : "#fef2f2",
          color: scannerStatus.configured ? "#166534" : "#991b1b",
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.45,
          marginBottom: 14,
        }}>
          <strong>Provider:</strong> {scannerStatus.provider} ({scannerStatus.mode === "local_fixture" ? "local fixture" : "external"})
          {" - "}
          {scannerStatus.message}
        </SurfaceCard>
      )}

      <SurfaceCard accent={theme.colors.primary} style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Statement account/card
          <select value={statementAccountId} onChange={(event) => setStatementAccountId(event.target.value)} style={{ ...inputStyle, marginTop: 5 }}>
            <option value="">Select account/card...</option>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Statement image(s)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))}
            style={{ ...inputStyle, marginTop: 5 }}
          />
        </label>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: theme.colors.textSoft, marginBottom: 12 }}>
        <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
        I consent to sending these images to the configured AI provider for this extraction request.
      </label>
      <Button onClick={scan} disabled={loading || !statementAccountId || !files.length || !privacyAccepted || scannerStatus?.configured === false}>
        {loading ? "Extracting..." : `Extract ${files.length || ""} Image${files.length === 1 ? "" : "s"}`}
      </Button>
      </SurfaceCard>

      {error && <SurfaceCard style={{ marginTop: 12, padding: 10, border: "1px solid #fecaca", color: "#991b1b", background: "#fef2f2", fontSize: 12 }}>{error}</SurfaceCard>}
      {summary && (
        <SurfaceCard style={{ marginTop: 12, padding: 12, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", fontSize: 13 }}>
          Added {summary.added}, skipped {summary.skipped}, attention recommended for {summary.attention}.
        </SurfaceCard>
      )}

      {candidates.length > 0 && (
        <SurfaceCard style={{ marginTop: 18, padding: 14 }}>
          <Toolbar style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <strong>{candidates.length} candidate transaction{candidates.length === 1 ? "" : "s"}</strong>
            <span style={{ fontSize: 11, color: theme.colors.textMuted }}>{providerInfo}</span>
          </Toolbar>
          <div className="finance-table" style={{ overflowX: "auto", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm }}>
            {candidates.map((candidate) => (
              <div key={candidate.id} style={{ display: "grid", gridTemplateColumns: "34px 115px minmax(180px, 1fr) 105px 150px 160px 160px 145px 115px", gap: 7, padding: 9, borderBottom: `1px solid ${theme.colors.border}`, minWidth: 1180, alignItems: "center", background: candidate.enabled ? theme.colors.surface : theme.colors.surfaceAlt }}>
                <input type="checkbox" checked={candidate.enabled} onChange={(event) => updateCandidate(candidate.id, { enabled: event.target.checked })} />
                <input type="date" value={candidate.date} onChange={(event) => updateCandidate(candidate.id, { date: event.target.value })} style={inputStyle} />
                <input value={candidate.description} onChange={(event) => updateCandidate(candidate.id, { description: event.target.value })} style={inputStyle} />
                <input type="number" min="0.01" step="0.01" value={candidate.amount} onChange={(event) => updateCandidate(candidate.id, { amount: Number(event.target.value) })} style={inputStyle} />
                <select value={candidate.purpose} onChange={(event) => updateCandidate(candidate.id, { purpose: event.target.value as StatementScannerCandidate["purpose"] })} style={inputStyle}>
                  {PURPOSE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select value={candidate.sourceId} onChange={(event) => updateCandidate(candidate.id, { sourceId: event.target.value })} style={inputStyle}>
                  <option value="">Source...</option>
                  {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                </select>
                <select value={candidate.destinationId ?? ""} onChange={(event) => updateCandidate(candidate.id, { destinationId: event.target.value || undefined })} style={inputStyle} disabled={!requiresDestination(candidate.purpose)}>
                  <option value="">Destination...</option>
                  {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                </select>
                <select value={candidate.categoryId ?? ""} onChange={(event) => updateCandidate(candidate.id, { categoryId: event.target.value || undefined })} style={inputStyle}>
                  <option value="">Category...</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <div>
                  <StatusChip tone={candidate.duplicateLevel ? "warning" : candidate.confidence === "high" ? "success" : "secondary"}>
                    {candidate.duplicateLevel ? `${candidate.duplicateLevel} duplicate` : candidate.confidence}
                  </StatusChip>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <span style={{ fontSize: 12, color: theme.colors.textSoft }}>
              Selected total: {fmtCAD(candidates.filter((candidate) => candidate.enabled).reduce((sum, candidate) => sum + candidate.amount, 0))}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={() => setCandidates([])}>Discard Preview</Button>
              <Button onClick={confirmImport} disabled={!candidates.some((candidate) => candidate.enabled)}>Import Selected</Button>
            </div>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
