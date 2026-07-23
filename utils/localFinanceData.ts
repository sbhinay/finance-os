const FINANCE_DATA_PREFIXES = ["finance_os_", "financeOS_"];
const PRESERVED_KEYS = new Set(["finance_os_cloud_device_id"]);

export function clearLocalFinanceData(storage: Storage = localStorage): number {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key))
    .filter((key) => FINANCE_DATA_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .filter((key) => !PRESERVED_KEYS.has(key));

  keys.forEach((key) => storage.removeItem(key));
  return keys.length;
}
