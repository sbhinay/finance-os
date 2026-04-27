import { Transaction } from "@/types/transaction";

const STORAGE_KEY = "finance_os_tx";

export const transactionRepository = {
  getAll(): Transaction[] {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveAll(tx: Transaction[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tx));
  },

  add(t: Transaction) {
    const all = this.getAll();
    all.push(t);
    this.saveAll(all);
  },
};