import { Vehicle, HouseLoan, PropertyTax } from "@/types/domain";

// ─── Vehicle Repository ───────────────────────────────────────────────────────

const VEHICLE_KEY = "finance_os_vehicles";

export const vehicleRepository = {
  getAll(): Vehicle[] {
    try { return JSON.parse(localStorage.getItem(VEHICLE_KEY) || "[]"); } catch { return []; }
  },
  saveAll(data: Vehicle[]) {
    localStorage.setItem(VEHICLE_KEY, JSON.stringify(data));
  },
};

// ─── House Loan Repository ────────────────────────────────────────────────────

const LOAN_KEY = "finance_os_house_loans";

export const houseLoanRepository = {
  getAll(): HouseLoan[] {
    try { return JSON.parse(localStorage.getItem(LOAN_KEY) || "[]"); } catch { return []; }
  },
  saveAll(data: HouseLoan[]) {
    localStorage.setItem(LOAN_KEY, JSON.stringify(data));
  },
};

// ─── Property Tax Repository ──────────────────────────────────────────────────

const PROPERTYTAX_KEY = "finance_os_property_taxes";

export const propertyTaxRepository = {
  getAll(): PropertyTax[] {
    try { return JSON.parse(localStorage.getItem(PROPERTYTAX_KEY) || "[]"); } catch { return []; }
  },
  saveAll(data: PropertyTax[]) {
    localStorage.setItem(PROPERTYTAX_KEY, JSON.stringify(data));
  },
};
