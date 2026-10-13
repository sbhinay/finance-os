import fs from "node:fs";

const sql = fs.readFileSync("supabase/02_guarded_snapshots.sql", "utf8");
const cloudState = fs.readFileSync("lib/supabase/cloudState.ts", "utf8");
const importExport = fs.readFileSync("modules/business/ImportExportSection.tsx", "utf8");
const localFinanceData = fs.readFileSync("utils/localFinanceData.ts", "utf8");
const required = [
  "app_snapshot_history",
  "save_app_snapshot_guarded",
  "for update",
  "snapshot_conflict",
  "p_expected_revision",
  "unique (user_id, revision)",
  "security definer",
  "revoke insert, update, delete on public.app_snapshots",
  "for select using (auth.uid() = user_id)",
];

required.forEach((fragment) => {
  if (!sql.toLowerCase().includes(fragment.toLowerCase())) {
    throw new Error(`Cloud migration is missing required guard: ${fragment}`);
  }
});

if (/create policy "app_snapshots_own_rows"[\s\S]{0,120}for all/i.test(sql)) {
  throw new Error("Snapshot table still permits direct all-operation client policy.");
}

[
  '"local-only"',
  '"synced"',
  '"pending-upload"',
  '"cloud-newer"',
  '"conflict"',
].forEach((state) => {
  if (!cloudState.includes(state)) {
    throw new Error(`Cloud sync state model is missing ${state}.`);
  }
});

if (!importExport.includes('label: `Before ${previewSource === "cloud" ? "cloud restore" : "JSON import"}`')) {
  throw new Error("Confirmed imports do not create a guarded pre-operation restore point.");
}

if (!importExport.includes("window.setInterval(checkForNewRevision")) {
  throw new Error("Cloud UI does not periodically check for newer revisions.");
}

if (importExport.includes("localStorage.clear()")) {
  throw new Error("Clear All still erases the entire browser storage area.");
}

if (!importExport.includes('label: "Before clearing local data"')) {
  throw new Error("Clear All does not create a guarded pre-operation restore point.");
}

if (!localFinanceData.includes('PRESERVED_KEYS = new Set(["finance_os_cloud_device_id"])')) {
  throw new Error("Scoped local cleanup does not preserve the cloud device identity.");
}

const retentionSql = fs.readFileSync("supabase/03_snapshot_history_retention.sql", "utf8").toLowerCase();
[
  "prune_app_snapshot_history",
  "recent_rank > 20",
  "interval '30 days'",
  "like 'before %'",
  "after insert on public.app_snapshot_history",
  "security definer",
  "revoke all on function public.prune_app_snapshot_history(uuid) from authenticated",
].forEach((fragment) => {
  if (!retentionSql.includes(fragment)) {
    throw new Error(`Snapshot history retention is missing: ${fragment}`);
  }
});
if (/delete from public\.app_snapshots\b/.test(retentionSql)) {
  throw new Error("Retention must never delete the live snapshot.");
}

console.log("Cloud guards validated: revision lock, bounded restore history (20 recent, daily for 30 days, restore points), pre-operation restore points, scoped local cleanup, stale-tab checks, read-only client tables, and guarded RPC.");
