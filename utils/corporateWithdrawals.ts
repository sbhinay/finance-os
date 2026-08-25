import type { Account } from "@/types/account";
import type { CorporateWithdrawalReview } from "@/types/business";
import type { Transaction } from "@/types/transaction";

export interface CorporateWithdrawalCandidate {
  transaction: Transaction;
  source: Account;
  destination?: Account;
  review?: CorporateWithdrawalReview;
}

export function getCorporateWithdrawalCandidates(
  transactions: Transaction[],
  accounts: Account[],
  reviews: Record<string, CorporateWithdrawalReview> = {}
): CorporateWithdrawalCandidate[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return transactions
    .filter((transaction) => transaction.status !== "pending")
    .map((transaction) => {
      const source = accountById.get(transaction.sourceId);
      const destination = transaction.destinationId ? accountById.get(transaction.destinationId) : undefined;
      return { transaction, source, destination };
    })
    .filter((row): row is { transaction: Transaction; source: Account; destination: Account | undefined } => row.source !== undefined)
    .filter(({ transaction, source, destination }) => {
      if (source.type !== "business") return false;
      if (transaction.type === "withdrawal") return true;
      if (transaction.type !== "transfer") return false;
      return Boolean(destination && destination.type !== "business");
    })
    .map((row) => ({ ...row, review: reviews[row.transaction.id] }))
    .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date));
}

export function isCorporateWithdrawalResolved(review?: CorporateWithdrawalReview): boolean {
  if (!review) return false;
  if (review.status === "excluded") return true;
  if (review.status === "accountant_review") return true;
  return review.status === "confirmed" && Boolean(review.classification);
}
