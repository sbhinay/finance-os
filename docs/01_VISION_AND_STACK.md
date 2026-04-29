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

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Inline styles for portability |
| State | React state + custom event bus |
| Storage (current) | Browser localStorage |
| Storage (future) | Supabase / PostgreSQL |
| Auth (future) | Supabase Auth |
| Deployment (future) | Vercel |

### Project Configuration
- No `src/` directory; path aliases are configured via `tsconfig.json`.
- `@/*` resolves to the repository root.
- No external component UI library is used.
- No global state library; cross-module updates happen through repository writes and event notifications.
