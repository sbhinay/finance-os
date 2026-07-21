"use client";

import { useState, useEffect } from "react";
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
} from "@/modules/business/AssetsSections";
import { DailyLogSection } from "@/modules/business/DailyLogSection";
import {
  BankAccountsSection,
  CreditCardsSection,
  TransactionHistorySection,
} from "@/modules/business/CoreSections";
import { useAccounts } from "@/modules/accounts/useAccounts";
import { useCreditCards } from "@/modules/creditCards/useCreditCards";
import { useTransactions } from "@/modules/transactions/useTransactions";
import { DashboardSection } from "@/modules/business/DashboardProjectionSections";
import { ImportExportSection } from "@/modules/business/ImportExportSection";
import { CategoriesSection } from "@/modules/business/CategoriesSection";
import { AssetsLiabilitiesSection } from "@/modules/business/AssetsLiabilitiesSection";
import { PropertiesSection } from "@/modules/business/PropertiesSection";
import { HealthReportSection } from "@/modules/business/HealthReportSection";
import { CRAReviewSection } from "@/modules/business/CRAReviewSection";
import { syncBalances } from "@/utils/syncBalances";
import { notifyDataChanged } from "@/utils/events";
import { fmtCAD } from "@/utils/finance";
import { DATA_CHANGED_EVENT } from "@/utils/events";
import { theme } from "@/lib/theme";
import { useProperties } from "@/modules/business/useAssets";
import { StatementScannerSection } from "@/modules/business/StatementScannerSection";
import { DataPanel, EmptyState, MetricCard, MetricGrid, PageHeader, StatusChip, SurfaceCard } from "@/components/ui";

type SectionId =
  | "accounts"
  | "cards"
  | "accountscards"
  | "categories"
  | "dailylog"
  | "healthreport"
  | "transactions"
  | "scanner"
  | "fixedpayments"
  | "vehicles"
  | "properties"
  | "houseloans"
  | "hourscontracts"
  | "corpincome"
  | "crareview"
  | "cra"
  | "ratesettings"
  | "dashboard"
  | "importexport"
  | "assetsliabilities";

const NAV: Array<{ id: SectionId; label: string; group: string; icon: string }> = [
  { id: "dailylog", label: "Daily Log", group: "Daily Activity", icon: "DL" },
  { id: "healthreport", label: "Health Report", group: "Daily Activity", icon: "DH" },
  { id: "transactions", label: "Transaction History", group: "Daily Activity", icon: "TX" },
  { id: "scanner", label: "Scan Statement", group: "Daily Activity", icon: "AI" },
  { id: "dashboard", label: "Dashboard", group: "Daily Activity", icon: "DB" },
  { id: "importexport", label: "Import / Export", group: "Daily Activity", icon: "IO" },
  { id: "accountscards", label: "Accounts & Cards", group: "Personal Finance", icon: "AC" },
  { id: "assetsliabilities", label: "Assets & Liabilities", group: "Personal Finance", icon: "AL" },
  { id: "accounts", label: "Bank Accounts", group: "Personal Finance", icon: "BA" },
  { id: "cards", label: "Credit Cards", group: "Personal Finance", icon: "CC" },
  { id: "fixedpayments", label: "Recurring Payments", group: "Personal Finance", icon: "RP" },
  { id: "vehicles", label: "Vehicles", group: "Personal Finance", icon: "VH" },
  { id: "properties", label: "Properties", group: "Personal Finance", icon: "PR" },
  { id: "houseloans", label: "House Loans", group: "Personal Finance", icon: "HL" },
  { id: "categories", label: "Categories", group: "Personal Finance", icon: "CT" },
  { id: "hourscontracts", label: "Hours & Contracts", group: "Business / CRA", icon: "BZ" },
  { id: "corpincome", label: "Corp Income", group: "Business / CRA", icon: "CI" },
  { id: "crareview", label: "CRA Review", group: "Business / CRA", icon: "CR" },
  { id: "cra", label: "Tax Obligations", group: "Business / CRA", icon: "TO" },
  { id: "ratesettings", label: "Tax & Rate Settings", group: "Business / CRA", icon: "RS" },
];
const PRIMARY_NAV_IDS = new Set<SectionId>([
  "dailylog",
  "dashboard",
  "accountscards",
  "assetsliabilities",
  "fixedpayments",
  "hourscontracts",
  "healthreport",
]);

const PRIMARY_SECTION_BY_SECTION: Record<SectionId, SectionId> = {
  accounts: "accountscards",
  cards: "accountscards",
  accountscards: "accountscards",
  categories: "healthreport",
  dailylog: "dailylog",
  healthreport: "healthreport",
  transactions: "dailylog",
  scanner: "dailylog",
  fixedpayments: "fixedpayments",
  vehicles: "assetsliabilities",
  properties: "assetsliabilities",
  houseloans: "assetsliabilities",
  hourscontracts: "hourscontracts",
  corpincome: "hourscontracts",
  crareview: "hourscontracts",
  cra: "hourscontracts",
  ratesettings: "hourscontracts",
  dashboard: "dashboard",
  importexport: "healthreport",
  assetsliabilities: "assetsliabilities",
};

const HUB_LINKS: Partial<Record<SectionId, Array<{ id: SectionId; label: string }>>> = {
  dailylog: [
    { id: "dailylog", label: "Daily Log" },
    { id: "transactions", label: "Transaction History" },
    { id: "scanner", label: "Scan Statement" },
  ],
  transactions: [
    { id: "dailylog", label: "Daily Log" },
    { id: "transactions", label: "Transaction History" },
    { id: "scanner", label: "Scan Statement" },
  ],
  scanner: [
    { id: "dailylog", label: "Daily Log" },
    { id: "transactions", label: "Transaction History" },
    { id: "scanner", label: "Scan Statement" },
  ],
  accountscards: [
    { id: "accountscards", label: "Combined View" },
    { id: "accounts", label: "Bank Accounts" },
    { id: "cards", label: "Credit Cards" },
  ],
  accounts: [
    { id: "accountscards", label: "Combined View" },
    { id: "accounts", label: "Bank Accounts" },
    { id: "cards", label: "Credit Cards" },
  ],
  cards: [
    { id: "accountscards", label: "Combined View" },
    { id: "accounts", label: "Bank Accounts" },
    { id: "cards", label: "Credit Cards" },
  ],
  assetsliabilities: [
    { id: "assetsliabilities", label: "Overview" },
    { id: "properties", label: "Properties" },
    { id: "vehicles", label: "Vehicles" },
    { id: "houseloans", label: "House Loans" },
  ],
  vehicles: [
    { id: "assetsliabilities", label: "Overview" },
    { id: "properties", label: "Properties" },
    { id: "vehicles", label: "Vehicles" },
    { id: "houseloans", label: "House Loans" },
  ],
  houseloans: [
    { id: "assetsliabilities", label: "Overview" },
    { id: "properties", label: "Properties" },
    { id: "vehicles", label: "Vehicles" },
    { id: "houseloans", label: "House Loans" },
  ],
  properties: [
    { id: "assetsliabilities", label: "Overview" },
    { id: "properties", label: "Properties" },
    { id: "vehicles", label: "Vehicles" },
    { id: "houseloans", label: "House Loans" },
  ],
  hourscontracts: [
    { id: "hourscontracts", label: "Hours & Contracts" },
    { id: "corpincome", label: "Corp Income" },
    { id: "crareview", label: "CRA Review" },
    { id: "cra", label: "Tax Obligations" },
    { id: "ratesettings", label: "Tax & Rate Settings" },
  ],
  corpincome: [
    { id: "hourscontracts", label: "Hours & Contracts" },
    { id: "corpincome", label: "Corp Income" },
    { id: "crareview", label: "CRA Review" },
    { id: "cra", label: "Tax Obligations" },
    { id: "ratesettings", label: "Tax & Rate Settings" },
  ],
  crareview: [
    { id: "hourscontracts", label: "Hours & Contracts" },
    { id: "corpincome", label: "Corp Income" },
    { id: "crareview", label: "CRA Review" },
    { id: "cra", label: "Tax Obligations" },
    { id: "ratesettings", label: "Tax & Rate Settings" },
  ],
  cra: [
    { id: "hourscontracts", label: "Hours & Contracts" },
    { id: "corpincome", label: "Corp Income" },
    { id: "crareview", label: "CRA Review" },
    { id: "cra", label: "Tax Obligations" },
    { id: "ratesettings", label: "Tax & Rate Settings" },
  ],
  ratesettings: [
    { id: "hourscontracts", label: "Hours & Contracts" },
    { id: "corpincome", label: "Corp Income" },
    { id: "crareview", label: "CRA Review" },
    { id: "cra", label: "Tax Obligations" },
    { id: "ratesettings", label: "Tax & Rate Settings" },
  ],
  healthreport: [
    { id: "healthreport", label: "Health Report" },
    { id: "importexport", label: "Import / Export" },
    { id: "categories", label: "Categories" },
  ],
  importexport: [
    { id: "healthreport", label: "Health Report" },
    { id: "importexport", label: "Import / Export" },
    { id: "categories", label: "Categories" },
  ],
  categories: [
    { id: "healthreport", label: "Health Report" },
    { id: "importexport", label: "Import / Export" },
    { id: "categories", label: "Categories" },
  ],
};

// Accounts & Cards combined view
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
      <PageHeader
        title="Accounts & Cards"
        subtitle="Snapshot-backed cash accounts and revolving credit in one consolidated view."
      />

      <MetricGrid>
        <MetricCard label="Total Bank Balance" value={fmtCAD(totalBankBalance)} tone={totalBankBalance >= 0 ? "success" : "danger"} />
        <MetricCard label="Total CC Owing" value={fmtCAD(totalOwed)} tone="danger" />
        <MetricCard label="Total CC Available" value={fmtCAD(totalAvailable)} tone="primary" />
        <MetricCard label="Net Position" value={fmtCAD(totalBankBalance - totalOwed)} tone={(totalBankBalance - totalOwed) >= 0 ? "success" : "danger"} />
      </MetricGrid>

      <DataPanel title="Bank Accounts" accent={theme.colors.primary} style={{ marginBottom: 22 }}>
        {accounts.length === 0 && (
          <EmptyState title="No bank accounts yet" detail="Add accounts from the Bank Accounts tab when you are ready." />
        )}
        {accounts.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</span>
                {a.primary && <StatusChip tone="success">Primary</StatusChip>}
              </div>
              <div style={{ fontSize: 11, color: theme.colors.textSoft, marginTop: 2 }}>{a.type} - {a.currency}</div>
            </div>
            <div style={{ fontWeight: 750, fontSize: 16, color: a.openingBalance >= 0 ? theme.colors.success : theme.colors.danger }}>
              {fmtCAD(a.openingBalance)}
            </div>
          </div>
        ))}
      </DataPanel>

      <DataPanel title="Credit Cards" accent={theme.colors.primary}>
        {cards.length === 0 && (
          <EmptyState title="No cards yet" detail="Cards and LOCs will appear here after they are created." />
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
                    {c.primary && <StatusChip tone="success">Primary</StatusChip>}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{c.issuer} - Limit {fmtCAD(c.limitAmount)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 750, fontSize: 16, color: c.openingBalance > 0 ? theme.colors.danger : theme.colors.success }}>
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
      </DataPanel>
    </div>
  );
}

// Main App
export default function Home() {
  const [section, setSection] = useState<SectionId>("dailylog");
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
  const [editHouseLoanId, setEditHouseLoanId] = useState<string | null>(null);
  const [isMobileNav, setIsMobileNav] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { accounts } = useAccounts();
  const { transactions } = useTransactions();
  useProperties();
  // Sync balances on startup so all sections read the same source of truth.
  useEffect(() => {
    syncBalances();
    notifyDataChanged();
  }, []);

  useEffect(() => {
    const applyViewport = () => {
      const mobile = window.innerWidth < 980;
      setIsMobileNav(mobile);
      setSidebarOpen((prev) => (mobile ? prev : true));
    };
    applyViewport();
    window.addEventListener("resize", applyViewport);
    return () => window.removeEventListener("resize", applyViewport);
  }, []);

  const primaryNav = NAV.filter((item) => PRIMARY_NAV_IDS.has(item.id)).map((item) => ({
    ...item,
    label:
      item.id === "hourscontracts"
        ? "Business"
        : item.id === "healthreport"
          ? "Data & Health"
          : item.id === "fixedpayments"
            ? "Recurring Payments"
            : item.label,
    group:
      item.id === "dailylog" || item.id === "dashboard"
        ? "Core"
        : item.id === "accountscards" || item.id === "assetsliabilities" || item.id === "fixedpayments"
          ? "Finance"
          : item.id === "hourscontracts"
            ? "Business"
            : "System",
  }));
  const navGroups = primaryNav.reduce<Record<string, typeof primaryNav>>((acc, item) => {
    (acc[item.group] = acc[item.group] ?? []).push(item);
    return acc;
  }, {});

  const groupOrder = ["Core", "Finance", "Business", "System"];
  const currentHubLinks = PRIMARY_SECTION_BY_SECTION[section] === "fixedpayments" ? [] : (HUB_LINKS[section] ?? []);

  const wrap = (children: React.ReactNode) => (
    <SurfaceCard
      style={{
        padding: "clamp(18px, 2vw, 26px)",
        background: "rgba(255,255,255,0.88)",
        animation: "financeFadeUp 180ms ease both",
      }}
    >
      {children}
    </SurfaceCard>
  );

  return (
    <div style={{ minHeight: "100vh", color: theme.colors.text, display: "flex", background: theme.colors.pageGlow }}>
      {isMobileNav && sidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            border: "none",
            background: "rgba(10, 18, 30, 0.45)",
            zIndex: 20,
            cursor: "pointer",
          }}
        />
      )}
      {/* Sidebar */}
      <aside style={{
        width: isMobileNav ? 276 : 244,
        flexShrink: 0,
        background: `linear-gradient(180deg, ${theme.colors.sidebar} 0%, ${theme.colors.sidebarAlt} 100%)`,
        minHeight: "100vh",
        padding: "0 0 24px 0",
        display: "flex", flexDirection: "column",
        boxShadow: "12px 0 40px rgba(15, 23, 42, 0.07)",
        borderRight: `1px solid ${theme.colors.border}`,
        position: isMobileNav ? "fixed" : "sticky",
        top: 0,
        left: 0,
        zIndex: 30,
        transform: isMobileNav ? (sidebarOpen ? "translateX(0)" : "translateX(-100%)") : "none",
        transition: "transform .22s ease",
      }}>
        <div style={{ padding: "24px 18px 18px", borderBottom: `1px solid ${theme.colors.border}` }}>
          <div style={{ color: theme.colors.text, fontWeight: 800, fontSize: 22, letterSpacing: 0 }}>FinanceOS</div>
          <div style={{ color: theme.colors.sidebarMuted, fontSize: 12, marginTop: 4 }}>Personal command center</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {groupOrder.map((group) => (
            <div key={group} style={{ marginBottom: 4 }}>
              <div style={{ padding: "14px 18px 6px", fontSize: 10, fontWeight: 700, letterSpacing: 0, textTransform: "uppercase", color: theme.colors.sidebarMuted }}>
                {group}
              </div>
              {(navGroups[group] ?? []).map((item) => {
                const active = PRIMARY_SECTION_BY_SECTION[section] === item.id;
                return (
                  <button key={item.id} onClick={() => { setSection(item.id); if (isMobileNav) setSidebarOpen(false); }} style={{
                    width: "100%", textAlign: "left",
                    padding: "10px 16px", margin: "0 10px 4px", display: "flex", alignItems: "center", gap: 10,
                    background: active ? "linear-gradient(90deg, rgba(15,118,110,0.16), rgba(245,158,11,0.08))" : "transparent",
                    border: "none",
                    borderLeft: active ? `3px solid ${theme.colors.primary}` : "3px solid transparent",
                    borderRadius: 14,
                    cursor: "pointer",
                    color: active ? theme.colors.primary : theme.colors.sidebarText,
                    fontSize: 13, fontWeight: active ? 750 : 600,
                    transition: "background-color .15s ease, color .15s ease, border-color .15s ease",
                  }}>
                    <span style={{
                      fontSize: 10,
                      width: 26,
                      height: 22,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 8,
                      background: active ? theme.colors.primary : theme.colors.surfaceMuted,
                      color: active ? "#fff" : theme.colors.sidebarText,
                      fontWeight: 700,
                      letterSpacing: 0,
                    }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, padding: "28px clamp(16px, 3vw, 34px)" }}>
        {isMobileNav && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 999,
                border: `1px solid ${theme.colors.border}`,
                background: "rgba(255,255,255,0.86)",
                color: theme.colors.text,
                fontSize: 13,
                fontWeight: 650,
                cursor: "pointer",
                boxShadow: theme.shadow.soft,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>=</span>
              <span>Menu</span>
            </button>
            <div style={{ fontSize: 12, color: theme.colors.textSoft, fontWeight: 600 }}>
              {NAV.find((item) => item.id === PRIMARY_SECTION_BY_SECTION[section])?.label ?? "Finance OS"}
            </div>
          </div>
        )}
        {currentHubLinks.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {currentHubLinks.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSection(item.id);
                    if (isMobileNav) setSidebarOpen(false);
                  }}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 999,
                    border: active ? `1px solid ${theme.colors.primary}` : `1px solid ${theme.colors.border}`,
                    background: active ? theme.colors.primary : "rgba(255,255,255,0.78)",
                    color: active ? "#fff" : theme.colors.text,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: active ? theme.shadow.soft : "none",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
            </div>
          </div>
        )}
        {section === "dailylog"       && wrap(<DailyLogSection />)}
        {section === "healthreport"   && wrap(
          <HealthReportSection
            onOpenVehicle={(id) => {
              setEditVehicleId(id);
              setSection("vehicles");
            }}
            onOpenHouseLoan={(id) => {
              setEditHouseLoanId(id);
              setSection("houseloans");
            }}
          />
        )}
        {section === "accounts"       && wrap(<BankAccountsSection />)}
        {section === "cards"          && wrap(<CreditCardsSection />)}
        {section === "accountscards"  && wrap(<AccountsCardsSection />)}
        {section === "assetsliabilities" && wrap(<AssetsLiabilitiesSection onNavigate={(target) => setSection(target)} />)}
        {section === "transactions"   && wrap(<TransactionHistorySection />)}
        {section === "scanner"        && wrap(<StatementScannerSection />)}
        {section === "fixedpayments"  && wrap(<FixedPaymentsSection />)}
        {section === "vehicles"       && wrap(
          <VehiclesSection
            accounts={accounts}
            transactions={transactions}
            editVehicleId={editVehicleId}
            onEditHandled={() => setEditVehicleId(null)}
          />
        )}
        {section === "properties"     && wrap(<PropertiesSection />)}
        {section === "houseloans"     && wrap(
          <HouseLoansSection
            accounts={accounts}
            transactions={transactions}
            editHouseLoanId={editHouseLoanId}
            onEditHandled={() => setEditHouseLoanId(null)}
          />
        )}
        {section === "hourscontracts" && wrap(<HoursContractsSection accounts={accounts} />)}
        {section === "corpincome"     && wrap(<CorporationIncomeSection transactions={transactions} />)}
        {section === "crareview"      && wrap(<CRAReviewSection transactions={transactions} accounts={accounts} />)}
        {section === "cra"            && wrap(<TaxObligationsSection accounts={accounts} />)}
        {section === "ratesettings"   && wrap(<TaxRateSettingsSection />)}
        {section === "dashboard"      && wrap(<DashboardSection />)}
        {section === "importexport"   && wrap(<ImportExportSection />)}
        {section === "categories"     && wrap(<CategoriesSection />)}
      </main>
    </div>
  );
}


