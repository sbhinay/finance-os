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
- Gradually simplify the app into a smaller set of stronger destinations instead of many sibling utility tabs.
- Treat Health Report as a warning-first system surface for integrity, stale schedules, and recurring ownership issues.
- Let the product answer both:
  - "What do I need ready for the next payment?"
  - "What is really expense versus transfer or liability reduction?"

### Current Navigation Direction
The active navigation is converging toward these hubs:
- `Daily Log`
- `Dashboard`
- `Accounts & Cards`
- `Assets & Liabilities`
- `Recurring Payments`
- `Business`
- `Data & Health`

Detail views such as `Transaction History`, `Projection`, `Vehicles`, `House Loans`, `Property Tax`, `Subscriptions`, and `Planned Payments` still exist, but they are now treated as subviews under stronger parent destinations rather than as permanent primary tabs.

### Current UX Direction
- Keep the product mobile-first even while preserving a strong desktop workspace.
- Use a shared internal theme/token layer instead of introducing a new UI framework.
- Prefer responsive cards, pill tabs, and lighter action hierarchy over old admin-style dense panels.
- Use an off-canvas navigation drawer on narrow screens so content keeps the available width.
- Improve trust in reporting by making summary areas easier to drill into instead of only showing static totals.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Inline styles + internal theme tokens (`lib/theme.ts`) |
| State | React state + custom event bus |
| Working cache | Browser localStorage after authenticated bootstrap |
| Cloud persistence | Supabase guarded snapshots with autosave and restore history |
| Auth | Supabase Auth with Google and email/password |
| Deployment | Vercel |

### Project Configuration
- No `src/` directory; path aliases are configured via `tsconfig.json`.
- `@/*` resolves to the repository root.
- No external component UI library is used.
- No Tailwind, Chakra, MUI, or CSS-in-JS framework has been added; the current overhaul stays inside the existing stack.
- No global state library; cross-module updates happen through repository writes and event notifications.
- FinanceOS is cloud-first at session boundaries: authentication and cloud bootstrap
  complete before financial UI mounts, while localStorage remains the responsive
  working cache between guarded automatic saves.
