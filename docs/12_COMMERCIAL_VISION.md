# FinanceOS Technical Documentation

## 13. Commercial Product Vision

### Product Tracks
**Personal**
- Single user
- Basic transaction tracking
- Fixed payments
- Bank accounts, credit cards, asset tracking
- Future AI-assisted statement import after privacy and secure API handling are implemented

**Commercial**
- Multi-user SaaS on Supabase
- Subscription tiers
- Business module and CRA obligations
- Accountant read-only access
- Data export and deletion workflows
- Future scanner-assisted transaction backfill for owners who do not want bank-link integrations

### Proposed Tiers
| Tier | Features |
|---|---|
| Free | Basic tracking, one account/card |
| Personal | Unlimited accounts/cards, projections, planned scanner-assisted import |
| Pro | Business domain, HST tracking, CRA obligations, planned scanner-assisted backfill |
| Business | Corp income, accountant access, exports |

### Compliance
- PIPEDA-aligned policies
- Data export on request
- Data deletion on request
- Breach notification procedures

### Accountant Access
- Read-only share link
- View transaction history, categories, and CRA obligations
- Access controlled by Supabase RLS
