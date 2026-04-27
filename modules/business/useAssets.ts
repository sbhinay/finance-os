"use client";

import { useState, useEffect, useCallback } from "react";
import { Vehicle, HouseLoan, PropertyTax, PropertyTaxPayment } from "@/types/domain";
import { vehicleRepository, houseLoanRepository, propertyTaxRepository } from "@/repositories/assetRepositories";
import { uid, toFixed2 } from "@/utils/finance";

// ═══════════════════════════════════════════════════════════════════════════════
// VEHICLES
// ═══════════════════════════════════════════════════════════════════════════════

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVehicles(vehicleRepository.getAll());
  }, []);

  const load = useCallback(() => setVehicles(vehicleRepository.getAll()), []);

  const addVehicle = useCallback((fields: Omit<Vehicle, "id">) => {
    const all = vehicleRepository.getAll();
    const v: Vehicle = {
      ...fields,
      id: uid(),
      payment: toFixed2(fields.payment),
      principal: toFixed2(fields.principal),
      remaining: toFixed2(fields.remaining),
    };
    vehicleRepository.saveAll([...all, v]);
    load();
  }, [load]);

  const updateVehicle = useCallback((updated: Vehicle) => {
    vehicleRepository.saveAll(
      vehicleRepository.getAll().map((v) => v.id === updated.id ? {
        ...updated,
        payment: toFixed2(updated.payment),
        principal: toFixed2(updated.principal),
        remaining: toFixed2(updated.remaining),
      } : v)
    );
    load();
  }, [load]);

  const deleteVehicle = useCallback((id: string) => {
    vehicleRepository.saveAll(vehicleRepository.getAll().filter((v) => v.id !== id));
    load();
  }, [load]);

  return { vehicles, addVehicle, updateVehicle, deleteVehicle, reloadVehicles: load };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOUSE LOANS
// ═══════════════════════════════════════════════════════════════════════════════

export function useHouseLoans() {
  const [houseLoans, setHouseLoans] = useState<HouseLoan[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHouseLoans(houseLoanRepository.getAll());
  }, []);

  const load = useCallback(() => setHouseLoans(houseLoanRepository.getAll()), []);

  const addHouseLoan = useCallback((fields: Omit<HouseLoan, "id">) => {
    const l: HouseLoan = {
      ...fields,
      id: uid(),
      principal: toFixed2(fields.principal),
      remaining: toFixed2(fields.remaining),
      payment: toFixed2(fields.payment),
    };
    houseLoanRepository.saveAll([...houseLoanRepository.getAll(), l]);
    load();
  }, [load]);

  const updateHouseLoan = useCallback((updated: HouseLoan) => {
    houseLoanRepository.saveAll(
      houseLoanRepository.getAll().map((l) => l.id === updated.id ? {
        ...updated,
        principal: toFixed2(updated.principal),
        remaining: toFixed2(updated.remaining),
        payment: toFixed2(updated.payment),
      } : l)
    );
    load();
  }, [load]);

  const deleteHouseLoan = useCallback((id: string) => {
    houseLoanRepository.saveAll(houseLoanRepository.getAll().filter((l) => l.id !== id));
    load();
  }, [load]);

  return { houseLoans, addHouseLoan, updateHouseLoan, deleteHouseLoan, reloadHouseLoans: load };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPERTY TAX
// ═══════════════════════════════════════════════════════════════════════════════

export function usePropertyTax() {
  const [propertyTaxes, setPropertyTaxes] = useState<PropertyTax[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPropertyTaxes(propertyTaxRepository.getAll());
  }, []);

  const load = useCallback(() => setPropertyTaxes(propertyTaxRepository.getAll()), []);

  const commit = useCallback((data: PropertyTax[]) => {
    propertyTaxRepository.saveAll(data);
    setPropertyTaxes(data);
  }, []);

  // Properties
  const addProperty = useCallback((name: string, accountNumber: string) => {
    const all = propertyTaxRepository.getAll();
    commit([...all, { id: uid(), name, accountNumber, payments: [] }]);
  }, [commit]);

  const updateProperty = useCallback((id: string, name: string, accountNumber: string) => {
    const all = propertyTaxRepository.getAll();
    commit(all.map((p) => p.id === id ? { ...p, name, accountNumber } : p));
  }, [commit]);

  const deleteProperty = useCallback((id: string) => {
    commit(propertyTaxRepository.getAll().filter((p) => p.id !== id));
  }, [commit]);

  // Payments
  const addPayment = useCallback((
    propertyId: string,
    fields: Omit<PropertyTaxPayment, "id" | "propertyId">
  ) => {
    const all = propertyTaxRepository.getAll();
    const pay: PropertyTaxPayment = {
      ...fields,
      id: uid(),
      propertyId,
      amount: toFixed2(fields.amount),
    };
    commit(all.map((p) =>
      p.id === propertyId ? { ...p, payments: [...(p.payments ?? []), pay] } : p
    ));
  }, [commit]);

  const deletePayment = useCallback((propertyId: string, paymentId: string) => {
    const all = propertyTaxRepository.getAll();
    commit(all.map((p) =>
      p.id === propertyId
        ? { ...p, payments: (p.payments ?? []).filter((x) => x.id !== paymentId) }
        : p
    ));
  }, [commit]);

  const markPaid = useCallback((
    propertyId: string,
    paymentId: string,
    paid: boolean,
    paidDate?: string
  ) => {
    const all = propertyTaxRepository.getAll();
    commit(all.map((p) =>
      p.id === propertyId
        ? {
            ...p,
            payments: (p.payments ?? []).map((x) =>
              x.id === paymentId
                ? { ...x, paid, paidDate: paid ? (paidDate ?? new Date().toISOString().split("T")[0]) : undefined }
                : x
            ),
          }
        : p
    ));
  }, [commit]);

  return {
    propertyTaxes,
    addProperty, updateProperty, deleteProperty,
    addPayment, deletePayment, markPaid,
    reloadPropertyTax: load,
  };
}
