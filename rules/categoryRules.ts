// ─── Static keyword rules ─────────────────────────────────────────────────────
export interface CategoryRule {
  id: string;
  keywords: string[];
  categoryId: string;
}

export const categoryRules: CategoryRule[] = [
  { id: "amazon-prime", keywords: ["amazon prime"], categoryId: "subscription" },
  { id: "amazon",       keywords: ["amazon", "amzn"], categoryId: "shopping" },
  { id: "netflix",      keywords: ["netflix"], categoryId: "subscription" },
  { id: "spotify",      keywords: ["spotify"], categoryId: "subscription" },
  { id: "uber-eats",    keywords: ["uber eats", "ubereats", "doordash", "skip"], categoryId: "dining" },
  { id: "gas",          keywords: ["petro", "esso", "shell", "gas station", "fuel"], categoryId: "gas" },
  { id: "grocery",      keywords: ["loblaws", "metro", "sobeys", "costco", "nofrills", "walmart"], categoryId: "groceries" },
  { id: "cra",          keywords: ["cra", "canada revenue", "remittance"], categoryId: "business-expense" },
];

// ─── Learned rules (user-trained) ────────────────────────────────────────────
const LEARNED_KEY = "finance_os_learned_rules";

export interface LearnedRule {
  id: string;
  description: string; // exact lowercase description
  categoryId: string;
}

export const learnedRulesRepository = {
  getAll(): LearnedRule[] {
    const raw = localStorage.getItem(LEARNED_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  saveAll(rules: LearnedRule[]) {
    localStorage.setItem(LEARNED_KEY, JSON.stringify(rules));
  },
  add(rule: LearnedRule) {
    const rules = this.getAll();
    const exists = rules.find((r) => r.description === rule.description);
    if (exists) {
      // Update existing
      this.saveAll(rules.map((r) => (r.description === rule.description ? rule : r)));
    } else {
      rules.unshift(rule); // newest = highest priority
      this.saveAll(rules);
    }
  },
};

// ─── Rule engine ──────────────────────────────────────────────────────────────
export function detectCategory(
  description: string,
  rules: CategoryRule[] = categoryRules
): string | undefined {
  const desc = description.toLowerCase().trim();

  // 1. Learned rules — highest priority (user explicitly assigned)
  const learned = learnedRulesRepository.getAll();
  const learnedMatch = learned.find((r) => r.description === desc);
  if (learnedMatch) return learnedMatch.categoryId;

  // 2. Static keyword rules
  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (desc.includes(keyword)) return rule.categoryId;
    }
  }

  return undefined;
}

// ─── Uncategorized tracker ────────────────────────────────────────────────────
const UNCATEGORIZED_KEY = "finance_os_uncategorized";

export const uncategorizedRepository = {
  getAll(): string[] {
    const raw = localStorage.getItem(UNCATEGORIZED_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  add(description: string) {
    const list = this.getAll();
    if (!list.includes(description)) {
      list.unshift(description);
      localStorage.setItem(UNCATEGORIZED_KEY, JSON.stringify(list));
    }
  },
  remove(description: string) {
    const list = this.getAll().filter((d) => d !== description);
    localStorage.setItem(UNCATEGORIZED_KEY, JSON.stringify(list));
  },
};
