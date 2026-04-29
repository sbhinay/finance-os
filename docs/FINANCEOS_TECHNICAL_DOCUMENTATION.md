# FinanceOS — Technical Documentation
**Version:** 3.0
**Last Updated:** April 2026
**Status:** Active Development

---

## Table of Contents
1. [Vision & Purpose](01_VISION_AND_STACK.md)
2. [Technology Stack](01_VISION_AND_STACK.md)
3. [Project Structure](02_PROJECT_STRUCTURE.md)
4. [Architecture Overview](03_ARCHITECTURE.md)
5. [Data Model](04_DATA_MODEL.md)
6. [Storage Keys & Transaction System](05_STORAGE_AND_TRANSACTIONS.md)
7. [Balance Architecture & Events](06_BALANCE_AND_EVENTS.md)
8. [Repositories & Modules](07_REPOSITORIES_AND_MODULES.md)
9. [Business Rules](08_BUSINESS_RULES.md)
10. [Import / Export & Dates](09_IMPORT_EXPORT_AND_DATES.md)
11. [Deferred Items](10_DEFERRED_ITEMS.md)
12. [Cloud Migration](11_CLOUD_MIGRATION.md)
13. [Commercial Vision](12_COMMERCIAL_VISION.md)
14. [Appendices](13_APPENDICES.md)

---

## 1. Vision & Purpose
FinanceOS is a personal financial operating system for Canadian contractors, salaried employees, and incorporated business owners. Its core mission is to provide a single ledger-based financial record, reconcile balances reliably, and support tax-aware decision making.

## 2. Key Current Features
- Master transaction ledger with replay-based balance computation.
- Full support for bank accounts, credit cards, assets, and recurring payments.
- Current-app JSON export/import with asset restoration.
- Reconciliation metadata on accounts and credit cards.
- Business and CRA support for HST, corporate tax, and payroll remittance tracking.

## 3. Current Implementation Notes
- `credit_card_payment` is a first-class transaction type.
- Accounts and credit cards support `balanceBase`, `reconciledBalance`, and `reconciledDate`.
- `recalculateBalances.ts` bases replay on reconciliation metadata and avoids compound drift.
- Reconciliation audit rows are stored as `type: "adjustment"` with `subType: "reconciliation"`.
- Reconciliation adjustments are excluded from normal reporting.

## 4. Documentation Structure
The docs are organized into the following cross-linked files:
- `01_VISION_AND_STACK.md`
- `02_PROJECT_STRUCTURE.md`
- `03_ARCHITECTURE.md`
- `04_DATA_MODEL.md`
- `05_STORAGE_AND_TRANSACTIONS.md`
- `06_BALANCE_AND_EVENTS.md`
- `07_REPOSITORIES_AND_MODULES.md`
- `08_BUSINESS_RULES.md`
- `09_IMPORT_EXPORT_AND_DATES.md`
- `10_DEFERRED_ITEMS.md`
- `11_CLOUD_MIGRATION.md`
- `12_COMMERCIAL_VISION.md`
- `13_APPENDICES.md`

## 5. Notes for Review
- The documentation prefers current code behavior over legacy wording.
- Where implementation is not fully complete, deferred items are explicitly listed.
- This set is a v3 refresh of the repo docs.
