// ─── Rate History ────────────────────────────────────────────────────────────
export interface RateEntry {
  id: string;
  value: number;
  effectiveFrom: string; // YYYY-MM-DD
  note?: string;
}

export interface PayrollDrawEntry {
  id: string;
  value: number;          // personal draw per month
  craRemittance: number;  // payroll remittance per month
  effectiveFrom: string;
  note?: string;
}

export interface RateSettings {
  hstRate: RateEntry[];
  quickMethodRate: RateEntry[];
  payrollDraw: PayrollDrawEntry[];
  corpTaxInstalment: RateEntry[];
}

// ─── Contracts ───────────────────────────────────────────────────────────────
export interface ContractRateHistory {
  id: string;
  rate: number;
  effectiveFrom: string;
  note?: string;
}

export interface HoursAllocation {
  id: string;
  fiscalYear: number;
  totalHours: number;
}

export interface Contract {
  id: string;
  name: string;
  client: string;
  status: "Active" | "Ended" | "Paused";
  startDate?: string;
  endDate?: string;
  rateHistory: ContractRateHistory[];
  hoursAllocations: HoursAllocation[];
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export interface Invoice {
  id: string;
  invoiceNumber: string;
  contractId: string;
  workMonth: number;
  workYear: number;
  workFiscalYear: number;   // computed: workMonth>=4 ? workYear+1 : workYear
  hours: number;
  hourlyRate: number;
  invoiceDate: string;
  paymentDate?: string;
  clientName: string;
  depositAccount: string;
  note?: string;
  fiscalYear: number;
  // Calculated fields (stored for performance)
  subtotal: number;
  hst: number;
  total: number;
  hstToRemit: number;
  hstKept: number;
  hstRateVal: number;
  qmRateVal: number;
  hstCalendarYear: number;
  quarter: string;          // e.g. "Q1-2026"
  personalDraw: number | null;
  corpTaxReserve: number | null;
}

// ─── CRA Obligations ─────────────────────────────────────────────────────────
export interface HSTRemittance {
  id: string;
  quarter: string;          // e.g. "Q1-2026"
  period: string;           // e.g. "Jan–Mar 2026"
  dueDate: string;
  plannedDate?: string;
  amount: number;
  paid: boolean;
  paidDate?: string | null;
  txnId?: string | null;    // linked transaction id for reversal
  note?: string;
}

export interface CorporateInstalment {
  id: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  amount: number;
  dueDate: string;
  plannedDate?: string;
  paid: boolean;
  paidDate?: string | null;
  txnId?: string | null;
  note?: string;
}

export interface PayrollRemittance {
  id: string;
  month: string;            // YYYY-MM
  amount: number;
  dueDate: string;
  plannedDate?: string;
  paid: boolean;
  paidDate?: string | null;
  txnId?: string | null;
  note?: string;
}

// ─── Arrears ─────────────────────────────────────────────────────────────────
export type ArrearsType = "HST" | "Corporate" | "Both";

export interface ArrearsPayment {
  id: string;
  amount: number;
  date: string;
  type: ArrearsType;
  note?: string;
  account?: string;
  txnId?: string | null;    // linked transaction id for reversal
}

// ─── Business Object (top-level) ─────────────────────────────────────────────
export interface Business {
  clientName: string;
  contracts: Contract[];
  invoices: Invoice[];
  hstRemittances: HSTRemittance[];
  corporateInstalments: CorporateInstalment[];
  payrollRemittances: PayrollRemittance[];
  arrearsHST: number;
  arrearsCorp: number;
  arrearsPayments: ArrearsPayment[];
  rateSettings: RateSettings;
  // Legacy scalar fields (kept for migration compatibility)
  hourlyRate?: number;
  annualHours?: number;
  fiscalYear?: number;
  payrollDraw?: number;
  payrollRemittance?: number;
}
