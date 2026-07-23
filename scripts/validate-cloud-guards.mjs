import fs from "node:fs";

const sql = fs.readFileSync("supabase/02_guarded_snapshots.sql", "utf8");
const cloudState = fs.readFileSync("lib/supabase/cloudState.ts", "utf8");
const importExport = fs.readFileSync("modules/business/ImportExportSection.tsx", "utf8");
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

console.log("Cloud guards validated: revision lock, append-only history, pre-import restore points, stale-tab checks, read-only client tables, and guarded RPC.");
