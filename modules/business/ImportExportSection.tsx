"use client";

import type { HouseLoan, PropertyTax, FixedPayment, Vehicle } from "@/types/domain";
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
import { vehicleRepository, houseLoanRepository, propertyTaxRepository } from "@/repositories/assetRepositories";
import { notifyDataChanged } from "@/utils/events";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadCloudSnapshot, saveCloudSnapshot } from "@/lib/supabase/cloudSnapshots";

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
    houseLoans: asArray(raw.houseLoans) as HouseLoan[],
    propertyTaxes: asArray(raw.propertyTaxes) as PropertyTax[],
    futurePayments: asArray(raw.futurePayments) as FixedPayment[],
  };
}

function normalizeImportResult(result: ImportResult): ImportPayload {
  if ("vehicles" in result && "futurePayments" in result) {
    return result;
  }

  return {
    accounts: result.accounts,
    creditCards: result.creditCards,
    transactions: result.transactions,
    categories: result.categories,
    business: result.business,
    vehicles: [],
    houseLoans: [],
    propertyTaxes: [],
    futurePayments: [],
  };
}

export function ImportExportSection() {
  const [status, setStatus] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [pendingData, setPendingData] = useState<ImportPayload | null>(null);
  const [importValidation, setImportValidation] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [cloudSession, setCloudSession] = useState<Session | null>(null);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null);
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

  useEffect(() => {
    if (!cloudSession) {
      setCloudUpdatedAt(null);
      return;
    }

    loadCloudSnapshot()
      .then((snapshot) => setCloudUpdatedAt(snapshot?.updated_at ?? null))
      .catch(() => setCloudUpdatedAt(null));
  }, [cloudSession]);

  function previewImport(result: ImportPayload) {
    const validation = validateImportPayload(result);
    setImportValidation({ errors: validation.errors, warnings: validation.warnings });
    setPreview({
      "Bank Accounts": result.accounts.length,
      "Credit Cards": result.creditCards.length,
      Transactions: result.transactions.length,
      Categories: result.categories.length,
      Invoices: result.business.invoices.length,
      Contracts: result.business.contracts.length,
      "HST Remittances": result.business.hstRemittances.length,
      "Corp Instalments": result.business.corporateInstalments.length,
      "Payroll Remittances": result.business.payrollRemittances.length,
      "Arrears Payments": result.business.arrearsPayments.length,
      Vehicles: result.vehicles.length,
      "House Loans": result.houseLoans.length,
      "Property Taxes": result.propertyTaxes.length,
      "Fixed Payments": result.futurePayments.length,
    });
    setPendingData(validation.normalized);
    setStatus(null);
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
        previewImport(result);
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
      houseLoanRepository.saveAll(result.houseLoans);
      propertyTaxRepository.saveAll(result.propertyTaxes);
      fixedPaymentRepository.saveAll(result.futurePayments);

      notifyDataChanged("import");

      setStatus({
        type: "success",
        message: `Import complete. ${result.accounts.length} accounts, ${result.transactions.length} transactions, ${result.business.invoices.length} invoices, ${result.vehicles.length} vehicles, ${result.houseLoans.length} house loans, ${result.propertyTaxes.length} property taxes, and ${result.futurePayments.length} fixed payments imported.${importValidation?.warnings.length ? ` ${importValidation.warnings.length} warning(s) were generated.` : ""}`,
      });
      setPreview(null);
      setPendingData(null);
      setImportValidation(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setStatus({ type: "error", message: `Import failed: ${String(err)}` });
    }
    setImporting(false);
  }

  function handleExport() {
    const data = {
      meta: { exportedAt: new Date().toISOString(), appVersion: "next-1.0" },
      bankAccounts: accountRepository.getAll(),
      creditCards: creditCardRepository.getAll(),
      transactions: transactionRepository.getAll(),
      categories: categoryRepository.getAll(),
      business: businessRepository.get(),
      vehicles: vehicleRepository.getAll(),
      houseLoans: houseLoanRepository.getAll(),
      propertyTaxes: propertyTaxRepository.getAll(),
      futurePayments: fixedPaymentRepository.getAll(),
    };
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
      await saveCloudSnapshot();
      setCloudUpdatedAt(new Date().toISOString());
      setStatus({ type: "success", message: "Current FinanceOS data saved to Supabase cloud backup." });
    } catch (err) {
      setStatus({ type: "error", message: `Cloud save failed: ${String(err)}` });
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
        const result = normalizeImportResult(loadExportResult(snapshot.payload as unknown as RawObject));
        previewImport(result);
        setStatus({ type: "success", message: "Cloud snapshot loaded. Review the preview below, then confirm import to restore it locally." });
        setCloudUpdatedAt(snapshot.updated_at);
      }
    } catch (err) {
      setStatus({ type: "error", message: `Cloud restore failed: ${String(err)}` });
    }
    setCloudBusy(false);
  }

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

      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "20px", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Cloud Backup (Supabase)</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          This is the first cloud-save layer: authenticated backup and restore using the same FinanceOS snapshot shape that export/import already trusts. It protects against browser or session loss before the full repository migration is complete.
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
              {cloudUpdatedAt ? ` | last cloud snapshot ${new Date(cloudUpdatedAt).toLocaleString()}` : " | no cloud snapshot saved yet"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={handleSaveToCloud} disabled={cloudBusy}>Save Current Data to Cloud</Btn>
              <Btn variant="secondary" onClick={handleRestoreFromCloud} disabled={cloudBusy}>Load Cloud Snapshot</Btn>
              <Btn variant="danger" onClick={handleCloudSignOut} disabled={cloudBusy}>Sign Out</Btn>
            </div>
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

        {preview && (
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

            {importValidation?.warnings.length ? (
              <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "#fefce8", border: "1px solid #fde68a", color: "#92400e" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Warnings:</div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {importValidation.warnings.map((warning, idx) => <li key={idx}>{warning}</li>)}
                </ul>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Btn onClick={confirmImport} disabled={importing || Boolean(importValidation?.errors.length)}>
                {importing ? "Importing..." : "Confirm Import"}
              </Btn>
              <Btn
                variant="secondary"
                onClick={() => {
                  setPreview(null);
                  setPendingData(null);
                  setImportValidation(null);
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
