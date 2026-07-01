import { Transaction } from "@/types/transaction";
import { normalizeTransactionCollection, normalizeTransactionShape } from "@/utils/transactionNormalization";

const STORAGE_KEY = "finance_os_tx";

export const transactionRepository = {
  getAll(): Transaction[] {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as Transaction[];
    return normalizeTransactionCollection(parsed);
  },

  saveAll(tx: Transaction[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeTransactionCollection(tx)));
  },

  add(t: Transaction) {
    const all = this.getAll();
    const normalized = normalizeTransactionShape(t);
    all.push(normalized);
    this.saveAll(all);
  },
};
