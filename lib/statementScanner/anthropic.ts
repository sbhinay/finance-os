import type { StatementScannerProvider, StatementExtractionInput } from "./provider.ts";
import { parseExtractionJson } from "./provider.ts";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function extractionPrompt(input: StatementExtractionInput): string {
  return `You extract visible transactions from Canadian bank and credit-card statement images.
Return only valid JSON with this shape:
{"accountHint":"visible account name or last four digits, or empty string","transactions":[{"date":"YYYY-MM-DD","description":"clean merchant or transaction label","amount":12.34,"purpose":"general_expense|general_income|purchase_refund|bank_transfer|credit_card_payment|loc_draw","suggestedCategoryId":"an id from the supplied category list, or null","confidence":"high|medium|low"}]}

Accounting rules:
- Amount is always positive.
- Purchases and withdrawals are general_expense.
- Deposits and earnings are general_income.
- Merchant credits and returned purchases are purchase_refund.
- "Payment - thank you" on a credit-card statement is credit_card_payment, not an expense.
- Internal bank movement is bank_transfer.
- A line-of-credit advance is loc_draw.
- Use the transaction posting date visible in the image.
- Do not invent clipped or unreadable rows. Mark uncertain readable rows low confidence.
- Suggested category ids must come from this list exactly: ${JSON.stringify(input.categories)}.
- Account/card hints may come from this list: ${JSON.stringify(input.accounts)}.`;
}

export class AnthropicStatementScannerProvider implements StatementScannerProvider {
  async extract(input: StatementExtractionInput) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
    const model = process.env.AI_SCANNER_MODEL || DEFAULT_MODEL;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            ...input.images.map((image) => ({
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: image.data },
            })),
            { type: "text", text: extractionPrompt(input) },
          ],
        }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic extraction failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const text = payload.content?.find((block) => block.type === "text")?.text;
    if (!text) throw new Error("Anthropic returned no structured text.");
    return { ...parseExtractionJson(text), provider: "anthropic", model };
  }
}
