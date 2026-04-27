const STORAGE_KEY = "learnedCategoryRules";

export interface LearnedRule {
  id: string;
  description: string; // full description (lowercase)
  categoryId: string;
}

export const learnedRulesRepository = {
  getAll(): LearnedRule[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },

  saveAll(rules: LearnedRule[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  },

  add(rule: LearnedRule) {
    const rules = this.getAll();

    // avoid duplicates
    const exists = rules.find(
      (r) => r.description === rule.description
    );
    if (exists) return;

    rules.unshift(rule); // newest first = priority
    this.saveAll(rules);
  },
};