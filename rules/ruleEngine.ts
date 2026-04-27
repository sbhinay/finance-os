import { CategoryRule } from "./categoryRules";
import { learnedRulesRepository } from "./learnedRules";

export function detectCategory(
  description: string,
  rules: CategoryRule[]
): string | undefined {
  const desc = description.toLowerCase().trim();

  // 1. Learned rules (highest priority)
  const learned = learnedRulesRepository.getAll();

  const learnedMatch = learned.find(
    (r) => r.description === desc
  );

  if (learnedMatch) {
    return learnedMatch.categoryId;
  }

  // 2. Static keyword rules
  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (desc.includes(keyword)) {
        return rule.categoryId;
      }
    }
  }

  return undefined;
}