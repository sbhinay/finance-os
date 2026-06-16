/**
 * syncBalances — single source of truth balance updater.
 * Calls recalculateBalances() which reads repositories internally.
 */

import { transactionRepository } from "@/repositories/transactionRepository";
import { accountRepository } from "@/repositories/accountRepository";
import { businessRepository } from "@/repositories/businessRepository";
import { recalculateBalances } from "./recalculateBalances";
import { toFixed2 } from "@/utils/finance";

function shouldApplyInvoiceDeposit(
  account: { balanceSnapshotDate?: string | null; balanceSnapshotAmount?: number },
  paymentDate: string
) {
  if (account.balanceSnapshotAmount == null || !account.balanceSnapshotDate) return true;
  return paymentDate > account.balanceSnapshotDate;
}

function hasMatchingIncomeTransaction(
  transactions: ReturnType<typeof transactionRepository.getAll>,
  accountId: string,
  paymentDate: string,
  amount: number
) {
  return transactions.some((transaction) =>
    transaction.status !== "pending" &&
    transaction.type === "income" &&
    transaction.sourceId === accountId &&
    (transaction.date ?? transaction.createdAt?.slice(0, 10)) === paymentDate &&
    toFixed2(transaction.amount) === toFixed2(amount)
  );
}

function applyInvoiceDeposits() {
  const today = new Date().toISOString().split("T")[0];
  const invoices = businessRepository.get().invoices ?? [];
  const accounts = accountRepository.getAll();
  const transactions = transactionRepository.getAll();

  const updated = accounts.map((account) => {
    const deposits = invoices
      .filter((invoice) => {
        const paymentDate = invoice.paymentDate?.slice(0, 10);
        const total = Number(invoice.total) || 0;
        return (
          invoice.depositAccount === account.name &&
          !!paymentDate &&
          paymentDate <= today &&
          shouldApplyInvoiceDeposit(account, paymentDate) &&
          !hasMatchingIncomeTransaction(transactions, account.id, paymentDate, total)
        );
      })
      .reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);

    return deposits
      ? { ...account, openingBalance: toFixed2(account.openingBalance + deposits) }
      : account;
  });

  accountRepository.saveAll(updated);
}

export function syncBalances() {
  const transactions = transactionRepository.getAll();
  recalculateBalances(transactions);
  applyInvoiceDeposits();
}
