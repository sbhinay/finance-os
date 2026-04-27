# FinanceOS Technical Documentation

## 18. Commercial Product Vision

### Two Deployment Tracks

**Track 1 — Personal**
- Single Supabase instance owned by the developer
- Single user or small family
- No subscription management
- Developer controls all data
- Used for dogfooding — test features before commercial release

**Track 2 — Commercial Product**
- Shared Supabase instance with RLS enforcing tenant isolation
- Full registration and onboarding flow
- Subscription tiers
- Accountant read-only access sharing
- Data export on account cancellation
- PIPEDA compliance

### Target Users (Commercial)
- Independent contractors in Canada billing T4A income
- Incorporated business owners (corp + personal finance)
- Full-time employees wanting to track expenses for tax purposes

### Subscription Tiers (proposed)
| Tier | Features | Target |
|---|---|---|
| Free | Basic transaction tracking, 1 account, 1 card | Trial users |
| Personal ($8/mo) | Unlimited accounts/cards, projections, fixed payments | Employees |
| Pro ($18/mo) | + Business domain, HST tracking, invoice log, CRA obligations | Contractors |
| Business ($28/mo) | + Corp income, T2 guidance, accountant access, Excel export | Incorporated |

### PIPEDA Compliance Requirements
Since FinanceOS handles personal financial data of Canadian users:
- Privacy policy explaining what data is collected and why
- Data retention policy — how long data is kept after account cancellation
- User data export on request
- User data deletion on request
- Breach notification process
- Data stored in Canadian or acceptable jurisdiction data centres

### Accountant Access Feature
- User can generate a read-only share link for their accountant
- Accountant sees transaction history, categories, CRA obligations
- Accountant cannot add/edit/delete anything
- Access expires after a set date or on user revocation
- Implemented via Supabase RLS role system

### Multi-Tenant Architecture
```
Every Supabase query:
  .eq("user_id", supabase.auth.user().id)

RLS policy ensures:
  No user can ever read another user's data
  Even with a bug in app code, database blocks cross-tenant access
```

---

