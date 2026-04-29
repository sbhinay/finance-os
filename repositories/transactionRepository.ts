import { Transaction } from "@/types/transaction";
import { normalizeTransactionCollection, normalizeTransactionShape } from "@/utils/transactionNormalization";

const STORAGE_KEY = "finance_os_tx";

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
    all.push(normalizeTransactionShape(t));
    this.saveAll(all);
  },
};
