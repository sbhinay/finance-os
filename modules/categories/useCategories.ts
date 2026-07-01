"use client";

import { useEffect, useState, useCallback } from "react";
import { Category, CategoryType } from "@/types/category";
import { categoryRepository } from "@/repositories/categoryRepository";
import { uid } from "@/utils/finance";
import { ensureRequiredCategories, seedDefaultCategories } from "@/utils/defaultCategories";
import { DATA_CHANGED_EVENT } from "@/utils/events";
import { transactionRepository } from "@/repositories/transactionRepository";
import { replaceCanonicalTransactions } from "@/services/transactionPipeline";

function migrateVehicleLeaseCategories(categories: Category[]) {
  const leaseCategory = categories.find(
    (category) => category.name.trim().toLowerCase() === "vehicle lease"
  );
  if (!leaseCategory) return;
  const transactions = transactionRepository.getAll();
  let changed = false;
  const migrated = transactions.map((transaction) => {
    if (
      transaction.type === "expense"
      && transaction.linkedVehicleId
      && /^vehicle lease payment\b/i.test(transaction.description)
      && (
        transaction.categoryId !== leaseCategory.id
        || transaction.purpose !== "vehicle_lease_payment"
      )
    ) {
      changed = true;
      return {
        ...transaction,
        categoryId: leaseCategory.id,
        purpose: "vehicle_lease_payment" as const,
      };
    }
    return transaction;
  });
  if (changed) replaceCanonicalTransactions(migrated);
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const cats = categoryRepository.getAll();
    if (cats.length === 0) {
      const seeded = seedDefaultCategories();
      categoryRepository.saveAll(seeded);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategories(seeded);
    } else {
      const upgraded = ensureRequiredCategories(cats);
      if (upgraded !== cats) categoryRepository.saveAll(upgraded);
      migrateVehicleLeaseCategories(upgraded);
      setCategories(upgraded);
    }
  }, []);

  const load = useCallback(() => {
    const cats = categoryRepository.getAll();
    if (cats.length === 0) {
      const seeded = seedDefaultCategories();
      categoryRepository.saveAll(seeded);
      setCategories(seeded);
      return;
    }
    const upgraded = ensureRequiredCategories(cats);
    if (upgraded !== cats) categoryRepository.saveAll(upgraded);
    migrateVehicleLeaseCategories(upgraded);
    setCategories(upgraded);
  }, []);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, [load]);

  const addCategory = useCallback((
    name: string,
    type: CategoryType,
    options?: Pick<Category, "vehicleLinked" | "propertyLinked">
  ) => {
    const cat: Category = {
      id: uid(),
      name: name.trim(),
      type,
      vehicleLinked: options?.vehicleLinked || undefined,
      propertyLinked: options?.propertyLinked || undefined,
    };
    categoryRepository.add(cat);
    load();
  }, [load]);

  const updateCategory = useCallback((updated: Category) => {
    const all = categoryRepository.getAll();
    categoryRepository.saveAll(all.map((c) => c.id === updated.id ? updated : c));
    load();
  }, [load]);

  // Smart delete — archive if transactions exist, hard delete if none
  const deleteCategory = useCallback((id: string, transactionCount: number) => {
    if (transactionCount > 0) {
      const all = categoryRepository.getAll();
      categoryRepository.saveAll(all.map((c) =>
        c.id === id ? { ...c, archived: true } : c
      ));
    } else {
        categoryRepository.saveAll(categoryRepository.getAll().filter((c) => c.id !== id));
    }
    load();
  }, [load]);

  const unarchiveCategory = useCallback((id: string) => {
    const all = categoryRepository.getAll();
    categoryRepository.saveAll(all.map((c) =>
      c.id === id ? { ...c, archived: false } : c
    ));
    load();
  }, [load]);

  return {
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    unarchiveCategory,
  };
}
