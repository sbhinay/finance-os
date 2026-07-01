# Tax Working Papers And Report Exports

## Purpose

FinanceOS produces review-oriented working papers. It does not file a return and does not convert bookkeeping categories into tax treatment automatically.

Each mapping keeps four distinct values:

- bookkeeping amount from the ledger
- proposed form or working-paper target
- system confidence
- user treatment: proposed, confirmed, excluded, or accountant review

A confirmed treatment may carry a confirmed amount and supporting note. These decisions live in `Business.craReviewProfile.taxTreatments` and remain part of JSON and cloud snapshots.

## Cautious CRA Mapping

- Sole-proprietor suggestions may reference current Form T2125 expense lines.
- Corporate rows are described as T2 Schedule 125 / GIFI working papers and require accountant mapping.
- Mixed filing profiles explicitly require separate sole-proprietor and corporate review.
- GST/HST remittances are not treated as normal expense deductions.
- ITC and mixed-use treatment remain dependent on eligibility, commercial use, and supporting records.
- CCA, capital-vs-current treatment, vehicle limits, and complex home-office claims remain review items.

Primary CRA references:

- Form T2125 expense guidance: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/expenses-section-form-t2125.html
- Motor vehicle expense guidance: https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/business-income-tax-reporting/business-expenses/motor-vehicle-expenses.html
- GST/HST input tax credits: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit/calculate-overview.html
- Corporate GIFI overview: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/corporation-income-tax-return/completing-your-corporation-income-tax-t2-return/general-index-financial-information-gifi.html

## Export Contents

Both Excel and PDF exports include:

- tax working papers and treatment status
- missing-information warnings
- bookkeeping category totals
- business and HST summary
- lender balances, principal, and interest
- mortgage balances and payment allocation
- Property value, mortgage owing, and equity
- vehicle payment and financed-debt summary
- tax-relevant ledger rows
- review notes explaining limitations

Excel uses a real multi-sheet `.xlsx` workbook. PDF uses one landscape report section per page group. Binary generation is regression tested in memory.
