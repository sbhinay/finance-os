"use client";

import type { HouseLoan, PropertyTax, FixedPayment, Vehicle } from "@/types/domain";
import type { Account } from "@/types/account";
import type { CreditCard } from "@/types/creditCard";
import type { Transaction } from "@/types/transaction";
import type { Category } from "@/types/category";
import type { Business } from "@/types/business";
import { useState, useRef } from "react";
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

type RawObject = Record<string, unknown>;

function asObject(value: unknown): RawObject {
  return value && typeof value === "object" ? (value as RawObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function Btn({ children, onClick, variant = "primary", disabled }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "danger"; disabled?: boolean;
}) {
  const c = { primary: { bg: "#1a5fa8", color: "#fff" }, secondary: { bg: "#f3f4f6", color: "#374151" }, danger: { bg: "#fef2f2", color: "#a31515" } }[variant];
  return <button onClick={onClick} disabled={disabled} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, background: c.bg, color: c.color }}>{children}</button>;
}

export function ImportExportSection() {
  const [status, setStatus] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [pendingData, setPendingData] = useState<ImportPayload | null>(null);
  const [importValidation, setImportValidation] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  type ImportResult = ImportPayload | MigrationResult;

  function isCurrentAppExport(raw: RawObject): raw is RawObject {
    return Array.isArray(raw.bankAccounts)
      && Array.isArray(raw.creditCards)
      && Array.isArray(raw.transactions)
      && Array.isArray(raw.categories)
      && typeof raw.business === "object";
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
        const validation = validateImportPayload(result);
        setImportValidation({ errors: validation.errors, warnings: validation.warnings });
        setPreview({
          "Bank Accounts": result.accounts.length,
          "Credit Cards": result.creditCards.length,
          "Transactions": result.transactions.length,
          "Categories": result.categories.length,
          "Invoices": result.business.invoices.length,
          "Contracts": result.business.contracts.length,
          "HST Remittances": result.business.hstRemittances.length,
          "Corp Instalments": result.business.corporateInstalments.length,
          "Payroll Remittances": result.business.payrollRemittances.length,
          "Arrears Payments": result.business.arrearsPayments.length,
          "Vehicles": result.vehicles.length,
          "House Loans": result.houseLoans.length,
          "Property Taxes": result.propertyTaxes.length,
          "Fixed Payments": result.futurePayments.length,
        });
        setPendingData(validation.normalized);
        setStatus(null);
      } catch {
        setStatus({ type: "error", message: "Could not parse file. Make sure it's a valid FinanceOS JSON export." });
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

      // Notify all hooks to reload
      notifyDataChanged("import");

      setStatus({ type: "success", message: `✓ Import complete! ${result.accounts.length} accounts, ${result.transactions.length} transactions, ${result.business.invoices.length} invoices, ${result.vehicles.length} vehicles, ${result.houseLoans.length} house loans, ${result.propertyTaxes.length} property taxes, ${result.futurePayments.length} fixed payments imported.${importValidation?.warnings.length ? ` ${importValidation.warnings.length} warning(s) were generated.` : ""}` });
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
    if (!confirm("⚠ This will delete ALL data from this app. Are you sure?")) return;
    if (!confirm("Really delete everything? This cannot be undone.")) return;
    
    localStorage.clear();

    notifyDataChanged("clear");
    setStatus({ type: "warning", message: "All data cleared." });
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Import / Export</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
        Import your existing FinanceOS prototype JSON, or export your current Next.js data.
      </div>

      {/* Status message */}
      {status && (
        <div style={{
          padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13,
          background: status.type === "success" ? "#f0fdf4" : status.type === "error" ? "#fef2f2" : "#fef3c7",
          color: status.type === "success" ? "#1a7f3c" : status.type === "error" ? "#a31515" : "#a05c00",
          border: `1px solid ${status.type === "success" ? "#bbf7d0" : status.type === "error" ? "#fecaca" : "#fde68a"}`,
        }}>
          {status.message}
        </div>
      )}

      {/* Import section */}
      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "20px", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>⬆ Import from Prototype JSON</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16, background: "#f0f9ff", padding: "10px 14px", borderRadius: 8, border: "1px solid #bae6fd" }}>
          Select your <strong>FinanceOS_YYYY-MM-DD.json</strong> export file from the prototype. All your accounts, transactions, invoices, CRA data, vehicles, and house loans will be imported automatically. Your existing data here will be replaced.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleFile}
          style={{ marginBottom: 12, fontSize: 13 }}
        />

        {/* Preview */}
        {preview && (
          <div style={{ background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Preview — data to be imported:</div>
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
                {importing ? "Importing…" : "✓ Confirm Import"}
              </Btn>
              <Btn variant="secondary" onClick={() => { setPreview(null); setPendingData(null); setImportValidation(null); if (fileRef.current) fileRef.current.value = ""; }}>
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* Export section */}
      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, padding: "20px", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>⬇ Export Current Data</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          Download all your current data as a JSON file. Use this as a backup or to transfer to another device.
        </div>
        <Btn onClick={handleExport}>Export JSON</Btn>
      </div>

      {/* Danger zone */}
      <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 10, padding: "20px" }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#a31515", marginBottom: 8 }}>⚠ Danger Zone</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          Permanently delete all data from this app. This cannot be undone.
        </div>
        <Btn variant="danger" onClick={handleClearAll}>Clear All Data</Btn>
      </div>
    </div>
  );
}
