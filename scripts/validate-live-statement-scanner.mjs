import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import { getStatementScannerProvider, getStatementScannerStatus } from "../lib/statementScanner/index.ts";

const MIME_BY_EXT = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

function argValue(name) {
  const exact = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(exact));
  if (inline) return inline.slice(exact.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const imagePath = argValue("image");
if (!imagePath) {
  throw new Error("Usage: npm run validate:scanner:live -- --image C:\\path\\to\\statement.png");
}

const status = getStatementScannerStatus();
if (!status.configured) {
  throw new Error(status.message);
}
if (status.mode !== "external") {
  throw new Error("Live scanner validation requires an external provider, not local_fixture.");
}

const mediaType = MIME_BY_EXT.get(extname(imagePath).toLowerCase());
if (!mediaType) {
  throw new Error("Live scanner validation supports .jpg, .jpeg, .png, .webp, and .gif images.");
}

const bytes = await readFile(imagePath);
const result = await getStatementScannerProvider().extract({
  images: [{
    mediaType,
    data: bytes.toString("base64"),
  }],
  categories: [
    { id: "cat-groceries", name: "Groceries", type: "expense" },
    { id: "cat-gas", name: "Gas", type: "expense" },
    { id: "cat-shopping", name: "Shopping", type: "expense" },
    { id: "cat-other", name: "Other", type: "expense" },
    { id: "cat-other-income", name: "Other Income", type: "income" },
  ],
  accounts: [{
    id: "live-validation-account",
    name: "Live Validation Account",
    kind: "card",
  }],
});

console.log(JSON.stringify({
  image: basename(imagePath),
  provider: result.provider,
  model: result.model,
  accountHint: result.accountHint ?? null,
  transactions: result.transactions.length,
  confidence: result.transactions.reduce((counts, row) => {
    counts[row.confidence] = (counts[row.confidence] ?? 0) + 1;
    return counts;
  }, {}),
  preview: result.transactions.slice(0, 5),
}, null, 2));
