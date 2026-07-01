import type { HouseLoan, Property, PropertyTax, PropertyType } from "@/types/domain";
import type { Transaction } from "@/types/transaction";

function normalized(value?: string): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferPropertyType(name: string): PropertyType {
  const value = normalized(name);
  if (value.includes("commercial")) return "Commercial";
  if (value.includes("rental")) return "Rental";
  return "Primary";
}

function propertyFromLoan(loan: HouseLoan, id: string): Property {
  const displayName = loan.address?.trim() || loan.name.trim() || "Property";
  return {
    id,
    name: displayName,
    type: inferPropertyType(`${loan.name} ${loan.address ?? ""}`),
    address: loan.address?.trim() || undefined,
    propertyTaxAmount: loan.propertyTaxAmount,
    propertyTaxSchedule: loan.propertyTaxSchedule,
    propertyTaxDate: loan.propertyTaxDate,
    propertyTaxSource: loan.propertyTaxSource,
    propertyTaxRollNumber: loan.propertyTaxRollNumber,
  };
}

function propertyFromTax(record: PropertyTax, id: string): Property {
  return {
    id,
    name: record.name.trim() || "Property",
    type: inferPropertyType(record.name),
  };
}

export type PropertyMigrationResult = {
  properties: Property[];
  houseLoans: HouseLoan[];
  propertyTaxes: PropertyTax[];
  transactions: Transaction[];
  changed: boolean;
};

export function migratePropertyParents(
  storedProperties: Property[],
  storedHouseLoans: HouseLoan[],
  storedPropertyTaxes: PropertyTax[],
  storedTransactions: Transaction[]
): PropertyMigrationResult {
  const properties = storedProperties.map((property) => ({ ...property }));
  let changed = false;

  const ensureProperty = (property: Property) => {
    const existing = properties.find((candidate) => candidate.id === property.id);
    if (existing) return existing;
    properties.push(property);
    changed = true;
    return property;
  };

  const houseLoans = storedHouseLoans.map((loan) => {
    const explicit = loan.propertyId
      ? properties.find((property) => property.id === loan.propertyId)
      : undefined;
    const property = explicit
      ?? properties.find((candidate) => candidate.id === loan.id)
      ?? ensureProperty(propertyFromLoan(loan, loan.propertyId || loan.id));
    if (loan.propertyId === property.id) return loan;
    changed = true;
    return { ...loan, propertyId: property.id };
  });

  const propertyTaxRewrites = new Map<string, string>();
  const propertyTaxes = storedPropertyTaxes.map((record) => {
    const explicit = record.propertyId
      ? properties.find((property) => property.id === record.propertyId)
      : undefined;
    const direct = properties.find((property) => property.id === record.id);
    const recordName = normalized(record.name);
    const nameMatches = properties.filter((property) =>
      recordName
      && [normalized(property.name), normalized(property.address)].includes(recordName)
    );
    const property = explicit
      ?? direct
      ?? (nameMatches.length === 1 ? nameMatches[0] : undefined)
      ?? ensureProperty(propertyFromTax(record, record.propertyId || record.id));

    if (property.id !== record.id) {
      propertyTaxRewrites.set(record.id, property.id);
    }
    if (record.propertyId === property.id) return record;
    changed = true;
    return { ...record, propertyId: property.id };
  });

  const transactions = storedTransactions.map((transaction) => {
    const replacement = transaction.linkedPropertyId
      ? propertyTaxRewrites.get(transaction.linkedPropertyId)
      : undefined;
    const isPropertyTaxRow =
      transaction.recurringOriginType === "property_tax"
      || /property\s*tax/i.test(transaction.description);
    const linkedPropertyId = replacement && isPropertyTaxRow
      ? replacement
      : transaction.linkedPropertyId;
    const originLoan = transaction.recurringOriginType === "house_loan"
      ? houseLoans.find((loan) => loan.id === transaction.recurringOriginId)
      : undefined;
    const propertyLoans = transaction.subType === "mortgage" && linkedPropertyId
      ? houseLoans.filter((loan) => loan.propertyId === linkedPropertyId)
      : [];
    const linkedHouseLoanId = transaction.linkedHouseLoanId
      ?? originLoan?.id
      ?? (propertyLoans.length === 1 ? propertyLoans[0].id : undefined);

    if (
      linkedPropertyId === transaction.linkedPropertyId
      && linkedHouseLoanId === transaction.linkedHouseLoanId
    ) {
      return transaction;
    }
    changed = true;
    return { ...transaction, linkedPropertyId, linkedHouseLoanId };
  });

  return { properties, houseLoans, propertyTaxes, transactions, changed };
}
