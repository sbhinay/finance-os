import type { TransactionPurpose } from "@/types/transaction";

export type ScannerConfidence = "high" | "medium" | "low";

export interface ExtractedStatementTransaction {
  date: string;
  description: string;
  amount: number;
  purpose: Extract<TransactionPurpose,
    | "general_expense"
    | "general_income"
    | "purchase_refund"
    | "bank_transfer"
    | "credit_card_payment"
    | "loc_draw"
  >;
  suggestedCategoryId?: string;
  confidence: ScannerConfidence;
}

export interface StatementExtractionResult {
  accountHint?: string;
  transactions: ExtractedStatementTransaction[];
  provider: string;
  model: string;
}

export interface StatementScannerCandidate extends ExtractedStatementTransaction {
  id: string;
  enabled: boolean;
  sourceId: string;
  destinationId?: string;
  categoryId?: string;
  tag: "Personal" | "Business";
  duplicateLevel?: "definite" | "probable" | "possible";
  duplicateTransactionId?: string;
}
