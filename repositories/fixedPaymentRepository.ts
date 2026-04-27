import { FixedPayment } from "@/types/domain";

const KEY = "finance_os_fixed_payments";
const DISMISSED_KEY = "finance_os_dismissed_pending";

export const fixedPaymentRepository = {
  getAll(): FixedPayment[] {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  },
  saveAll(data: FixedPayment[]) {
    localStorage.setItem(KEY, JSON.stringify(data));
  },
  getDismissedKeys(): string[] {
    try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
  },
  addDismissedKey(key: string) {
    const keys = this.getDismissedKeys();
    if (!keys.includes(key)) {
      keys.push(key);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys));
    }
  },
  // Clean up dismissed keys older than 90 days (tech doc §11.1)
  pruneOldDismissedKeys() {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const keys = this.getDismissedKeys().filter((k) => {
      const dateMatch = k.match(/\d{4}-\d{2}-\d{2}/);
      return dateMatch ? dateMatch[0] > cutoff : true;
    });
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys));
  },
};
