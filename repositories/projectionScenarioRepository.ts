import { normalizeProjectionScenarios, type ProjectionScenario } from "@/utils/projectionScenarios";

const KEY = "finance_os_projection_scenarios";

export const projectionScenarioRepository = {
  getAll(): ProjectionScenario[] {
    try {
      return normalizeProjectionScenarios(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch {
      return [];
    }
  },
  saveAll(data: ProjectionScenario[]) {
    localStorage.setItem(KEY, JSON.stringify(normalizeProjectionScenarios(data)));
  },
};
