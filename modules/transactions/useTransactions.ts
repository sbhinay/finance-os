"use client";

import { useEffect, useState, useCallback } from "react";
import { Transaction, TransactionType } from "@/types/transaction";
import { transactionRepository } from "@/repositories/transactionRepository";
import { validateTransaction } from "@/rules/validationRules";
import { detectCategory, learnedRulesRepository, uncategorizedRepository } from "@/rules/categoryRules";
import { uid, toFixed2 } from "@/utils/finance";
import { DATA_CHANGED_EVENT } from "@/utils/events";
import { syncBalances } from "@/utils/syncBalances";

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTransactions(transactionRepository.getAll());
  }, []);

  const load = useCallback(() => setTransactions(transactionRepository.getAll()), []);

  // Re-load whenever any domain writes data
  useEffect(() => {
    const handler = () => load();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, [load]);

  const addTransaction = useCallback((
    type: TransactionType,
    amount: number,
    description: string,
    sourceId: string,
    destinationId?: string,
    categoryId?: string,
    overrides?: Partial<Transaction>
  ) => {
    const err = validateTransaction(type, amount, sourceId, destinationId);
    if (err) { setError(err); return; }

    const cleanDesc = description.toLowerCase().trim();
    const detectedCategoryId = categoryId ?? detectCategory(cleanDesc);

    if (categoryId) {
      learnedRulesRepository.add({ id: uid(), description: cleanDesc, categoryId });
      uncategorizedRepository.remove(cleanDesc);
    } else if (!detectedCategoryId) {
      uncategorizedRepository.add(cleanDesc);
    }

    const t: Transaction = {
      id: uid(),
      type,
      date: new Date().toISOString().split("T")[0],
      currency: "CAD",
      status: "cleared" as const,
      amount: toFixed2(amount),
      description,
      sourceId,
      destinationId,
      createdAt: new Date().toISOString(),
      categoryId: detectedCategoryId,
      ...overrides,
    };

    transactionRepository.add(t);
    syncBalances();
    const updated = transactionRepository.getAll();
    setTransactions(updated);
    setError(null);
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    const updated = transactionRepository.getAll().filter((t) => t.id !== id);
    transactionRepository.saveAll(updated);
    syncBalances();
    setTransactions(updated);
  }, []);

  const updateTransaction = useCallback((updatedTx: Transaction) => {
    const updated = transactionRepository.getAll().map((t) => (t.id === updatedTx.id ? updatedTx : t));
    transactionRepository.saveAll(updated);
    syncBalances();
    setTransactions(updated);
  }, []);

  return {
    transactions,
    addTransaction,
    deleteTransaction,
    updateTransaction,
    reloadTransactions: load,
    error,
  };
}