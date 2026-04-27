"use client";

import { useState, useRef } from "react";
import { migrateFromPrototype } from "@/utils/migrationService";
import { accountRepository } from "@/repositories/accountRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { transactionRepository } from "@/repositories/transactionRepository";
import { categoryRepository } from "@/repositories/categoryRepository";
import { businessRepository } from "@/repositories/businessRepository";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { vehicleRepository, houseLoanRepository, propertyTaxRepository } from "@/repositories/assetRepositories";
import { notifyDataChanged } from "@/utils/events";

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
  const [pendingData, setPendingData] = useState<Record<string, unknown> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        // Show preview before committing
        const result = migrateFromPrototype(raw);
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
        });
        setPendingData(raw as Record<string, unknown>);
        setStatus(null);
      } catch (err) {
        setStatus({ type: "error", message: "Could not parse file. Make sure it's a valid FinanceOS JSON export." });
      }
    };
    reader.readAsText(file);
  }

  function confirmImport() {
    if (!pendingData) return;
    setImporting(true);
    try {
      const result = migrateFromPrototype(pendingData);

      // Write all domains to localStorage
      accountRepository.saveAll(result.accounts);
      creditCardRepository.saveAll(result.creditCards);
      transactionRepository.saveAll(result.transactions);
      categoryRepository.saveAll(result.categories);
      businessRepository.save(result.business);

      // Import vehicles, house loans, property taxes, fixed payments from raw data
      // Resolve account/card names -> IDs for source fields
      const raw = pendingData as any;
      const allAccounts = result.accounts;
      const allCards = result.creditCards;

      function resolveSourceId(nameOrId: string): string {
        if (!nameOrId) return "";
        // Already an ID? Check directly
        const byId = [...allAccounts, ...allCards].find((x) => x.id === nameOrId);
        if (byId) return byId.id;
        // Try name match (prototype stores names)
        const byName = [...allAccounts, ...allCards].find(
          (x) => x.name.toLowerCase() === String(nameOrId).toLowerCase()
        );
        return byName ? byName.id : nameOrId;
      }

      if (raw.vehicles?.length) {
        vehicleRepository.saveAll(raw.vehicles.map((v: any) => ({
          ...v, source: resolveSourceId(v.source ?? ""),
        })));
      }
      if (raw.houseLoans?.length) {
        houseLoanRepository.saveAll(raw.houseLoans.map((l: any) => ({
          ...l, source: resolveSourceId(l.source ?? ""),
        })));
      }
      if (raw.propertyTaxes?.length) {
        propertyTaxRepository.saveAll(raw.propertyTaxes);
      }
      if (raw.futurePayments?.length) {
        fixedPaymentRepository.saveAll(raw.futurePayments.map((p: any) => ({
          ...p, source: resolveSourceId(p.source ?? ""),
        })));
      }

      // Notify all hooks to reload
      notifyDataChanged("import");

      const warnings = result.warnings.length > 0
        ? ` ${result.warnings.length} migration note(s): ${result.warnings.join("; ")}`
        : "";

      setStatus({ type: "success", message: `✓ Import complete! ${result.accounts.length} accounts, ${result.transactions.length} transactions, ${result.business.invoices.length} invoices imported.${warnings}` });
      setPreview(null);
      setPendingData(null);
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
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Btn onClick={confirmImport} disabled={importing}>
                {importing ? "Importing…" : "✓ Confirm Import"}
              </Btn>
              <Btn variant="secondary" onClick={() => { setPreview(null); setPendingData(null); if (fileRef.current) fileRef.current.value = ""; }}>
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
