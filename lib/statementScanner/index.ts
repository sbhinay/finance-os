import { AnthropicStatementScannerProvider } from "./anthropic.ts";
import { LocalFixtureStatementScannerProvider } from "./localFixture.ts";
import type { StatementScannerProvider } from "./provider.ts";

export interface StatementScannerStatus {
  provider: string;
  configured: boolean;
  mode: "external" | "local_fixture";
  message: string;
}

export function getStatementScannerProviderName() {
  return (process.env.AI_SCANNER_PROVIDER || "anthropic").toLowerCase();
}

export function getStatementScannerProvider(): StatementScannerProvider {
  const provider = getStatementScannerProviderName();
  if (provider === "anthropic") return new AnthropicStatementScannerProvider();
  if (provider === "local_fixture") return new LocalFixtureStatementScannerProvider();
  throw new Error(`Unsupported AI scanner provider "${provider}".`);
}

export function getStatementScannerStatus(): StatementScannerStatus {
  const provider = getStatementScannerProviderName();
  if (provider === "local_fixture") {
    return {
      provider,
      configured: true,
      mode: "local_fixture",
      message: "Local fixture scanner is ready for deterministic acceptance testing. It does not perform OCR.",
    };
  }
  if (provider === "anthropic") {
    const configured = Boolean(process.env.ANTHROPIC_API_KEY);
    return {
      provider,
      configured,
      mode: "external",
      message: configured
        ? "Anthropic scanner provider is configured."
        : "Anthropic scanner provider is selected, but ANTHROPIC_API_KEY is not configured on the server.",
    };
  }
  return {
    provider,
    configured: false,
    mode: "external",
    message: `Unsupported AI scanner provider "${provider}".`,
  };
}
