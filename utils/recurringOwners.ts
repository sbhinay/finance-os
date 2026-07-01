import { accountRepository } from "@/repositories/accountRepository";
import { categoryRepository } from "@/repositories/categoryRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { houseLoanRepository, propertyRepository, vehicleRepository } from "@/repositories/assetRepositories";
import type { Account } from "@/types/account";
import type { CreditCard } from "@/types/creditCard";
import type { FixedPayment, HouseLoan, Property, Vehicle } from "@/types/domain";

function getAccountFeesCategoryId() {
  return categoryRepository.getAll().find((c) => c.name.toLowerCase() === "account fees")?.id;
}

function getCarInsuranceCategoryId() {
  return categoryRepository.getAll().find((c) => c.name.toLowerCase() === "car insurance")?.id
    ?? categoryRepository.getAll().find((c) => c.name.toLowerCase() === "insurance")?.id;
}

function getPropertyTaxCategoryId() {
  return categoryRepository.getAll().find((c) => c.name.toLowerCase() === "property tax")?.id;
}

function upsertOwnedRecurringPayment(next: FixedPayment | null) {
  const all = fixedPaymentRepository.getAll();
  if (!next?.ownerType || !next.ownerId) return;

  const existingIndex = all.findIndex(
    (fp) =>
      fp.id === next.id
      || (
        fp.ownerType === next.ownerType
        && fp.ownerId === next.ownerId
        && fp.kind === next.kind
      )
  );

  if (existingIndex >= 0) {
    const existing = all[existingIndex];
    const anchorChangedAtParent =
      next.date !== existing.date
      && next.date !== (existing.startDate ?? existing.date);
    all[existingIndex] = {
      ...existing,
      ...next,
      date: anchorChangedAtParent ? next.date : existing.date,
      startDate: anchorChangedAtParent
        ? next.date
        : existing.startDate ?? next.startDate ?? existing.date ?? next.date,
    };
  } else {
    all.push({ ...next, startDate: next.startDate ?? next.date });
  }

  fixedPaymentRepository.saveAll(all);
}

function removeOwnedRecurringPayment(ownerType: "account" | "card" | "vehicle" | "house_loan" | "property", ownerId: string) {
  const all = fixedPaymentRepository.getAll();
  fixedPaymentRepository.saveAll(
    all.filter((fp) => !(fp.ownerType === ownerType && fp.ownerId === ownerId))
  );
}

export function syncAccountFeeRecurring(account: Account) {
  if (!account.monthlyFeeAmount || account.monthlyFeeAmount <= 0 || !account.monthlyFeeDate) {
    removeOwnedRecurringPayment("account", account.id);
    return;
  }

  upsertOwnedRecurringPayment({
    id: `recurring_account_fee_${account.id}`,
    name: `Account Fees - ${account.name}`,
    kind: "account_fee",
    ownerType: "account",
    ownerId: account.id,
    amount: account.monthlyFeeAmount,
    schedule: "Monthly",
    date: account.monthlyFeeDate,
    source: account.id,
    categoryId: getAccountFeesCategoryId(),
    mode: "Debit",
    tag: account.type === "business" ? "Business" : "Personal",
  });
}

export function syncCardFeeRecurring(card: CreditCard) {
  if (!card.annualFeeAmount || card.annualFeeAmount <= 0 || !card.annualFeeDate) {
    removeOwnedRecurringPayment("card", card.id);
    return;
  }

  upsertOwnedRecurringPayment({
    id: `recurring_card_fee_${card.id}`,
    name: `Annual Fee - ${card.name}`,
    kind: "card_fee",
    ownerType: "card",
    ownerId: card.id,
    amount: card.annualFeeAmount,
    schedule: "Annual",
    date: card.annualFeeDate,
    source: card.id,
    categoryId: getAccountFeesCategoryId(),
    mode: "Credit Card",
    tag: card.type === "business" ? "Business" : "Personal",
  });
}

export function syncVehicleInsuranceRecurring(vehicle: Vehicle) {
  if (!vehicle.insuranceAmount || vehicle.insuranceAmount <= 0 || !vehicle.insuranceDate) {
    removeOwnedRecurringPayment("vehicle", vehicle.id);
    return;
  }

  upsertOwnedRecurringPayment({
    id: `recurring_vehicle_insurance_${vehicle.id}`,
    name: `Insurance - ${vehicle.name}`,
    kind: "insurance",
    ownerType: "vehicle",
    ownerId: vehicle.id,
    amount: vehicle.insuranceAmount,
    schedule: vehicle.insuranceSchedule ?? "Monthly",
    date: vehicle.insuranceDate,
    source: vehicle.insuranceSource ?? vehicle.source,
    categoryId: getCarInsuranceCategoryId(),
    mode: "Debit",
    tag: "Personal",
  });
}

export function syncHouseLoanPropertyTaxRecurring(loan: HouseLoan) {
  if (loan.propertyId) {
    removeOwnedRecurringPayment("house_loan", loan.id);
    const property = propertyRepository.getAll().find((candidate) => candidate.id === loan.propertyId);
    if (!property) return;
    const updated: Property = {
      ...property,
      propertyTaxAmount: loan.propertyTaxAmount,
      propertyTaxSchedule: loan.propertyTaxSchedule,
      propertyTaxDate: loan.propertyTaxDate,
      propertyTaxSource: loan.propertyTaxSource,
      propertyTaxRollNumber: loan.propertyTaxRollNumber,
    };
    propertyRepository.saveAll(
      propertyRepository.getAll().map((candidate) => candidate.id === updated.id ? updated : candidate)
    );
    syncPropertyTaxRecurring(updated);
    return;
  }
  if (!loan.propertyTaxAmount || loan.propertyTaxAmount <= 0 || !loan.propertyTaxDate) {
    removeOwnedRecurringPayment("house_loan", loan.id);
    return;
  }

  upsertOwnedRecurringPayment({
    id: `recurring_house_loan_property_tax_${loan.id}`,
    name: `Property Tax - ${loan.name}`,
    kind: "property_tax",
    ownerType: "house_loan",
    ownerId: loan.id,
    amount: loan.propertyTaxAmount,
    schedule: loan.propertyTaxSchedule ?? "Monthly",
    date: loan.propertyTaxDate,
    source: loan.propertyTaxSource ?? loan.source,
    categoryId: getPropertyTaxCategoryId(),
    mode: "Bank Transfer",
    tag: "Personal",
  });
}

export function syncPropertyTaxRecurring(property: Property) {
  if (
    !property.propertyTaxAmount
    || property.propertyTaxAmount <= 0
    || !property.propertyTaxDate
    || !property.propertyTaxSource
  ) {
    const all = fixedPaymentRepository.getAll();
    fixedPaymentRepository.saveAll(
      all.filter((payment) => payment.id !== `recurring_property_tax_${property.id}`)
    );
    return;
  }

  upsertOwnedRecurringPayment({
    id: `recurring_property_tax_${property.id}`,
    name: `Property Tax - ${property.name}`,
    kind: "property_tax",
    ownerType: "property",
    ownerId: property.id,
    amount: property.propertyTaxAmount,
    schedule: property.propertyTaxSchedule ?? "Monthly",
    date: property.propertyTaxDate,
    source: property.propertyTaxSource,
    categoryId: getPropertyTaxCategoryId(),
    mode: "Bank Transfer",
    tag: property.type === "Commercial" ? "Business" : "Personal",
  });
}

function getInsuranceCategoryId() {
  return categoryRepository.getAll().find((c) => c.name.toLowerCase() === "insurance")?.id
    ?? getCarInsuranceCategoryId();
}

export function syncPropertyInsuranceRecurring(property: Property) {
  if (
    !property.insuranceAmount
    || property.insuranceAmount <= 0
    || !property.insuranceDate
    || !property.insuranceSource
  ) {
    removeOwnedRecurringPayment("property", property.id);
    return;
  }

  upsertOwnedRecurringPayment({
    id: `recurring_property_insurance_${property.id}`,
    name: `Property Insurance - ${property.name}`,
    kind: "insurance",
    ownerType: "property",
    ownerId: property.id,
    amount: property.insuranceAmount,
    schedule: property.insuranceSchedule ?? "Monthly",
    date: property.insuranceDate,
    source: property.insuranceSource,
    categoryId: getInsuranceCategoryId(),
    mode: "Debit",
    tag: property.type === "Commercial" ? "Business" : "Personal",
  });
}

export function removeOwnedRecurringForAccount(accountId: string) {
  removeOwnedRecurringPayment("account", accountId);
}

export function removeOwnedRecurringForCard(cardId: string) {
  removeOwnedRecurringPayment("card", cardId);
}

export function removeOwnedRecurringForVehicle(vehicleId: string) {
  removeOwnedRecurringPayment("vehicle", vehicleId);
}

export function removeOwnedRecurringForHouseLoan(houseLoanId: string) {
  removeOwnedRecurringPayment("house_loan", houseLoanId);
}

export function removeOwnedRecurringForProperty(propertyId: string) {
  removeOwnedRecurringPayment("property", propertyId);
}

export function syncAllOwnedRecurringPayments() {
  accountRepository.getAll().forEach(syncAccountFeeRecurring);
  creditCardRepository.getAll().forEach(syncCardFeeRecurring);
  vehicleRepository.getAll().forEach(syncVehicleInsuranceRecurring);
  houseLoanRepository.getAll().forEach(syncHouseLoanPropertyTaxRecurring);
  propertyRepository.getAll().forEach((property) => {
    syncPropertyInsuranceRecurring(property);
    syncPropertyTaxRecurring(property);
  });
}
