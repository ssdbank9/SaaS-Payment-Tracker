# Wasooli redesign plan (drafted 2026-11-16, at v77)

Status: phase 1 is built (v78). Rollout (decided 2026-11-16): the redesign is built in `new.html`, served at `/new`; the usual
address keeps the v77 page until the owner says to swap, then the new page takes `/` and the old one moves to `/old`. A fix asked
for meanwhile goes into both files.

The owner uses every feature (WhatsApp, Email, Telegram, customer link pages, analytics,
import/export, screenshot import, 3-step reminder rounds), so nothing is removed: the redesign changes where things live and how
much shows at once. Data, money rules, URLs and the single-file build stay exactly as they are.

## 1. What is wrong today (measured on a phone, sample data, 6 customers)

| Screen | Today |
|---|---|
| Home | 20 controls above the first customer; the first customer starts almost a full screen down |
| Customer list | 2 buttons on every row (30 buttons for 6 customers) |
| One customer opened (3 plans) | 51 buttons, more than 3 screens long, opened inside the list |
| Changing what a bill costs | 7 different actions: Change price, Courtesy discount, Set bill / proration, edit days / rate, change charge / package, Discount, Paid up to |
| Add customer | 15 fields |
| Edit plan | 14 fields |
| Settings | 69 fields and 49 buttons, about 10 screens long |
| Queue | 52 buttons, drawn above the customer list on the same page |

Causes: (1) everything is on one page (summary, filters, list, costs, charts); (2) every action has the same weight, so the rare
ones crowd the daily ones; (3) a customer opens inside the list, so the list loses its place; (4) several routes lead to the same
thing under different names; (5) Settings is one flat page.

## 2. Principles

1. One job per screen.
2. One main action per screen; everything else behind "More".
3. Show the result, hide the machinery: "Renews on the 5th, paid to Dec 4" instead of anchors, proration basis and cycle rules.
4. Defaults first: a form asks only what differs for this customer; the rest sits under "More options" already filled in.
5. The same word everywhere: Customer, Product, Bill, Wholesaler, Cost.
6. Nothing removed, no data touched, every total identical before and after.

## 3. New structure: five tabs (bottom bar on a phone, side bar on a computer)

1. **Today**: who owes now (name, period, amount, Record payment), what falls due in the next 7 days, how many messages are waiting,
   and three numbers for the month: Collected, Costs, Net.
2. **Customers**: search box; four chips (All, Owes, Due soon, Paid); one Filter button (product, wholesaler, status, sort); one-line
   rows (name, product, status, amount); wholesaler groups that fold, each with its total and its own Record payment; one Add button.
3. **Reminders** (today's Queue): the three stages, wholesaler statements, overdue. One main button per row (WhatsApp); Email, Telegram
   and Copy in a small menu.
4. **Money**: month picker; Collected, Costs, Net; payments list; costs list (Add cost, screenshot import); charts and the By product /
   By wholesaler tables.
5. **More**: Settings, Import / export, Sign out.

### Customer page (its own screen, with Back)

- Top: name, status, amount owed, one big Record payment, then WhatsApp / Email / Telegram.
- One card per plan: product, price, "renews on", "paid to", your cost. Latest 3 bills, with "All bills".
- "More" on a plan: Change price, Adjust a bill, Refund, Plan dates, Change product, End plan.
- "More" on the customer: Edit details, Add a plan, Cancel.
- Target: about 8 visible buttons instead of 51.

### Merged actions (same abilities, fewer doors)

| New | Replaces |
|---|---|
| Change price (from a date, including a standing discount) | Change price, Discount, Courtesy discount for every bill |
| Adjust a bill (one bill: amount, days, due date, one-off discount) | Set bill / proration, edit days / rate, change charge / package, Courtesy discount for one bill |
| Plan dates (start, renews on, end) | Package start / payments, Change start / payments, Renews on, End date |
| Add (one customer or several) | Add user, Quick add |

### Forms

- Add customer: Name, WhatsApp, Product, Price, Start date, Sold through. Everything else under "More options" with its default.
- Edit plan: three short groups (Price, Dates, Advanced) instead of 14 fields in a row.

### Settings: a menu of short pages

Business (name, rates, tax), Products (a list; one product per page), Wholesalers (a list; one per page), Messages, Reminders
(lead days, email, Telegram), Screenshot reading, Security, Your data. No page longer than two phone screens.

### Look

Calmer: white cards on a soft background, one green accent, red only for money owed, fewer borders, larger text, 44px touch
targets, consistent spacing, light and dark.

## 4. How we do it

- **Step 1, design (no code):** mock-ups in Claude Design, phone and computer, of Today, Customers, Customer page, Add customer,
  Reminders, Money and Settings, using made-up names. The owner comments; one or two rounds.
- **Step 2, build in phases**, each one a normal version the owner approves before it goes live:
  1. Tabs and the Today screen
  2. Customers list
  3. Customer page, "More" menus, the merged Adjust a bill
  4. Add and Edit forms
  5. Reminders screen
  6. Money screen
  7. Settings pages
  8. Wording, computer layout, polish
- Each phase changes presentation only. The money functions (`analyze`, `analyzeMonthly`, `costRecords`, `breakdownRows`) are not
  touched, so totals cannot drift.
- **The main cost:** the 56 test suites drive today's screens by their element ids. Each phase updates the suites it affects; ids and
  form field names are kept wherever possible. Affected suites per push, the full suite at the end of the day.
- Constraints kept: one `index.html`, no framework or build step, same data, same URLs, 390px first, plain words, no emojis.
- Undo: revert that phase's commit.

## 5. Targets (how we know it worked)

| Measure (phone) | Now | Target |
|---|---|---|
| Controls above the first customer | 20 | 6 or fewer |
| Buttons on a list row | 2 | 0 or 1 |
| Visible buttons on a customer with 3 plans | 51 | about 8 |
| Fields to add a customer | 15 | 6 |
| Longest Settings page | about 10 screens | 2 screens |
| Taps to reach any customer | scroll | search or 2 taps |
| Totals vs today | | identical |

## 6. Feature map (audit of v77, 2026-11-16)

Taken from the code, not from memory: 65 action types, 7 dialogs, 11 inline forms, 16 Settings groups plus 5 Settings blocks
(AI, mail, security, data, queue messages), 19 top-level buttons. Every one has a home below. A phase is not finished until each
row it touches is reachable in the new screens and its test suite passes. "(not drawn)" = had a home but no mock-up in round 1.

Mock-ups: https://claude.ai/artifact/9YDFYR6jbMdN1VLX6MQDLs (boards 1-10 round 1; boards 11-20 round 2, 2026-11-16, which draw the
"(not drawn)" rows: Filter and advanced search, customer More menu, link answer / one-time item / ended plan, Record payment,
reminder steps / tools / answers, Add several, Money reports and costs, two dark screens; the plan More menu gained Advanced and
Remove this plan). Still not drawn, to be designed in their build phase: the form behind each plan-menu action (Change price,
Adjust a bill, Refund, Plan dates, Change product or cost, Advanced, Cancel plans), the Payments list, the charts page, the Sent
log, and each Settings page.

### Customers tab

| Today | New home |
|---|---|
| Search box | Customers: search |
| Owe / Due soon / Paid strip, "Hasn't paid" | Customers: chips |
| Package, Sold by, Status (active, cancelled, upcoming, all), Sort, By supplier grouping | Customers: Filter sheet (not drawn) |
| Search panel: joined / started / ended between, paid between, owes at least, price between, currency, CSV of results | Filter sheet: "Advanced search" (not drawn) |
| Owe money table (who owes, which period) | Today: Owes now |
| Wholesaler group heading: count, owed, number, Record payment | Customers: group heading |
| Row buttons Record payment, Cancel plan | Customer page (Record on Today rows too) |

### Customer page

| Today | New home |
|---|---|
| Remind on WhatsApp, Email, Telegram, add Telegram | Customer page: three contact buttons |
| Customer link: copy link, their answer (continue, upgrade, stop), keep mine / use theirs, confirm or dismiss a stop request | Customer page: "Customer link" row; Reminders: "Answers" (not drawn) |
| Edit user: name, email, phone, Telegram, joined, notes, sold through | Customer More: Edit details |
| Cancel subscription, Cancel plan (choose plans, last day, reason), Edit cancellation, Resume | Customer More: Cancel / Resume; plan More: End this plan (Resume not drawn) |
| Delete customer | Customer More: Delete (not drawn) |
| Add plan or one-time item, first-sale question for a new product | Customer page: Add a plan (one-time item card not drawn) |
| Record payment dialog: plan, month, amount, received on, currency, rate, note, preview | Record payment (dialog not drawn) |
| Paid up to... | Inside Record payment: "Pay several months" |
| Refund dialog: cash only or linked to a bill, also cancel, sale cancelled | Plan More: Refund |
| Change price, price history (edit, remove) | Plan More: Change price |
| Discount (% or amount), Courtesy discount (one bill, several, every bill; remove) | Change price (standing or a range) and Adjust a bill (one bill) |
| Change tier, tier history, remove a switch | Plan More: Change product or cost |
| Edit plan: product, cycle, label, currency change with new price and date, start, end, remaining due by, prorate, waive first, renews on (own start, product date, chosen date), proration basis, supplier cost (set, leave, remove) | Split: Change price (currency), Plan dates (start, end, renews on, how often they pay, due by), Change product or cost (product, supplier cost), Advanced (label, proration basis, prorate / waive first) |
| Package start / payments dialog: start, prorate, pay every N months, from next bill or from start | Plan More: Plan dates |
| Set bill / proration dialog: amount, days, keep + due date, settle with a new or corrected receipt | Plan More: Adjust a bill |
| Period boxes: Record payment, change charge / package (one-month product), edit days / rate, reset | Bill rows: tap a bill to Record or Adjust |
| Payments and refunds list: Edit, Remove | All bills and payments |
| Remove plan | Plan More: Remove plan (not drawn; separate from End this plan) |
| Your cost line | Plan card |

### Add

| Today | New home |
|---|---|
| Add user: customer, plan, payment groups, Save and add another | Add customer + More options |
| One-time sale, yearly paid monthly / every N months, join date, own start date, prorate, waive, supplier cost | More options (one-time under Product) |
| Quick add: paste several lines, review, save | Add customer: "Add several" (not drawn) |

### Reminders tab

| Today | New home |
|---|---|
| Queue per cycle date, steps 1-3, date picker | Reminders: date sections with a step switcher (switcher not drawn) |
| Row: WhatsApp, Email, Telegram, Copy, Sent tick, edit amount, Skip / unskip | Row: WhatsApp + More menu |
| Reminder run, Final notice (copy all, CSV) | Reminders: "Run" and "Final notice" views (not drawn) |
| Wholesaler statements: WhatsApp, Copy, Sent, Record payment | Reminders: Wholesalers |
| Overdue section | Reminders: Overdue |
| Sent log | Reminders: Sent |

### Money tab

| Today | New home |
|---|---|
| Tiles: Collected, Refunds, Costs, Net, Outstanding, Not paid | Money: Overview (Refunds and Outstanding not drawn) |
| Range (month, custom, all time), product filter, PKR / USD switch | Money: header controls (only the month picker is drawn) |
| Next cycles, Active accounts by product | Money: Overview |
| By product, By wholesaler tables; charts; Analytics panel | Money: Reports |
| Collected / Costs by month with entries | Money: Overview, tap a total |
| Payments view: search, product, kind, range | Money: Payments |
| Costs list, Add / edit / delete cost, loss (seats, wholesaler), receipt picture, calculated cycle costs (Edit, Waive cycle) | Money: Costs |
| Import from screenshot (camera, file, pasted text, review, duplicate warning) | Money: Costs: Import |

### More tab

| Today | New home |
|---|---|
| App name, tagline, exchange rates (USD, EUR, GBP), PKR cost tax, default proration basis, paid-up display | Settings: Business |
| Products: add, copy, remove, price, cycle date, own-start tick, seat cost, supplier year, "apply seat cost to all plans" | Settings: Products, one page each |
| Wholesalers: name, number, notes, pays at start / end, pays on day, remind days, statement closing line | Settings: Wholesalers, one page each |
| Reminder message, final notice message, payment instructions, the three step messages | Settings: Messages |
| Reminder lead, reply-by lead, WhatsApp app, link address, mail (daily emails) | Settings: Reminders |
| AI reading: provider, keys, model, test | Settings: Screenshot reading |
| Hidden sign-in address, sign out everywhere | Settings: Security |
| Backup, import, export customers / costs CSV, reset | Settings: Your data |
| Sign out, saved indicator, version | More |

### Unchanged, outside the redesign

Customer-facing link page (`/c/<token>`), sign-in page, daily email job, saving and conflict handling, the stale-version banner,
light and dark themes (dark mock-ups not drawn yet), the claude.ai artifact and browser-local modes.
