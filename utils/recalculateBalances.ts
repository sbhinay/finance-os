import { Transaction } from "@/types/transaction";
import { accountRepository } from "@/repositories/accountRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { toFixed2 } from "@/utils/finance";

type BalanceFields = {
  reconciledBalance?: number;
  reconciledDate?: string | null;
  balanceBase?: number;
};

function getReplayBase<T extends { openingBalance: number }>(
  item: T & BalanceFields
): number {
  if (typeof item.reconciledBalance === "number") {
    return item.reconciledBalance;
  }

  if (typeof item.balanceBase === "number") {
    return item.balanceBase;
  }

  item.balanceBase = toFixed2(item.openingBalance ?? 0);
  return item.balanceBase;
}

export function recalculateBalances(transactions: Transaction[]) {
  const accounts = accountRepository.getAll() as Array<
    ReturnType<typeof accountRepository.getAll>[number] & BalanceFields
  >;
  const cards = creditCardRepository.getAll() as Array<
    ReturnType<typeof creditCardRepository.getAll>[number] & BalanceFields
  >;

  const today = new Date().toISOString().split("T")[0];

  // Reset every account/card to a stable replay base before applying transactions.
  accounts.forEach((a) => {
    a.openingBalance = toFixed2(getReplayBase(a));
  });

  cards.forEach((c) => {
    c.openingBalance = toFixed2(getReplayBase(c));
  });

  const sorted = [...transactions].sort((a, b) => {
    const da = a.date ?? a.createdAt?.slice(0, 10) ?? "";
    const db = b.date ?? b.createdAt?.slice(0, 10) ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  for (const t of sorted) {
    if (t.status === "pending") continue;

    const txDate = t.date ?? t.createdAt?.slice(0, 10) ?? "";
    if (txDate > today) continue;

    const src =
      accounts.find((a) => a.id === t.sourceId) ??
      cards.find((c) => c.id === t.sourceId);
    const reconDate = src?.reconciledDate ?? null;
    if (reconDate && txDate < reconDate) continue;

    const acc = accounts.find((a) => a.id === t.sourceId);
    const card = cards.find((c) => c.id === t.sourceId);

    switch (t.type) {
      case "expense":
      case "tax_payment":
      case "loan_payment":
      case "withdrawal":
        if (acc) acc.openingBalance = toFixed2(acc.openingBalance - t.amount);
        if (card) card.openingBalance = toFixed2(card.openingBalance + t.amount);
        break;

      case "income":
      case "refund":
      case "dividend":
      case "loan_receipt":
        if (acc) acc.openingBalance = toFixed2(acc.openingBalance + t.amount);
        if (card) card.openingBalance = toFixed2(card.openingBalance - t.amount);
        break;

      case "transfer":
        if (t.destinationId) {
          const toAcc = accounts.find((a) => a.id === t.destinationId);
          const toCard = cards.find((c) => c.id === t.destinationId);
          if (acc) acc.openingBalance = toFixed2(acc.openingBalance - t.amount);
          if (card) card.openingBalance = toFixed2(card.openingBalance - t.amount);
          if (toAcc) toAcc.openingBalance = toFixed2(toAcc.openingBalance + t.amount);
          if (toCard) toCard.openingBalance = toFixed2(toCard.openingBalance - t.amount);
        }
        break;

      case "adjustment":
        if (t.destinationId) {
          const toAcc = accounts.find((a) => a.id === t.destinationId);
          const toCard = cards.find((c) => c.id === t.destinationId);
          if (acc) acc.openingBalance = toFixed2(acc.openingBalance + t.amount);
          if (card) card.openingBalance = toFixed2(card.openingBalance + t.amount);
          if (toAcc) toAcc.openingBalance = toFixed2(toAcc.openingBalance - t.amount);
          if (toCard) toCard.openingBalance = toFixed2(toCard.openingBalance - t.amount);
        }
        break;
    }
  }

  accountRepository.saveAll(accounts);
  creditCardRepository.saveAll(cards);
}