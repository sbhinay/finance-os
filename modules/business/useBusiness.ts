"use client";

import { useState, useCallback } from "react";
import {
  Business,
  Invoice,
  Contract,
  ContractRateHistory,
  HoursAllocation,
  HSTRemittance,
  PayrollRemittance,
  ArrearsPayment,
  ArrearsType,
  RateSettings,
  RateEntry,
  PayrollDrawEntry,
} from "@/types/business";
import { Transaction } from "@/types/transaction";
import { Account } from "@/types/account";
import { businessRepository } from "@/repositories/businessRepository";
import { accountRepository } from "@/repositories/accountRepository";
import { transactionRepository } from "@/repositories/transactionRepository";
import {
  uid,
  toFixed2,
  getRateOnDate,
  workFiscalYear,
  parseHSTQuarter,
} from "@/utils/finance";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Recalculates all unpaid HST remittance amounts from invoice list.
 * Called any time invoices change. Mirrors prototype's auto-update logic.
 */
function recalcHSTRemittances(
  remittances: HSTRemittance[],
  invoices: Invoice[]
): HSTRemittance[] {
  return remittances.map((r) => {
    if (r.paid) return r; // never touch paid obligations
    const auto = calcHSTFromInvoices(r.quarter, invoices);
    return auto > 0 ? { ...r, amount: auto } : r;
  });
}

/**
 * Calculate HST to remit for a quarter from invoice list.
 * Quarter format: "Q1-2026". Cash basis — uses paymentDate.
 * Exported so UI components can display the auto-calculated value.
 */
export function calcHSTFromInvoices(
  quarter: string,
  invoices: Invoice[]
): number {
  const parsed = parseHSTQuarter(quarter);
  if (!parsed) return 0;
  const { months, year } = parsed;
  return toFixed2(
    (invoices ?? [])
      .filter((i) => {
        if (!i.paymentDate) return false;
        const pd = new Date(i.paymentDate.slice(0, 10) + "T12:00:00");
        return months.includes(pd.getMonth() + 1) && pd.getFullYear() === year;
      })
      .reduce((s, i) => s + (i.hstToRemit ?? 0), 0)
  );
}

/**
 * Build a CRA expense transaction for obligation/arrears payments.
 * The transaction id is pre-set so it can be stored on the source record (txnId).
 */
function buildCRATransaction(
  id: string,
  amount: number,
  date: string,
  accountId: string,
  description: string
): Transaction {
  return {
    id,
    type: "expense",
    date: new Date().toISOString().split("T")[0],
  currency: "CAD",
  status: "cleared" as const,
    amount,
    description,
    sourceId: accountId,
    createdAt: new Date().toISOString(),
    tag: "Business",
    mode: "Bank Transfer",
  };
}

/**
 * Reduce/restore an arrears balance when payments are added, edited, or deleted.
 * sign: -1 to reduce (payment logged), +1 to restore (payment deleted/edited).
 * "Both" splits proportionally by current balance.
 */
function applyArrearsBalance(
  biz: Business,
  type: ArrearsType,
  amount: number,
  sign: -1 | 1
): Business {
  const delta = toFixed2(amount * sign);
  if (type === "HST") {
    return { ...biz, arrearsHST: toFixed2(Math.max(0, biz.arrearsHST + delta)) };
  }
  if (type === "Corporate") {
    return {
      ...biz,
      arrearsCorp: toFixed2(Math.max(0, biz.arrearsCorp + delta)),
    };
  }
  // Both — split proportionally
  const total = biz.arrearsHST + biz.arrearsCorp;
  if (total <= 0) return biz;
  const hstShare = toFixed2(amount * (biz.arrearsHST / total));
  const corpShare = toFixed2(amount - hstShare);
  return {
    ...biz,
    arrearsHST: toFixed2(Math.max(0, biz.arrearsHST + hstShare * sign)),
    arrearsCorp: toFixed2(Math.max(0, biz.arrearsCorp + corpShare * sign)),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBusiness() {
  const [business, setBusiness] = useState<Business>(() => businessRepository.get());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => setBusiness(businessRepository.get()), []);

  // Persist + update local state atomically
  const commit = useCallback((biz: Business) => {
    businessRepository.save(biz);
    setBusiness(biz);
    setError(null);
  }, []);

  // ── Accounts helper (read-only inside this hook) ──
  const getAccounts = (): Account[] => accountRepository.getAll();

  // ── Transaction helpers ───────────────────────────────────────────────────

  const addTransactionAndDebit = useCallback(
    (txn: Transaction, accountId: string) => {
      transactionRepository.add(txn);
      const accounts = getAccounts();
      const updated = accounts.map((a) =>
        a.id === accountId
          ? { ...a, openingBalance: toFixed2(a.openingBalance - txn.amount) }
          : a
      );
      accountRepository.saveAll(updated);
    },
    []
  );

  const deleteTransactionAndCredit = useCallback((txnId: string) => {
    const txns = transactionRepository.getAll();
    const txn = txns.find((t) => t.id === txnId);
    if (!txn) return;
    transactionRepository.saveAll(txns.filter((t) => t.id !== txnId));
    if (txn.type === "expense") {
      const accounts = getAccounts();
      const updated = accounts.map((a) =>
        a.id === txn.sourceId
          ? { ...a, openingBalance: toFixed2(a.openingBalance + txn.amount) }
          : a
      );
      accountRepository.saveAll(updated);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACTS
  // ═══════════════════════════════════════════════════════════════════════════

  const addContract = useCallback(
    (fields: Omit<Contract, "id" | "rateHistory" | "hoursAllocations">) => {
      const biz = businessRepository.get();
      const contract: Contract = {
        ...fields,
        id: uid(),
        rateHistory: [
          {
            id: uid(),
            rate: 0,
            effectiveFrom: new Date().toISOString().split("T")[0],
            note: "Initial rate",
          },
        ],
        hoursAllocations: [],
      };
      commit({ ...biz, contracts: [...biz.contracts, contract] });
    },
    [commit]
  );

  const updateContract = useCallback(
    (updated: Contract) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        contracts: biz.contracts.map((c) =>
          c.id === updated.id ? updated : c
        ),
      });
    },
    [commit]
  );

  const deleteContract = useCallback(
    (contractId: string) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        contracts: biz.contracts.filter((c) => c.id !== contractId),
        // Invoices keep their data but lose the contract link
      });
    },
    [commit]
  );

  const addContractRate = useCallback(
    (contractId: string) => {
      const biz = businessRepository.get();
      const rate: ContractRateHistory = {
        id: uid(),
        rate: 0,
        effectiveFrom: new Date().toISOString().split("T")[0],
        note: "",
      };
      commit({
        ...biz,
        contracts: biz.contracts.map((c) =>
          c.id === contractId
            ? { ...c, rateHistory: [...c.rateHistory, rate] }
            : c
        ),
      });
    },
    [commit]
  );

  const updateContractRate = useCallback(
    (
      contractId: string,
      rateId: string,
      field: keyof ContractRateHistory,
      value: string | number
    ) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        contracts: biz.contracts.map((c) =>
          c.id === contractId
            ? {
                ...c,
                rateHistory: c.rateHistory.map((r) =>
                  r.id === rateId
                    ? { ...r, [field]: field === "rate" ? toFixed2(Number(value)) : value }
                    : r
                ),
              }
            : c
        ),
      });
    },
    [commit]
  );

  const deleteContractRate = useCallback(
    (contractId: string, rateId: string) => {
      const biz = businessRepository.get();
      const contract = biz.contracts.find((c) => c.id === contractId);
      if (!contract || contract.rateHistory.length <= 1) {
        setError("Cannot delete the last rate entry.");
        return;
      }
      commit({
        ...biz,
        contracts: biz.contracts.map((c) =>
          c.id === contractId
            ? { ...c, rateHistory: c.rateHistory.filter((r) => r.id !== rateId) }
            : c
        ),
      });
    },
    [commit]
  );

  const addHoursAllocation = useCallback(
    (contractId: string) => {
      const biz = businessRepository.get();
      const now = new Date();
      const fy = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
      const alloc: HoursAllocation = { id: uid(), fiscalYear: fy, totalHours: 2000 };
      commit({
        ...biz,
        contracts: biz.contracts.map((c) =>
          c.id === contractId
            ? { ...c, hoursAllocations: [...(c.hoursAllocations ?? []), alloc] }
            : c
        ),
      });
    },
    [commit]
  );

  const updateHoursAllocation = useCallback(
    (
      contractId: string,
      allocId: string,
      field: "fiscalYear" | "totalHours",
      value: number
    ) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        contracts: biz.contracts.map((c) =>
          c.id === contractId
            ? {
                ...c,
                hoursAllocations: (c.hoursAllocations ?? []).map((a) =>
                  a.id === allocId ? { ...a, [field]: value } : a
                ),
              }
            : c
        ),
      });
    },
    [commit]
  );

  const deleteHoursAllocation = useCallback(
    (contractId: string, allocId: string) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        contracts: biz.contracts.map((c) =>
          c.id === contractId
            ? {
                ...c,
                hoursAllocations: (c.hoursAllocations ?? []).filter(
                  (a) => a.id !== allocId
                ),
              }
            : c
        ),
      });
    },
    [commit]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // INVOICES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute all derived invoice fields from raw input.
   * Mirrors prototype's calc useMemo + save() logic exactly.
   */
  const calcInvoiceFields = useCallback(
    (
      hours: number,
      hourlyRate: number,
      invoiceDateStr: string,
      paymentDateStr: string | undefined,
      workMonth: number,
      workYear: number,
      rs: RateSettings
    ) => {
      const subtotal = toFixed2(hours * hourlyRate);
      const dateForRates = invoiceDateStr || paymentDateStr || new Date().toISOString().split("T")[0];
      const hstRateEntry = getRateOnDate(rs.hstRate, dateForRates);
      const qmRateEntry = getRateOnDate(rs.quickMethodRate, dateForRates);
      const hstRateVal = hstRateEntry?.value ?? 0.13;
      const qmRateVal = qmRateEntry?.value ?? 0.088;
      const hst = toFixed2(subtotal * hstRateVal);
      const total = toFixed2(subtotal + hst);
      const hstToRemit = toFixed2(total * qmRateVal);
      const hstKept = toFixed2(hst - hstToRemit);

      // HST quarter assigned by payment received date (cash basis), else work month
      const dateForHST = paymentDateStr || invoiceDateStr;
      const hstDate = dateForHST
        ? new Date(dateForHST + "T12:00:00")
        : new Date(workYear, workMonth - 1, 1);
      const hstMonth = hstDate.getMonth() + 1;
      const hstCalendarYear = hstDate.getFullYear();

      // Quarter string as "Q{n}-{year}" — dynamic, never hardcoded
      const qNum = Math.ceil(hstMonth / 3);
      const quarter = `Q${qNum}-${hstCalendarYear}`;

      const wfy = workFiscalYear(workMonth, workYear);

      return {
        subtotal,
        hst,
        total,
        hstToRemit,
        hstKept,
        hstRateVal,
        qmRateVal,
        quarter,
        hstCalendarYear,
        workFiscalYear: wfy,
        fiscalYear: wfy,
      };
    },
    []
  );

  const getNextInvoiceNumber = useCallback(
    (workYear: number): string => {
      const biz = businessRepository.get();
      const prefix = `INV-${workYear}-`;
      const nums = biz.invoices
        .map((i) => i.invoiceNumber)
        .filter((n) => n?.startsWith(prefix))
        .map((n) => parseInt(n.replace(prefix, "")) || 0);
      return `${prefix}${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
    },
    []
  );

  const saveInvoice = useCallback(
    (
      fields: Omit<
        Invoice,
        | "id"
        | "subtotal"
        | "hst"
        | "total"
        | "hstToRemit"
        | "hstKept"
        | "hstRateVal"
        | "qmRateVal"
        | "quarter"
        | "hstCalendarYear"
        | "workFiscalYear"
        | "fiscalYear"
      > & { id?: string }
    ) => {
      const biz = businessRepository.get();
      const rs = biz.rateSettings;

      const derived = calcInvoiceFields(
        fields.hours,
        fields.hourlyRate,
        fields.invoiceDate,
        fields.paymentDate,
        fields.workMonth,
        fields.workYear,
        rs
      );

      const inv: Invoice = {
        ...fields,
        id: fields.id ?? uid(),
        invoiceNumber: fields.invoiceNumber || getNextInvoiceNumber(fields.workYear),
        ...derived,
      };

      const isNew = !fields.id;
      const wasReceived = !isNew
        ? biz.invoices.find((x) => x.id === fields.id)?.paymentDate
        : undefined;
      const paymentDateChanged =
        !isNew && inv.paymentDate && inv.paymentDate !== (wasReceived ?? "");

      // Upsert invoice
      let newBiz: Business = {
        ...biz,
        invoices: isNew
          ? [...biz.invoices, inv]
          : biz.invoices.map((x) => (x.id === inv.id ? inv : x)),
      };

      // Auto-recalculate unpaid HST remittances
      newBiz = {
        ...newBiz,
        hstRemittances: recalcHSTRemittances(
          newBiz.hstRemittances,
          newBiz.invoices
        ),
      };

      commit(newBiz);

      // Bank balance update: only when payment is newly received or date changed
      if (inv.depositAccount && inv.paymentDate) {
        if (isNew || paymentDateChanged) {
          const accounts = getAccounts();
          const updatedAccounts = accounts.map((a) => {
            if (a.name !== inv.depositAccount) return a;
            let b = a.openingBalance;
            // If date changed, reverse the old total first
            if (paymentDateChanged && wasReceived) b = toFixed2(b - inv.total);
            b = toFixed2(b + inv.total);
            return { ...a, openingBalance: b };
          });
          accountRepository.saveAll(updatedAccounts);
        }
      }
    },
    [commit, calcInvoiceFields, getNextInvoiceNumber]
  );

  const deleteInvoice = useCallback(
    (invoiceId: string) => {
      const biz = businessRepository.get();
      const inv = biz.invoices.find((x) => x.id === invoiceId);
      if (!inv) return;

      let newBiz: Business = {
        ...biz,
        invoices: biz.invoices.filter((x) => x.id !== invoiceId),
      };
      newBiz = {
        ...newBiz,
        hstRemittances: recalcHSTRemittances(
          newBiz.hstRemittances,
          newBiz.invoices
        ),
      };
      commit(newBiz);

      // Reverse bank balance if payment had been received
      if (inv.depositAccount && inv.paymentDate) {
        const accounts = getAccounts();
        const updated = accounts.map((a) =>
          a.name === inv.depositAccount
            ? { ...a, openingBalance: toFixed2(a.openingBalance - inv.total) }
            : a
        );
        accountRepository.saveAll(updated);
      }
    },
    [commit]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // HST REMITTANCES
  // ═══════════════════════════════════════════════════════════════════════════

  const addHSTRemittance = useCallback(
    (fields: Omit<HSTRemittance, "id" | "paid" | "paidDate" | "txnId">) => {
      const biz = businessRepository.get();
      // Auto-fill amount from invoices
      const autoAmt = calcHSTFromInvoices(fields.quarter, biz.invoices);
      const remittance: HSTRemittance = {
        ...fields,
        id: uid(),
        amount: autoAmt > 0 ? autoAmt : fields.amount,
        paid: false,
        paidDate: null,
        txnId: null,
      };
      commit({ ...biz, hstRemittances: [...biz.hstRemittances, remittance] });
    },
    [commit]
  );

  const updateHSTRemittance = useCallback(
    (updated: Partial<HSTRemittance> & { id: string }) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        hstRemittances: biz.hstRemittances.map((r) =>
          r.id === updated.id ? { ...r, ...updated } : r
        ),
      });
    },
    [commit]
  );

  const deleteHSTRemittance = useCallback(
    (id: string) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        hstRemittances: biz.hstRemittances.filter((r) => r.id !== id),
      });
    },
    [commit]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // OBLIGATIONS — Mark Paid / Unpay (txnId cascade)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Mark any CRA obligation as paid.
   * Creates a linked transaction and debits the bank account.
   * Stores txnId on the obligation for clean reversal.
   */
  const markObligationPaid = useCallback(
    (
      obligationId: string,
      type: "HST" | "Corp Tax" | "Payroll",
      amount: number,
      accountId: string,
      paidDate: string,
      label: string
    ) => {
      if (!accountId) { setError("Select an account to pay from."); return; }
      const biz = businessRepository.get();
      const txnId = uid();

      // Update obligation
      const newBiz = { ...biz };
      if (type === "HST") {
        newBiz.hstRemittances = biz.hstRemittances.map((r) =>
          r.id === obligationId ? { ...r, paid: true, paidDate, txnId } : r
        );
      } else if (type === "Corp Tax") {
        newBiz.corporateInstalments = biz.corporateInstalments.map((i) =>
          i.id === obligationId ? { ...i, paid: true, paidDate, txnId } : i
        );
      } else if (type === "Payroll") {
        newBiz.payrollRemittances = biz.payrollRemittances.map((p) =>
          p.id === obligationId ? { ...p, paid: true, paidDate, txnId } : p
        );
      }

      commit(newBiz);

      // Auto-create linked transaction
      const txn = buildCRATransaction(
        txnId,
        amount,
        paidDate,
        accountId,
        `CRA Payment — ${label}`
      );
      addTransactionAndDebit(txn, accountId);
    },
    [commit, addTransactionAndDebit]
  );

  /**
   * Unpay an obligation — reverses the transaction and bank balance.
   * txnId cascade: finds the linked transaction and deletes it.
   */
  const unpayObligation = useCallback(
    (
      obligationId: string,
      type: "HST" | "Corp Tax" | "Payroll",
      txnId: string | null | undefined
    ) => {
      const biz = businessRepository.get();

      const newBiz = { ...biz };
      if (type === "HST") {
        newBiz.hstRemittances = biz.hstRemittances.map((r) =>
          r.id === obligationId
            ? { ...r, paid: false, paidDate: null, txnId: null }
            : r
        );
      } else if (type === "Corp Tax") {
        newBiz.corporateInstalments = biz.corporateInstalments.map((i) =>
          i.id === obligationId
            ? { ...i, paid: false, paidDate: null, txnId: null }
            : i
        );
      } else if (type === "Payroll") {
        newBiz.payrollRemittances = biz.payrollRemittances.map((p) =>
          p.id === obligationId
            ? { ...p, paid: false, paidDate: null, txnId: null }
            : p
        );
      }

      commit(newBiz);

      if (txnId) {
        deleteTransactionAndCredit(txnId);
      }
      // Legacy records without txnId — caller should warn user
    },
    [commit, deleteTransactionAndCredit]
  );

  const updateObligationPlannedDate = useCallback(
    (
      obligationId: string,
      type: "HST" | "Corp Tax" | "Payroll",
      date: string
    ) => {
      const biz = businessRepository.get();
      const newBiz = { ...biz };
      if (type === "HST") {
        newBiz.hstRemittances = biz.hstRemittances.map((r) =>
          r.id === obligationId ? { ...r, plannedDate: date } : r
        );
      } else if (type === "Corp Tax") {
        newBiz.corporateInstalments = biz.corporateInstalments.map((i) =>
          i.id === obligationId ? { ...i, plannedDate: date } : i
        );
      } else if (type === "Payroll") {
        newBiz.payrollRemittances = biz.payrollRemittances.map((p) =>
          p.id === obligationId ? { ...p, plannedDate: date } : p
        );
      }
      commit(newBiz);
    },
    [commit]
  );

  const updateObligationAmount = useCallback(
    (
      obligationId: string,
      type: "HST" | "Corp Tax" | "Payroll",
      amount: number
    ) => {
      const biz = businessRepository.get();
      const newBiz = { ...biz };
      if (type === "HST") {
        newBiz.hstRemittances = biz.hstRemittances.map((r) =>
          r.id === obligationId ? { ...r, amount: toFixed2(amount) } : r
        );
      } else if (type === "Corp Tax") {
        newBiz.corporateInstalments = biz.corporateInstalments.map((i) =>
          i.id === obligationId ? { ...i, amount: toFixed2(amount) } : i
        );
      } else if (type === "Payroll") {
        newBiz.payrollRemittances = biz.payrollRemittances.map((p) =>
          p.id === obligationId ? { ...p, amount: toFixed2(amount) } : p
        );
      }
      commit(newBiz);
    },
    [commit]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CORPORATE INSTALMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add Q1–Q4 instalments for a given year at a given amount.
   * Mirrors prototype's addCorpYear logic.
   */
  const addCorpTaxYear = useCallback(
    (year: number, amountPerQuarter: number) => {
      const biz = businessRepository.get();
      if (biz.corporateInstalments.some((i) => i.year === year)) {
        setError(`Corp tax year ${year} already exists.`);
        return;
      }
      const quarters: Array<{ q: "Q1" | "Q2" | "Q3" | "Q4"; d: string }> = [
        { q: "Q1", d: `${year}-03-31` },
        { q: "Q2", d: `${year}-06-30` },
        { q: "Q3", d: `${year}-09-30` },
        { q: "Q4", d: `${year}-12-31` },
      ];
      const newInsts = quarters.map(({ q, d }) => ({
        id: uid(),
        year,
        quarter: q,
        amount: toFixed2(amountPerQuarter),
        dueDate: d,
        paid: false,
        paidDate: null,
        txnId: null,
      }));
      commit({
        ...biz,
        corporateInstalments: [...biz.corporateInstalments, ...newInsts],
      });
    },
    [commit]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYROLL REMITTANCES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add a new monthly payroll remittance.
   * Due date = 15th of following month. Mirrors prototype's addPayrollMonth logic.
   */
  const addPayrollMonth = useCallback(
    (month: string, amount: number) => {
      // month format: "YYYY-MM"
      const biz = businessRepository.get();
      const id = `pr${month.replace("-", "")}`;
      if (biz.payrollRemittances.find((p) => p.id === id)) {
        setError("Payroll month already exists.");
        return;
      }
      const [yr, mo] = month.split("-").map(Number);
      const nextMo = mo === 12 ? 1 : mo + 1;
      const nextYr = mo === 12 ? yr + 1 : yr;
      const dueDate = `${nextYr}-${String(nextMo).padStart(2, "0")}-15`;
      const p: PayrollRemittance = {
        id,
        month,
        amount: toFixed2(amount),
        dueDate,
        paid: false,
        paidDate: null,
        txnId: null,
      };
      commit({
        ...biz,
        payrollRemittances: [...biz.payrollRemittances, p],
      });
    },
    [commit]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ARREARS
  // ═══════════════════════════════════════════════════════════════════════════

  const setArrearsOpeningBalances = useCallback(
    (arrearsHST: number, arrearsCorp: number) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        arrearsHST: toFixed2(arrearsHST),
        arrearsCorp: toFixed2(arrearsCorp),
      });
    },
    [commit]
  );

  /**
   * Log an arrears payment.
   * If accountId provided: auto-creates a transaction and debits the account.
   * Reduces arrearsHST/arrearsCorp via applyArrearsBalance.
   */
  const addArrearsPayment = useCallback(
    (
      fields: Pick<ArrearsPayment, "amount" | "date" | "type" | "note">,
      accountId?: string
    ) => {
      const biz = businessRepository.get();
      const txnId = accountId ? uid() : null;
      const payment: ArrearsPayment = {
        ...fields,
        id: uid(),
        amount: toFixed2(fields.amount),
        account: accountId,
        txnId,
      };

      const newBiz = applyArrearsBalance(
        { ...biz, arrearsPayments: [...biz.arrearsPayments, payment] },
        payment.type,
        payment.amount,
        -1
      );
      commit(newBiz);

      if (accountId && txnId) {
        const txn = buildCRATransaction(
          txnId,
          payment.amount,
          payment.date,
          accountId,
          `CRA Arrears Payment — ${payment.type}${payment.note ? ` (${payment.note})` : ""}`
        );
        addTransactionAndDebit(txn, accountId);
      }
    },
    [commit, addTransactionAndDebit]
  );

  /**
   * Edit an arrears payment.
   * Delete old transaction → restore old balance → create new transaction → apply new balance.
   */
  const editArrearsPayment = useCallback(
    (
      paymentId: string,
      fields: Pick<ArrearsPayment, "amount" | "date" | "type" | "note">,
      accountId?: string
    ) => {
      const biz = businessRepository.get();
      const old = biz.arrearsPayments.find((p) => p.id === paymentId);
      if (!old) return;

      const newTxnId = accountId ? uid() : null;
      const updated: ArrearsPayment = {
        ...old,
        ...fields,
        amount: toFixed2(fields.amount),
        account: accountId,
        txnId: newTxnId,
      };

      // Restore old, apply new
      let newBiz = applyArrearsBalance(biz, old.type, old.amount, +1);
      newBiz = {
        ...newBiz,
        arrearsPayments: newBiz.arrearsPayments.map((p) =>
          p.id === paymentId ? updated : p
        ),
      };
      newBiz = applyArrearsBalance(newBiz, updated.type, updated.amount, -1);
      commit(newBiz);

      // Delete old transaction
      if (old.txnId) deleteTransactionAndCredit(old.txnId);

      // Create new transaction
      if (accountId && newTxnId) {
        const txn = buildCRATransaction(
          newTxnId,
          updated.amount,
          updated.date,
          accountId,
          `CRA Arrears Payment — ${updated.type}${updated.note ? ` (${updated.note})` : ""}`
        );
        addTransactionAndDebit(txn, accountId);
      }
    },
    [commit, addTransactionAndDebit, deleteTransactionAndCredit]
  );

  /**
   * Delete an arrears payment.
   * Restores arrears balance and reverses the linked transaction.
   */
  const deleteArrearsPayment = useCallback(
    (paymentId: string) => {
      const biz = businessRepository.get();
      const p = biz.arrearsPayments.find((x) => x.id === paymentId);
      if (!p) return;

      let newBiz = applyArrearsBalance(biz, p.type, p.amount, +1);
      newBiz = {
        ...newBiz,
        arrearsPayments: newBiz.arrearsPayments.filter(
          (x) => x.id !== paymentId
        ),
      };
      commit(newBiz);

      if (p.txnId) deleteTransactionAndCredit(p.txnId);
    },
    [commit, deleteTransactionAndCredit]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  const updateRateSettings = useCallback(
    (key: keyof RateSettings, entries: RateEntry[] | PayrollDrawEntry[]) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        rateSettings: { ...biz.rateSettings, [key]: entries },
      });
    },
    [commit]
  );

  const addRateEntry = useCallback(
    (key: "hstRate" | "quickMethodRate" | "corpTaxInstalment", entry: Omit<RateEntry, "id">) => {
      const biz = businessRepository.get();
      const arr = (biz.rateSettings[key] ?? []) as RateEntry[];
      const newEntry: RateEntry = { ...entry, id: uid() };
      commit({
        ...biz,
        rateSettings: { ...biz.rateSettings, [key]: [...arr, newEntry] },
      });
    },
    [commit]
  );

  const updateRateEntry = useCallback(
    (
      key: "hstRate" | "quickMethodRate" | "corpTaxInstalment",
      updated: RateEntry
    ) => {
      const biz = businessRepository.get();
      const arr = (biz.rateSettings[key] ?? []) as RateEntry[];
      commit({
        ...biz,
        rateSettings: {
          ...biz.rateSettings,
          [key]: arr.map((e) => (e.id === updated.id ? updated : e)),
        },
      });
    },
    [commit]
  );

  const deleteRateEntry = useCallback(
    (key: "hstRate" | "quickMethodRate" | "corpTaxInstalment", id: string) => {
      const biz = businessRepository.get();
      const arr = (biz.rateSettings[key] ?? []) as RateEntry[];
      if (arr.length <= 1) { setError("Cannot delete the last rate entry."); return; }
      commit({
        ...biz,
        rateSettings: {
          ...biz.rateSettings,
          [key]: arr.filter((e) => e.id !== id),
        },
      });
    },
    [commit]
  );

  const addPayrollDrawEntry = useCallback(
    (entry: Omit<PayrollDrawEntry, "id">) => {
      const biz = businessRepository.get();
      const arr = biz.rateSettings.payrollDraw ?? [];
      commit({
        ...biz,
        rateSettings: {
          ...biz.rateSettings,
          payrollDraw: [...arr, { ...entry, id: uid() }],
        },
      });
    },
    [commit]
  );

  const updatePayrollDrawEntry = useCallback(
    (updated: PayrollDrawEntry) => {
      const biz = businessRepository.get();
      commit({
        ...biz,
        rateSettings: {
          ...biz.rateSettings,
          payrollDraw: biz.rateSettings.payrollDraw.map((e) =>
            e.id === updated.id ? updated : e
          ),
        },
      });
    },
    [commit]
  );

  const deletePayrollDrawEntry = useCallback(
    (id: string) => {
      const biz = businessRepository.get();
      const arr = biz.rateSettings.payrollDraw;
      if (arr.length <= 1) { setError("Cannot delete the last entry."); return; }
      commit({
        ...biz,
        rateSettings: {
          ...biz.rateSettings,
          payrollDraw: arr.filter((e) => e.id !== id),
        },
      });
    },
    [commit]
  );

  // ─── Return ────────────────────────────────────────────────────────────────

  return {
    business,
    error,
    reloadBusiness: load,
    clearError: () => setError(null),

    // Invoices
    saveInvoice,
    deleteInvoice,
    calcInvoiceFields,
    getNextInvoiceNumber,
    calcHSTFromInvoices,

    // Contracts
    addContract,
    updateContract,
    deleteContract,
    addContractRate,
    updateContractRate,
    deleteContractRate,
    addHoursAllocation,
    updateHoursAllocation,
    deleteHoursAllocation,

    // HST Remittances
    addHSTRemittance,
    updateHSTRemittance,
    deleteHSTRemittance,

    // Obligations (mark paid / unpay)
    markObligationPaid,
    unpayObligation,
    updateObligationPlannedDate,
    updateObligationAmount,

    // Corp Tax
    addCorpTaxYear,

    // Payroll
    addPayrollMonth,

    // Arrears
    setArrearsOpeningBalances,
    addArrearsPayment,
    editArrearsPayment,
    deleteArrearsPayment,

    // Rate Settings
    updateRateSettings,
    addRateEntry,
    updateRateEntry,
    deleteRateEntry,
    addPayrollDrawEntry,
    updatePayrollDrawEntry,
    deletePayrollDrawEntry,
  };
}
