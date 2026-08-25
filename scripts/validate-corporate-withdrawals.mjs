import { getCorporateWithdrawalCandidates, isCorporateWithdrawalResolved } from "../utils/corporateWithdrawals.ts";

const accounts = [
  { id: "business", name: "Business", type: "business" },
  { id: "personal", name: "Personal", type: "bank" },
  { id: "savings", name: "Business Savings", type: "business" },
];

const transactions = [
  { id: "risky", type: "transfer", status: "cleared", date: "2026-08-01", amount: 5000, sourceId: "business", destinationId: "personal", description: "Owner transfer" },
  { id: "internal", type: "transfer", status: "cleared", date: "2026-08-02", amount: 1000, sourceId: "business", destinationId: "savings", description: "Internal transfer" },
  { id: "expense", type: "expense", status: "cleared", date: "2026-08-03", amount: 50, sourceId: "business", description: "Business expense" },
  { id: "withdrawal", type: "withdrawal", status: "cleared", date: "2026-08-04", amount: 200, sourceId: "business", description: "Cash withdrawal" },
  { id: "pending", type: "withdrawal", status: "pending", date: "2026-08-05", amount: 300, sourceId: "business", description: "Pending" },
];

const candidates = getCorporateWithdrawalCandidates(transactions, accounts);
if (candidates.map((candidate) => candidate.transaction.id).join(",") !== "withdrawal,risky") {
  throw new Error(`Corporate withdrawal detection returned unexpected rows: ${candidates.map((candidate) => candidate.transaction.id).join(",")}`);
}

if (isCorporateWithdrawalResolved(undefined) || isCorporateWithdrawalResolved({ status: "pending" })) {
  throw new Error("Missing and pending reviews must remain unresolved.");
}
if (!isCorporateWithdrawalResolved({ status: "accountant_review" }) || !isCorporateWithdrawalResolved({ status: "excluded" })) {
  throw new Error("Accountant-review and excluded decisions must resolve the Data Health warning.");
}
if (!isCorporateWithdrawalResolved({ status: "confirmed", classification: "dividend" })) {
  throw new Error("A confirmed classified withdrawal must resolve the warning.");
}
if (isCorporateWithdrawalResolved({ status: "confirmed" })) {
  throw new Error("A confirmed review without classification must remain unresolved.");
}

console.log("Corporate withdrawal detection and review resolution validated.");
