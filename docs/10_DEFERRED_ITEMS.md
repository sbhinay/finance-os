# FinanceOS Technical Documentation

## 16. Deferred Items

### 1. Transaction Types — refund and dividend
**What:** Add `refund` and `dividend` as user-selectable transaction types in `TransactionForm`  
**Why deferred:** Core architecture being stabilized first  
**Why it matters:** Refund must not inflate income (tax implication). Dividend has different T1 tax treatment than employment income  
**Suggested approach:** Add to `TransactionType` union in `types/transaction.ts`. Update `recalculateBalances` — refund reverses expense direction. Add to `TransactionForm` type dropdown. Update all totals/filters to handle new types

### 2. Single Source of Truth — Reconcile
**What:** Reconcile currently directly writes `openingBalance`, bypassing `recalculateBalances`  
**Why deferred:** Architectural refactor needed  
**Why it matters:** Creates balance drift — reconciled balance gets overwritten on next `syncBalances()` call  
**Suggested approach:** When reconcile is triggered, calculate difference between stated balance and calculated balance, create an `adjustment` type transaction for that difference, let `syncBalances()` pick it up naturally

### 3. Liabilities Domain
**What:** Personal loans, lines of credit tracked as liability accounts  
**Why deferred:** Requires new domain — accounts payable, loan tracking  
**Why it matters:** Loan receipts currently logged as income (inflates taxable income). Loan repayments need to reduce liability balance not expense totals. Net worth calculation requires Assets − Liabilities  
**Suggested approach:** New `LiabilityAccount` type (id, name, lender, principal, remaining, interestRate, startDate). Loan receipt = transfer from liability account to bank. Repayment = transfer from bank to liability account. New `finance_os_liabilities` storage key

### 4. Income Sources + RRSP/TFSA Module
**What:** Expected recurring income sources, RRSP/RRSP contribution tracking  
**Why deferred:** Needed for accurate projection but complex domain  
**Why it matters:** Projection currently shows $0 expected income. TFSA/RRSP contributions must be transfers not expenses  
**Suggested approach:** `IncomeSource` type already defined in `domain.ts`. `InvestmentAccount` type already defined. Build UI for managing these. Wire into 30-day and monthly projection expected income calculations

### 5. Date/Time Utility Engine
**What:** Single `utils/dateTime.ts` module that all code uses for date operations  
**Why deferred:** Being discussed at time of documentation  
**Why it matters:** Date handling currently scattered across files with inconsistent patterns  
**Suggested approach:** Export `nowISO()`, `toDateOnly()`, `toDateTimeLocal()`, `displayDate()`, `displayDateTime()`. All components import from here. Single place to change format if needed

### 6. Import Signature Validation
**What:** Reject any JSON import that doesn't have `meta.signature === "FINANCEOS-v1"`  
**Why deferred:** Import/export being stabilized  
**Why it matters:** Prevents importing prototype data, random JSON, or data from other tools. Ensures data quality going forward  
**Suggested approach:** Add signature to export. Check signature first in import handler. Hard reject with clear error message. Remove prototype migration path entirely

### 7. Dashboard + Projection Income
**What:** Wire income sources into Dashboard expected income and Projection calculations  
**Why deferred:** Income Sources module not built yet  
**Why it matters:** Dashboard shows $0 expected income currently. Projection can't show accurate cashflow without expected income

### 8. Excel/PDF Export
**What:** Export projection and monthly reports as Excel or PDF  
**Why deferred:** Nice to have, not core  
**Suggested approach:** Use `xlsx` npm package for Excel. Use `jsPDF` or server-side PDF generation for PDF reports

### 9. Data Health Page
**What:** Page showing data quality issues — orphaned categoryIds, missing sourceIds, duplicate transactions  
**Why deferred:** Low priority during active development  
**Suggested approach:** Scan all transactions for references to deleted accounts/categories. Show count of issues with fix suggestions

### 10. Tax Summary Page
**What:** T1 and T2 guidance page mapping transaction data to CRA line numbers  
**Why deferred:** Requires stable data model and income sources  
**Why it matters:** Core vision of the product — self-generate tax filing data  
**Suggested approach:** T1 section (employment income, RRSP deductions, medical expenses). T2 section (business income, deductible expenses by category, HST summary). Map existing categories to CRA line numbers

### 11. Year-over-Year Analysis
**What:** Compare spending, income, net worth across fiscal years  
**Why deferred:** Need sufficient historical data first

### 12. Mortgage Principal/Interest Split
**What:** Separate principal repayment (balance sheet) from interest (true expense)  
**Why deferred:** Requires amortization calculation  
**Why it matters:** Currently full mortgage payment counted as expense — overstates expenses. Interest only is the true expense. Important for rental income tax calculations

---

