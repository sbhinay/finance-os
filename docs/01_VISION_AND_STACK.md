# FinanceOS Technical Documentation

## 1. Vision & Purpose

FinanceOS is a personal financial operating system built for **Canadian contractors, full-time employees, and incorporated business owners**. It tracks every transaction in and out of every account, projects short and mid-term financial position, and structures data to support personal (T1) and corporate (T2) tax filing guidance.

### Core Goals
- Log every penny in and out across all accounts, credit cards, and assets
- Project 30-day daily and monthly financial position
- Track CRA obligations (HST, corporate tax, payroll remittances)
- Structure data to pre-fill or guide Canadian tax return line items
- Support both personal and incorporated business financial tracking

### Target Users
- Independent contractors (T4A income, HST registrants)
- Incorporated business owners (T2 filers, payroll, dividends)
- Full-time employees with personal finance tracking needs

### Design Principle
One tool that grows with the user — starts as a personal tracker, evolves into a tax-ready financial record system.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Inline styles (no CSS framework — intentional for portability) |
| Storage (current) | Browser localStorage |
| Storage (future) | Supabase (PostgreSQL) |
| Auth (future) | Supabase Auth |
| Deployment (future) | Vercel |

### Project Configuration
- **Root:** No `src/` folder — files at project root level
- **Path alias:** `"@/*": ["./*"]` in `tsconfig.json`
- **No** external UI component libraries
- **No** state management libraries (React state + event bus only)

---

