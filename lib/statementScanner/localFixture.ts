import type { StatementScannerProvider } from "./provider.ts";
import { parseExtractionJson } from "./provider.ts";

const DEFAULT_FIXTURE = JSON.stringify({
  accountHint: "Local fixture",
  transactions: [{
    date: "2026-06-29",
    description: "Local Scanner Fixture",
    amount: 12.34,
    purpose: "general_expense",
    confidence: "high",
  }],
});

export class LocalFixtureStatementScannerProvider implements StatementScannerProvider {
  async extract() {
    const fixture = process.env.AI_SCANNER_FIXTURE_JSON || DEFAULT_FIXTURE;
    return {
      ...parseExtractionJson(fixture),
      provider: "local_fixture",
      model: "local-fixture-v1",
    };
  }
}
