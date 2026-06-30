import { Transaction } from "@/types/transaction";
import { accountRepository } from "@/repositories/accountRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { toFixed2 } from "@/utils/finance";
import { getTransactionEffect } from "@/utils/transactionSemantics";

type BalanceFields = {
  balanceSnapshotAmount?: number;
  balanceSnapshotDate?: string | null;
};

function getReplayBase<T extends { id: string; openingBalance: number }>(
  item: T & BalanceFields,
  transactions: Transaction[]
): number {
  if (typeof item.balanceSnapshotAmount === "number" && item.balanceSnapshotDate) {
    return item.balanceSnapshotAmount;
  }

  const hasRelatedTransactions = transactions.some(
    (t) => t.sourceId === item.id || t.destinationId === item.id
  );

  if (hasRelatedTransactions) {
    return 0;
  }

  return toFixed2(item.openingBalance ?? 0);
}

function shouldApplyTransaction(item: BalanceFields, txDate: string) {
  if (item.balanceSnapshotAmount != null && item.balanceSnapshotDate) {
    return txDate > item.balanceSnapshotDate;
  }
  return true;
}

export function recalculateBalances(transactions: Transaction[]) {
  const accounts = accountRepository.getAll() as Array<
    ReturnType<typeof accountRepository.getAll>[number] & BalanceFields
  >;
  const cards = creditCardRepository.getAll() as Array<
    ReturnType<typeof creditCardRepository.getAll>[number] & BalanceFields
  >;

  const today = new Date().toISOString().split("T")[0];

  accounts.forEach((a) => {
    a.openingBalance = toFixed2(getReplayBase(a, transactions));
  });

  cards.forEach((c) => {
    c.openingBalance = toFixed2(getReplayBase(c, transactions));
  });

  const sorted = [...transactions].sort((a, b) => {
    const da = a.date ?? a.createdAt?.slice(0, 10) ?? "";
    const db = b.date ?? b.createdAt?.slice(0, 10) ?? "";
    if (da !== db) return da < db ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });

  for (const t of sorted) {
    if (t.status === "pending") continue;

    const txDate = t.date ?? t.createdAt?.slice(0, 10) ?? "";
    if (txDate > today) continue;
    if (t.type === "adjustment" && (t.subType as string) === "reconciliation") continue;

    const srcAcc = accounts.find((a) => a.id === t.sourceId);
    const srcCard = cards.find((c) => c.id === t.sourceId);
    const toAcc = t.destinationId ? accounts.find((a) => a.id === t.destinationId) : undefined;
    const toCard = t.destinationId ? cards.find((c) => c.id === t.destinationId) : undefined;

    const applySrcAcc = srcAcc && shouldApplyTransaction(srcAcc, txDate);
    const applySrcCard = srcCard && shouldApplyTransaction(srcCard, txDate);
    const applyToAcc = toAcc && shouldApplyTransaction(toAcc, txDate);
    const applyToCard = toCard && shouldApplyTransaction(toCard, txDate);

    if (applySrcAcc && srcAcc) {
      srcAcc.openingBalance = toFixed2(
        srcAcc.openingBalance + getTransactionEffect(t, srcAcc.id, "account")
      );
    }
    if (applySrcCard && srcCard) {
      srcCard.openingBalance = toFixed2(
        srcCard.openingBalance + getTransactionEffect(t, srcCard.id, "card")
      );
    }
    if (applyToAcc && toAcc && toAcc.id !== srcAcc?.id) {
      toAcc.openingBalance = toFixed2(
        toAcc.openingBalance + getTransactionEffect(t, toAcc.id, "account")
      );
    }
    if (applyToCard && toCard && toCard.id !== srcCard?.id) {
      toCard.openingBalance = toFixed2(
        toCard.openingBalance + getTransactionEffect(t, toCard.id, "card")
      );
    }
  }

  accountRepository.saveAll(accounts);
  creditCardRepository.saveAll(cards);
}
