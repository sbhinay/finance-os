import type { Account } from "@/types/account";
import type { CreditCard } from "@/types/creditCard";
import type { Category } from "@/types/category";
import type { Transaction, TransactionType } from "@/types/transaction";
import type { FixedPayment, HouseLoan, PropertyTax, Vehicle } from "@/types/domain";
import type { Business } from "@/types/business";

export interface ReferenceCheckResult {
  errors: string[];
  warnings: string[];
}

export interface ImportPayload {
  accounts: Account[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  categories: Category[];
  business: Business;
  vehicles: Vehicle[];
  houseLoans: HouseLoan[];
  propertyTaxes: PropertyTax[];
  futurePayments: FixedPayment[];
}

export function getTransactionReferencesForEntity(id: string, transactions: Transaction[]) {
  return transactions.filter((tx) => tx.sourceId === id || tx.destinationId === id);
}

export function getAccountReferenceReasons(
  accountId: string,
  transactions: Transaction[],
  cards: CreditCard[],
  fixedPayments: FixedPayment[],
  vehicles: Vehicle[],
  houseLoans: HouseLoan[]
) {
  const reasons: string[] = [];
  const txCount = transactions.filter((tx) => tx.sourceId === accountId || tx.destinationId === accountId).length;
  if (txCount > 0) reasons.push(`${txCount} transaction(s)`);

  const linkedCards = cards.filter((c) => c.linkedAccountId === accountId).length;
  if (linkedCards > 0) reasons.push(`${linkedCards} linked credit card(s)`);

  const fixedPaymentCount = fixedPayments.filter((fp) => fp.source === accountId).length;
  if (fixedPaymentCount > 0) reasons.push(`${fixedPaymentCount} recurring payment(s)`);

  const vehicleCount = vehicles.filter((v) => v.source === accountId).length;
  if (vehicleCount > 0) reasons.push(`${vehicleCount} vehicle source(s)`);

  const houseLoanCount = houseLoans.filter((l) => l.source === accountId).length;
  if (houseLoanCount > 0) reasons.push(`${houseLoanCount} house loan source(s)`);

  return reasons;
}

export function getCardReferenceReasons(
  cardId: string,
  transactions: Transaction[]
) {
  const reasons: string[] = [];
  const txCount = transactions.filter((tx) => tx.sourceId === cardId || tx.destinationId === cardId).length;
  if (txCount > 0) reasons.push(`${txCount} transaction(s)`);
  return reasons;
}

export function getVehicleReferenceReasons(vehicleId: string, transactions: Transaction[]) {
  const reasons: string[] = [];
  const txCount = transactions.filter((tx) => tx.linkedVehicleId === vehicleId).length;
  if (txCount > 0) reasons.push(`${txCount} linked transaction(s)`);
  return reasons;
}

export function getHouseLoanReferenceReasons(houseLoanId: string, transactions: Transaction[]) {
  const reasons: string[] = [];
  const txCount = transactions.filter((tx) => tx.linkedPropertyId === houseLoanId).length;
  if (txCount > 0) reasons.push(`${txCount} linked transaction(s)`);
  return reasons;
}

export function getPropertyTaxReferenceReasons(property: PropertyTax) {
  const reasons: string[] = [];
  const paymentCount = (property.payments ?? []).length;
  if (paymentCount > 0) reasons.push(`${paymentCount} recorded property tax payment(s)`);
  return reasons;
}

export function resolveReferenceId<T extends { id: string; name?: string }>(
  items: T[],
  value: string
): string | undefined {
  if (!value) return undefined;
  const exact = items.find((item) => item.id === value);
  if (exact) return exact.id;

  const normalized = value.trim().toLowerCase();
  const matches = items.filter((item) => item.name?.trim().toLowerCase() === normalized);
  if (matches.length === 1) return matches[0].id;
  return undefined;
}

export function normalizeCategoryReference(
  categoryId: string | undefined,
  categories: Category[]
) {
  if (!categoryId) return { categoryId: undefined, warning: undefined };
  const direct = categories.find((c) => c.id === categoryId);
  if (direct) return { categoryId: direct.id, warning: undefined };

  const normalized = categoryId.trim().toLowerCase();

  // Check for known clear legacy aliases
  const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
    "business-expense": "Business Expense",
  };
  const aliasTarget = LEGACY_CATEGORY_ALIASES[normalized];
  if (aliasTarget) {
    const aliasMatch = categories.find((c) => c.name.toLowerCase() === aliasTarget.toLowerCase());
    if (aliasMatch) {
      return {
        categoryId: aliasMatch.id,
        warning: `Category reference "${categoryId}" was mapped from legacy alias to "${aliasMatch.name}".`,
      };
    }
  }

  const matches = categories.filter((c) => c.name.trim().toLowerCase() === normalized);
  if (matches.length === 1) {
    return {
      categoryId: matches[0].id,
      warning: `Category reference "${categoryId}" was resolved by name to "${matches[0].name}".`,
    };
  }

  // For ambiguous or missing references, fallback to "Other" if it exists
  const otherCategory = categories.find((c) => c.name.toLowerCase() === "other");
  if (otherCategory) {
    const reason = matches.length > 1
      ? `matched multiple categories`
      : `was not found`;
    return {
      categoryId: otherCategory.id,
      warning: `Category reference "${categoryId}" ${reason} and was mapped to "Other" for safe cleanup.`,
    };
  }

  // If no "Other" category exists, leave unresolved
  const warning = matches.length > 1
    ? `Category reference "${categoryId}" matched multiple categories and was left blank.`
    : `Category reference "${categoryId}" was not found and was left blank.`;
  return { categoryId: undefined, warning };
}

export function validateImportPayload(payload: ImportPayload): ReferenceCheckResult & { normalized: ImportPayload } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const accountAndCardSources = [...payload.accounts, ...payload.creditCards];

  const resolvedTransactions = payload.transactions.map((tx) => {
    const normalizedTx = { ...tx };
    const sourceId = resolveReferenceId(accountAndCardSources, String(tx.sourceId));
    if (!sourceId) {
      errors.push(`Transaction ${tx.id} source "${tx.sourceId ?? ""}" could not be resolved to a valid account or card.`);
    } else {
      normalizedTx.sourceId = sourceId;
    }

    if (tx.destinationId) {
      const destId = resolveReferenceId(accountAndCardSources, String(tx.destinationId));
      if (!destId) {
        errors.push(`Transaction ${tx.id} destination "${tx.destinationId}" could not be resolved to a valid account or card.`);
      } else {
        normalizedTx.destinationId = destId;
      }
    }

    if (tx.categoryId) {
      const normalizedCategory = normalizeCategoryReference(String(tx.categoryId), payload.categories);
      if (normalizedCategory.warning) warnings.push(`Transaction ${tx.id}: ${normalizedCategory.warning}`);
      normalizedTx.categoryId = normalizedCategory.categoryId;
    }

    if (tx.linkedVehicleId && !payload.vehicles.some((v) => v.id === tx.linkedVehicleId)) {
      warnings.push(`Transaction ${tx.id}: linked vehicle "${tx.linkedVehicleId}" was not found and was detached.`);
      normalizedTx.linkedVehicleId = undefined;
    }
    if (tx.linkedPropertyId && !payload.houseLoans.some((h) => h.id === tx.linkedPropertyId)) {
      warnings.push(`Transaction ${tx.id}: linked property "${tx.linkedPropertyId}" was not found and was detached.`);
      normalizedTx.linkedPropertyId = undefined;
    }

    if (tx.type === "credit_card_payment" && normalizedTx.destinationId) {
      const isCard = payload.creditCards.some((c) => c.id === normalizedTx.destinationId);
      if (!isCard) {
        errors.push(`Transaction ${tx.id}: credit card payment destination must be a credit card.`);
      }
    }

    if (requiresDestination(tx.type) && !normalizedTx.destinationId) {
      errors.push(`Transaction ${tx.id}: type "${tx.type}" requires a destination account or card.`);
    }

    return normalizedTx;
  });

  const resolveSource = (source: string | undefined, entityName: string) => {
    if (!source) return "";
    const resolved = resolveReferenceId(accountAndCardSources, source);
    if (!resolved) {
      warnings.push(`${entityName} source "${source}" was not found and was cleared.`);
      return "";
    }
    return resolved;
  };

  const resolvedVehicles = payload.vehicles.map((v) => ({ ...v, source: resolveSource(v.source, `Vehicle ${v.name}`) }));
  const resolvedHouseLoans = payload.houseLoans.map((l) => ({ ...l, source: resolveSource(l.source, `House loan ${l.name}`) }));
  const resolvedFixedPayments = payload.futurePayments.map((p) => ({ ...p, source: resolveSource(p.source, `Fixed payment ${p.name}`) }));

  return {
    errors,
    warnings,
    normalized: {
      ...payload,
      transactions: resolvedTransactions,
      vehicles: resolvedVehicles,
      houseLoans: resolvedHouseLoans,
      futurePayments: resolvedFixedPayments,
    },
  };
}

function requiresDestination(type: TransactionType) {
  return type === "transfer" || type === "adjustment" || type === "credit_card_payment";
}
