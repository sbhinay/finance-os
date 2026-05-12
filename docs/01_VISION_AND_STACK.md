# FinanceOS Technical Documentation

## 1. Vision & Purpose

FinanceOS is a personal financial operating system built for **Canadian contractors, full-time employees, and incorporated business owners**. It tracks every transaction in and out of every account, projects short- and mid-term financial position, and structures data to support personal (T1) and corporate (T2) tax guidance.

### Core Goals
- Track cash, bank, credit card, and asset-linked financial activity.
- Maintain a single ledger of transactions for replay-based balance accuracy.
- Support Canadian CRA obligations including HST, corporate tax, and payroll remittances.
- Preserve audit trails for reconciliation, corrections, and historical review.
- Support both personal and incorporated business financial workflows.

### Target Users
- Independent contractors with mixed personal/business finances.
- Incorporated business owners managing corporate and personal cashflow.
- Full-time employees who want tax-aware financial tracking.

### Design Principle
One tool that grows with the user: from simple personal tracking to business-ready record keeping and tax-aware financial guidance.

### Current Product Direction
- Keep the ledger as the single source of posted money truth.
- Move recurring setup toward stronger parent records instead of one generic catch-all list.
- Support two user levels:
  - regular mode for cash-first planning with minimal required inputs
  - detailed mode for richer financing, tax, and amortization analysis only when the user opts in
- Let the product answer both:
  - "What do I need ready for the next payment?"
  - "What is really expense versus transfer or liability reduction?"

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Inline styles for portability |
| State | React state + custom event bus |
| Storage (current) | Browser localStorage |
| Storage (future) | Supabase / PostgreSQL |
| Auth (future) | Supabase Auth |
| Deployment | Vercel |

### Project Configuration
- No `src/` directory; path aliases are configured via `tsconfig.json`.
- `@/*` resolves to the repository root.
- No external component UI library is used.
- No global state library; cross-module updates happen through repository writes and event notifications.
- The current live app is deployed to Vercel, while core data still remains local-first with safe manual Supabase cloud backup/restore.
