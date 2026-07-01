import { accountRepository } from "@/repositories/accountRepository";
import { businessRepository } from "@/repositories/businessRepository";
import { categoryRepository } from "@/repositories/categoryRepository";
import { creditCardRepository } from "@/repositories/creditCardRepository";
import { fixedPaymentRepository } from "@/repositories/fixedPaymentRepository";
import { transactionRepository } from "@/repositories/transactionRepository";
import {
  vehicleRepository,
  propertyRepository,
  houseLoanRepository,
  liabilityRepository,
  propertyTaxRepository,
} from "@/repositories/assetRepositories";
import { uid } from "@/utils/finance";
import { getSupabaseBrowserClient } from "./client";

const DEVICE_ID_KEY = "finance_os_cloud_device_id";

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
  properties: ReturnType<typeof propertyRepository.getAll>;
  houseLoans: ReturnType<typeof houseLoanRepository.getAll>;
  propertyTaxes: ReturnType<typeof propertyTaxRepository.getAll>;
  liabilities: ReturnType<typeof liabilityRepository.getAll>;
  futurePayments: ReturnType<typeof fixedPaymentRepository.getAll>;
}

export interface CloudSnapshot {
  payload: CloudExportPayload;
  updated_at: string;
  revision: number;
  payload_hash: string;
  device_id?: string;
}

export interface CloudSnapshotHistoryItem extends CloudSnapshot {
  id: string;
  label?: string;
  created_at: string;
}

export class CloudSnapshotConflictError extends Error {
  constructor() {
    super("Cloud snapshot changed after this page last checked it. Refresh cloud state before saving.");
    this.name = "CloudSnapshotConflictError";
  }
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
    properties: propertyRepository.getAll(),
    houseLoans: houseLoanRepository.getAll(),
    propertyTaxes: propertyTaxRepository.getAll(),
    liabilities: liabilityRepository.getAll(),
    futurePayments: fixedPaymentRepository.getAll(),
  };
}

function fingerprintInput(payload: CloudExportPayload) {
  return {
    ...payload,
    meta: { ...payload.meta, exportedAt: "" },
  };
}

export async function hashCloudPayload(payload: CloudExportPayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(fingerprintInput(payload)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getCloudDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = uid();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

async function requireUser() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("You must be signed in to use cloud snapshots.");
  return { supabase, user: data.user };
}

export async function saveCloudSnapshot({
  expectedRevision,
  label,
}: {
  expectedRevision: number;
  label?: string;
}) {
  const { supabase } = await requireUser();
  const payload = buildCloudExportPayload();
  const payloadHash = await hashCloudPayload(payload);
  const { data, error } = await supabase.rpc("save_app_snapshot_guarded", {
    p_payload: payload,
    p_expected_revision: expectedRevision,
    p_payload_hash: payloadHash,
    p_device_id: getCloudDeviceId(),
    p_label: label?.trim() || null,
  });
  if (error) {
    if (error.code === "40001" || error.message?.includes("snapshot_conflict")) {
      throw new CloudSnapshotConflictError();
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    payload,
    updated_at: String(row.updated_at),
    revision: Number(row.revision),
    payload_hash: String(row.payload_hash),
    device_id: row.device_id ? String(row.device_id) : undefined,
  } satisfies CloudSnapshot;
}

export async function loadCloudSnapshot(): Promise<CloudSnapshot | null> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("app_snapshots")
    .select("payload, updated_at, revision, payload_hash, device_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    payload: data.payload as CloudExportPayload,
    updated_at: String(data.updated_at),
    revision: Number(data.revision),
    payload_hash: String(data.payload_hash),
    device_id: data.device_id ? String(data.device_id) : undefined,
  };
}

export async function listCloudSnapshotHistory(limit = 20): Promise<CloudSnapshotHistoryItem[]> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("app_snapshot_history")
    .select("id, payload, created_at, revision, payload_hash, device_id, label")
    .eq("user_id", user.id)
    .order("revision", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    payload: row.payload as CloudExportPayload,
    created_at: String(row.created_at),
    updated_at: String(row.created_at),
    revision: Number(row.revision),
    payload_hash: String(row.payload_hash),
    device_id: row.device_id ? String(row.device_id) : undefined,
    label: row.label ? String(row.label) : undefined,
  }));
}

export async function loadCloudSnapshotHistoryItem(id: string): Promise<CloudSnapshotHistoryItem> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("app_snapshot_history")
    .select("id, payload, created_at, revision, payload_hash, device_id, label")
    .eq("user_id", user.id)
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    id: String(data.id),
    payload: data.payload as CloudExportPayload,
    created_at: String(data.created_at),
    updated_at: String(data.created_at),
    revision: Number(data.revision),
    payload_hash: String(data.payload_hash),
    device_id: data.device_id ? String(data.device_id) : undefined,
    label: data.label ? String(data.label) : undefined,
  };
}
