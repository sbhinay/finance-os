/**
 * syncBalances — single source of truth balance updater.
 * Calls recalculateBalances() which reads repositories internally.
 */

import { transactionRepository } from "@/repositories/transactionRepository";
import { recalculateBalances } from "./recalculateBalances";

export function syncBalances() {
  const transactions = transactionRepository.getAll();
  recalculateBalances(transactions);
}