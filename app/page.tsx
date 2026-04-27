"use client";

import { useState, useEffect } from "react";
import { useCategories } from "@/modules/categories/useCategories";
import { HoursContractsSection } from "@/modules/business/HoursContractsSection";
import { TaxObligationsSection } from "@/modules/business/TaxObligationsSection";
import {
  CorporationIncomeSection,
  TaxRateSettingsSection,
} from "@/modules/business/CorporationIncomeTaxRateSections";
import { FixedPaymentsSection } from "@/modules/business/FixedPaymentsSection";
import {
  VehiclesSection,
  HouseLoansSection,
  PropertyTaxSection,
} from "@/modules/business/AssetsSections";
import { DailyLogSection } from "@/modules/business/DailyLogSection";
import {
  BankAccountsSection,
  CreditCardsSection,
  TransactionHistorySection,
  OverviewSection,
} from "@/modules/business/CoreSections";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { DashboardSection, ProjectionSection } from "@/modules/business/DashboardProjectionSections";
import { ImportExportSection } from "@/modules/business/ImportExportSection";
import { CategoriesSection } from "@/modules/business/CategoriesSection";
import { syncBalances } from "@/utils/syncBalances";
import { notifyDataChanged } from "@/utils/events";
import { fmtCAD } from "@/utils/finance";
import { DATA_CHANGED_EVENT } from "@/utils/events";

type SectionId =
  | "overview"
  | "accounts"
  | "cards"
  | "accountscards"
  | "categories"
  | "dailylog"
  | "transactions"
  | "fixedpayments"
  | "vehicles"
  | "houseloans"
  | "propertytax"
  | "hourscontracts"
  | "corpincome"
  | "cra"
  | "ratesettings"
  | "dashboard"
  | "projection"
  | "importexport";

const NAV: Array<{ id: SectionId; label: string; group: string; icon: string }> = [
  { id: "dailylog",       label: "Daily Log",           group: "Daily Activity",  icon: "📓" },
  { id: "transactions",   label: "Transaction History", group: "Daily Activity",  icon: "📋" },
  { id: "dashboard",      label: "Dashboard",           group: "Daily Activity",  icon: "🏠" },
  { id: "projection",     label: "Projection",          group: "Daily Activity",  icon: "📈" },
  { id: "importexport",   label: "Import / Export",     group: "Daily Activity",  icon: "💾" },
  { id: "overview",       label: "Overview",            group: "Personal Finance", icon: "🏠" },
  { id: "accountscards",  label: "Accounts & Cards",    group: "Personal Finance", icon: "💰" },
  { id: "accounts",       label: "Bank Accounts",       group: "Personal Finance", icon: "🏦" },
  { id: "cards",          label: "Credit Cards",        group: "Personal Finance", icon: "💳" },
  { id: "fixedpayments",  label: "Fixed Payments",      group: "Personal Finance", icon: "📅" },
  { id: "vehicles",       label: "Vehicles",            group: "Personal Finance", icon: "🚗" },
  { id: "houseloans",     label: "House Loans",         group: "Personal Finance", icon: "🏡" },
  { id: "propertytax",    label: "Property Tax",        group: "Personal Finance", icon: "🏛" },
  { id: "categories",     label: "Categories",          group: "Personal Finance", icon: "🏷" },
  { id: "hourscontracts", label: "Hours & Contracts",   group: "Business / CRA",   icon: "⏱" },
  { id: "corpincome",     label: "Corp Income",         group: "Business / CRA",   icon: "💼" },
  { id: "cra",            label: "Tax Obligations",     group: "Business / CRA",   icon: "📊" },
  { id: "ratesettings",   label: "Tax & Rate Settings", group: "Business / CRA",   icon: "⚙️" },
];

// ─── Accounts & Cards combined view ──────────────────────────────────────────
function AccountsCardsSection() {
  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const [, forceUpdate] = useState(0);

  // Re-render on any data change so balances stay live
  useEffect(() => {
    const handler = () => forceUpdate((n) => n + 1);
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, []);

  const totalBankBalance = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const totalOwed = cards.reduce((s, c) => s + c.openingBalance, 0);
  const totalLimit = cards.reduce((s, c) => s + c.limitAmount, 0);
  const totalAvailable = totalLimit - totalOwed;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Accounts & Cards</div>

      {/* Summary bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { label: "Total Bank Balance", value: fmtCAD(totalBankBalance), color: totalBankBalance >= 0 ? "#1a7f3c" : "#a31515" },
          { label: "Total CC Owing", value: fmtCAD(totalOwed), color: "#a31515" },
          { label: "Total CC Available", value: fmtCAD(totalAvailable), color: "#1a5fa8" },
          { label: "Net Position", value: fmtCAD(totalBankBalance - totalOwed), color: (totalBankBalance - totalOwed) >= 0 ? "#1a7f3c" : "#a31515" },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, minWidth: 140, padding: "12px 14px", background: "#f9fafb", border: "1px solid #e2e4e8", borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bank Accounts */}
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1a5fa8", marginBottom: 8 }}>🏦 Bank Accounts</div>
      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, marginBottom: 20, overflow: "hidden" }}>
        {accounts.length === 0 && (
          <div style={{ padding: 16, color: "#6b7280", fontSize: 13, textAlign: "center" }}>No accounts yet.</div>
        )}
        {accounts.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                {a.primary && <span style={{ fontSize: 10, fontWeight: 700, background: "#1a7f3c", color: "#fff", padding: "1px 7px", borderRadius: 99 }}>PRIMARY</span>}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{a.type} · {a.currency}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: a.openingBalance >= 0 ? "#1a7f3c" : "#a31515" }}>
              {fmtCAD(a.openingBalance)}
            </div>
          </div>
        ))}
      </div>

      {/* Credit Cards */}
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1a5fa8", marginBottom: 8 }}>💳 Credit Cards</div>
      <div style={{ background: "#fff", border: "1px solid #e2e4e8", borderRadius: 10, overflow: "hidden" }}>
        {cards.length === 0 && (
          <div style={{ padding: 16, color: "#6b7280", fontSize: 13, textAlign: "center" }}>No cards yet.</div>
        )}
        {cards.map((c) => {
          const available = c.limitAmount - c.openingBalance;
          const utilPct = c.limitAmount > 0 ? Math.round((c.openingBalance / c.limitAmount) * 100) : 0;
          return (
            <div key={c.id} style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                    {c.primary && <span style={{ fontSize: 10, fontWeight: 700, background: "#1a7f3c", color: "#fff", padding: "1px 7px", borderRadius: 99 }}>PRIMARY</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{c.issuer} · Limit {fmtCAD(c.limitAmount)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: c.openingBalance > 0 ? "#a31515" : "#1a7f3c" }}>
                    {fmtCAD(c.openingBalance)} <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>owed</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#1a5fa8" }}>{fmtCAD(available)} available</div>
                </div>
              </div>
              {/* Utilization bar */}
              <div style={{ marginTop: 8, background: "#f3f4f6", borderRadius: 99, height: 4 }}>
                <div style={{ width: `${Math.min(utilPct, 100)}%`, background: utilPct > 75 ? "#a31515" : utilPct > 50 ? "#a05c00" : "#1a7f3c", borderRadius: 99, height: 4, transition: "width .3s" }} />
              </div>
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{utilPct}% utilized</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [section, setSection] = useState<SectionId>("dailylog");

  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { transactions } = useTransactions();
  const { categories } = useCategories();

  // ── Sync balances on startup — single source of truth ──────────────────────
  useEffect(() => {
    syncBalances();
    notifyDataChanged();
  }, []);

  const navGroups = NAV.reduce<Record<string, typeof NAV>>((acc, item) => {
    (acc[item.group] = acc[item.group] ?? []).push(item);
    return acc;
  }, {});

  const groupOrder = ["Daily Activity", "Personal Finance", "Business / CRA"];

  const wrap = (children: React.ReactNode) => (
    <div className="bg-white rounded-lg border shadow-sm p-5">{children}</div>
  );

  return (
    <div style={{ minHeight: "100vh", color: "#000", display: "flex", background: "#f3f4f6" }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 220, flexShrink: 0, background: "#1e2530",
        minHeight: "100vh", padding: "0 0 24px 0",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 17, letterSpacing: "-.01em" }}>Finance OS</div>
          <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginTop: 2 }}>Personal workspace</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {groupOrder.map((group) => (
            <div key={group} style={{ marginBottom: 4 }}>
              <div style={{ padding: "10px 16px 4px", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.35)" }}>
                {group}
              </div>
              {(navGroups[group] ?? []).map((item) => {
                const active = section === item.id;
                return (
                  <button key={item.id} onClick={() => setSection(item.id)} style={{
                    width: "100%", textAlign: "left",
                    padding: "7px 16px", display: "flex", alignItems: "center", gap: 9,
                    background: active ? "rgba(255,255,255,.1)" : "transparent",
                    border: "none",
                    borderLeft: active ? "3px solid #4a9eff" : "3px solid transparent",
                    cursor: "pointer",
                    color: active ? "#fff" : "rgba(255,255,255,.6)",
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    transition: "all .15s",
                  }}>
                    <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, minWidth: 0, padding: 24 }}>
        {section === "overview"       && wrap(<OverviewSection />)}
        {section === "dailylog"       && wrap(<DailyLogSection />)}
        {section === "accounts"       && wrap(<BankAccountsSection />)}
        {section === "cards"          && wrap(<CreditCardsSection />)}
        {section === "accountscards"  && wrap(<AccountsCardsSection />)}
        {section === "transactions"   && wrap(<TransactionHistorySection />)}
        {section === "fixedpayments"  && wrap(<FixedPaymentsSection accounts={accounts} cards={cards} />)}
        {section === "vehicles"       && wrap(<VehiclesSection accounts={accounts} transactions={transactions} />)}
        {section === "houseloans"     && wrap(<HouseLoansSection accounts={accounts} />)}
        {section === "propertytax"    && wrap(<PropertyTaxSection />)}
        {section === "hourscontracts" && wrap(<HoursContractsSection accounts={accounts} />)}
        {section === "corpincome"     && wrap(<CorporationIncomeSection transactions={transactions} />)}
        {section === "cra"            && wrap(<TaxObligationsSection accounts={accounts} />)}
        {section === "ratesettings"   && wrap(<TaxRateSettingsSection />)}
        {section === "dashboard"      && wrap(<DashboardSection />)}
        {section === "projection"     && wrap(<ProjectionSection />)}
        {section === "importexport"   && wrap(<ImportExportSection />)}
        {section === "categories"     && wrap(<CategoriesSection />)}
      </main>
    </div>
  );
}