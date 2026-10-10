# v37 requirements and verification

The owner requested independent product starts for every user/product in Add user, Add product, Edit product and Edit user; immediate supplier cost entry; recurring cycle costs with dated increases/decreases; first partial costs; and simple controls. No owner data rewrite is part of release.

| Requirement | Implementation / verification |
| --- | --- |
| Per-user/product start in all add/edit paths | Explicit start field; Edit user fieldset per subscription; monthly/yearly/one-time browser cases |
| Separate joining, product start and due date | Existing joining date retained; one-time start separate from due; browser preservation checks |
| Recurring cost and individual expense | Supplier cost selector, amount/currency/source/rate, monthly/yearly supplier frequency; live API atomic account/actual expense transaction |
| First partial cost then normal cycles | Actual days, full, custom or free; live preview; exact total and free/full tests |
| Cost increases/decreases | Dated entries at supplier cycle boundaries; prior rate/currency retained; one-cycle override in Costs |
| No invented payments | Supplier costs separate from customer cash; customer receipts and price history unchanged in test |
| Persistence and failed saves | JSON profiles plus actual costs, cycle rows derived without duplicates; reload/poll/failure/retry tests |
| Phone / desktop and both themes | 390px / 1400px light / dark geometry checks and inspected screenshots |
| Existing billing behavior | Billing/refund, payment, package-start, cancellation and settings suites on disposable store |
| Git and OCI | Commit/push/deployed HEAD and health verification required before live claim |

Recurring expenses are computed from the account start, dated supplier profile and shared calendar, through the product/user end. Changing those inputs explicitly recalculates scheduled expenses; removing an account removes its derived costs. These are expenses due under a schedule, not proof of supplier cash paid. Do not manually add the same expense again. One actual expense is a normal ledger record linked by costId. JSON backups store profiles; Costs CSV includes elapsed cycle rows. The retired artifact backend requires its separate Costs workflow for linked actual expenses.

Environment recovery: WSL temporary scratch was removed during a refresh before commit; reconstructed code in the canonical checkout must pass its own checks. Prior scratch results are not used as final release evidence.

Final local results (recovered canonical source): 112 browser checks passed — 25 product/cost, 21 billing/refund, 18 payment, 18 package-start, 11 cancellation and 19 settings. No unexpected console/page errors. Deliberate 503 failures were tested and retained drafts. Product screenshots inspected at 390px and 1400px in both themes; no page overflow. Installed Node syntax and `git diff --check` passed. Synthetic evidence is retained under ignored `data/v37-qa/`; test scripts and this record are in Git. Product tests and existing regressions used separate disposable stores. Initial reuse of product cost fixtures made a regression's sign-stripping display parser unsuitable for a negative Net; isolation corrected the test setup, not product billing logic.

Release baseline: live health was healthy v36 and OCI HEAD was a36d159 before pushing. App, update timer and backup timer were active. No owner-record writes were made. Confirm health v37 and deployed HEAD matches the pushed commit before reporting live. Retired claude.ai artifact has not been republished.
