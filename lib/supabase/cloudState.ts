export type CloudSyncState =
  | "checking"
  | "local-only"
  | "synced"
  | "pending-upload"
  | "cloud-newer"
  | "conflict";

export function deriveCloudSyncState({
  localHash,
  latestCloudHash,
  latestCloudRevision,
  observedCloudHash,
  observedCloudRevision,
}: {
  localHash: string;
  latestCloudHash?: string;
  latestCloudRevision?: number;
  observedCloudHash?: string;
  observedCloudRevision?: number;
}): CloudSyncState {
  if (!latestCloudHash || !latestCloudRevision) return "local-only";

  const cloudAdvanced =
    observedCloudRevision !== undefined &&
    latestCloudRevision > observedCloudRevision;
  const localChanged =
    observedCloudHash !== undefined
      ? localHash !== observedCloudHash
      : localHash !== latestCloudHash;

  if (cloudAdvanced && localChanged) return "conflict";
  if (cloudAdvanced) return "cloud-newer";
  return localHash === latestCloudHash ? "synced" : "pending-upload";
}
