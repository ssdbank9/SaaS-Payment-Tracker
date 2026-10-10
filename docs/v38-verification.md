# v38 cost payment currency, tax and historical rates

| Owner requirement | Implementation and verification |
| --- | --- |
| USD supplier cost, paid in USD or PKR | Payment-currency choice in all product cost forms and ordinary Costs form; USD is the default quote currency for new costs |
| Global editable PKR tax | Settings field with scoped Save/status; initial 5.2% explicitly supplied by owner; valid range 0–100 inclusive |
| USD→PKR conversion plus tax | Global rate for the cost's date; tax on rounded PKR base; both base and tax included in total and analytics |
| USD payment without PKR tax | USD quote retained as USD expense; PKR payment tax is zero |
| Upcoming-only updates | Dated global cost policies effective from next calendar day; original global base retained; current and earlier cycles unchanged |
| Actual purchase history | USD quote/payment currency/rate/tax snapshot stored in `purchase`; editing description/amount keeps historical rate/tax unless payment method is explicitly changed |
| Recurring cost payment changes | Payment currency stored in dated supplier entries; changing from a cycle boundary keeps earlier payment choice |
| Preserve owner records | No deployment migration or owner-record edits; older costs without payment metadata retain their prior meaning |
| Safe persistence | Existing atomic account+expense save and settings scoped save; failed saves retain drafts and leave policy unchanged |
| Simple mobile/desktop workflow | Quote, pay currency, conversion/tax/total preview; global rate field hidden for automatic PKR payment conversion; 390px/1400px both themes |

The global exchange rate still supplies customer receipts without their own rate using the existing behavior. Cost conversions use a separate dated policy, so cost changes do not require changing historical receipt logic. Missing historical rates stay unavailable rather than picking up a newly supplied rate. A recurring PKR conversion without a usable rate is shown as unconverted USD and must be corrected; forms block saving a new USD→PKR cost without the relevant global rate.

PKR payment tax applies when the supplier quote is USD and payment is PKR. A directly quoted PKR expense retains the ordinary manual tax field. Other manually entered tax is additional to automatic payment tax. No statutory rate is inferred: 5.2% is the owner's supplied value.

Final local verification: 134 browser checks passed — 22 cost-payment/tax, 25 product costs/starts, 21 billing/refund, 18 payments, 18 package starts, 11 cancellation and 19 settings (now 20 scoped controls). No unexpected console/page errors; deliberately injected 503 failures leave records and drafts intact. Missing relevant rates block new PKR conversion without an expense write. Source syntax and `git diff --check` passed. Cost/payment and settings screenshots inspected at 390px and 1400px in both themes. Evidence remains under ignored `data/v38-qa/`; source test scripts and this record are in Git. Product, tax and other regressions used independent disposable stores.

Live baseline before push: health healthy v37, docs_version 653. No owner financial records were written. After push, verify health v38, deployed HEAD equals GitHub main, and app/update/backup services before reporting live. Retired claude.ai artifact was not republished.
