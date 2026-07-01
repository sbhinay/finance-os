"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { liabilityRepository } from "@/repositories/assetRepositories";
import { transactionRepository } from "@/repositories/transactionRepository";
import type { Liability } from "@/types/domain";
import type { Transaction } from "@/types/transaction";
import { notifyDataChanged, DATA_CHANGED_EVENT } from "@/utils/events";
import { toFixed2, uid } from "@/utils/finance";
import { persistCanonicalTransaction, replaceCanonicalTransactions } from "@/services/transactionPipeline";

function migrateNumberedPersonalLenders(): Liability[] {
  const liabilities = liabilityRepository.getAll();
  const transactions = transactionRepository.getAll();
  const groups = new Map<string, typeof transactions>();

  transactions.forEach((transaction) => {
    if (
      transaction.type !== "loan_receipt"
      || transaction.subType !== "personal_loan"
      || transaction.linkedLiabilityId
    ) {
      return;
    }
    const match = transaction.description.trim().match(/^Loan\s+(.+?)\s+\d+$/i);
    if (!match) return;
    const lenderName = match[1].trim();
    groups.set(lenderName, [...(groups.get(lenderName) ?? []), transaction]);
  });

  let changedTransactions = false;
  groups.forEach((receipts, lenderName) => {
    if (receipts.length < 2 || new Set(receipts.map((receipt) => receipt.sourceId)).size !== 1) {
      return;
    }
    let liability = liabilities.find(
      (item) => item.name.trim().toLowerCase() === lenderName.toLowerCase()
    );
    if (!liability) {
      const businessCount = receipts.filter((receipt) => receipt.tag === "Business").length;
      liability = {
        id: uid(),
        name: lenderName,
        type: "Personal Loan",
        openingBalance: 0,
        tag: businessCount > receipts.length / 2 ? "Business" : "Personal",
      };
      liabilities.push(liability);
    }
    const receiptIds = new Set(receipts.map((receipt) => receipt.id));
    transactions.forEach((transaction) => {
      if (receiptIds.has(transaction.id)) {
        transaction.linkedLiabilityId = liability!.id;
        changedTransactions = true;
      }
    });
  });

  if (changedTransactions) {
    liabilityRepository.saveAll(liabilities);
    replaceCanonicalTransactions(transactions);
  }
  return liabilities;
}

export function calculateLiabilityBalance(
  liability: Liability,
  transactions = transactionRepository.getAll()
): number {
  const hasSnapshot = liability.balanceSnapshotAmount != null && !!liability.balanceSnapshotDate;
  const snapshotDate = hasSnapshot ? liability.balanceSnapshotDate : undefined;
  let balance = hasSnapshot ? liability.balanceSnapshotAmount! : liability.openingBalance;

  transactions
    .filter((transaction) =>
      transaction.status !== "pending"
      && transaction.linkedLiabilityId === liability.id
      && (!snapshotDate || transaction.date > snapshotDate)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .forEach((transaction) => {
      if (transaction.type === "loan_receipt") {
        balance += transaction.amount;
      } else if (transaction.type === "loan_payment") {
        balance -= getLiabilityPrincipal(transaction);
      }
    });

  return toFixed2(balance);
}

export function getLiabilityPrincipal(transaction: Transaction): number {
  if (transaction.type !== "loan_payment") return 0;
  return toFixed2(
    transaction.principalAmount
      ?? transaction.amount - (transaction.interestAmount ?? 0)
  );
}

export type LiabilityLedgerRow = {
  transaction: Transaction;
  effect: number;
  principal: number;
  interest: number;
  runningBalance: number;
};

export function getLiabilityLedger(
  liability: Liability,
  transactions = transactionRepository.getAll()
): LiabilityLedgerRow[] {
  const hasSnapshot = liability.balanceSnapshotAmount != null && !!liability.balanceSnapshotDate;
  let runningBalance = hasSnapshot ? liability.balanceSnapshotAmount! : liability.openingBalance;
  const snapshotDate = hasSnapshot ? liability.balanceSnapshotDate : undefined;

  return transactions
    .filter((transaction) =>
      transaction.status !== "pending"
      && transaction.linkedLiabilityId === liability.id
      && (!snapshotDate || transaction.date > snapshotDate)
      && (transaction.type === "loan_receipt" || transaction.type === "loan_payment")
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((transaction) => {
      const principal = getLiabilityPrincipal(transaction);
      const interest = transaction.type === "loan_payment"
        ? toFixed2(transaction.interestAmount ?? 0)
        : 0;
      const effect = transaction.type === "loan_receipt"
        ? toFixed2(transaction.amount)
        : toFixed2(-principal);
      runningBalance = toFixed2(runningBalance + effect);
      return { transaction, effect, principal, interest, runningBalance };
    });
}

export function getLiabilitySummary(
  liability: Liability,
  transactions = transactionRepository.getAll()
) {
  const linked = transactions.filter((transaction) =>
    transaction.status !== "pending"
    && transaction.linkedLiabilityId === liability.id
  );
  return {
    borrowed: toFixed2(linked
      .filter((transaction) => transaction.type === "loan_receipt")
      .reduce((sum, transaction) => sum + transaction.amount, 0)),
    principalRepaid: toFixed2(linked
      .filter((transaction) => transaction.type === "loan_payment")
      .reduce((sum, transaction) => sum + getLiabilityPrincipal(transaction), 0)),
    interestPaid: toFixed2(linked
      .filter((transaction) => transaction.type === "loan_payment")
      .reduce((sum, transaction) => sum + (transaction.interestAmount ?? 0), 0)),
    currentBalance: calculateLiabilityBalance(liability, transactions),
    transactionCount: linked.length,
  };
}

export function useLiabilities() {
  const [liabilities, setLiabilities] = useState<Liability[]>([]);

  const load = useCallback(() => {
    setLiabilities(migrateNumberedPersonalLenders());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const handler = () => load();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, [load]);

  const save = useCallback((liability: Omit<Liability, "id"> & { id?: string }) => {
    const all = liabilityRepository.getAll();
    const hasSnapshot = liability.balanceSnapshotAmount != null && !!liability.balanceSnapshotDate;
    const prepared: Liability = {
      ...liability,
      id: liability.id ?? uid(),
      openingBalance: toFixed2(liability.openingBalance),
      balanceSnapshotAmount: hasSnapshot
        ? toFixed2(liability.balanceSnapshotAmount!)
        : undefined,
      balanceSnapshotDate: hasSnapshot ? liability.balanceSnapshotDate : undefined,
    };
    const index = all.findIndex((item) => item.id === prepared.id);
    if (index >= 0) all[index] = prepared;
    else all.push(prepared);
    liabilityRepository.saveAll(all);
    notifyDataChanged("liabilities");
    load();
    return prepared;
  }, [load]);

  const deleteLiability = useCallback((id: string): "archived" | "deleted" => {
    const all = liabilityRepository.getAll();
    const linkedCount = transactionRepository.getAll().filter(
      (transaction) => transaction.linkedLiabilityId === id
    ).length;
    if (linkedCount > 0) {
      liabilityRepository.saveAll(all.map((liability) =>
        liability.id === id ? { ...liability, archived: true } : liability
      ));
      notifyDataChanged("liabilities");
      load();
      return "archived";
    }
    liabilityRepository.saveAll(all.filter((liability) => liability.id !== id));
    notifyDataChanged("liabilities");
    load();
    return "deleted";
  }, [load]);

  const relinkTransaction = useCallback((transaction: Transaction, liabilityId?: string) => {
    persistCanonicalTransaction({
      ...transaction,
      linkedLiabilityId: liabilityId || undefined,
    });
    load();
  }, [load]);

  const balances = useMemo(
    () => Object.fromEntries(liabilities.map((liability) => [
      liability.id,
      calculateLiabilityBalance(liability),
    ])),
    [liabilities]
  );

  return {
    liabilities,
    balances,
    saveLiability: save,
    deleteLiability,
    relinkTransaction,
    reloadLiabilities: load,
  };
}
