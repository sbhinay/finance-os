export type StorageMode = "local" | "cloud";

export function getStorageMode(): StorageMode {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ? "cloud"
    : "local";
}

export function isCloudModeEnabled() {
  return getStorageMode() === "cloud";
}
