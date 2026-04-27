import { Transaction } from "@/types/transaction";
import { accountRepository } from "@/repositories/accountRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { toFixed2 } from "@/utils/finance";

export function recalculateBalances(transactions: Transaction[]) {
  const accounts = accountRepository.getAll();
  const cards = creditCardRepository.getAll();

  const today = new Date().toISOString().split("T")[0];

  // Start from reconciledBalance if set, otherwise fall back to stored openingBalance, then 0
  accounts.forEach((a) => {
    a.openingBalance = toFixed2((a as any).reconciledBalance ?? a.openingBalance ?? 0);
  });
  cards.forEach((c) => {
    c.openingBalance = toFixed2((c as any).reconciledBalance ?? c.openingBalance ?? 0);
  });

  // Sort by date ascending for correct replay
  const sorted = [...transactions].sort((a, b) => {
    const da = a.date ?? a.createdAt?.slice(0, 10) ?? "";
    const db = b.date ?? b.createdAt?.slice(0, 10) ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  for (const t of sorted) {
    // Skip pending — don't affect balance until cleared
    if (t.status === "pending") continue;

    // Skip future-dated — projections only
    const txDate = t.date ?? t.createdAt?.slice(0, 10) ?? "";
    if (txDate > today) continue;

    // Skip if before reconciledDate for source account
    const src = accounts.find((a) => a.id === t.sourceId) ?? cards.find((c) => c.id === t.sourceId);
    const reconDate = src ? (src as any).reconciledDate : null;
    if (reconDate && txDate < reconDate) continue;

    const acc  = accounts.find((a) => a.id === t.sourceId);
    const card = cards.find((c) => c.id === t.sourceId);

    switch (t.type) {
      case "expense":
      case "tax_payment":
      case "loan_payment":
      case "withdrawal":
        if (acc)  acc.openingBalance  = toFixed2(acc.openingBalance  - t.amount);
        if (card) card.openingBalance = toFixed2(card.openingBalance + t.amount);
        break;

      case "income":
      case "refund":
      case "dividend":
      case "loan_receipt":
        if (acc)  acc.openingBalance  = toFixed2(acc.openingBalance  + t.amount);
        if (card) card.openingBalance = toFixed2(card.openingBalance - t.amount);
        break;

      case "transfer":
        if (t.destinationId) {
          const toAcc  = accounts.find((a) => a.id === t.destinationId);
          const toCard = cards.find((c) => c.id === t.destinationId);
          if (acc)    acc.openingBalance    = toFixed2(acc.openingBalance    - t.amount);
          if (card)   card.openingBalance   = toFixed2(card.openingBalance   - t.amount);
          if (toAcc)  toAcc.openingBalance  = toFixed2(toAcc.openingBalance  + t.amount);
          if (toCard) toCard.openingBalance = toFixed2(toCard.openingBalance - t.amount);
        }
        break;

      case "adjustment":
        if (t.destinationId) {
          const toAcc  = accounts.find((a) => a.id === t.destinationId);
          const toCard = cards.find((c) => c.id === t.destinationId);
          if (acc)    acc.openingBalance    = toFixed2(acc.openingBalance    + t.amount);
          if (card)   card.openingBalance   = toFixed2(card.openingBalance   + t.amount);
          if (toAcc)  toAcc.openingBalance  = toFixed2(toAcc.openingBalance  - t.amount);
          if (toCard) toCard.openingBalance = toFixed2(toCard.openingBalance - t.amount);
        }
        break;
    }
  }

  accountRepository.saveAll(accounts);
  creditCardRepository.saveAll(cards);
}