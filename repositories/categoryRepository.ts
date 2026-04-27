import { Category } from "@/types/category";

const STORAGE_KEY = "finance_os_categories";

export const categoryRepository = {
  getAll(): Category[] {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveAll(categories: Category[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  },

  add(category: Category) {
    const all = this.getAll();
    all.push(category);
    this.saveAll(all);
  },
};