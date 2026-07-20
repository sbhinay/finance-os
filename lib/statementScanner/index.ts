import { AnthropicStatementScannerProvider } from "./anthropic.ts";
import { LocalFixtureStatementScannerProvider } from "./localFixture.ts";
import type { StatementScannerProvider } from "./provider.ts";

export function getStatementScannerProvider(): StatementScannerProvider {
  const provider = (process.env.AI_SCANNER_PROVIDER || "anthropic").toLowerCase();
  if (provider === "anthropic") return new AnthropicStatementScannerProvider();
  if (provider === "local_fixture") return new LocalFixtureStatementScannerProvider();
  throw new Error(`Unsupported AI scanner provider "${provider}".`);
}
