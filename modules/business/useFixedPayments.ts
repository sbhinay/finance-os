"use client";

import { useEffect, useState, useCallback } from "react";
import { FixedPayment, PendingTransaction, PaymentSchedule } from "@/types/domain";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { vehicleRepository, houseLoanRepository } from "@/repositories/assetRepositories";
import { transactionRepository } from "@/repositories/transactionRepository";
import { businessRepository } from "@/repositories/businessRepository";
import { uid, toFixed2, getNextOccurrence, advanceOneInterval } from "@/utils/finance";
import { Transaction, TransactionType, TransactionSubType } from "@/types/transaction";
import { notifyDataChanged } from "@/utils/events";
import { syncBalances } from "@/utils/syncBalances";

// ─── Schedule interval helper ─────────────────────────────────────────────────

const SCHED_DAYS: Partial<Record<PaymentSchedule, number>> = {
  Weekly: 7, "Bi-weekly": 14, "Semi-monthly": 15, Monthly: 30, Annual: 365,
};

function getOccurrencesBetween(
  anchorDateStr: string,
  schedule: PaymentSchedule,
  windowStart: Date,
  windowEnd: Date
): string[] {
  if (!anchorDateStr || schedule === "One-time") return [];
  const interval = SCHED_DAYS[schedule];
  if (!interval) return [];
  const results: string[] = [];
  let d = new Date(anchorDateStr + "T12:00:00");
  while (d < windowStart) d = new Date(d.getTime() + interval * 86400000);
  while (d <= windowEnd) {
    results.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + interval * 86400000);
  }
  return results;
}

// ─── Backfill: calculate all past payment dates from startDate to today ───────

export function calculateBackfillDates(
  startDate: string,
  schedule: PaymentSchedule,
  endDate?: string
): string[] {
  if (!startDate || schedule === "One-time") return [];
  const interval = SCHED_DAYS[schedule];
  if (!interval) return [];

  const today = new Date();
  today.setHours(23, 59, 59, 0);
  const end = endDate ? new Date(Math.min(new Date(endDate + "T12:00:00").getTime(), today.getTime())) : today;

  const dates: string[] = [];
  let d = new Date(startDate + "T12:00:00");

  if (schedule === "Monthly") {
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d = new Date(d);
      d.setMonth(d.getMonth() + 1);
    }
  } else if (schedule === "Annual") {
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d = new Date(d);
      d.setFullYear(d.getFullYear() + 1);
    }
  } else {
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + interval * 86400000);
    }
  }

  return dates;
}

// ─── Pending generation ───────────────────────────────────────────────────────

export function generatePendingTransactions(
  fixedPayments: FixedPayment[],
  lastSaved: string | null,
  dismissedKeys: string[],
  existingPending: PendingTransaction[],
  extraSources?: {
    vehicles?: Array<{ id: string; name: string; payment: number; nextPaymentDate: string; schedule: PaymentSchedule; source: string }>;
    houseLoans?: Array<{ id: string; name: string; payment: number; nextPaymentDate: string; schedule: PaymentSchedule; source: string }>;
    payrollRemittances?: Array<{ id: string; month: string; amount: number; dueDate: string; plannedDate?: string; paid: boolean }>;
    corporateInstalments?: Array<{ id: string; year: number; quarter: string; amount: number; dueDate: string; plannedDate?: string; paid: boolean }>;
    hstRemittances?: Array<{ id: string; quarter: string; amount: number; dueDate: string; plannedDate?: string; paid: boolean }>;
    propertyTaxes?: Array<{ id: string; name: string; payments: Array<{ id: string; amount: number; date: string; paid: boolean }> }>;
  }
): PendingTransaction[] {
  const today = new Date();
  today.setHours(23, 59, 59, 0);
  const windowStart = lastSaved ? new Date(lastSaved) : new Date(today.getTime() - 86400000);
  windowStart.setHours(0, 0, 0, 0);

  const existingKeys = new Set(existingPending.map((p) => p.key));
  const blockedKeys = new Set(dismissedKeys);
  const newPending = [...existingPending];

  function addIfNew(key: string, entry: Omit<PendingTransaction, "key" | "id" | "createdAt">) {
    if (!existingKeys.has(key) && !blockedKeys.has(key)) {
      existingKeys.add(key);
      newPending.push({ ...entry, key, id: uid(), createdAt: new Date().toISOString() });
    }
  }

  const todayStr = today.toISOString().slice(0, 10);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  // Fixed payments
  fixedPayments.forEach((p) => {
    if (!p.amount || !p.date) return;
    if (p.endDate && new Date(p.endDate + "T12:00:00") < windowStart) return;
    const dates = getOccurrencesBetween(p.date, p.schedule, windowStart, today);
    dates.forEach((dateStr) => {
      addIfNew(`fp_${p.id}_${dateStr}`, {
        sourceType: "fixed", sourceId: p.id,
        name: p.name, amount: p.amount, dueDate: dateStr,
        account: p.source,
        category: p.categoryId ?? "",  // store categoryId not string
        type: "Expense", mode: p.mode ?? "Debit", tag: (p.tag ?? "Personal") as "Personal" | "Business",
      });
    });
  });

  // Vehicles
  (extraSources?.vehicles ?? []).forEach((v) => {
    if (!v.payment || !v.nextPaymentDate) return;
    const dates = getOccurrencesBetween(v.nextPaymentDate, v.schedule, windowStart, today);
    dates.forEach((dateStr) => {
      addIfNew(`v_${v.id}_${dateStr}`, {
        sourceType: "vehicle", sourceId: v.id,
        name: `${v.name} Payment`, amount: v.payment, dueDate: dateStr,
        account: v.source, category: "",
        type: "Expense", mode: "Debit", tag: "Personal", linkedVehicleId: v.id,
      });
    });
  });

  // House loans
  (extraSources?.houseLoans ?? []).forEach((l) => {
    if (!l.payment || !l.nextPaymentDate) return;
    const dates = getOccurrencesBetween(l.nextPaymentDate, l.schedule, windowStart, today);
    dates.forEach((dateStr) => {
      addIfNew(`hl_${l.id}_${dateStr}`, {
        sourceType: "loan", sourceId: l.id,
        name: `${l.name} Mortgage Payment`, amount: l.payment, dueDate: dateStr,
        account: l.source, category: "",
        type: "Expense", mode: "Debit", tag: "Personal",
      });
    });
  });

  // CRA payroll — type will be tax_payment/payroll_remittance
  (extraSources?.payrollRemittances ?? []).forEach((r) => {
    if (r.paid || !r.dueDate) return;
    const alertDate = r.plannedDate ?? r.dueDate;
    if (alertDate >= windowStartStr && alertDate <= todayStr) {
      addIfNew(`pr_${r.id}`, {
        sourceType: "cra_payroll", sourceId: r.id,
        name: `CRA Payroll Remittance — ${r.month}`, amount: r.amount, dueDate: alertDate,
        account: "", category: "",
        type: "Expense", mode: "Bank Transfer", tag: "Business",
      });
    }
  });

  // CRA corp tax
  (extraSources?.corporateInstalments ?? []).forEach((i) => {
    if (i.paid || !i.dueDate) return;
    const alertDate = i.plannedDate ?? i.dueDate;
    if (alertDate >= windowStartStr && alertDate <= todayStr) {
      addIfNew(`ci_${i.id}`, {
        sourceType: "cra_corp", sourceId: i.id,
        name: `Corp Tax ${i.year} ${i.quarter}`, amount: i.amount, dueDate: alertDate,
        account: "", category: "",
        type: "Expense", mode: "Bank Transfer", tag: "Business",
      });
    }
  });

  // HST remittances
  (extraSources?.hstRemittances ?? []).filter((h) => !h.paid && h.amount > 0).forEach((h) => {
    const alertDate = h.plannedDate ?? h.dueDate;
    if (alertDate >= windowStartStr && alertDate <= todayStr) {
      addIfNew(`hst_${h.id}`, {
        sourceType: "cra_hst", sourceId: h.id,
        name: `HST Remittance ${h.quarter}`, amount: h.amount, dueDate: alertDate,
        account: "", category: "",
        type: "Expense", mode: "Bank Transfer", tag: "Business",
      });
    }
  });

  // Property tax
  (extraSources?.propertyTaxes ?? []).forEach((prop) => {
    (prop.payments ?? []).filter((p) => !p.paid && p.date).forEach((p) => {
      if (p.date >= windowStartStr && p.date <= todayStr) {
        addIfNew(`pt_${p.id}`, {
          sourceType: "propertytax", sourceId: p.id,
          name: `Property Tax — ${prop.name}`, amount: p.amount, dueDate: p.date,
          account: "", category: "",
          type: "Expense", mode: "Bank Transfer", tag: "Personal",
        });
      }
    });
  });

  return newPending;
}

// ─── Transaction type helper ──────────────────────────────────────────────────

function getTransactionType(sourceType: string): { type: TransactionType; subType?: TransactionSubType } {
  switch (sourceType) {
    case "cra_hst":     return { type: "tax_payment", subType: "hst_remittance" };
    case "cra_corp":    return { type: "tax_payment", subType: "corp_tax" };
    case "cra_payroll": return { type: "tax_payment", subType: "payroll_remittance" };
    case "loan":        return { type: "loan_payment", subType: "mortgage" };
    case "vehicle":     return { type: "expense" }; // lease=expense, finance=loan_payment handled at confirm
    default:            return { type: "expense" };
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFixedPayments() {
  const [fixedPayments, setFixedPayments] = useState<FixedPayment[]>([]);
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);

  const load = useCallback(() => {
    fixedPaymentRepository.pruneOldDismissedKeys();
    const fps = fixedPaymentRepository.getAll();
    const dismissed = fixedPaymentRepository.getDismissedKeys();
    const biz = businessRepository.get();

    const generated = generatePendingTransactions(fps, null, dismissed, [], {
      payrollRemittances: biz.payrollRemittances,
      corporateInstalments: biz.corporateInstalments,
      hstRemittances: biz.hstRemittances,
    });

    setFixedPayments(fps);
    setDismissedKeys(dismissed);
    setPending(generated);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Fixed payment CRUD ─────────────────────────────────────────────────────

  const addFixedPayment = useCallback((fields: Omit<FixedPayment, "id">) => {
    const all = fixedPaymentRepository.getAll();
    const fp: FixedPayment = { ...fields, id: uid(), amount: toFixed2(fields.amount) };
    fixedPaymentRepository.saveAll([...all, fp]);
    load();
  }, [load]);

  const updateFixedPayment = useCallback((updated: FixedPayment) => {
    const all = fixedPaymentRepository.getAll();
    fixedPaymentRepository.saveAll(all.map((p) => p.id === updated.id ? updated : p));
    load();
  }, [load]);

  const deleteFixedPayment = useCallback((id: string) => {
    fixedPaymentRepository.saveAll(fixedPaymentRepository.getAll().filter((p) => p.id !== id));
    load();
  }, [load]);

  // ── Backfill historical payments ───────────────────────────────────────────

  const backfillPayments = useCallback((
    fp: FixedPayment,
    dates: string[],
    accountId: string
  ): number => {
    if (!dates.length || !accountId) return 0;
    const existing = transactionRepository.getAll();

    // Find dates that already have a matching transaction
    const existingDates = new Set(
      existing
        .filter((t) => t.description === fp.name || t.description?.includes(fp.name))
        .map((t) => t.date ?? t.createdAt?.slice(0, 10))
    );

    let count = 0;
    dates.forEach((date) => {
      if (existingDates.has(date)) return; // skip duplicates
      const txn: Transaction = {
        id: uid(),
        type: "expense",
        amount: toFixed2(fp.amount),
        description: fp.name,
        sourceId: accountId,
        date,
        createdAt: new Date().toISOString(),
        currency: "CAD",
        status: "cleared",
        categoryId: fp.categoryId || undefined,
        tag: (fp.tag ?? "Personal") as "Personal" | "Business",
        mode: (fp.mode ?? "Debit") as Transaction["mode"],
      };
      transactionRepository.add(txn);
      count++;
    });

    if (count > 0) {
      syncBalances();
      notifyDataChanged("transactions");
    }
    return count;
  }, []);

  // ── Log payment (+ Log button) ─────────────────────────────────────────────

  const logPayment = useCallback((
    fp: FixedPayment,
    amount: number,
    date: string,
    accountId: string,
    categoryId?: string,
    mode?: Transaction["mode"],
    tag?: "Personal" | "Business",
    description?: string
  ) => {
    if (!amount || !date) return;
    const txn: Transaction = {
      id: uid(),
      type: "expense",
      amount: toFixed2(amount),
      description: description || fp.name,
      sourceId: accountId,
      date,
      createdAt: new Date().toISOString(),
      currency: "CAD",
      status: "cleared",
      categoryId: categoryId || undefined,
      tag: tag ?? "Personal",
      mode: mode ?? "Debit",
    };
    transactionRepository.add(txn);
    syncBalances();
    notifyDataChanged("transactions");

    if (fp.schedule !== "One-time") {
      const all = fixedPaymentRepository.getAll();
      fixedPaymentRepository.saveAll(all.map((f) =>
        f.id === fp.id ? { ...f, date: advanceOneInterval(f.date, f.schedule) } : f
      ));
    }
    load();
  }, [load]);

  // ── Confirm pending ────────────────────────────────────────────────────────

  const confirmPending = useCallback((p: PendingTransaction) => {
    // CRA items don't need an account check — they'll be handled via TaxObligations
    const needsAccount = !["cra_payroll", "cra_corp", "cra_hst"].includes(p.sourceType);
    if (needsAccount && !p.account) return;

    const { type, subType } = getTransactionType(p.sourceType);

    const txn: Transaction = {
      id: uid(),
      type,
      subType,
      amount: toFixed2(p.amount),
      description: p.name,
      sourceId: p.account,
      date: p.dueDate,
      createdAt: new Date().toISOString(),
      currency: "CAD",
      status: "cleared",
      categoryId: p.category || undefined,
      tag: p.tag,
      mode: p.mode as Transaction["mode"],
    };

    transactionRepository.add(txn);
    syncBalances();
    notifyDataChanged("transactions");
    fixedPaymentRepository.addDismissedKey(p.key);

    // Auto-advance fixed payment date
    if (p.sourceType === "fixed") {
      const all = fixedPaymentRepository.getAll();
      const fp = all.find((f) => f.name === p.name);
      if (fp && fp.schedule !== "One-time") {
        fixedPaymentRepository.saveAll(all.map((f) =>
          f.id === fp.id ? { ...f, date: advanceOneInterval(f.date, f.schedule) } : f
        ));
      }
    }

    // Auto-advance vehicle nextPaymentDate
    if (p.sourceType === "vehicle") {
      const vehicles = vehicleRepository.getAll();
      const v = vehicles.find((x: any) => x.id === p.sourceId);
      if (v && v.nextPaymentDate) {
        vehicleRepository.saveAll(vehicles.map((x: any) =>
          x.id === v.id ? { ...x, nextPaymentDate: advanceOneInterval(v.nextPaymentDate, v.schedule) } : x
        ));
      }
    }

    // Auto-advance house loan nextPaymentDate
    if (p.sourceType === "loan") {
      const loans = houseLoanRepository.getAll();
      const l = loans.find((x: any) => x.id === p.sourceId);
      if (l && l.nextPaymentDate) {
        houseLoanRepository.saveAll(loans.map((x: any) =>
          x.id === l.id ? { ...x, nextPaymentDate: advanceOneInterval(l.nextPaymentDate, l.schedule) } : x
        ));
      }
    }

    load();
  }, [load]);

  const dismissPending = useCallback((key: string) => {
    fixedPaymentRepository.addDismissedKey(key);
    load();
  }, [load]);

  const dismissAllPending = useCallback(() => {
    pending.forEach((p) => fixedPaymentRepository.addDismissedKey(p.key));
    load();
  }, [pending, load]);

  return {
    fixedPayments, pending, dismissedKeys,
    addFixedPayment, updateFixedPayment, deleteFixedPayment,
    logPayment, backfillPayments,
    confirmPending, dismissPending, dismissAllPending,
    reloadFixedPayments: load,
  };
}