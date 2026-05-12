import { accountRepository } from "@/repositories/accountRepository";
import { categoryRepository } from "@/repositories/categoryRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { houseLoanRepository, vehicleRepository } from "@/repositories/assetRepositories";
import type { Account } from "@/types/account";
import type { CreditCard } from "@/types/creditCard";
import type { FixedPayment, HouseLoan, Vehicle } from "@/types/domain";

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
    (fp) => fp.ownerType === next.ownerType && fp.ownerId === next.ownerId
  );

  if (existingIndex >= 0) {
    all[existingIndex] = { ...all[existingIndex], ...next };
  } else {
    all.push(next);
  }

  fixedPaymentRepository.saveAll(all);
}

function removeOwnedRecurringPayment(ownerType: "account" | "card" | "vehicle" | "house_loan", ownerId: string) {
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

export function syncAllOwnedRecurringPayments() {
  accountRepository.getAll().forEach(syncAccountFeeRecurring);
  creditCardRepository.getAll().forEach(syncCardFeeRecurring);
  vehicleRepository.getAll().forEach(syncVehicleInsuranceRecurring);
  houseLoanRepository.getAll().forEach(syncHouseLoanPropertyTaxRecurring);
}
