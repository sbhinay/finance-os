import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const durableDomains = [
  "bankAccounts",
  "creditCards",
  "transactions",
  "categories",
  "business",
  "vehicles",
  "properties",
  "houseLoans",
  "propertyTaxes",
  "liabilities",
  "futurePayments",
];

const cloudSnapshotSource = fs.readFileSync(
  path.join(root, "lib", "supabase", "cloudSnapshots.ts"),
  "utf8"
);
const importExportSource = fs.readFileSync(
  path.join(root, "modules", "business", "ImportExportSection.tsx"),
  "utf8"
);

function assertSourceContains(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

const importPreviewPatterns = {
  bankAccounts: /\baccounts\s*:\s*asArray\(raw\.bankAccounts\)/,
};

for (const domain of durableDomains) {
  assertSourceContains(
    cloudSnapshotSource,
    new RegExp(`\\b${domain}\\s*:`),
    `Cloud export payload is missing durable domain "${domain}".`
  );
  assertSourceContains(
    importExportSource,
    importPreviewPatterns[domain] ?? new RegExp(`\\b${domain}\\s*:`),
    `Import preview/result mapping is missing durable domain "${domain}".`
  );
}

const explicitlyTransientDomains = [
  "pendingTransactions",
  "dismissedPendingKeys",
  "incomes",
  "rrsp",
  "tfsa",
  "profile",
];

for (const domain of explicitlyTransientDomains) {
  if (new RegExp(`\\b${domain}\\s*:`).test(cloudSnapshotSource)) {
    throw new Error(
      `Transient or currently unsupported AppData domain "${domain}" is now in cloud export. ` +
        "If this is intentional, promote it to durableDomains and add matching import validation."
    );
  }
}

const fixturePath = path.resolve(
  process.argv[2] ?? "C:/Users/singha2/Downloads/FinanceOS_2026-06-29.json"
);

if (fs.existsSync(fixturePath)) {
  const payload = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const requiredFixtureDomains = [
    "bankAccounts",
    "creditCards",
    "transactions",
    "categories",
    "business",
  ];
  for (const domain of requiredFixtureDomains) {
    if (!(domain in payload)) {
      throw new Error(`Fixture export is missing durable domain "${domain}".`);
    }
  }
  const legacyMissingDomains = durableDomains.filter((domain) => !(domain in payload));
  if (legacyMissingDomains.length) {
    console.warn(
      `Fixture is accepted as backward-compatible legacy shape; missing newer domains: ${legacyMissingDomains.join(", ")}.`
    );
  }
}

console.log(`Import/export contract validated for ${durableDomains.length} durable domains.`);
