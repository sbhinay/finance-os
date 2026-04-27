import { Account } from "@/types/account";

const STORAGE_KEY = "finance_os_accounts";

export const accountRepository = {
  getAll(): Account[] {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveAll(accounts: Account[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  },

  add(account: Account) {
    const accounts = this.getAll();
    accounts.push(account);
    this.saveAll(accounts);
  },

  delete(id: string) {
    const accounts = this.getAll().filter((acc) => acc.id !== id);
    this.saveAll(accounts);
  },

  update(updated: Account) {
    const accounts = this.getAll().map((acc) =>
      acc.id === updated.id ? updated : acc
    );
    this.saveAll(accounts);
  },
};