import type { CloudExportPayload } from "@/lib/supabase/cloudSnapshots";
import { accountRepository } from "@/repositories/accountRepository";
import {
  houseLoanRepository,
  liabilityRepository,
  propertyRepository,
  propertyTaxRepository,
  vehicleRepository,
} from "@/repositories/assetRepositories";
import { businessRepository } from "@/repositories/businessRepository";
import { categoryRepository } from "@/repositories/categoryRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { replaceCanonicalTransactions } from "@/services/transactionPipeline";
import { notifyDataChanged } from "@/utils/events";
import { clearLocalFinanceData } from "@/utils/localFinanceData";

export function applyCloudPayloadToLocal(payload: CloudExportPayload) {
  clearLocalFinanceData();
  accountRepository.saveAll(payload.bankAccounts ?? []);
  creditCardRepository.saveAll(payload.creditCards ?? []);
  categoryRepository.saveAll(payload.categories ?? []);
  businessRepository.save(payload.business);
  vehicleRepository.saveAll(payload.vehicles ?? []);
  propertyRepository.saveAll(payload.properties ?? []);
  houseLoanRepository.saveAll(payload.houseLoans ?? []);
  propertyTaxRepository.saveAll(payload.propertyTaxes ?? []);
  liabilityRepository.saveAll(payload.liabilities ?? []);
  fixedPaymentRepository.saveAll(payload.futurePayments ?? []);
  replaceCanonicalTransactions(payload.transactions ?? []);
  notifyDataChanged("cloud-bootstrap");
}

export function initializeEmptyLocalProfile() {
  clearLocalFinanceData();
  notifyDataChanged("cloud-empty-profile");
}
