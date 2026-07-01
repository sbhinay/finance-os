import { AnthropicStatementScannerProvider } from "./anthropic";
import type { StatementScannerProvider } from "./provider";

export function getStatementScannerProvider(): StatementScannerProvider {
  const provider = (process.env.AI_SCANNER_PROVIDER || "anthropic").toLowerCase();
  if (provider === "anthropic") return new AnthropicStatementScannerProvider();
  throw new Error(`Unsupported AI scanner provider "${provider}".`);
}
