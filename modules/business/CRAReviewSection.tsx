"use client";

import { useMemo, useState } from "react";
import { useBusiness } from "./useBusiness";
import { useCategories } from "@/modules/categories/useCategories";
import { Transaction } from "@/types/transaction";
import { Account } from "@/types/account";
import { fmtCAD, toFixed2 } from "@/utils/finance";
import { theme } from "@/lib/theme";
import { getExpenseReportEffect } from "@/utils/transactionSemantics";
import { useLiabilities, getLiabilitySummary } from "./useLiabilities";
import { useHouseLoans, useProperties, useVehicles } from "./useAssets";
import { calculateDebtSummary, matchesMortgagePayment, matchesVehicleFinancePayment } from "@/utils/debtReporting";
import { exportReportsExcel, exportReportsPdf, type ReportSheet } from "@/utils/reportExports";
import type { TaxTreatmentDecision, TaxTreatmentStatus } from "@/types/business";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: theme.colors.textSoft,
        display: "block",
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

function Inp({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
}) {
  const shared: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 10,
    background: "#fff",
    fontSize: 13,
    boxSizing: "border-box",
    color: theme.colors.text,
  };
  return (
    <div>
      {label && <Label>{label}</Label>}
      {type === "textarea" ? (
        <textarea value={value ?? ""} onChange={onChange} placeholder={placeholder} rows={3} style={shared} />
      ) : (
        <input type={type} value={value ?? ""} onChange={onChange} placeholder={placeholder} style={shared} />
      )}
    </div>
  );
}

function Sel({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <select
        value={value}
        onChange={onChange}
        style={{
          width: "100%",
          padding: "10px 12px",
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 10,
          background: "#fff",
          fontSize: 13,
          color: theme.colors.text,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}) {
  const style =
    variant === "primary"
      ? {
          background: theme.colors.primary,
          color: "#fff",
          border: `1px solid ${theme.colors.primary}`,
        }
      : {
          background: "#fff",
          color: theme.colors.text,
          border: `1px solid ${theme.colors.border}`,
        };
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function StatBox({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{ ...theme.cardStyle(), flex: 1, minWidth: 180, padding: "16px 18px", background: theme.colors.surfaceAlt }}>
      <div style={{ fontSize: 11, color: theme.colors.textSoft, fontWeight: 700, textTransform: "uppercase", marginBottom: 6, letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 21, color: color ?? theme.colors.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Pill({ color, children }: { color: "green" | "amber" | "red" | "blue" | "gray"; children: React.ReactNode }) {
  const map = {
    green: { bg: theme.colors.successSoft, fg: theme.colors.success },
    amber: { bg: theme.colors.warningSoft, fg: theme.colors.warning },
    red: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
    blue: { bg: theme.colors.primarySoft, fg: theme.colors.primary },
    gray: { bg: theme.colors.surfaceMuted, fg: theme.colors.textSoft },
  };
  const c = map[color];
  return (
    <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg }}>
      {children}
    </span>
  );
}

function percentAmount(total: number, pct: number) {
  return toFixed2(total * Math.max(0, Math.min(100, pct)) / 100);
}

function byDateDesc(a: Transaction, b: Transaction) {
  return (b.date ?? b.createdAt ?? "").localeCompare(a.date ?? a.createdAt ?? "");
}

export function CRAReviewSection({
  transactions,
  accounts,
}: {
  transactions: Transaction[];
  accounts: Account[];
}) {
  const hooks = useBusiness();
  const { business } = hooks;
  const { categories } = useCategories();
  const { liabilities } = useLiabilities();
  const { vehicles } = useVehicles();
  const { properties } = useProperties();
  const { houseLoans } = useHouseLoans();
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const [draft, setDraft] = useState({
    province: business.craReviewProfile?.province ?? "ON",
    filingProfile: business.craReviewProfile?.filingProfile ?? "corporation",
    gstRegistered: business.craReviewProfile?.gstRegistered ?? "unknown",
    gstFilingFrequency: business.craReviewProfile?.gstFilingFrequency ?? "unknown",
    hasEmploymentIncome: business.craReviewProfile?.hasEmploymentIncome ?? "unknown",
    hasSpouseOrPartner: business.craReviewProfile?.hasSpouseOrPartner ?? "unknown",
    phoneBusinessUsePct: business.craReviewProfile?.phoneBusinessUsePct ?? 100,
    internetBusinessUsePct: business.craReviewProfile?.internetBusinessUsePct ?? 100,
    vehicleBusinessUsePct: business.craReviewProfile?.vehicleBusinessUsePct ?? 0,
    homeOfficeUsePct: business.craReviewProfile?.homeOfficeUsePct ?? 0,
    notes: business.craReviewProfile?.notes ?? "",
    taxTreatments: business.craReviewProfile?.taxTreatments ?? {},
  });

  const categoryName = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const businessTagged = useMemo(
    () => transactions.filter((t) => t.tag === "Business").sort(byDateDesc),
    [transactions]
  );

  const likelyBusinessIncomeTx = useMemo(
    () => businessTagged.filter((t) => t.type === "income" || t.type === "dividend"),
    [businessTagged]
  );
  const likelyBusinessExpenseTx = useMemo(
    () => businessTagged.filter((t) => t.type === "expense" || t.type === "refund"),
    [businessTagged]
  );
  const likelyTaxPayments = useMemo(
    () =>
      transactions.filter((t) => {
        const desc = (t.description ?? "").toLowerCase();
        return (
          t.type === "tax_payment" ||
          t.subType === "hst_remittance" ||
          t.subType === "corp_tax" ||
          t.subType === "payroll_remittance" ||
          desc.includes("cra") ||
          desc.includes("hst")
        );
      }).sort(byDateDesc),
    [transactions]
  );

  const phoneInternetTx = useMemo(
    () =>
      likelyBusinessExpenseTx.filter((t) => {
        const name = categoryName.get(t.categoryId ?? "") ?? "";
        return /phone|internet/i.test(name) || /phone|internet|iphone|rogers|bell|telus/i.test(t.description ?? "");
      }),
    [likelyBusinessExpenseTx, categoryName]
  );

  const vehicleTx = useMemo(
    () =>
      likelyBusinessExpenseTx.filter((t) => {
        const name = categoryName.get(t.categoryId ?? "") ?? "";
        return Boolean(t.linkedVehicleId) || /vehicle|transport|gas|car maintenance|insurance/i.test(name);
      }),
    [likelyBusinessExpenseTx, categoryName]
  );

  const homeOfficeTx = useMemo(
    () =>
      likelyBusinessExpenseTx.filter((t) => {
        const name = categoryName.get(t.categoryId ?? "") ?? "";
        return /utilities|home maintenance|insurance/i.test(name) || Boolean(t.linkedPropertyId);
      }),
    [likelyBusinessExpenseTx, categoryName]
  );

  const invoiceSubtotal = useMemo(
    () => toFixed2(business.invoices.reduce((sum, inv) => sum + inv.subtotal, 0)),
    [business.invoices]
  );
  const invoiceHSTCollected = useMemo(
    () => toFixed2(business.invoices.reduce((sum, inv) => sum + inv.hst, 0)),
    [business.invoices]
  );
  const invoiceHSTToRemit = useMemo(
    () => toFixed2(business.invoices.reduce((sum, inv) => sum + inv.hstToRemit, 0)),
    [business.invoices]
  );

  const businessIncomeTotal = useMemo(
    () => toFixed2(likelyBusinessIncomeTx.reduce((sum, t) => sum + t.amount, 0)),
    [likelyBusinessIncomeTx]
  );
  const businessExpenseTotal = useMemo(
    () => toFixed2(likelyBusinessExpenseTx.reduce((sum, t) => sum + getExpenseReportEffect(t), 0)),
    [likelyBusinessExpenseTx]
  );
  const taxPaidTotal = useMemo(
    () => toFixed2(likelyTaxPayments.reduce((sum, t) => sum + t.amount, 0)),
    [likelyTaxPayments]
  );
  const phoneInternetTotal = useMemo(
    () => toFixed2(phoneInternetTx.reduce((sum, t) => sum + t.amount, 0)),
    [phoneInternetTx]
  );
  const vehicleTotal = useMemo(
    () => toFixed2(vehicleTx.reduce((sum, t) => sum + t.amount, 0)),
    [vehicleTx]
  );
  const homeOfficeTotal = useMemo(
    () => toFixed2(homeOfficeTx.reduce((sum, t) => sum + t.amount, 0)),
    [homeOfficeTx]
  );

  const adjustedPhone = percentAmount(phoneInternetTotal, draft.phoneBusinessUsePct);
  const adjustedInternet = percentAmount(phoneInternetTotal, draft.internetBusinessUsePct);
  const adjustedVehicle = percentAmount(vehicleTotal, draft.vehicleBusinessUsePct);
  const adjustedHomeOffice = percentAmount(homeOfficeTotal, draft.homeOfficeUsePct);
  const filingTarget = (soleProprietorTarget: string) => {
    if (draft.filingProfile === "sole_prop") return soleProprietorTarget;
    if (draft.filingProfile === "corporation") return "T2 Schedule 125 / GIFI working paper - accountant mapping required";
    return `${soleProprietorTarget}; separate corporate T2 Schedule 125 / GIFI review also required`;
  };

  const missingInputs = [
    draft.gstRegistered === "unknown" ? "GST/HST registration status" : "",
    draft.gstRegistered === "yes" && draft.gstFilingFrequency === "unknown" ? "GST/HST filing frequency" : "",
    draft.hasEmploymentIncome === "unknown" ? "Employment income / T-slip context" : "",
    draft.hasSpouseOrPartner === "unknown" ? "Spouse or partner context" : "",
    phoneInternetTotal > 0 && draft.phoneBusinessUsePct <= 0 ? "Business-use % for phone expenses" : "",
    phoneInternetTotal > 0 && draft.internetBusinessUsePct <= 0 ? "Business-use % for internet expenses" : "",
    vehicleTotal > 0 && draft.vehicleBusinessUsePct <= 0 ? "Business-use % for vehicle expenses" : "",
    homeOfficeTotal > 0 && draft.homeOfficeUsePct <= 0 ? "Home office use %" : "",
  ].filter(Boolean);

  const mappingRows = [
    {
      id: "business_income",
      label: "Business income",
      target: draft.filingProfile === "corporation" ? "Corporate working paper" : "T2125 - Gross business income",
      amount: draft.filingProfile === "corporation" ? invoiceSubtotal || businessIncomeTotal : Math.max(invoiceSubtotal, businessIncomeTotal),
      confidence: draft.filingProfile === "corporation" ? "High" : invoiceSubtotal > 0 || businessIncomeTotal > 0 ? "Medium" : "Low",
      note: draft.filingProfile === "corporation"
        ? "Based on invoice subtotal and tagged business-income transactions."
        : "Needs user confirmation between invoice-driven revenue and tagged business-income transactions.",
    },
    {
      id: "phone_internet",
      label: "Phone and internet",
      target: filingTarget("Likely T2125 line 9220 or 9270 - confirm allocation"),
      amount: Math.max(adjustedPhone, adjustedInternet),
      confidence: phoneInternetTotal > 0 && (draft.phoneBusinessUsePct > 0 || draft.internetBusinessUsePct > 0) ? "Medium" : "Low",
      note: `Raw total ${fmtCAD(phoneInternetTotal)} adjusted by saved business-use percentages.`,
    },
    {
      id: "motor_vehicle",
      label: "Motor vehicle",
      target: filingTarget("T2125 line 9281 motor vehicle working paper (excluding CCA)"),
      amount: adjustedVehicle,
      confidence: vehicleTotal > 0 && draft.vehicleBusinessUsePct > 0 ? "Medium" : "Low",
      note: `Raw total ${fmtCAD(vehicleTotal)} adjusted by ${draft.vehicleBusinessUsePct}% business use.`,
    },
    {
      id: "business_use_home",
      label: "Business-use-of-home",
      target: filingTarget("T2125 business-use-of-home working paper - detailed eligibility review required"),
      amount: adjustedHomeOffice,
      confidence: homeOfficeTotal > 0 && draft.homeOfficeUsePct > 0 ? "Low" : "Low",
      note: "This area usually needs stronger support and often accountant review.",
    },
    {
      id: "gst_hst_remittances",
      label: "GST/HST remittances",
      target: "CRA remittance working paper (not a normal expense claim)",
      amount: Math.max(invoiceHSTToRemit, taxPaidTotal),
      confidence: draft.gstRegistered === "yes" ? "High" : draft.gstRegistered === "no" ? "Low" : "Medium",
      note: `Invoices suggest ${fmtCAD(invoiceHSTToRemit)} to remit; tax-related payments found ${fmtCAD(taxPaidTotal)}.`,
    },
  ];

  const topExpenseBuckets = useMemo(() => {
    const map = new Map<string, number>();
    likelyBusinessExpenseTx.forEach((t) => {
      const name = categoryName.get(t.categoryId ?? "") ?? "Uncategorized";
      map.set(name, toFixed2((map.get(name) ?? 0) + getExpenseReportEffect(t)));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [likelyBusinessExpenseTx, categoryName]);

  const businessAccount = accounts.find((a) => a.type === "business" || a.name.toLowerCase().includes("business"));

  function updateTaxTreatment(id: string, patch: Partial<TaxTreatmentDecision>) {
    setDraft((current) => {
      const existing = current.taxTreatments[id];
      return {
        ...current,
        taxTreatments: {
          ...current.taxTreatments,
          [id]: {
            ...existing,
            ...patch,
            status: patch.status ?? existing?.status ?? "proposed",
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  }

  const reportSheets: ReportSheet[] = (() => {
    const expenseBuckets = new Map<string, number>();
    likelyBusinessExpenseTx.forEach((transaction) => {
      const name = categoryName.get(transaction.categoryId ?? "") ?? "Uncategorized";
      expenseBuckets.set(name, toFixed2((expenseBuckets.get(name) ?? 0) + getExpenseReportEffect(transaction)));
    });

    const lenderRows = liabilities.map((liability) => {
      const summary = getLiabilitySummary(liability, transactions);
      return {
        Lender: liability.name,
        Type: liability.type,
        Tag: liability.tag,
        Borrowed: summary.borrowed,
        "Principal Repaid": summary.principalRepaid,
        "Interest Paid": summary.interestPaid,
        "Current Owing": summary.currentBalance,
      };
    });

    const mortgageRows = houseLoans.map((loan) => {
      const summary = calculateDebtSummary({
        transactions,
        matches: matchesMortgagePayment(
          loan.id,
          loan.propertyId,
          houseLoans.filter((candidate) => candidate.propertyId === loan.propertyId).length === 1
        ),
        balanceSnapshotAmount: loan.balanceSnapshotAmount,
        balanceSnapshotDate: loan.balanceSnapshotDate,
        fallbackBalance: loan.remaining,
      });
      return {
        Mortgage: loan.name,
        Property: properties.find((property) => property.id === loan.propertyId)?.name ?? "",
        "Property ID": loan.propertyId ?? "",
        "Current Owing": summary.currentOwing,
        "Cash Paid": summary.cashPaid,
        Principal: summary.principalPaid,
        Interest: summary.interestPaid,
        Unallocated: summary.unallocatedPaid,
      };
    });

    const vehicleRows = vehicles.map((vehicle) => {
      const summary = vehicle.vtype === "Finance"
        ? calculateDebtSummary({
            transactions,
            matches: matchesVehicleFinancePayment(vehicle.id),
            balanceSnapshotAmount: vehicle.balanceSnapshotAmount,
            balanceSnapshotDate: vehicle.balanceSnapshotDate,
            fallbackBalance: vehicle.remaining,
          })
        : null;
      return {
        Vehicle: vehicle.name,
        Type: vehicle.vtype,
        Payment: vehicle.payment,
        Schedule: vehicle.schedule,
        "Current Owing": summary?.currentOwing ?? 0,
        "Cash Paid": summary?.cashPaid ?? 0,
        Principal: summary?.principalPaid ?? 0,
        Interest: summary?.interestPaid ?? 0,
        Unallocated: summary?.unallocatedPaid ?? 0,
      };
    });

    const propertyRows = properties.filter((property) => !property.archived).map((property) => {
      const mortgages = mortgageRows.filter((row) => row["Property ID"] === property.id);
      const mortgageOwing = toFixed2(mortgages.reduce((sum, row) => sum + Number(row["Current Owing"]), 0));
      return {
        Property: property.name,
        Type: property.type,
        Address: property.address ?? "",
        "Estimated Value": property.estimatedValue ?? 0,
        "Mortgage Owing": mortgageOwing,
        Equity: property.estimatedValue == null ? "" : toFixed2(property.estimatedValue - mortgageOwing),
        "Insurance Schedule": property.insuranceAmount ?? 0,
        "Property Tax Schedule": property.propertyTaxAmount ?? 0,
      };
    });

    return [
      {
        name: "Tax Working Papers",
        rows: mappingRows.map((row) => {
          const treatment = draft.taxTreatments[row.id] ?? { status: "proposed" as const };
          return {
            Item: row.label,
            "Bookkeeping Amount": row.amount,
            "Proposed Mapping": row.target,
            Confidence: row.confidence,
            "Tax Treatment Status": treatment.status,
            "Confirmed Tax Amount": treatment.status === "confirmed"
              ? treatment.confirmedAmount ?? row.amount
              : "",
            "User Note": treatment.note ?? "",
            Evidence: row.note,
          };
        }),
      },
      {
        name: "Missing Information",
        rows: missingInputs.length
          ? missingInputs.map((item) => ({ Status: "Missing", Item: item }))
          : [{ Status: "Complete", Item: "No currently detected missing questionnaire inputs" }],
      },
      {
        name: "Bookkeeping Categories",
        rows: [...expenseBuckets.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([category, amount]) => ({ Category: category, "Bookkeeping Total": amount, Treatment: "Not filing-ready unless confirmed above" })),
      },
      {
        name: "Business Summary",
        rows: [{
          "Invoice Revenue Before HST": invoiceSubtotal,
          "Tagged Business Income": businessIncomeTotal,
          "Tagged Business Expenses": businessExpenseTotal,
          "Invoice HST Collected": invoiceHSTCollected,
          "Invoice HST To Remit": invoiceHSTToRemit,
          "Tax Payments Found": taxPaidTotal,
        }],
      },
      { name: "Lenders", rows: lenderRows.length ? lenderRows : [{ Lender: "None" }] },
      { name: "Mortgages", rows: mortgageRows.length ? mortgageRows : [{ Mortgage: "None" }] },
      { name: "Properties", rows: propertyRows.length ? propertyRows : [{ Property: "None" }] },
      { name: "Vehicles", rows: vehicleRows.length ? vehicleRows : [{ Vehicle: "None" }] },
      {
        name: "Tax Ledger",
        rows: [...likelyBusinessIncomeTx, ...likelyBusinessExpenseTx, ...likelyTaxPayments]
          .sort(byDateDesc)
          .map((transaction) => ({
            Date: transaction.date,
            Description: transaction.description,
            Type: transaction.type,
            Category: categoryName.get(transaction.categoryId ?? "") ?? "",
            Amount: transaction.amount,
            Tag: transaction.tag ?? "",
          })),
      },
      {
        name: "Read Me",
        rows: [
          { Topic: "Purpose", Detail: "Working papers for review; not a filed tax return or tax advice." },
          { Topic: "Bookkeeping vs tax", Detail: "Bookkeeping totals remain separate from user-confirmed tax treatment." },
          { Topic: "T2125", Detail: "Proposed sole-proprietor mappings use current CRA T2125 expense-line guidance and require review." },
          { Topic: "Corporation", Detail: "Corporate amounts require T2 Schedule 125 / GIFI review; FinanceOS does not assign filing codes automatically." },
          { Topic: "GST/HST", Detail: "ITCs require eligible commercial use and supporting records; remittances are not normal expense deductions." },
        ],
      },
    ];
  })();

  async function exportWorkingPapers(format: "excel" | "pdf") {
    setExporting(format);
    try {
      const date = new Date().toISOString().slice(0, 10);
      if (format === "excel") {
        await exportReportsExcel(reportSheets, `FinanceOS_Working_Papers_${date}.xlsx`);
      } else {
        await exportReportsPdf("FinanceOS Tax And Financial Working Papers", reportSheets, `FinanceOS_Working_Papers_${date}.pdf`);
      }
    } catch (error) {
      window.alert(`Report export failed: ${String(error)}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", color: theme.colors.text, marginBottom: 6 }}>CRA Review</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: theme.colors.textSoft, maxWidth: 860 }}>
            Warning-first tax review using the transactions, invoices, obligations, and business settings FinanceOS already knows.
            This page proposes likely CRA working-paper mappings and highlights the missing inputs that still block stronger advice.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="secondary" onClick={() => exportWorkingPapers("excel")}>{exporting === "excel" ? "Building Excel..." : "Export Excel"}</Btn>
          <Btn variant="secondary" onClick={() => exportWorkingPapers("pdf")}>{exporting === "pdf" ? "Building PDF..." : "Export PDF"}</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <StatBox label="Invoice Revenue" value={fmtCAD(invoiceSubtotal)} sub="invoice subtotal before HST" color={theme.colors.success} />
        <StatBox label="Tagged Biz Expenses" value={fmtCAD(businessExpenseTotal)} sub={`${likelyBusinessExpenseTx.length} expense entries`} color={theme.colors.danger} />
        <StatBox label="CRA Paid / Found" value={fmtCAD(taxPaidTotal)} sub="tax payments located in ledger" color={theme.colors.warning} />
        <StatBox label="CRA Owing" value={fmtCAD(toFixed2(
          business.hstRemittances.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0) +
          business.corporateInstalments.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0) +
          business.payrollRemittances.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0) +
          business.arrearsHST + business.arrearsCorp
        ))} sub={businessAccount ? `Business account: ${businessAccount.name}` : "No business account detected"} color={theme.colors.primary} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.05fr) minmax(300px, 1fr)", gap: 18, alignItems: "start" }}>
        <div style={{ ...theme.cardStyle(theme.colors.primary), padding: 20, background: "linear-gradient(180deg, #ffffff, #f8fbff)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: theme.colors.text }}>Missing Inputs</div>
              <div style={{ fontSize: 12, color: theme.colors.textSoft, marginTop: 4 }}>Answer these once and the review becomes more reliable.</div>
            </div>
            <Pill color={missingInputs.length === 0 ? "green" : missingInputs.length <= 3 ? "amber" : "red"}>
              {missingInputs.length === 0 ? "Ready for review" : `${missingInputs.length} missing`}
            </Pill>
          </div>

          {missingInputs.length > 0 && (
            <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 12, background: theme.colors.warningSoft, color: theme.colors.warning, fontSize: 13, lineHeight: 1.6 }}>
              {missingInputs.map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <Sel label="Province" value={draft.province} onChange={(e) => setDraft((p) => ({ ...p, province: e.target.value }))} options={[
              { value: "ON", label: "Ontario" },
              { value: "BC", label: "British Columbia" },
              { value: "AB", label: "Alberta" },
              { value: "QC", label: "Quebec" },
              { value: "Other", label: "Other" },
            ]} />
            <Sel label="Filing Profile" value={draft.filingProfile} onChange={(e) => setDraft((p) => ({ ...p, filingProfile: e.target.value as typeof p.filingProfile }))} options={[
              { value: "sole_prop", label: "Sole proprietor" },
              { value: "corporation", label: "Corporation" },
              { value: "both", label: "Both / mixed" },
            ]} />
            <Sel label="GST/HST Registered?" value={draft.gstRegistered} onChange={(e) => setDraft((p) => ({ ...p, gstRegistered: e.target.value as typeof p.gstRegistered }))} options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]} />
            <Sel label="GST/HST Filing Frequency" value={draft.gstFilingFrequency} onChange={(e) => setDraft((p) => ({ ...p, gstFilingFrequency: e.target.value as typeof p.gstFilingFrequency }))} options={[
              { value: "unknown", label: "Unknown" },
              { value: "monthly", label: "Monthly" },
              { value: "quarterly", label: "Quarterly" },
              { value: "annual", label: "Annual" },
            ]} />
            <Sel label="Employment Income?" value={draft.hasEmploymentIncome} onChange={(e) => setDraft((p) => ({ ...p, hasEmploymentIncome: e.target.value as typeof p.hasEmploymentIncome }))} options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]} />
            <Sel label="Spouse or Partner Context?" value={draft.hasSpouseOrPartner} onChange={(e) => setDraft((p) => ({ ...p, hasSpouseOrPartner: e.target.value as typeof p.hasSpouseOrPartner }))} options={[
              { value: "unknown", label: "Unknown" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]} />
            <Inp label="Phone Business Use %" type="number" value={draft.phoneBusinessUsePct} onChange={(e) => setDraft((p) => ({ ...p, phoneBusinessUsePct: Number(e.target.value) }))} />
            <Inp label="Internet Business Use %" type="number" value={draft.internetBusinessUsePct} onChange={(e) => setDraft((p) => ({ ...p, internetBusinessUsePct: Number(e.target.value) }))} />
            <Inp label="Vehicle Business Use %" type="number" value={draft.vehicleBusinessUsePct} onChange={(e) => setDraft((p) => ({ ...p, vehicleBusinessUsePct: Number(e.target.value) }))} />
            <Inp label="Home Office Use %" type="number" value={draft.homeOfficeUsePct} onChange={(e) => setDraft((p) => ({ ...p, homeOfficeUsePct: Number(e.target.value) }))} />
          </div>

          <div style={{ marginTop: 12 }}>
            <Inp label="Advisor Notes / Assumptions" type="textarea" value={draft.notes ?? ""} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} placeholder="Any assumptions or tax context you want FinanceOS to carry forward." />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <Btn
              onClick={() => hooks.updateCRAReviewProfile({
                province: draft.province,
                filingProfile: draft.filingProfile,
                gstRegistered: draft.gstRegistered,
                gstFilingFrequency: draft.gstFilingFrequency,
                hasEmploymentIncome: draft.hasEmploymentIncome,
                hasSpouseOrPartner: draft.hasSpouseOrPartner,
                phoneBusinessUsePct: draft.phoneBusinessUsePct,
                internetBusinessUsePct: draft.internetBusinessUsePct,
                vehicleBusinessUsePct: draft.vehicleBusinessUsePct,
                homeOfficeUsePct: draft.homeOfficeUsePct,
                notes: draft.notes,
                taxTreatments: draft.taxTreatments,
              })}
            >
              Save CRA Inputs
            </Btn>
          </div>
        </div>

        <div style={{ ...theme.cardStyle(theme.colors.warning), padding: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: theme.colors.text, marginBottom: 12 }}>Likely CRA Mapping</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mappingRows.map((row) => {
              const treatment = draft.taxTreatments[row.id] ?? { status: "proposed" as TaxTreatmentStatus };
              return (
              <div key={row.id} style={{ border: `1px solid ${theme.colors.border}`, borderRadius: 12, padding: "12px 14px", background: theme.colors.surfaceAlt }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: theme.colors.text }}>{row.label}</div>
                  <Pill color={row.confidence === "High" ? "green" : row.confidence === "Medium" ? "amber" : "red"}>
                    {row.confidence} confidence
                  </Pill>
                </div>
                <div style={{ fontSize: 12, color: theme.colors.textSoft, marginBottom: 6 }}>{row.target}</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: theme.colors.text }}>{fmtCAD(row.amount)}</div>
                <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 6, lineHeight: 1.55 }}>{row.note}</div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, .7fr) minmax(140px, .6fr) minmax(180px, 1fr)", gap: 8, marginTop: 10 }}>
                  <Sel
                    label="Tax Treatment"
                    value={treatment.status}
                    onChange={(event) => {
                      const status = event.target.value as TaxTreatmentStatus;
                      updateTaxTreatment(row.id, {
                        status,
                        confirmedAmount: status === "confirmed"
                          ? treatment.confirmedAmount ?? row.amount
                          : treatment.confirmedAmount,
                      });
                    }}
                    options={[
                      { value: "proposed", label: "Proposed only" },
                      { value: "confirmed", label: "User confirmed" },
                      { value: "excluded", label: "Excluded from tax" },
                      { value: "accountant_review", label: "Accountant review" },
                    ]}
                  />
                  <Inp
                    label="Confirmed Amount"
                    type="number"
                    value={treatment.confirmedAmount ?? row.amount}
                    onChange={(event) => updateTaxTreatment(row.id, { confirmedAmount: Number(event.target.value) })}
                  />
                  <Inp
                    label="Treatment Note"
                    value={treatment.note ?? ""}
                    onChange={(event) => updateTaxTreatment(row.id, { note: event.target.value })}
                    placeholder="Reason, evidence, or accountant note"
                  />
                </div>
              </div>
            );})}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)", gap: 18, alignItems: "start", marginTop: 18 }}>
        <div style={{ ...theme.cardStyle(theme.colors.primary), padding: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: theme.colors.text, marginBottom: 10 }}>Business Expense Buckets</div>
          {topExpenseBuckets.length === 0 ? (
            <div style={{ color: theme.colors.textSoft, fontSize: 13 }}>No tagged business expenses found yet.</div>
          ) : (
            topExpenseBuckets.map(([name, amount]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${theme.colors.border}` }}>
                <span style={{ fontSize: 13, color: theme.colors.text }}>{name}</span>
                <strong style={{ color: theme.colors.danger }}>{fmtCAD(amount)}</strong>
              </div>
            ))
          )}
          <div style={{ marginTop: 12, padding: "10px 12px", background: theme.colors.surfaceMuted, borderRadius: 10, fontSize: 12, color: theme.colors.textSoft }}>
            These are bookkeeping buckets first. CRA treatment may still differ depending on use percentages, capital-vs-current treatment, and filing profile.
          </div>
        </div>

        <div style={{ ...theme.cardStyle(theme.colors.primary), padding: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: theme.colors.text, marginBottom: 10 }}>Review Flags</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: "12px 14px", borderRadius: 12, background: theme.colors.warningSoft, color: theme.colors.warning, fontSize: 13, lineHeight: 1.6 }}>
              Phone/internet, vehicle, and home-office totals should not be treated as filing-ready until their business-use percentages are confirmed.
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 12, background: theme.colors.primarySoft, color: theme.colors.primary, fontSize: 13, lineHeight: 1.6 }}>
              CRA remittance payments are not the same as normal expense claims. FinanceOS tracks them as tax working-paper items, not generic deductions.
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 12, background: theme.colors.surfaceMuted, color: theme.colors.textSoft, fontSize: 13, lineHeight: 1.6 }}>
              If you intend to claim capital assets, CCA, or more complex mixed-use items, accountant review is still the safer path before final filing.
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, ...theme.cardStyle(), padding: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: theme.colors.text, marginBottom: 10 }}>Tax-Relevant Ledger Snapshot</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
          <StatBox label="Tagged Biz Income" value={fmtCAD(businessIncomeTotal)} sub={`${likelyBusinessIncomeTx.length} entries`} color={theme.colors.success} />
          <StatBox label="Tagged Biz Expenses" value={fmtCAD(businessExpenseTotal)} sub={`${likelyBusinessExpenseTx.length} entries`} color={theme.colors.danger} />
          <StatBox label="Invoice HST Collected" value={fmtCAD(invoiceHSTCollected)} sub={`${business.invoices.length} invoices`} color={theme.colors.primary} />
          <StatBox label="Invoice HST To Remit" value={fmtCAD(invoiceHSTToRemit)} sub="quick-method based" color={theme.colors.warning} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={{ ...theme.cardStyle(), padding: "14px 16px", background: theme.colors.surfaceAlt }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent tax-related transactions</div>
            {likelyTaxPayments.slice(0, 6).map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: `1px solid ${theme.colors.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: theme.colors.text }}>{t.description}</div>
                  <div style={{ fontSize: 11, color: theme.colors.textMuted }}>{t.date}</div>
                </div>
                <strong style={{ color: theme.colors.danger }}>{fmtCAD(t.amount)}</strong>
              </div>
            ))}
            {likelyTaxPayments.length === 0 && <div style={{ fontSize: 13, color: theme.colors.textSoft }}>No likely tax-payment transactions found yet.</div>}
          </div>

          <div style={{ ...theme.cardStyle(), padding: "14px 16px", background: theme.colors.surfaceAlt }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Mixed-use categories needing confirmation</div>
            <div style={{ fontSize: 13, color: theme.colors.textSoft, lineHeight: 1.7 }}>
              <div>Phone & internet raw: <strong>{fmtCAD(phoneInternetTotal)}</strong></div>
              <div>Vehicle raw: <strong>{fmtCAD(vehicleTotal)}</strong></div>
              <div>Home office raw: <strong>{fmtCAD(homeOfficeTotal)}</strong></div>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.6 }}>
              Saved percentages currently reduce these to:
              <div>Phone: {fmtCAD(adjustedPhone)}</div>
              <div>Internet: {fmtCAD(adjustedInternet)}</div>
              <div>Vehicle: {fmtCAD(adjustedVehicle)}</div>
              <div>Home office: {fmtCAD(adjustedHomeOffice)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
