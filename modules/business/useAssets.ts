"use client";

import { useState, useEffect, useCallback } from "react";
import { Vehicle, Property, HouseLoan, PropertyTax, PropertyTaxPayment } from "@/types/domain";
import { vehicleRepository, propertyRepository, houseLoanRepository, propertyTaxRepository } from "@/repositories/assetRepositories";
import { transactionRepository } from "@/repositories/transactionRepository";
import { uid, toFixed2 } from "@/utils/finance";
import { getVehicleReferenceReasons, getHouseLoanReferenceReasons, getPropertyTaxReferenceReasons } from "@/utils/referenceIntegrity";
import {
  removeOwnedRecurringForProperty,
  removeOwnedRecurringForHouseLoan,
  removeOwnedRecurringForVehicle,
  syncHouseLoanPropertyTaxRecurring,
  syncPropertyInsuranceRecurring,
  syncPropertyTaxRecurring,
  syncVehicleInsuranceRecurring,
} from "@/utils/recurringOwners";
import { migratePropertyParents } from "@/utils/propertyMigration";
import { persistCanonicalTransactions } from "@/services/transactionPipeline";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/utils/events";

function loadPropertyModel() {
  const existingTransactions = transactionRepository.getAll();
  const result = migratePropertyParents(
    propertyRepository.getAll(),
    houseLoanRepository.getAll(),
    propertyTaxRepository.getAll(),
    existingTransactions
  );
  if (result.changed) {
    propertyRepository.saveAll(result.properties);
    houseLoanRepository.saveAll(result.houseLoans);
    propertyTaxRepository.saveAll(result.propertyTaxes);
    const changedTransactions = result.transactions.filter(
      (transaction, index) =>
        transaction.linkedPropertyId !== existingTransactions[index]?.linkedPropertyId
    );
    persistCanonicalTransactions(changedTransactions);
  }
  return result;
}

export function useProperties() {
  const [properties, setProperties] = useState<Property[]>([]);

  const load = useCallback(() => {
    const result = loadPropertyModel();
    setProperties(result.properties);
    if (result.changed) notifyDataChanged("properties");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const handleChange = () => load();
    window.addEventListener(DATA_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handleChange);
  }, [load]);

  const saveProperty = useCallback((property: Omit<Property, "id"> & { id?: string }) => {
    const all = propertyRepository.getAll();
    const prepared: Property = {
      ...property,
      id: property.id || uid(),
      name: property.name.trim(),
      address: property.address?.trim() || undefined,
      purchasePrice: property.purchasePrice == null ? undefined : toFixed2(property.purchasePrice),
      estimatedValue: property.estimatedValue == null ? undefined : toFixed2(property.estimatedValue),
      insuranceAmount: property.insuranceAmount == null ? undefined : toFixed2(property.insuranceAmount),
      propertyTaxAmount: property.propertyTaxAmount == null ? undefined : toFixed2(property.propertyTaxAmount),
    };
    const index = all.findIndex((candidate) => candidate.id === prepared.id);
    if (index >= 0) all[index] = prepared;
    else all.push(prepared);
    propertyRepository.saveAll(all);
    syncPropertyInsuranceRecurring(prepared);
    syncPropertyTaxRecurring(prepared);
    notifyDataChanged("properties");
    load();
    return prepared;
  }, [load]);

  const deleteProperty = useCallback((id: string): "archived" | "deleted" => {
    const hasReferences =
      transactionRepository.getAll().some((transaction) => transaction.linkedPropertyId === id)
      || houseLoanRepository.getAll().some((loan) => loan.propertyId === id)
      || propertyTaxRepository.getAll().some((record) => record.propertyId === id);
    const all = propertyRepository.getAll();
    if (hasReferences) {
      propertyRepository.saveAll(
        all.map((property) => property.id === id ? { ...property, archived: true } : property)
      );
      removeOwnedRecurringForProperty(id);
      notifyDataChanged("properties");
      load();
      return "archived";
    }
    propertyRepository.saveAll(all.filter((property) => property.id !== id));
    removeOwnedRecurringForProperty(id);
    notifyDataChanged("properties");
    load();
    return "deleted";
  }, [load]);

  return { properties, saveProperty, deleteProperty, reloadProperties: load };
}

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
      insuranceAmount: fields.insuranceAmount ? toFixed2(fields.insuranceAmount) : 0,
    };
    vehicleRepository.saveAll([...all, v]);
    syncVehicleInsuranceRecurring(v);
    load();
  }, [load]);

  const updateVehicle = useCallback((updated: Vehicle) => {
    vehicleRepository.saveAll(
      vehicleRepository.getAll().map((v) => v.id === updated.id ? {
        ...updated,
        payment: toFixed2(updated.payment),
        principal: toFixed2(updated.principal),
        remaining: toFixed2(updated.remaining),
        insuranceAmount: updated.insuranceAmount ? toFixed2(updated.insuranceAmount) : 0,
      } : v)
    );
    syncVehicleInsuranceRecurring({
      ...updated,
      insuranceAmount: updated.insuranceAmount ? toFixed2(updated.insuranceAmount) : 0,
    });
    load();
  }, [load]);

  const deleteVehicle = useCallback((id: string) => {
    const reasons = getVehicleReferenceReasons(id, transactionRepository.getAll());
    if (reasons.length > 0) {
      window.alert(`Vehicle cannot be deleted because it is referenced by existing transactions. ${reasons.join(", ")}.`);
      return;
    }
    removeOwnedRecurringForVehicle(id);
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
    setHouseLoans(loadPropertyModel().houseLoans);
  }, []);

  const load = useCallback(() => setHouseLoans(loadPropertyModel().houseLoans), []);

  const addHouseLoan = useCallback((fields: Omit<HouseLoan, "id">) => {
    const l: HouseLoan = {
      ...fields,
      id: uid(),
      principal: toFixed2(fields.principal),
      remaining: toFixed2(fields.remaining),
      payment: toFixed2(fields.payment),
      propertyTaxAmount: fields.propertyTaxAmount ? toFixed2(fields.propertyTaxAmount) : 0,
    };
    houseLoanRepository.saveAll([...houseLoanRepository.getAll(), l]);
    const migrated = loadPropertyModel().houseLoans.find((loan) => loan.id === l.id) ?? l;
    syncHouseLoanPropertyTaxRecurring(migrated);
    notifyDataChanged("properties");
    load();
  }, [load]);

  const updateHouseLoan = useCallback((updated: HouseLoan) => {
    const existingLoan = houseLoanRepository.getAll().find((loan) => loan.id === updated.id);
    const previousPropertyId = existingLoan?.propertyId ?? existingLoan?.id;
    const nextPropertyId = updated.propertyId ?? updated.id;
    houseLoanRepository.saveAll(
      houseLoanRepository.getAll().map((l) => l.id === updated.id ? {
        ...updated,
        principal: toFixed2(updated.principal),
        remaining: toFixed2(updated.remaining),
        payment: toFixed2(updated.payment),
        propertyTaxAmount: updated.propertyTaxAmount ? toFixed2(updated.propertyTaxAmount) : 0,
      } : l)
    );
    syncHouseLoanPropertyTaxRecurring({
      ...updated,
      propertyTaxAmount: updated.propertyTaxAmount ? toFixed2(updated.propertyTaxAmount) : 0,
    });
    notifyDataChanged("properties");
    if (previousPropertyId && previousPropertyId !== nextPropertyId) {
      const relinked = transactionRepository.getAll()
        .filter((transaction) =>
          transaction.linkedPropertyId === previousPropertyId
          && (
            transaction.recurringOriginType === "house_loan"
            || transaction.subType === "mortgage"
          )
        )
        .map((transaction) => ({ ...transaction, linkedPropertyId: nextPropertyId }));
      persistCanonicalTransactions(relinked);
    }
    load();
  }, [load]);

  const deleteHouseLoan = useCallback((id: string) => {
    const reasons = getHouseLoanReferenceReasons(id, transactionRepository.getAll());
    if (reasons.length > 0) {
      window.alert(`House loan cannot be deleted because it is referenced by existing transactions. ${reasons.join(", ")}.`);
      return;
    }
    removeOwnedRecurringForHouseLoan(id);
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
    setPropertyTaxes(loadPropertyModel().propertyTaxes);
  }, []);

  const load = useCallback(() => setPropertyTaxes(loadPropertyModel().propertyTaxes), []);

  const commit = useCallback((data: PropertyTax[]) => {
    propertyTaxRepository.saveAll(data);
    const result = loadPropertyModel();
    setPropertyTaxes(result.propertyTaxes);
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
    const property = propertyTaxRepository.getAll().find((p) => p.id === id);
    if (!property) return;
    const reasons = getPropertyTaxReferenceReasons(property);
    if (reasons.length > 0) {
      window.alert(`Property tax record cannot be deleted because it has existing payments. ${reasons.join(", ")}.`);
      return;
    }
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
