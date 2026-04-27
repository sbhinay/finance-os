"use client";

import { useEffect, useState, useCallback } from "react";
import { Category, CategoryType } from "@/types/category";
import { categoryRepository } from "@/repositories/categoryRepository";
import { uid } from "@/utils/finance";
import { seedDefaultCategories } from "@/utils/defaultCategories";
import { DATA_CHANGED_EVENT } from "@/utils/events";

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(() => {
    const cats = categoryRepository.getAll();
    if (cats.length === 0) {
      const seeded = seedDefaultCategories();
      categoryRepository.saveAll(seeded);
      return seeded;
    }
    return cats;
  });

  const load = useCallback(() => {
    const cats = categoryRepository.getAll();
    if (cats.length === 0) {
      const seeded = seedDefaultCategories();
      categoryRepository.saveAll(seeded);
      setCategories(seeded);
      return;
    }
    setCategories(cats);
  }, []);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, [load]);

  const addCategory = useCallback((name: string, type: CategoryType) => {
    const cat: Category = { id: uid(), name: name.trim(), type };
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
