"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { liabilityRepository } from "@/repositories/assetRepositories";
import { transactionRepository } from "@/repositories/transactionRepository";
import type { Liability } from "@/types/domain";
import { notifyDataChanged, DATA_CHANGED_EVENT } from "@/utils/events";
import { toFixed2, uid } from "@/utils/finance";

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
    transactionRepository.saveAll(transactions);
  }
  return liabilities;
}

export function calculateLiabilityBalance(
  liability: Liability,
  transactions = transactionRepository.getAll()
): number {
  const snapshotDate = liability.balanceSnapshotDate;
  let balance = liability.balanceSnapshotAmount ?? liability.openingBalance;

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
        balance -= transaction.principalAmount
          ?? toFixed2(transaction.amount - (transaction.interestAmount ?? 0));
      }
    });

  return toFixed2(balance);
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
    const prepared: Liability = {
      ...liability,
      id: liability.id ?? uid(),
      openingBalance: toFixed2(liability.openingBalance),
      balanceSnapshotAmount: liability.balanceSnapshotAmount == null
        ? undefined
        : toFixed2(liability.balanceSnapshotAmount),
    };
    const index = all.findIndex((item) => item.id === prepared.id);
    if (index >= 0) all[index] = prepared;
    else all.push(prepared);
    liabilityRepository.saveAll(all);
    notifyDataChanged("liabilities");
    load();
    return prepared;
  }, [load]);

  const balances = useMemo(
    () => Object.fromEntries(liabilities.map((liability) => [
      liability.id,
      calculateLiabilityBalance(liability),
    ])),
    [liabilities]
  );

  return { liabilities, balances, saveLiability: save, reloadLiabilities: load };
}
