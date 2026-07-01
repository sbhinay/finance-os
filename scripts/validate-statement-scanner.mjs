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

console.log("Statement scanner parsing validated: fenced JSON, normalization, and invalid-row rejection.");
