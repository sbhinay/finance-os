import { getStatementScannerProvider, getStatementScannerStatus } from "../lib/statementScanner/index.ts";
import { AnthropicStatementScannerProvider } from "../lib/statementScanner/anthropic.ts";
import { LocalFixtureStatementScannerProvider } from "../lib/statementScanner/localFixture.ts";
import { parseExtractionJson } from "../lib/statementScanner/provider.ts";

const parsed = parseExtractionJson(`\`\`\`json
{
  "accountHint": "Avion 1234",
  "transactions": [
    {
      "date": "2026-06-29",
      "description": "Merchant",
      "amount": 12.345,
      "purpose": "general_expense",
      "suggestedCategoryId": "cat-food",
      "confidence": "high"
    }
  ]
}
\`\`\``);

if (parsed.accountHint !== "Avion 1234") throw new Error("Scanner account hint parsing failed.");
if (parsed.transactions[0]?.amount !== 12.35) throw new Error("Scanner amount normalization failed.");
if (parsed.transactions[0]?.purpose !== "general_expense") throw new Error("Scanner purpose parsing failed.");

let rejected = false;
try {
  parseExtractionJson('{"transactions":[{"date":"bad","description":"x","amount":1,"purpose":"general_expense","confidence":"high"}]}');
} catch {
  rejected = true;
}
if (!rejected) throw new Error("Scanner parser accepted an invalid date.");

const previousProvider = process.env.AI_SCANNER_PROVIDER;
const previousFixture = process.env.AI_SCANNER_FIXTURE_JSON;
const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;

process.env.AI_SCANNER_PROVIDER = "local_fixture";
process.env.AI_SCANNER_FIXTURE_JSON = JSON.stringify({
  accountHint: "Fixture Card 1234",
  transactions: [{
    date: "2026-06-30",
    description: "Fixture Refund",
    amount: 10,
    purpose: "purchase_refund",
    confidence: "medium",
  }],
});
const localProvider = getStatementScannerProvider();
if (!(localProvider instanceof LocalFixtureStatementScannerProvider)) {
  throw new Error("Local fixture scanner provider was not selected.");
}
const localStatus = getStatementScannerStatus();
if (!localStatus.configured || localStatus.mode !== "local_fixture") {
  throw new Error("Local fixture scanner status should be configured.");
}
const localResult = await localProvider.extract({ images: [], categories: [], accounts: [] });
if (localResult.provider !== "local_fixture" || localResult.transactions[0]?.purpose !== "purchase_refund") {
  throw new Error("Local fixture scanner provider did not return validated fixture rows.");
}

process.env.AI_SCANNER_PROVIDER = "anthropic";
delete process.env.ANTHROPIC_API_KEY;
const unconfiguredAnthropic = getStatementScannerStatus();
if (unconfiguredAnthropic.configured || !unconfiguredAnthropic.message.includes("ANTHROPIC_API_KEY")) {
  throw new Error("Anthropic scanner status should report missing server key.");
}
process.env.ANTHROPIC_API_KEY = "test-key";
const configuredAnthropic = getStatementScannerStatus();
if (!configuredAnthropic.configured || configuredAnthropic.mode !== "external") {
  throw new Error("Anthropic scanner status should report configured external provider.");
}
if (!(getStatementScannerProvider() instanceof AnthropicStatementScannerProvider)) {
  throw new Error("Anthropic scanner provider was not selected.");
}

process.env.AI_SCANNER_PROVIDER = "unsupported";
const unsupportedStatus = getStatementScannerStatus();
if (unsupportedStatus.configured || !unsupportedStatus.message.includes("Unsupported")) {
  throw new Error("Unsupported scanner provider should report not configured.");
}

if (previousProvider === undefined) {
  delete process.env.AI_SCANNER_PROVIDER;
} else {
  process.env.AI_SCANNER_PROVIDER = previousProvider;
}
if (previousFixture === undefined) {
  delete process.env.AI_SCANNER_FIXTURE_JSON;
} else {
  process.env.AI_SCANNER_FIXTURE_JSON = previousFixture;
}
if (previousAnthropicKey === undefined) {
  delete process.env.ANTHROPIC_API_KEY;
} else {
  process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
}

console.log("Statement scanner validated: parsing, fixture provider, provider status, provider selection, and invalid-row rejection.");
