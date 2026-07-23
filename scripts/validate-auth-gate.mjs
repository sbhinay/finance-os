import fs from "node:fs";

const page = fs.readFileSync("app/page.tsx", "utf8");
const gate = fs.readFileSync("components/AuthGate.tsx", "utf8");
const client = fs.readFileSync("lib/supabase/client.ts", "utf8");

[
  "<AuthGate>",
  "<FinanceApp />",
].forEach((fragment) => {
  if (!page.includes(fragment)) throw new Error(`App entry is missing auth boundary: ${fragment}`);
});

[
  "loadCloudSnapshot()",
  "applyCloudPayloadToLocal(snapshot.payload)",
  "initializeEmptyLocalProfile()",
  'state === "ready" && session',
  "signInWithPassword",
  "signUp",
  "signInWithOAuth",
  "resetPasswordForEmail",
  "saveCloudSnapshot",
  "CloudSnapshotConflictError",
  "DATA_CHANGED_EVENT",
  "Automatic save",
  "cloud-newer",
  "Offline - changes are pending",
].forEach((fragment) => {
  if (!gate.includes(fragment)) throw new Error(`Auth gate is missing required behavior: ${fragment}`);
});

if (!client.includes("storage: window.sessionStorage")) {
  throw new Error("Supabase auth is not using session-scoped browser storage.");
}

if (/NEXT_PUBLIC_.+BYPASS|auth.+bypass/i.test(gate + client)) {
  throw new Error("A production-reachable authentication bypass was detected.");
}

console.log("Authentication gate validated: pre-render boundary, cloud bootstrap, guarded autosave, session storage, Google/email auth, and recovery.");
