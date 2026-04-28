/**
 * FinanceOS Migration Service
 *
 * Imports data from the prototype's monolithic financeOS_v4 localStorage key
 * into the Next.js split-storage format.
 *
 * All normalisation rules from tech doc §9 are applied here.
 * Each domain's repository handles its own slice; this orchestrates all of them.
 *
 * Usage:
 *   const result = migrateFromPrototype(JSON.parse(exportedJson));
 *   if (result.errors.length) console.warn(result.errors);
 */

import { Account } from "@/types/account";
import { CreditCard } from "@/types/creditCard";
import { Transaction } from "@/types/transaction";
import { Category } from "@/types/category";
import { Business, Invoice } from "@/types/business";
import { workFiscalYear, toFixed2, getRateOnDate } from "@/utils/finance";

export interface MigrationResult {
  accounts: Account[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  categories: Category[];
  business: Business;
  warnings: string[];
}

// ─── Invoice normalisation ────────────────────────────────────────────────────

/**
 * Normalise a prototype invoice to the Next.js Invoice shape.
 * Handles field name differences documented in tech doc §9 and the data diff.
 */
function normaliseInvoice(
  raw: Record<string, unknown>,
  defaultContractId: string,
  business: Record<string, unknown>
): Invoice {
  // Field name mapping: prototype uses month/year/date; Next.js uses workMonth/workYear/invoiceDate
  const workMonth = Number(raw.workMonth ?? raw.month) || 1;
  const workYear = Number(raw.workYear ?? raw.year) || new Date().getFullYear();
  const invoiceDate =
    (raw.invoiceDate as string | undefined) ??
    (raw.date as string | undefined) ??
    "";
  const wfy = workFiscalYear(workMonth, workYear);

  // Quarter: prototype may store bare "Q4"; Next.js expects "Q4-2026"
  let quarter = (raw.quarter as string | undefined) ?? "";
  if (quarter && !quarter.includes("-")) {
    // Bare quarter — derive year from paymentDate or invoiceDate
    const dateForYear =
      (raw.paymentDate as string | undefined) ??
      invoiceDate ??
      `${workYear}-${String(workMonth).padStart(2, "0")}-01`;
    const yr = dateForYear
      ? new Date(dateForYear + "T12:00:00").getFullYear()
      : workYear;
    quarter = `${quarter}-${yr}`;
  }

  // Backfill corpTaxReserve if missing
  const rs = business.rateSettings as Record<string, unknown> | undefined;
  const instalment =
    rs && Array.isArray(rs.corpTaxInstalment)
      ? (getRateOnDate(
          rs.corpTaxInstalment as Array<{ id: string; value: number; effectiveFrom: string }>,
          invoiceDate || `${workYear}-01-01`
        )?.value ?? 2038)
      : 2038;

  const corpTaxReserve =
    raw.corpTaxReserve != null
      ? toFixed2(Number(raw.corpTaxReserve))
      : toFixed2(instalment / 3);

  return {
    id: (raw.id as string) ?? String(Math.random().toString(36).slice(2)),
    invoiceNumber: (raw.invoiceNumber as string) ?? "",
    contractId:
      (raw.contractId as string | undefined) ?? defaultContractId,
    workMonth,
    workYear,
    workFiscalYear: wfy,
    hours: parseFloat(String(raw.hours ?? 0)) || 0,
    hourlyRate: Number(raw.hourlyRate ?? 0),
    invoiceDate,
    paymentDate: (raw.paymentDate as string | undefined) ?? undefined,
    clientName: (raw.clientName as string) ?? "",
    depositAccount:
      // Fix known typo from prototype
      ((raw.depositAccount as string) ?? "").replace("RBC Buisness", "RBC Business"),
    note: (raw.note as string | undefined) ?? "",
    fiscalYear: wfy,
    subtotal: toFixed2(Number(raw.subtotal ?? 0)),
    hst: toFixed2(Number(raw.hst ?? 0)),
    total: toFixed2(Number(raw.total ?? 0)),
    hstToRemit: toFixed2(Number(raw.hstToRemit ?? 0)),
    hstKept: toFixed2(Number(raw.hstKept ?? 0)),
    hstRateVal: Number(raw.hstRateVal ?? 0.13),
    qmRateVal: Number(raw.qmRateVal ?? 0.088),
    hstCalendarYear: Number(raw.hstCalendarYear ?? workYear),
    quarter,
    personalDraw:
      raw.personalDraw != null ? toFixed2(Number(raw.personalDraw)) : null,
    corpTaxReserve,
  };
}

// ─── Main migration function ──────────────────────────────────────────────────

export function migrateFromPrototype(
  protoData: Record<string, unknown>
): MigrationResult {
  const warnings: string[] = [];

  // ── Accounts ──
  const bankAccounts = (
    (protoData.bankAccounts as Record<string, unknown>[]) ?? []
  ).map((a) => ({
    id: String(a.id ?? Math.random().toString(36).slice(2)),
    name: String(a.name ?? "").replace("RBC Buisness", "RBC Business"),
    type: (a.type ?? "bank") as Account["type"],
    currency: (a.currency as string) ?? "CAD",
    openingBalance: toFixed2(Number(a.balance ?? a.openingBalance ?? 0)),
    balanceBase: toFixed2(Number(a.balance ?? a.openingBalance ?? 0)),
    reconciledBalance: a.reconciledBalance != null ? toFixed2(Number(a.reconciledBalance)) : undefined,
    reconciledDate: (a.reconciledDate as string | undefined) ?? undefined,
    active: Boolean(a.active ?? true),
    createdAt:
      (a.createdAt as string) ?? new Date().toISOString(),
  })) as Account[];

  // ── Credit cards ──
  const creditCards = (
    (protoData.creditCards as Record<string, unknown>[]) ?? []
  ).map((c) => ({
    id: String(c.id ?? Math.random().toString(36).slice(2)),
    name: String(c.name ?? ""),
    issuer: String(c.issuer ?? ""),
    type: ((c.type ?? "personal") as CreditCard["type"]),
    limitAmount: toFixed2(Number(c.limit ?? c.limitAmount ?? 0)),
    openingBalance: toFixed2(Number(c.balance ?? c.openingBalance ?? 0)),
    balanceBase: toFixed2(Number(c.balance ?? c.openingBalance ?? 0)),
    reconciledBalance: c.reconciledBalance != null ? toFixed2(Number(c.reconciledBalance)) : undefined,
    reconciledDate: (c.reconciledDate as string | undefined) ?? undefined,
    active: Boolean(c.active ?? true),
    createdAt: (c.createdAt as string) ?? new Date().toISOString(),
  })) as CreditCard[];

  // ── Categories ──
  const categories = (
    (protoData.categories as Record<string, unknown>[]) ?? []
  ).map((c) => ({
    id: String(c.id ?? Math.random().toString(36).slice(2)),
    name: String(c.name ?? ""),
    type: (c.type ?? "expense") as Category["type"],
    color: (c.color as string | undefined),
    vehicleLinked: Boolean(c.vehicleLinked ?? false),
    archived: Boolean(c.archived ?? false),
  })) as Category[];

  // ── Transactions ──
  const transactions = (
    (protoData.transactions as Record<string, unknown>[]) ?? []
  ).map((t) => {
    // Prototype stores date in createdAt-like ISO string; Next.js adds explicit date field
    const createdAt = (t.date as string) ?? (t.createdAt as string) ?? new Date().toISOString();
    const dateStr = createdAt.slice(0, 10);
    return {
      id: String(t.id ?? Math.random().toString(36).slice(2)),
      type: (t.type === "Income" ? "income" : t.type === "Expense" ? "expense" : t.type ?? "expense") as Transaction["type"],
      amount: toFixed2(Number(t.amount ?? 0)),
      description: String(t.note ?? t.description ?? ""),
      sourceId: (() => {
        const raw = String(t.account ?? t.sourceId ?? "");
        if (!raw) return "";
        const allSources = [...bankAccounts, ...creditCards];
        const byId = allSources.find((x) => x.id === raw);
        if (byId) return byId.id;
        const byName = allSources.find((x) => x.name.toLowerCase() === raw.toLowerCase());
        return byName ? byName.id : raw;
      })(),
      destinationId: (t.destinationId as string | undefined),
      createdAt,
      date: dateStr,
      categoryId: (() => {
        const raw = (t.category as string | undefined) ?? (t.categoryId as string | undefined);
        if (!raw) return undefined;
        // Try to find by ID first, then by name
        const byId = categories.find((c) => c.id === raw);
        if (byId) return byId.id;
        const byName = categories.find((c) => c.name.toLowerCase() === raw.toLowerCase());
        return byName ? byName.id : raw; // keep raw if no match (will show as-is)
      })(),
      tag: (t.tag as Transaction["tag"]) ?? "Personal",
      mode: (t.mode as Transaction["mode"]) ?? "Bank Transfer",
      linkedVehicleId:
        (t.linkedVehicle as string | undefined) ??
        (t.linkedVehicleId as string | undefined),
    };
  }) as Transaction[];

  // ── Business ──
  const rawBiz = (protoData.business as Record<string, unknown>) ?? {};

  // Migrate legacy scalar payrollDraw/payrollRemittance → rateSettings
  const rs = (rawBiz.rateSettings as Record<string, unknown>) ?? {};
  const payrollDrawArr = (rs.payrollDraw as unknown[]) ?? [];

  if (
    payrollDrawArr.length === 0 &&
    (rawBiz.payrollDraw != null || rawBiz.payrollRemittance != null)
  ) {
    rs.payrollDraw = [
      {
        id: "pd_imported",
        value: Number(rawBiz.payrollDraw ?? 0),
        craRemittance: Number(rawBiz.payrollRemittance ?? 0),
        effectiveFrom: "2025-04-01",
        note: "Imported from previous settings",
      },
    ];
    warnings.push(
      "Migrated legacy scalar payrollDraw/payrollRemittance to rateSettings.payrollDraw[]"
    );
  }

  // Migrate legacy craArrears object → flat fields
  const craArrears = rawBiz.craArrears as
    | { hst?: number; corporate?: number }
    | undefined;
  if (craArrears && !rawBiz.arrearsHST) {
    rawBiz.arrearsHST = craArrears.hst ?? 0;
    rawBiz.arrearsCorp = craArrears.corporate ?? 0;
    warnings.push("Migrated legacy craArrears object to arrearsHST/arrearsCorp fields");
  }

  // Ensure dismissedPendingKeys exists
  if (!protoData.dismissedPendingKeys) {
    (protoData as Record<string, unknown>).dismissedPendingKeys = [];
  }

  // Get first active contract id for invoice backfill
  const contracts = (rawBiz.contracts as Record<string, unknown>[]) ?? [];
  const firstContractId =
    contracts.find((c) => c.status === "Active")?.id ??
    contracts[0]?.id ??
    "";

  // Deduplicate hoursAllocations per fiscalYear per contract (keep first)
  const normalisedContracts = contracts.map((c) => {
    const allocs = (c.hoursAllocations as Record<string, unknown>[]) ?? [];
    const seen = new Set<number>();
    const deduped = allocs.filter((a) => {
      const fy = Number(a.fiscalYear);
      if (seen.has(fy)) return false;
      seen.add(fy);
      return true;
    });
    if (deduped.length !== allocs.length) {
      warnings.push(
        `Deduplicated hoursAllocations for contract ${c.id}: removed ${allocs.length - deduped.length} duplicate(s)`
      );
    }
    return { ...c, hoursAllocations: deduped };
  });

  // Normalise invoices
  const rawInvoices = (rawBiz.invoices as Record<string, unknown>[]) ?? [];
  const normalisedInvoices = rawInvoices.map((inv) =>
    normaliseInvoice(inv, String(firstContractId), { ...rawBiz, rateSettings: rs })
  );

  // Fix HST remittance quarter format if needed
  const rawRemittances = (
    rawBiz.hstRemittances as Record<string, unknown>[]
  ) ?? [];
  const normalisedRemittances = rawRemittances.map((r) => {
    const quarter = String(r.quarter ?? "");
    // Already correct format "Q1-2026" — leave alone
    return { ...r, quarter };
  });

  const business: Business = {
    clientName: String(rawBiz.clientName ?? ""),
    contracts: normalisedContracts as unknown as Business["contracts"],
    invoices: normalisedInvoices,
    hstRemittances: normalisedRemittances as Business["hstRemittances"],
    corporateInstalments:
      (rawBiz.corporateInstalments as Business["corporateInstalments"]) ?? [],
    payrollRemittances:
      (rawBiz.payrollRemittances as Business["payrollRemittances"]) ?? [],
    arrearsHST: toFixed2(Number(rawBiz.arrearsHST ?? 0)),
    arrearsCorp: toFixed2(Number(rawBiz.arrearsCorp ?? 0)),
    arrearsPayments:
      (rawBiz.arrearsPayments as Business["arrearsPayments"]) ?? [],
    rateSettings: {
      hstRate: (rs.hstRate as Business["rateSettings"]["hstRate"]) ?? [],
      quickMethodRate:
        (rs.quickMethodRate as Business["rateSettings"]["quickMethodRate"]) ??
        [],
      payrollDraw:
        (rs.payrollDraw as Business["rateSettings"]["payrollDraw"]) ?? [],
      corpTaxInstalment:
        (rs.corpTaxInstalment as Business["rateSettings"]["corpTaxInstalment"]) ??
        [],
    },
    // Retain legacy scalars for compatibility
    hourlyRate: Number(rawBiz.hourlyRate ?? 0),
    annualHours: Number(rawBiz.annualHours ?? 2000),
    fiscalYear: Number(rawBiz.fiscalYear ?? new Date().getFullYear()),
  };

  return {
    accounts: bankAccounts,
    creditCards,
    transactions,
    categories,
    business,
    warnings,
  };
}
