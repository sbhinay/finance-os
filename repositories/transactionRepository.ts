import { Transaction } from "@/types/transaction";
import { normalizeTransactionCollection, normalizeTransactionShape } from "@/utils/transactionNormalization";
import { accountRepository } from "@/repositories/accountRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";

const STORAGE_KEY = "finance_os_tx";

function ensureReconciledAtCutoffs(existingTransactions: Transaction[], transaction: Transaction) {
  const relevantIds = [transaction.sourceId, transaction.destinationId].filter(Boolean) as string[];
  if (!relevantIds.length) return;

  const accounts = accountRepository.getAll();
  const cards = creditCardRepository.getAll();

  let accountsChanged = false;
  let cardsChanged = false;

  const deriveCutoff = (id: string, reconciledDate: string) =>
    existingTransactions
      .filter((t) => {
        const txDate = t.date ?? t.createdAt?.slice(0, 10) ?? "";
        return (t.sourceId === id || t.destinationId === id) && txDate === reconciledDate;
      })
      .map((t) => t.createdAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ?? `${reconciledDate}T00:00:00.000Z`;

  for (const id of relevantIds) {
    const acc = accounts.find((a) => a.id === id);
    if (acc?.reconciledDate && !acc.reconciledAt) {
      acc.reconciledAt = deriveCutoff(id, acc.reconciledDate);
      accountsChanged = true;
    }
    const card = cards.find((c) => c.id === id);
    if (card?.reconciledDate && !card.reconciledAt) {
      card.reconciledAt = deriveCutoff(id, card.reconciledDate);
      cardsChanged = true;
    }
  }

  if (accountsChanged) accountRepository.saveAll(accounts);
  if (cardsChanged) creditCardRepository.saveAll(cards);
}

export const transactionRepository = {
  getAll(): Transaction[] {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as Transaction[];
    const normalized = normalizeTransactionCollection(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  },

  saveAll(tx: Transaction[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeTransactionCollection(tx)));
  },

  add(t: Transaction) {
    const all = this.getAll();
    const normalized = normalizeTransactionShape(t);
    ensureReconciledAtCutoffs(all, normalized);
    all.push(normalized);
    this.saveAll(all);
  },
};
