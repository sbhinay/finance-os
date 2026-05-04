import { accountRepository } from "@/repositories/accountRepository";
import { businessRepository } from "@/repositories/businessRepository";
import { categoryRepository } from "@/repositories/categoryRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { transactionRepository } from "@/repositories/transactionRepository";
import { vehicleRepository, houseLoanRepository, propertyTaxRepository } from "@/repositories/assetRepositories";
import { getSupabaseBrowserClient } from "./client";

export interface CloudExportPayload {
  meta: {
    exportedAt: string;
    appVersion: string;
  };
  bankAccounts: ReturnType<typeof accountRepository.getAll>;
  creditCards: ReturnType<typeof creditCardRepository.getAll>;
  transactions: ReturnType<typeof transactionRepository.getAll>;
  categories: ReturnType<typeof categoryRepository.getAll>;
  business: ReturnType<typeof businessRepository.get>;
  vehicles: ReturnType<typeof vehicleRepository.getAll>;
  houseLoans: ReturnType<typeof houseLoanRepository.getAll>;
  propertyTaxes: ReturnType<typeof propertyTaxRepository.getAll>;
  futurePayments: ReturnType<typeof fixedPaymentRepository.getAll>;
}

export function buildCloudExportPayload(): CloudExportPayload {
  return {
    meta: { exportedAt: new Date().toISOString(), appVersion: "next-1.0" },
    bankAccounts: accountRepository.getAll(),
    creditCards: creditCardRepository.getAll(),
    transactions: transactionRepository.getAll(),
    categories: categoryRepository.getAll(),
    business: businessRepository.get(),
    vehicles: vehicleRepository.getAll(),
    houseLoans: houseLoanRepository.getAll(),
    propertyTaxes: propertyTaxRepository.getAll(),
    futurePayments: fixedPaymentRepository.getAll(),
  };
}

export async function saveCloudSnapshot() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("You must be signed in to save to cloud.");

  const payload = buildCloudExportPayload();
  const { error } = await supabase.from("app_snapshots").upsert(
    {
      user_id: authData.user.id,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
  return payload;
}

export async function loadCloudSnapshot() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("You must be signed in to restore from cloud.");

  const { data, error } = await supabase
    .from("app_snapshots")
    .select("payload, updated_at")
    .eq("user_id", authData.user.id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;
  return data as { payload: CloudExportPayload; updated_at: string };
}
