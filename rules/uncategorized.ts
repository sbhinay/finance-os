const STORAGE_KEY = "uncategorizedTransactions";

export const uncategorizedRepository = {
  getAll(): string[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },

  add(description: string) {
    const list = this.getAll();

    if (!list.includes(description)) {
      list.unshift(description);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  },
};