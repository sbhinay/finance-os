import { buildCanonicalTransaction } from "@/services/transactionPipeline";
import type { StatementScannerCandidate } from "@/types/statementScanner";
import type { Transaction } from "@/types/transaction";
import { isSemanticDuplicate } from "@/utils/transactionSemantics";

export function scannerCandidateToTransaction(candidate: StatementScannerCandidate): Transaction {
  return buildCanonicalTransaction({
    purpose: candidate.purpose,
    amount: candidate.amount,
    date: candidate.date,
    sourceId: candidate.sourceId,
    destinationId: candidate.destinationId,
    categoryId: candidate.categoryId,
    description: candidate.description,
    tag: candidate.tag,
    status: "cleared",
  });
}

function dayDistance(left: string, right: string): number {
  const leftDate = Date.parse(`${left}T12:00:00Z`);
  const rightDate = Date.parse(`${right}T12:00:00Z`);
  return Math.abs(leftDate - rightDate) / 86_400_000;
}

export function classifyScannerDuplicate(
  candidate: StatementScannerCandidate,
  existing: Transaction[]
): Pick<StatementScannerCandidate, "duplicateLevel" | "duplicateTransactionId"> {
  if (!candidate.sourceId || !(candidate.amount > 0) || !candidate.date) return {};
  const transaction = scannerCandidateToTransaction(candidate);
  const definite = existing.find((item) => isSemanticDuplicate(transaction, item));
  if (definite) return { duplicateLevel: "definite", duplicateTransactionId: definite.id };

  const probable = existing.find((item) =>
    item.status !== "pending"
    && item.date === candidate.date
    && Math.round(item.amount * 100) === Math.round(candidate.amount * 100)
    && item.sourceId === candidate.sourceId
  );
  if (probable) return { duplicateLevel: "probable", duplicateTransactionId: probable.id };

  const possible = existing.find((item) =>
    item.status !== "pending"
    && Math.round(item.amount * 100) === Math.round(candidate.amount * 100)
    && dayDistance(item.date, candidate.date) <= 3
  );
  return possible
    ? { duplicateLevel: "possible", duplicateTransactionId: possible.id }
    : {};
}
