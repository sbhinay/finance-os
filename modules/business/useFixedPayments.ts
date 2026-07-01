"use client";

import {
    useEffect,
    useState,
    useCallback
} from "react";
import {
    FixedPayment,
    PlannedPaymentTransactionType,
    PendingTransaction,
    PaymentSchedule
} from "@/types/domain";
import {
    fixedPaymentRepository
} from "@/repositories/fixedPaymentRepository";
import {
    vehicleRepository,
    houseLoanRepository,
    propertyTaxRepository
} from "@/repositories/assetRepositories";
import {
    transactionRepository
} from "@/repositories/transactionRepository";
import {
    businessRepository
} from "@/repositories/businessRepository";
import {
    uid,
    toFixed2,
    advanceOneInterval,
    shiftOneInterval
} from "@/utils/finance";
import {
    Transaction,
    TransactionType,
    TransactionSubType,
    TransactionPurpose
} from "@/types/transaction";
import {
    buildCanonicalTransaction,
    persistCanonicalTransaction,
    persistCanonicalTransactions,
} from "@/services/transactionPipeline";
import { inferTransactionPurpose, isSemanticDuplicate } from "@/utils/transactionSemantics";

// ─── Schedule interval helper ─────────────────────────────────────────────────
type PaymentSourceWithSchedule = {
    id: string;
    nextPaymentDate ? : string;
    schedule: PaymentSchedule;
};

const SCHED_DAYS: Partial < Record < PaymentSchedule, number >> = {
    Weekly: 7,
    "Bi-weekly": 14,
    "Semi-monthly": 15,
    Monthly: 30,
    Annual: 365,
};

function getOccurrencesBetween(
    anchorDateStr: string,
    schedule: PaymentSchedule,
    windowStart: Date,
    windowEnd: Date
): string[] {
    if (!anchorDateStr || schedule === "One-time") return [];
    const results: string[] = [];
    let d = new Date(anchorDateStr + "T12:00:00");
    while (d < windowStart) d = shiftDateBySchedule(d, schedule, 1);
    while (d <= windowEnd) {
        results.push(d.toISOString().slice(0, 10));
        d = shiftDateBySchedule(d, schedule, 1);
    }
    return results;
}

function getPendingPurpose(
    sourceType: PendingTransaction["sourceType"],
    transactionType?: PlannedPaymentTransactionType,
    subType?: TransactionSubType,
    explicitPurpose?: TransactionPurpose
): TransactionPurpose {
    if (explicitPurpose) return explicitPurpose;
    if (sourceType === "vehicle") return "vehicle_lease_payment";
    if (sourceType === "loan") return "mortgage_payment";
    if (sourceType === "cra_payroll") return "payroll_remittance";
    if (sourceType === "cra_corp") return "corporate_tax_payment";
    if (sourceType === "cra_hst") return "hst_remittance";
    if (transactionType) {
        return inferTransactionPurpose({
            type: transactionType,
            subType,
        }) ?? "recurring_expense";
    }
    return "recurring_expense";
}

function transactionMatchesPending(
    txn: Transaction,
    pending: Omit<PendingTransaction, "key" | "id" | "createdAt">
): boolean {
    if (txn.status === "pending" || txn.type === "adjustment") return false;

    const txnDate = txn.date ?? txn.createdAt?.slice(0, 10) ?? "";
    if (txnDate !== pending.dueDate) return false;
    if (toFixed2(txn.amount) !== toFixed2(pending.amount)) return false;
    if (pending.account && txn.sourceId !== pending.account) return false;

    const candidate = buildCanonicalTransaction({
        purpose: getPendingPurpose(
            pending.sourceType,
            pending.transactionType,
            pending.subType,
            pending.purpose
        ),
        amount: pending.amount,
        date: pending.dueDate,
        sourceId: pending.account,
        destinationId: pending.destinationId,
        categoryId: pending.category || undefined,
        description: pending.name,
        tag: pending.tag,
        mode: pending.mode as Transaction["mode"],
        linkedVehicleId: pending.linkedVehicleId,
        linkedPropertyId: pending.linkedPropertyId,
        recurringOriginType: pending.recurringOriginType,
        recurringOriginId: pending.recurringOriginId,
    });
    if (pending.category && txn.categoryId && txn.categoryId !== pending.category) return false;
    return isSemanticDuplicate(candidate, txn);
}

// ─── Backfill: calculate all past payment dates from startDate to today ───────

export function calculateBackfillDates(
    startDate: string,
    schedule: PaymentSchedule,
    endDate ? : string
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

function shiftDateBySchedule(date: Date, schedule: PaymentSchedule, direction: 1 | -1): Date {
    return new Date(
        shiftOneInterval(date.toISOString().slice(0, 10), schedule, direction) + "T12:00:00"
    );
}

export function calculateBackfillDatesFromAnchor(
    anchorDate: string,
    schedule: PaymentSchedule,
    startDate ? : string,
    endDate ? : string
): string[] {
    if (!anchorDate || schedule === "One-time") return [];

    const today = new Date();
    today.setHours(23, 59, 59, 0);
    const start = startDate ? new Date(startDate + "T12:00:00") : null;
    const end = endDate ? new Date(Math.min(new Date(endDate + "T12:00:00").getTime(), today.getTime())) : today;
    const dates = new Set<string>();

    let d = new Date(anchorDate + "T12:00:00");
    while (d <= end) {
        if (!start || d >= start) dates.add(d.toISOString().slice(0, 10));
        d = shiftDateBySchedule(d, schedule, 1);
    }

    d = shiftDateBySchedule(new Date(anchorDate + "T12:00:00"), schedule, -1);
    while ((!start || d >= start) && d <= end) {
        dates.add(d.toISOString().slice(0, 10));
        d = shiftDateBySchedule(d, schedule, -1);
    }

    return Array.from(dates).sort();
}

// ─── Pending generation ───────────────────────────────────────────────────────

export function generatePendingTransactions(
    fixedPayments: FixedPayment[],
    lastSaved: string | null,
    dismissedKeys: string[],
    existingPending: PendingTransaction[],
    existingTransactions: Transaction[],
    extraSources ? : {
        vehicles ? : Array < {
            id: string;name: string;payment: number;nextPaymentDate: string;schedule: PaymentSchedule;source: string;vtype: "Lease" | "Finance"
        } > ;
        houseLoans ? : Array < {
            id: string;name: string;payment: number;nextPaymentDate: string;schedule: PaymentSchedule;source: string
        } > ;
        payrollRemittances ? : Array < {
            id: string;month: string;amount: number;dueDate: string;plannedDate ? : string;paid: boolean
        } > ;
        corporateInstalments ? : Array < {
            id: string;year: number;quarter: string;amount: number;dueDate: string;plannedDate ? : string;paid: boolean
        } > ;
        hstRemittances ? : Array < {
            id: string;quarter: string;amount: number;dueDate: string;plannedDate ? : string;paid: boolean
        } > ;
        propertyTaxes ? : Array < {
            id: string;name: string;payments: Array < {
                id: string;amount: number;date: string;paid: boolean
            } >
        } > ;
    }
): PendingTransaction[] {
    const today = new Date();
    today.setHours(23, 59, 59, 0);
    const windowStart = lastSaved ? new Date(lastSaved) : new Date(today.getTime() - 86400000);
    windowStart.setHours(0, 0, 0, 0);

    const existingKeys = new Set(existingPending.map((p) => p.key));
    const blockedKeys = new Set(dismissedKeys);
    const newPending = [...existingPending];

    function addIfNew(key: string, entry: Omit < PendingTransaction, "key" | "id" | "createdAt" > ) {
        if (existingTransactions.some((txn) => transactionMatchesPending(txn, entry))) {
            return;
        }
        if (!existingKeys.has(key) && !blockedKeys.has(key)) {
            existingKeys.add(key);
            newPending.push({
                ...entry,
                key,
                id: uid(),
                createdAt: new Date().toISOString()
            });
        }
    }

    const todayStr = today.toISOString().slice(0, 10);
    const windowStartStr = windowStart.toISOString().slice(0, 10);

    // Fixed payments
    fixedPayments.forEach((p) => {
        if (p.archived || !p.amount || !p.date) return;
        if (p.endDate && new Date(p.endDate + "T12:00:00") < windowStart) return;
        const dates = getOccurrencesBetween(p.date, p.schedule, windowStart, today);
        dates.forEach((dateStr) => {
            addIfNew(`fp_${p.id}_${dateStr}`, {
                sourceType: "fixed",
                sourceId: p.id,
                name: p.name,
                amount: p.amount,
                dueDate: dateStr,
                account: p.source,
                category: p.categoryId ?? "", // store categoryId not string
                type: "Expense",
                transactionType: p.transactionType,
                subType: p.subType,
                purpose: getPendingPurpose("fixed", p.transactionType, p.subType, p.purpose),
                recurringOriginType: "fixed_payment",
                recurringOriginId: p.id,
                destinationId: p.destinationId,
                mode: p.mode ?? "Debit",
                tag: (p.tag ?? "Personal") as "Personal" | "Business",
            });
        });
    });

    // Vehicles
    (extraSources?.vehicles ?? []).forEach((v) => {
        if (!v.payment || !v.nextPaymentDate) return;
        const dates = getOccurrencesBetween(v.nextPaymentDate, v.schedule, windowStart, today);
        dates.forEach((dateStr) => {
            addIfNew(`v_${v.id}_${dateStr}`, {
                sourceType: "vehicle",
                sourceId: v.id,
                name: v.vtype === "Finance"
                    ? `Vehicle Finance Payment - ${v.name}`
                    : `Vehicle Lease Payment - ${v.name}`,
                amount: v.payment,
                dueDate: dateStr,
                account: v.source,
                category: "",
                type: "Expense",
                mode: "Debit",
                tag: "Personal",
                linkedVehicleId: v.id,
                recurringOriginType: "vehicle",
                recurringOriginId: v.id,
                purpose: v.vtype === "Finance" ? "vehicle_finance_payment" : "vehicle_lease_payment",
            });
        });
    });

    // House loans
    (extraSources?.houseLoans ?? []).forEach((l) => {
        if (!l.payment || !l.nextPaymentDate) return;
        const dates = getOccurrencesBetween(l.nextPaymentDate, l.schedule, windowStart, today);
        dates.forEach((dateStr) => {
            addIfNew(`hl_${l.id}_${dateStr}`, {
                sourceType: "loan",
                sourceId: l.id,
                name: `Mortgage Payment - ${l.name}`,
                amount: l.payment,
                dueDate: dateStr,
                account: l.source,
                category: "",
                type: "Expense",
                mode: "Debit",
                tag: "Personal",
                linkedPropertyId: l.id,
                recurringOriginType: "house_loan",
                recurringOriginId: l.id,
                purpose: "mortgage_payment",
            });
        });
    });

    // CRA payroll — type will be tax_payment/payroll_remittance
    (extraSources?.payrollRemittances ?? []).forEach((r) => {
        if (r.paid || !r.dueDate) return;
        const alertDate = r.plannedDate ?? r.dueDate;
        if (alertDate >= windowStartStr && alertDate <= todayStr) {
            addIfNew(`pr_${r.id}`, {
                sourceType: "cra_payroll",
                sourceId: r.id,
                name: `CRA Payroll Remittance - ${r.month}`,
                amount: r.amount,
                dueDate: alertDate,
                account: "",
                category: "",
                type: "Expense",
                mode: "Bank Transfer",
                tag: "Business",
                purpose: "payroll_remittance",
                recurringOriginType: "tax_obligation",
                recurringOriginId: r.id,
            });
        }
    });

    // CRA corp tax
    (extraSources?.corporateInstalments ?? []).forEach((i) => {
        if (i.paid || !i.dueDate) return;
        const alertDate = i.plannedDate ?? i.dueDate;
        if (alertDate >= windowStartStr && alertDate <= todayStr) {
            addIfNew(`ci_${i.id}`, {
                sourceType: "cra_corp",
                sourceId: i.id,
                name: `Corp Tax ${i.year} ${i.quarter}`,
                amount: i.amount,
                dueDate: alertDate,
                account: "",
                category: "",
                type: "Expense",
                mode: "Bank Transfer",
                tag: "Business",
                purpose: "corporate_tax_payment",
                recurringOriginType: "tax_obligation",
                recurringOriginId: i.id,
            });
        }
    });

    // HST remittances
    (extraSources?.hstRemittances ?? []).filter((h) => !h.paid && h.amount > 0).forEach((h) => {
        const alertDate = h.plannedDate ?? h.dueDate;
        if (alertDate >= windowStartStr && alertDate <= todayStr) {
            addIfNew(`hst_${h.id}`, {
                sourceType: "cra_hst",
                sourceId: h.id,
                name: `HST Remittance ${h.quarter}`,
                amount: h.amount,
                dueDate: alertDate,
                account: "",
                category: "",
                type: "Expense",
                mode: "Bank Transfer",
                tag: "Business",
                purpose: "hst_remittance",
                recurringOriginType: "tax_obligation",
                recurringOriginId: h.id,
            });
        }
    });

    // Property tax
    (extraSources?.propertyTaxes ?? []).forEach((prop) => {
        (prop.payments ?? []).filter((p) => !p.paid && p.date).forEach((p) => {
            if (p.date >= windowStartStr && p.date <= todayStr) {
                addIfNew(`pt_${p.id}`, {
                    sourceType: "propertytax",
                    sourceId: p.id,
                    name: `Property Tax - ${prop.name}`,
                    amount: p.amount,
                    dueDate: p.date,
                    account: "",
                    category: "",
                    type: "Expense",
                    mode: "Bank Transfer",
                    tag: "Personal",
                    recurringOriginType: "property_tax",
                    recurringOriginId: p.id,
                });
            }
        });
    });

    return newPending;
}

// ─── Transaction type helper ──────────────────────────────────────────────────

function getTransactionType(sourceType: string): {
    type: TransactionType;subType ? : TransactionSubType
} {
    switch (sourceType) {
        case "cra_hst":
            return {
                type: "tax_payment", subType: "hst_remittance"
            };
        case "cra_corp":
            return {
                type: "tax_payment", subType: "corp_tax"
            };
        case "cra_payroll":
            return {
                type: "tax_payment", subType: "payroll_remittance"
            };
        case "loan":
            return {
                type: "loan_payment", subType: "mortgage"
            };
        case "vehicle":
            return {
                type: "expense"
            }; // lease=expense, finance=loan_payment handled at confirm
        default:
            return {
                type: "expense"
            };
    }
}

function getFixedPaymentPosting(fp: FixedPayment): {
    type: TransactionType;
    subType?: TransactionSubType;
    destinationId?: string;
    categoryId?: string;
} {
    const transactionType: PlannedPaymentTransactionType = fp.transactionType ?? "expense";
    if (transactionType === "transfer") {
        return {
            type: "transfer",
            subType: fp.subType,
            destinationId: fp.destinationId,
        };
    }
    return {
        type: "expense",
        categoryId: fp.categoryId,
    };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFixedPayments() {
    const [fixedPayments, setFixedPayments] = useState < FixedPayment[] > ([]);
    const [pending, setPending] = useState < PendingTransaction[] > ([]);
    const [dismissedKeys, setDismissedKeys] = useState < string[] > ([]);

    const load = useCallback(() => {
        fixedPaymentRepository.pruneOldDismissedKeys();
        const storedPayments = fixedPaymentRepository.getAll();
        const fps = storedPayments.map((payment) => ({
            ...payment,
            startDate: payment.startDate ?? payment.date,
        }));
        if (storedPayments.some((payment) => !payment.startDate)) {
            fixedPaymentRepository.saveAll(fps);
        }
        const dismissed = fixedPaymentRepository.getDismissedKeys();
        const biz = businessRepository.get();
        const existingTransactions = transactionRepository.getAll();
        const vehicles = vehicleRepository.getAll();
        const houseLoans = houseLoanRepository.getAll();
        const propertyTaxes = propertyTaxRepository.getAll();

        const generated = generatePendingTransactions(fps, null, dismissed, [], existingTransactions, {
            vehicles: vehicles.map((v) => ({
                id: v.id,
                name: v.name,
                payment: v.payment,
                nextPaymentDate: v.nextPaymentDate,
                schedule: v.schedule,
                source: v.source,
                vtype: v.vtype,
            })),
            houseLoans: houseLoans.map((l) => ({
                id: l.id,
                name: l.name,
                payment: l.payment,
                nextPaymentDate: l.nextPaymentDate,
                schedule: l.schedule,
                source: l.source,
            })),
            payrollRemittances: biz.payrollRemittances ?? [],
            corporateInstalments: biz.corporateInstalments ?? [],
            hstRemittances: biz.hstRemittances ?? [],
            propertyTaxes: propertyTaxes.map((prop) => ({
                id: prop.id,
                name: prop.name,
                payments: prop.payments ?? [],
            })),
        });

        setFixedPayments(fps);
        setDismissedKeys(dismissed);
        setPending(generated);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    // ── Fixed payment CRUD ─────────────────────────────────────────────────────

    const addFixedPayment = useCallback((fields: Omit < FixedPayment, "id" > ) => {
        const all = fixedPaymentRepository.getAll();
        const fp: FixedPayment = {
            ...fields,
            id: uid(),
            amount: toFixed2(fields.amount),
            startDate: fields.startDate ?? fields.date,
        };
        fixedPaymentRepository.saveAll([...all, fp]);
        load();
    }, [load]);

    const updateFixedPayment = useCallback((updated: FixedPayment) => {
        const all = fixedPaymentRepository.getAll();
        fixedPaymentRepository.saveAll(all.map((p) => p.id === updated.id ? updated : p));
        load();
    }, [load]);

    const deleteFixedPayment = useCallback((id: string) => {
        const all = fixedPaymentRepository.getAll();
        const hasPostedTransactions = transactionRepository.getAll().some(
            (transaction) =>
                transaction.recurringOriginType === "fixed_payment"
                && transaction.recurringOriginId === id
        );
        fixedPaymentRepository.saveAll(
            hasPostedTransactions
                ? all.map((payment) => payment.id === id ? { ...payment, archived: true } : payment)
                : all.filter((payment) => payment.id !== id)
        );
        load();
    }, [load]);

    // ── Backfill historical payments ───────────────────────────────────────────

    const backfillPayments = useCallback((
        fp: FixedPayment,
        dates: string[],
        accountId: string
    ): number => {
        if (!dates.length || !accountId) return 0;
        const posting = getFixedPaymentPosting(fp);
        const purpose = getPendingPurpose("fixed", fp.transactionType, fp.subType, fp.purpose);
        const candidates = dates.map((date) =>
            buildCanonicalTransaction({
                purpose,
                amount: toFixed2(fp.amount),
                description: fp.name,
                sourceId: accountId,
                destinationId: posting.destinationId,
                date,
                createdAt: new Date().toISOString(),
                status: "cleared",
                categoryId: posting.categoryId || undefined,
                tag: (fp.tag ?? "Personal") as "Personal" | "Business",
                mode: (fp.mode ?? "Debit") as Transaction["mode"],
                recurringOriginType: "fixed_payment",
                recurringOriginId: fp.id,
            })
        );

        const inserted = persistCanonicalTransactions(candidates, { skipSemanticDuplicates: true }).length;
        if (inserted > 0) {
            const nextDate = advanceOneInterval(dates[dates.length - 1], fp.schedule);
            fixedPaymentRepository.saveAll(
                fixedPaymentRepository.getAll().map((payment) =>
                    payment.id === fp.id ? { ...payment, date: nextDate } : payment
                )
            );
            load();
        }
        return inserted;
    }, [load]);

    // ── Log payment (+ Log button) ─────────────────────────────────────────────

    const logPayment = useCallback((
        fp: FixedPayment,
        amount: number,
        date: string,
        accountId: string,
        categoryId ? : string,
        mode ? : Transaction["mode"],
        tag ? : "Personal" | "Business",
        description ? : string
    ) => {
        if (!amount || !date) return;
        const posting = getFixedPaymentPosting(fp);
        const txn = buildCanonicalTransaction({
            purpose: getPendingPurpose("fixed", fp.transactionType, fp.subType, fp.purpose),
            amount: toFixed2(amount),
            description: description || fp.name,
            sourceId: accountId,
            destinationId: posting.destinationId,
            date,
            createdAt: new Date().toISOString(),
            status: "cleared",
            categoryId: (posting.type === "expense" ? (categoryId || posting.categoryId) : undefined) || undefined,
            tag: tag ?? "Personal",
            mode: mode ?? "Debit",
            recurringOriginType: "fixed_payment",
            recurringOriginId: fp.id,
        });
        persistCanonicalTransaction(txn);

        if (fp.schedule !== "One-time") {
            const all = fixedPaymentRepository.getAll();
            fixedPaymentRepository.saveAll(all.map((f) =>
                f.id === fp.id ? {
                    ...f,
                    date: advanceOneInterval(date, f.schedule)
                } : f
            ));
        }
        load();
    }, [load]);

    // ── Confirm pending ────────────────────────────────────────────────────────

    const confirmPending = useCallback((p: PendingTransaction) => {
        // CRA items don't need an account check — they'll be handled via TaxObligations
        const needsAccount = !["cra_payroll", "cra_corp", "cra_hst"].includes(p.sourceType);
        if (needsAccount && !p.account) return;

        if (transactionRepository.getAll().some((txn) => transactionMatchesPending(txn, p))) {
            fixedPaymentRepository.addDismissedKey(p.key);
            load();
            return;
        }

        const pendingType = p.sourceType === "fixed" && p.transactionType
            ? { type: p.transactionType as TransactionType, subType: p.subType }
            : getTransactionType(p.sourceType);

        const txn = buildCanonicalTransaction({
            purpose: getPendingPurpose(p.sourceType, p.transactionType, p.subType, p.purpose),
            amount: toFixed2(p.amount),
            description: p.name,
            sourceId: p.account,
            destinationId: p.destinationId,
            date: p.dueDate,
            createdAt: new Date().toISOString(),
            status: "cleared",
            categoryId: pendingType.type === "expense" ? (p.category || undefined) : undefined,
            tag: p.tag,
            mode: p.mode as Transaction["mode"],
            linkedVehicleId: p.linkedVehicleId,
            linkedPropertyId: p.linkedPropertyId,
            recurringOriginType: p.recurringOriginType,
            recurringOriginId: p.recurringOriginId,
        });

        persistCanonicalTransaction(txn);
        fixedPaymentRepository.addDismissedKey(p.key);

        // Auto-advance fixed payment date
        if (p.sourceType === "fixed") {
            const all = fixedPaymentRepository.getAll();
            const fp = all.find((f) => f.id === p.sourceId);
            if (fp && fp.schedule !== "One-time") {
                fixedPaymentRepository.saveAll(all.map((f) =>
                    f.id === fp.id ? {
                        ...f,
                        date: advanceOneInterval(p.dueDate, f.schedule)
                    } : f
                ));
            }
        }

        // Auto-advance vehicle nextPaymentDate
        if (p.sourceType === "vehicle") {
            const vehicles = vehicleRepository.getAll();
            const v = vehicles.find((x) => x.id === p.sourceId) as |
                (typeof vehicles[number] & PaymentSourceWithSchedule) |
                undefined;

            if (v?.nextPaymentDate) {
                vehicleRepository.saveAll(
                    vehicles.map((x) =>
                        x.id === v.id ? {
                            ...x,
                            nextPaymentDate: advanceOneInterval(v.nextPaymentDate, v.schedule),
                        } :
                        x
                    )
                );
            }
        }

        // Auto-advance house loan nextPaymentDate
        if (p.sourceType === "loan") {
            const loans = houseLoanRepository.getAll();
            const l = loans.find((x) => x.id === p.sourceId) as |
                (typeof loans[number] & PaymentSourceWithSchedule) |
                undefined;

            if (l?.nextPaymentDate) {
                houseLoanRepository.saveAll(
                    loans.map((x) =>
                        x.id === l.id ?
                        {
                            ...x,
                            nextPaymentDate: advanceOneInterval(l.nextPaymentDate, l.schedule),
                        } :
                        x
                    )
                );
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
        fixedPayments,
        pending,
        dismissedKeys,
        addFixedPayment,
        updateFixedPayment,
        deleteFixedPayment,
        logPayment,
        backfillPayments,
        confirmPending,
        dismissPending,
        dismissAllPending,
        reloadFixedPayments: load,
    };
}
