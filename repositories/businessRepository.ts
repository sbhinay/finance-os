import { Business } from "@/types/business";

const STORAGE_KEY = "finance_os_business";

/**
 * Default empty Business object — mirrors prototype's defaultBusiness.
 * Used on first load (blank on first open, no pre-seeded data).
 */
const DEFAULT_BUSINESS: Business = {
  clientName: "",
  contracts: [],
  invoices: [],
  hstRemittances: [],
  corporateInstalments: [],
  payrollRemittances: [],
  arrearsHST: 0,
  arrearsCorp: 0,
  arrearsPayments: [],
  rateSettings: {
    hstRate: [],
    quickMethodRate: [],
    payrollDraw: [],
    corpTaxInstalment: [],
  },
};

export const businessRepository = {
  get(): Business {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BUSINESS };
    try {
      return { ...DEFAULT_BUSINESS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_BUSINESS };
    }
  },

  save(business: Business): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(business));
  },

  /**
   * Import from prototype's monolithic financeOS_v4 key.
   * Extracts and normalises the business sub-object.
   * Call once during data migration — does NOT overwrite existing Next.js data.
   */
  importFromPrototype(protoData: Record<string, unknown>): Business | null {
    const raw = protoData?.business;
    if (!raw || typeof raw !== "object") return null;
    const biz = raw as Record<string, unknown>;

    // Merge over defaults to fill any missing fields
    const imported: Business = {
      ...DEFAULT_BUSINESS,
      ...(biz as Partial<Business>),
    };

    // Migrate legacy scalar payrollDraw/payrollRemittance → rateSettings
    if (
      imported.rateSettings?.payrollDraw?.length === 0 &&
      typeof imported.payrollDraw === "number"
    ) {
      imported.rateSettings = {
        ...imported.rateSettings,
        payrollDraw: [
          {
            id: "pd_imported",
            value: imported.payrollDraw ?? 0,
            craRemittance:
              (imported.payrollRemittance as number | undefined) ?? 0,
            effectiveFrom: "2025-04-01",
            note: "Imported from previous settings",
          },
        ],
      };
    }

    // Migrate legacy craArrears object → flat fields
    const craArrears = biz.craArrears as
      | { hst?: number; corporate?: number }
      | undefined;
    if (craArrears && !imported.arrearsHST) {
      imported.arrearsHST = craArrears.hst ?? 0;
      imported.arrearsCorp = craArrears.corporate ?? 0;
    }

    return imported;
  },
};
