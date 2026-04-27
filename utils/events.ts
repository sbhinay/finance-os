/**
 * Global refresh event bus.
 * Any repository write calls `notifyDataChanged()`.
 * Any hook calls `useDataChanged(callback)` to reload when data changes.
 *
 * This solves the cross-hook refresh problem: DailyLog writes to accountRepository
 * directly, but the BankAccounts hook in another component doesn't know about it.
 */

export const DATA_CHANGED_EVENT = "financeOS:dataChanged";

/** Call this after any localStorage write to notify all listening hooks */
export function notifyDataChanged(domain?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DATA_CHANGED_EVENT, { detail: { domain } })
    );
  }
}
