import { Transaction } from "@/types/transaction";
import { accountRepository } from "@/repositories/accountRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { toFixed2 } from "@/utils/finance";

type BalanceFields = {
  reconciledBalance?: number;
  reconciledDate?: string | null;
  balanceBase?: number;
};

function getReplayBase<T extends { id: string; openingBalance: number }>(
  item: T & BalanceFields,
  transactions: Transaction[]
): number {
  if (typeof item.reconciledBalance === "number") {
    return item.reconciledBalance;
  }

  if (typeof item.balanceBase === "number") {
    return item.balanceBase;
  }

  const hasRelatedTransactions = transactions.some(
    (t) => t.sourceId === item.id || t.destinationId === item.id
  );

  if (hasRelatedTransactions) {
    return 0;
  }

  return toFixed2(item.openingBalance ?? 0);
}

function shouldApplyTransaction(item: { reconciledDate?: string | null }, txDate: string) {
  return !item.reconciledDate || txDate > item.reconciledDate;
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

    const srcAcc = accounts.find((a) => a.id === t.sourceId);
    const srcCard = cards.find((c) => c.id === t.sourceId);
    const toAcc = t.destinationId ? accounts.find((a) => a.id === t.destinationId) : undefined;
    const toCard = t.destinationId ? cards.find((c) => c.id === t.destinationId) : undefined;

    const applySrcAcc = srcAcc && shouldApplyTransaction(srcAcc, txDate);
    const applySrcCard = srcCard && shouldApplyTransaction(srcCard, txDate);
    const applyToAcc = toAcc && shouldApplyTransaction(toAcc, txDate);
    const applyToCard = toCard && shouldApplyTransaction(toCard, txDate);

    switch (t.type) {
      case "expense":
      case "tax_payment":
      case "loan_payment":
      case "withdrawal":
        if (applySrcAcc && srcAcc) srcAcc.openingBalance = toFixed2(srcAcc.openingBalance - t.amount);
        if (applySrcCard && srcCard) srcCard.openingBalance = toFixed2(srcCard.openingBalance + t.amount);
        break;

      case "income":
      case "refund":
      case "dividend":
      case "loan_receipt":
        if (applySrcAcc && srcAcc) srcAcc.openingBalance = toFixed2(srcAcc.openingBalance + t.amount);
        if (applySrcCard && srcCard) srcCard.openingBalance = toFixed2(srcCard.openingBalance - t.amount);
        break;

      case "transfer":
        if (applySrcAcc && srcAcc) srcAcc.openingBalance = toFixed2(srcAcc.openingBalance - t.amount);
        if (applySrcCard && srcCard) srcCard.openingBalance = toFixed2(srcCard.openingBalance - t.amount);
        if (applyToAcc && toAcc) toAcc.openingBalance = toFixed2(toAcc.openingBalance + t.amount);
        if (applyToCard && toCard) toCard.openingBalance = toFixed2(toCard.openingBalance - t.amount);
        break;

      case "adjustment":
        if (applySrcAcc && srcAcc) srcAcc.openingBalance = toFixed2(srcAcc.openingBalance + t.amount);
        if (applySrcCard && srcCard) srcCard.openingBalance = toFixed2(srcCard.openingBalance + t.amount);
        if (applyToAcc && toAcc) toAcc.openingBalance = toFixed2(toAcc.openingBalance - t.amount);
        if (applyToCard && toCard) toCard.openingBalance = toFixed2(toCard.openingBalance - t.amount);
        break;
    }
  }

  accountRepository.saveAll(accounts);
  creditCardRepository.saveAll(cards);
}
