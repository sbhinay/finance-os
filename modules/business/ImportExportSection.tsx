"use client";

import type { HouseLoan, Liability, Property, PropertyTax, FixedPayment, Vehicle } from "@/types/domain";
import type { Account } from "@/types/account";
import type { CreditCard } from "@/types/creditCard";
import type { Transaction } from "@/types/transaction";
import type { Category } from "@/types/category";
import type { Business } from "@/types/business";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { migrateFromPrototype, MigrationResult } from "@/utils/migrationService";
import { accountRepository } from "@/repositories/accountRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { transactionRepository } from "@/repositories/transactionRepository";
import { categoryRepository } from "@/repositories/categoryRepository";
import { businessRepository } from "@/repositories/businessRepository";
import { ImportPayload, validateImportPayload } from "@/utils/referenceIntegrity";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { vehicleRepository, propertyRepository, houseLoanRepository, liabilityRepository, propertyTaxRepository } from "@/repositories/assetRepositories";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/utils/events";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  buildCloudExportPayload,
  CloudSnapshotConflictError,
  hashCloudPayload,
  listCloudSnapshotHistory,
  loadCloudSnapshot,
  loadCloudSnapshotHistoryItem,
  saveCloudSnapshot,
  type CloudSnapshot,
  type CloudSnapshotHistoryItem,
} from "@/lib/supabase/cloudSnapshots";
import { migratePropertyParents } from "@/utils/propertyMigration";

type RawObject = Record<string, unknown>;
type ImportResult = ImportPayload | MigrationResult;

function asObject(value: unknown): RawObject {
  return value && typeof value === "object" ? (value as RawObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const c = {
    primary: { bg: "#1a5fa8", color: "#fff" },
    secondary: { bg: "#f3f4f6", color: "#374151" },
    danger: { bg: "#fef2f2", color: "#a31515" },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 20px",
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 8,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: c.bg,
        color: c.color,
      }}
    >
      {children}
    </button>
  );
}

function isCurrentAppExport(raw: RawObject): raw is RawObject {
  return (
    Array.isArray(raw.bankAccounts) &&
    Array.isArray(raw.creditCards) &&
    Array.isArray(raw.transactions) &&
    Array.isArray(raw.categories) &&
    typeof raw.business === "object"
  );
}

function loadExportResult(raw: RawObject): ImportPayload {
  return {
    accounts: asArray(raw.bankAccounts) as Account[],
    creditCards: asArray(raw.creditCards) as CreditCard[],
    transactions: asArray(raw.transactions) as Transaction[],
    categories: asArray(raw.categories) as Category[],
    business: asObject(raw.business) as unknown as Business,
    vehicles: asArray(raw.vehicles) as Vehicle[],
    properties: asArray(raw.properties) as Property[],
    houseLoans: asArray(raw.houseLoans) as HouseLoan[],
    propertyTaxes: asArray(raw.propertyTaxes) as PropertyTax[],
    liabilities: asArray(raw.liabilities) as Liability[],
    futurePayments: asArray(raw.futurePayments) as FixedPayment[],
  };
}

function normalizeImportResult(result: ImportResult): ImportPayload {
  if ("vehicles" in result && "futurePayments" in result) {
    return {
      ...result,
      properties: "properties" in result && Array.isArray(result.properties)
        ? result.properties as Property[]
        : [],
    };
  }

  return {
    accounts: result.accounts,
    creditCards: result.creditCards,
    transactions: result.transactions,
    categories: result.categories,
    business: result.business,
    vehicles: [],
    properties: [],
    houseLoans: [],
    propertyTaxes: [],
    liabilities: [],
    futurePayments: [],
  };
}

export function ImportExportSection() {
  const [status, setStatus] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [previewSource, setPreviewSource] = useState<"file" | "cloud" | null>(null);
  const [pendingData, setPendingData] = useState<ImportPayload | null>(null);
  const [importValidation, setImportValidation] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [acceptedImportWarnings, setAcceptedImportWarnings] = useState<string[]>([]);
  const [cloudSession, setCloudSession] = useState<Session | null>(null);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null);
  const [cloudSnapshot, setCloudSnapshot] = useState<CloudSnapshot | null>(null);
  const [cloudHistory, setCloudHistory] = useState<CloudSnapshotHistoryItem[]>([]);
  const [cloudState, setCloudState] = useState<"checking" | "not-saved" | "in-sync" | "local-changes" | "cloud-newer">("checking");
  const [cloudLabel, setCloudLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setCloudSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setCloudSession(session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function compareLocalToCloud(snapshot: CloudSnapshot | null) {
    if (!snapshot) {
      setCloudState("not-saved");
      return;
    }
    const localHash = await hashCloudPayload(buildCloudExportPayload());
    setCloudState(localHash === snapshot.payload_hash ? "in-sync" : "local-changes");
  }

  async function refreshCloudState(markNewer = false) {
    if (!cloudSession) return;
    const [snapshot, history] = await Promise.all([
      loadCloudSnapshot(),
      listCloudSnapshotHistory(),
    ]);
    setCloudSnapshot(snapshot);
    setCloudUpdatedAt(snapshot?.updated_at ?? null);
    setCloudHistory(history);
    if (markNewer && snapshot) setCloudState("cloud-newer");
    else await compareLocalToCloud(snapshot);
  }

  useEffect(() => {
    if (!cloudSession) {
      setCloudUpdatedAt(null);
      setCloudSnapshot(null);
      setCloudHistory([]);
      setCloudState("checking");
      return;
    }
    refreshCloudState().catch((error) => {
      setCloudUpdatedAt(null);
      setCloudState("checking");
      setStatus({ type: "error", message: `Cloud state check failed: ${String(error)}. Apply the guarded snapshot migration before using cloud backup.` });
    });
    // Cloud functions are stable module imports; session identity is the intended trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSession]);

  useEffect(() => {
    if (!cloudSession) return;
    const handleDataChanged = () => {
      compareLocalToCloud(cloudSnapshot).catch(() => setCloudState("checking"));
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
  }, [cloudSession, cloudSnapshot]);

  function previewImport(result: ImportPayload, source: "file" | "cloud") {
    const propertyMigration = migratePropertyParents(
      result.properties,
      result.houseLoans,
      result.propertyTaxes,
      result.transactions
    );
    const migratedResult: ImportPayload = {
      ...result,
      properties: propertyMigration.properties,
      houseLoans: propertyMigration.houseLoans,
      propertyTaxes: propertyMigration.propertyTaxes,
      transactions: propertyMigration.transactions,
    };
    const validation = validateImportPayload(migratedResult);
    setImportValidation({ errors: validation.errors, warnings: validation.warnings });
    setAcceptedImportWarnings([]);
    setPreviewSource(source);
    setPreview({
      "Bank Accounts": migratedResult.accounts.length,
      "Credit Cards": migratedResult.creditCards.length,
      Transactions: migratedResult.transactions.length,
      Categories: migratedResult.categories.length,
      Invoices: migratedResult.business.invoices.length,
      Contracts: migratedResult.business.contracts.length,
      "HST Remittances": migratedResult.business.hstRemittances.length,
      "Corp Instalments": migratedResult.business.corporateInstalments.length,
      "Payroll Remittances": migratedResult.business.payrollRemittances.length,
      "Arrears Payments": migratedResult.business.arrearsPayments.length,
      Vehicles: migratedResult.vehicles.length,
      Properties: migratedResult.properties.length,
      "House Loans": migratedResult.houseLoans.length,
      "Property Taxes": migratedResult.propertyTaxes.length,
      Liabilities: migratedResult.liabilities.length,
      "Fixed Payments": migratedResult.futurePayments.length,
    });
    setPendingData(validation.normalized);
    setStatus(null);
  }

  function refreshImportReview(next: ImportPayload) {
    const validation = validateImportPayload(next);
    setPendingData(validation.normalized);
    setImportValidation({ errors: validation.errors, warnings: validation.warnings });
    setPreview((current) => current ? { ...current, Transactions: validation.normalized.transactions.length } : current);
    setAcceptedImportWarnings([]);
  }

  function transactionIdFromIssue(message: string): string | undefined {
    return /^Transaction\s+([^:\s]+)(?::|\s)/.exec(message)?.[1];
  }

  function updateImportTransaction(transactionId: string, field: "sourceId" | "destinationId", value: string) {
    if (!pendingData) return;
    refreshImportReview({
      ...pendingData,
      transactions: pendingData.transactions.map((transaction) =>
        transaction.id === transactionId
          ? { ...transaction, [field]: value || undefined }
          : transaction
      ),
    });
  }

  function excludeImportTransaction(transactionId: string) {
    if (!pendingData) return;
    refreshImportReview({
      ...pendingData,
      transactions: pendingData.transactions.filter((transaction) => transaction.id !== transactionId),
    });
  }

  function renderTransactionReview() {
    if (!pendingData || !importValidation) return null;
    const issueMessages = [
      ...importValidation.errors,
      ...importValidation.warnings.filter((warning) => !acceptedImportWarnings.includes(warning)),
    ];
    const transactionIds = [...new Set(issueMessages.map(transactionIdFromIssue).filter(Boolean) as string[])];
    if (!transactionIds.length) return null;
    const accountOptions = [...pendingData.accounts, ...pendingData.creditCards];

    return (
      <div style={{ marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "9px 12px", background: "#f8fafc", fontWeight: 700, fontSize: 12 }}>Transaction cleanup before import</div>
        {transactionIds.map((transactionId) => {
          const transaction = pendingData.transactions.find((item) => item.id === transactionId);
          if (!transaction) return null;
          const messages = issueMessages.filter((message) => transactionIdFromIssue(message) === transactionId);
          return (
            <div key={transactionId} style={{ padding: 12, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{transaction.date} | {transaction.description} | ${transaction.amount.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{messages.join(" ")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <select
                  aria-label={`Source for ${transaction.description}`}
                  value={transaction.sourceId}
                  onChange={(event) => updateImportTransaction(transaction.id, "sourceId", event.target.value)}
                  style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12 }}
                >
                  <option value="">Select source...</option>
                  {accountOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                {(transaction.destinationId || transaction.type === "transfer" || transaction.type === "adjustment") && (
                  <select
                    aria-label={`Destination for ${transaction.description}`}
                    value={transaction.destinationId}
                    onChange={(event) => updateImportTransaction(transaction.id, "destinationId", event.target.value)}
                    style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12 }}
                  >
                    <option value="">Select destination...</option>
                    {accountOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                )}
                <Btn variant="danger" onClick={() => excludeImportTransaction(transaction.id)}>Exclude Transaction</Btn>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const result = normalizeImportResult(
          isCurrentAppExport(raw) ? loadExportResult(raw) : migrateFromPrototype(raw)
        );
        previewImport(result, "file");
      } catch {
        setStatus({ type: "error", message: "Could not parse file. Make sure it is a valid FinanceOS JSON export." });
      }
    };
    reader.readAsText(file);
  }

  function confirmImport() {
    if (!pendingData) return;
    if (importValidation?.errors.length) {
      setStatus({ type: "error", message: `Import blocked: ${importValidation.errors.length} issue(s) must be resolved first.` });
      return;
    }
    setImporting(true);
    try {
      const result = pendingData;

      accountRepository.saveAll(result.accounts);
      creditCardRepository.saveAll(result.creditCards);
      transactionRepository.saveAll(result.transactions);
      categoryRepository.saveAll(result.categories);
      businessRepository.save(result.business);
      vehicleRepository.saveAll(result.vehicles);
      propertyRepository.saveAll(result.properties);
      houseLoanRepository.saveAll(result.houseLoans);
      propertyTaxRepository.saveAll(result.propertyTaxes);
      liabilityRepository.saveAll(result.liabilities);
      fixedPaymentRepository.saveAll(result.futurePayments);

      notifyDataChanged("import");

      setStatus({
        type: "success",
        message: `Import complete. ${result.accounts.length} accounts, ${result.transactions.length} transactions, ${result.business.invoices.length} invoices, ${result.vehicles.length} vehicles, ${result.properties.length} properties, ${result.houseLoans.length} house loans, ${result.propertyTaxes.length} property taxes, and ${result.futurePayments.length} recurring payments imported.${importValidation?.warnings.length ? ` ${importValidation.warnings.length} warning(s) were generated.` : ""}`,
      });
      setPreview(null);
      setPreviewSource(null);
      setPendingData(null);
      setImportValidation(null);
      setAcceptedImportWarnings([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setStatus({ type: "error", message: `Import failed: ${String(err)}` });
    }
    setImporting(false);
  }

  function handleExport() {
    const data = buildCloudExportPayload();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FinanceOS_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleClearAll() {
    if (!confirm("This will delete ALL data from this app. Are you sure?")) return;
    if (!confirm("Really delete everything? This cannot be undone.")) return;

    localStorage.clear();
    notifyDataChanged("clear");
    setStatus({ type: "warning", message: "All local data cleared." });
  }

  async function handleCloudSignIn() {
    if (!isSupabaseConfigured()) return;
    setCloudBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: cloudEmail,
        password: cloudPassword,
      });
      if (error) throw error;
      setStatus({ type: "success", message: "Signed in to Supabase cloud backup." });
    } catch (err) {
      setStatus({ type: "error", message: `Cloud sign-in failed: ${String(err)}` });
    }
    setCloudBusy(false);
  }

  async function handleCloudSignUp() {
    if (!isSupabaseConfigured()) return;
    setCloudBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signUp({
        email: cloudEmail,
        password: cloudPassword,
      });
      if (error) throw error;
      setStatus({ type: "success", message: "Cloud account created. If email confirmation is enabled, verify your email before signing in." });
    } catch (err) {
      setStatus({ type: "error", message: `Cloud sign-up failed: ${String(err)}` });
    }
    setCloudBusy(false);
  }

  async function handleCloudSignOut() {
    if (!isSupabaseConfigured()) return;
    setCloudBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setStatus({ type: "success", message: "Signed out of cloud backup." });
    } catch (err) {
      setStatus({ type: "error", message: `Cloud sign-out failed: ${String(err)}` });
    }
    setCloudBusy(false);
  }

  async function handleSaveToCloud() {
    setCloudBusy(true);
    try {
      const saved = await saveCloudSnapshot({
        expectedRevision: cloudSnapshot?.revision ?? 0,
        label: cloudLabel,
      });
      setCloudSnapshot(saved);
      setCloudUpdatedAt(saved.updated_at);
      setCloudLabel("");
      setCloudState("in-sync");
      setCloudHistory(await listCloudSnapshotHistory());
      setStatus({ type: "success", message: `Current FinanceOS data saved as guarded cloud revision ${saved.revision}.` });
    } catch (err) {
      if (err instanceof CloudSnapshotConflictError) {
        await refreshCloudState(true);
        setStatus({ type: "warning", message: "Cloud save blocked because a newer revision exists. Review or load the newer cloud snapshot before trying again." });
      } else {
        setStatus({ type: "error", message: `Cloud save failed: ${String(err)}` });
      }
    }
    setCloudBusy(false);
  }

  async function handleRestoreFromCloud() {
    setCloudBusy(true);
    try {
      const snapshot = await loadCloudSnapshot();
      if (!snapshot) {
        setStatus({ type: "warning", message: "No cloud snapshot found for this account yet." });
      } else {
        const result = normalizeImportResult(loadExportResult(asObject(snapshot.payload)));
        previewImport(result, "cloud");
        setStatus({ type: "success", message: `Cloud revision ${snapshot.revision} loaded. Review the preview below, then confirm import to restore it locally.` });
        setCloudUpdatedAt(snapshot.updated_at);
        setCloudSnapshot(snapshot);
      }
    } catch (err) {
      setStatus({ type: "error", message: `Cloud restore failed: ${String(err)}` });
    }
    setCloudBusy(false);
  }

  async function handleRestoreHistoryItem(id: string) {
    setCloudBusy(true);
    try {
      const snapshot = await loadCloudSnapshotHistoryItem(id);
      const result = normalizeImportResult(loadExportResult(asObject(snapshot.payload)));
      previewImport(result, "cloud");
      setStatus({ type: "success", message: `Restore point revision ${snapshot.revision} loaded for preview. Current local and cloud data remain unchanged until you confirm import.` });
    } catch (err) {
      setStatus({ type: "error", message: `Restore-point preview failed: ${String(err)}` });
    }
    setCloudBusy(false);
  }

  const visibleImportWarnings = (importValidation?.warnings ?? [])
    .filter((warning) => !acceptedImportWarnings.includes(warning));

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Import / Export</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
        Import your existing FinanceOS prototype JSON, export your current data, or use Supabase cloud backup for safer persistence.
      </div>

      {status && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            background: status.type === "success" ? "#f0fdf4" : status.type === "error" ? "#fef2f2" : "#fef3c7",
            color: status.type === "success" ? "#1a7f3c" : status.type === "error" ? "#a31515" : "#a05c00",
            border: `1px solid ${status.type === "success" ? "#bbf7d0" : status.type === "error" ? "#fecaca" : "#fde68a"}`,
          }}
        >
          {status.message}
        </div>
      )}

      {preview && previewSource === "cloud" && (
        <div style={{ background: "#fff", border: "1px solid #dbeafe", borderRadius: 10, padding: "20px", marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: "#1a5fa8" }}>Cloud Snapshot Preview</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            This snapshot was loaded from Supabase cloud backup. Confirm import only if you want to replace the current local browser data with this cloud copy.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {Object.entries(preview).map(([label, count]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 8px", background: "#fff", borderRadius: 6, border: "1px solid #e2e4e8" }}>
                <span style={{ color: "#6b7280" }}>{label}</span>
                <span style={{ fontWeight: 700, color: count > 0 ? "#1a5fa8" : "#9ca3af" }}>{count}</span>
              </div>
            ))}
          </div>

          {importValidation?.errors.length ? (
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#a31515" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Import blocked due to unresolved reference errors:</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {importValidation.errors.map((error, idx) => <li key={idx}>{error}</li>)}
              </ul>
            </div>
          ) : null}

          {visibleImportWarnings.length ? (
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "#fefce8", border: "1px solid #fde68a", color: "#92400e" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Warnings:</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {visibleImportWarnings.map((warning) => (
                  <li key={warning} style={{ marginBottom: 6 }}>
                    {warning}{" "}
                    <button onClick={() => setAcceptedImportWarnings((current) => [...current, warning])} style={{ border: 0, background: "transparent", color: "#1a5fa8", cursor: "pointer", fontWeight: 700 }}>Accept cleanup</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {renderTransactionReview()}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Btn onClick={confirmImport} disabled={importing || Boolean(importValidation?.errors.length)}>
              {importing ? "Importing..." : "Confirm Cloud Restore"}
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => {
                setPreview(null);
                setPreviewSource(null);
                setPendingData(null);
                setImportValidation(null);
                setAcceptedImportWarnings([]);
              }}
            >
              Cancel
            </Btn>
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "20px", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Guarded Cloud Snapshots (Supabase)</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          Manual cloud save keeps revision history and blocks stale overwrites. Loading any current or historical snapshot always opens the normal import preview before local data changes.
        </div>

        {!isSupabaseConfigured() ? (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fef3c7", color: "#a05c00", border: "1px solid #fde68a", fontSize: 12 }}>
            Supabase is not configured yet. Add the public URL and publishable key to .env.local to enable cloud backup.
          </div>
        ) : !cloudSession ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              value={cloudEmail}
              onChange={(e) => setCloudEmail(e.target.value)}
              placeholder="Email"
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13 }}
            />
            <input
              type="password"
              value={cloudPassword}
              onChange={(e) => setCloudPassword(e.target.value)}
              placeholder="Password"
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={handleCloudSignIn} disabled={cloudBusy || !cloudEmail || !cloudPassword}>Sign In</Btn>
              <Btn variant="secondary" onClick={handleCloudSignUp} disabled={cloudBusy || !cloudEmail || !cloudPassword}>Create Account</Btn>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: "#1a7f3c", marginBottom: 10 }}>
              Signed in as <strong>{cloudSession.user.email}</strong>
              {cloudUpdatedAt ? ` | revision ${cloudSnapshot?.revision ?? "?"} saved ${new Date(cloudUpdatedAt).toLocaleString()}` : " | no cloud snapshot saved yet"}
            </div>
            <div style={{ padding: "8px 10px", borderRadius: 6, background: cloudState === "in-sync" ? "#ecfdf5" : cloudState === "cloud-newer" ? "#fef2f2" : "#fff7ed", color: cloudState === "in-sync" ? "#166534" : cloudState === "cloud-newer" ? "#991b1b" : "#9a3412", fontSize: 12, marginBottom: 10 }}>
              {cloudState === "in-sync" && "Local data matches the latest cloud revision."}
              {cloudState === "local-changes" && "Local data differs from the latest checked cloud revision."}
              {cloudState === "not-saved" && "No cloud revision exists yet."}
              {cloudState === "cloud-newer" && "A newer cloud revision was detected. Saving is blocked until you review it."}
              {cloudState === "checking" && "Cloud state has not been verified yet."}
            </div>
            <input
              value={cloudLabel}
              onChange={(event) => setCloudLabel(event.target.value)}
              placeholder="Optional restore-point label"
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e4e8", borderRadius: 8, fontSize: 12, marginBottom: 10, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={handleSaveToCloud} disabled={cloudBusy || cloudState === "checking" || cloudState === "cloud-newer"}>Save New Revision</Btn>
              <Btn variant="secondary" onClick={handleRestoreFromCloud} disabled={cloudBusy}>Load Cloud Snapshot</Btn>
              <Btn variant="secondary" onClick={() => refreshCloudState().catch((error) => setStatus({ type: "error", message: `Cloud refresh failed: ${String(error)}` }))} disabled={cloudBusy}>Refresh Cloud State</Btn>
              <Btn variant="danger" onClick={handleCloudSignOut} disabled={cloudBusy}>Sign Out</Btn>
            </div>
            {cloudHistory.length > 0 && (
              <div style={{ marginTop: 14, borderTop: "1px solid #e2e4e8", paddingTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Restore points</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {cloudHistory.map((snapshot) => (
                    <div key={snapshot.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "7px 9px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12 }}>
                      <span>
                        <strong>Revision {snapshot.revision}</strong> | {new Date(snapshot.created_at).toLocaleString()}
                        {snapshot.label ? ` | ${snapshot.label}` : ""}
                      </span>
                      <Btn variant="secondary" onClick={() => handleRestoreHistoryItem(snapshot.id)} disabled={cloudBusy}>Preview Restore</Btn>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "20px", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Import from FinanceOS JSON</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16, background: "#f0f9ff", padding: "10px 14px", borderRadius: 8, border: "1px solid #bae6fd" }}>
          Select your FinanceOS_YYYY-MM-DD.json export. Your existing local data here will be replaced after you confirm the preview.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleFile}
          style={{ marginBottom: 12, fontSize: 13 }}
        />

        {preview && previewSource === "file" && (
          <div style={{ background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Preview - data to be imported:</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {Object.entries(preview).map(([label, count]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 8px", background: "#fff", borderRadius: 6, border: "1px solid #e2e4e8" }}>
                  <span style={{ color: "#6b7280" }}>{label}</span>
                  <span style={{ fontWeight: 700, color: count > 0 ? "#1a5fa8" : "#9ca3af" }}>{count}</span>
                </div>
              ))}
            </div>

            {importValidation?.errors.length ? (
              <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#a31515" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Import blocked due to unresolved reference errors:</div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {importValidation.errors.map((error, idx) => <li key={idx}>{error}</li>)}
                </ul>
              </div>
            ) : null}

            {visibleImportWarnings.length ? (
              <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "#fefce8", border: "1px solid #fde68a", color: "#92400e" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Warnings:</div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {visibleImportWarnings.map((warning) => (
                    <li key={warning} style={{ marginBottom: 6 }}>
                      {warning}{" "}
                      <button onClick={() => setAcceptedImportWarnings((current) => [...current, warning])} style={{ border: 0, background: "transparent", color: "#1a5fa8", cursor: "pointer", fontWeight: 700 }}>Accept cleanup</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {renderTransactionReview()}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Btn onClick={confirmImport} disabled={importing || Boolean(importValidation?.errors.length)}>
                {importing ? "Importing..." : "Confirm Import"}
              </Btn>
              <Btn
                variant="secondary"
                onClick={() => {
                  setPreview(null);
                  setPreviewSource(null);
                  setPendingData(null);
                  setImportValidation(null);
                  setAcceptedImportWarnings([]);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "20px", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Export Current Data</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          Download all your current local data as a JSON file. Keep this as a backup even after cloud save is enabled.
        </div>
        <Btn onClick={handleExport}>Export JSON</Btn>
      </div>

      <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 10, padding: "20px" }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#a31515", marginBottom: 8 }}>Danger Zone</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          Permanently delete all local app data from this browser. This cannot be undone.
        </div>
        <Btn variant="danger" onClick={handleClearAll}>Clear All Data</Btn>
      </div>
    </div>
  );
}
