# SMX Production Tracker — AI Agent Rules

## Project Overview

This app is the full manufacturing lifecycle tracker for SMX Drives. It tracks every controller unit from order creation through production stages (Powerstage, Brainboard, Assembly, QC, Software, Final Assembly), dispatch packing, and shipping. Units are identified by barcodes at each stage. The system also manages inventory (BOM, GRN, stock movements), sales (proformas, invoices, payments), purchase orders, rework, and returns.

Production URL: **production-peach-tau.vercel.app**
Main project directory (deploy from here only): **/Users/mr.yash/Desktop/production**

---

## Tech Stack

- **Framework:** Next.js 14 App Router (TypeScript)
- **ORM:** Prisma ORM
- **Database:** Supabase PostgreSQL
- **Deployment:** Vercel
- **Auth:** Custom session-based auth with optional face verification (`lib/auth.ts`, `lib/face-verify-server.ts`)
- **Storage:** Supabase Blob (`lib/blobUrl.ts`)
- **Barcode rendering:** `components/Barcode128.tsx`, `components/BarcodeScanner.tsx`

---

## Architecture

### Top-Level `app/` Directories

| Directory | Purpose |
|---|---|
| `app/(main)/` | All authenticated pages — layout wraps them with header/nav |
| `app/api/` | All API route handlers |
| `app/login/` | Public login page |
| `app/print/` | Print-only pages (barcodes, packing slips) |
| `app/serial/` | Serial lookup / public-facing serial number pages |
| `app/vendor/` | Vendor portal pages |

### `app/(main)/` UI Modules

| Module | Path | Description |
|---|---|---|
| Dashboard | `dashboard/` | Overview stats and quick links |
| Orders | `orders/` | Manufacturing order list and detail |
| Production Floor | `production/floor/` | Live floor view by barcode scan |
| Units | `units/` | Individual controller unit lookup |
| Shipping | `shipping/` | Dispatch order management, packing, DO list |
| Sales | `sales/` | Proforma invoices and client management |
| Inventory | `inventory/` | Stock, categories, low-stock alerts |
| Purchase | `purchase/` | Purchase requests and purchase orders |
| Rework | `rework/` | Rework tracking and repair logs |
| Reports | `reports/` | Performance and production reports |
| Admin | `admin/` | User management, checklists, settings |
| Accounts | `accounts/` | Payments, invoices, accounts view |
| Approvals | `approvals/` | Manager approval queue |
| My Tasks | `my-tasks/` | Employee personal task queue |
| My Performance | `my-performance/` | Employee performance metrics |
| My Dispatch | `my-dispatch/` | Packing team dispatch view |

### `app/api/` API Modules

| Module | Path | Description |
|---|---|---|
| Work | `work/` | Stage work submission — start, submit, upload |
| Units | `units/` | Unit lookup by barcode/serial, unit detail |
| Orders | `orders/` | Order CRUD, status summary |
| Dispatch Orders | `dispatch-orders/` | DO creation, lifecycle, packing, approval |
| Scan | `scan/` | Barcode scan entry point — routes to correct stage |
| Approvals | `approvals/` | Manager approval of stage work |
| Rework | `rework/` | Rework record creation and replacement flow |
| Inventory | `inventory/` | Stock CRUD, GRN, stock movements, issue, adjust |
| Purchase | `purchase/` | Purchase requests, POs, vendor bids, GRN |
| Proformas | `proformas/` | Proforma invoice CRUD and approval |
| Invoices | `invoices/` | Invoice CRUD and payment tracking |
| Shipping | `shipping/` | Dispatch + shipping records |
| Auth | `auth/` | Login, logout, session |
| Admin | `admin/` | User management, checklist config, migrations |
| Products | `products/` | Product/model configuration |
| Clients | `clients/` | Client records |
| Returns | `returns/` | Return requests and repair logs |
| Users | `users/` | User profile and settings |
| Check PCB | `check-pcb/` | PCB board zone inspection |
| Timeline | `timeline/` | Unit timeline log entries |
| Print | `print/` | Print data endpoints (barcodes, slips) |
| Sheet | `sheet/` | Google Sheets integration |
| Dashboard | `dashboard/` | Aggregated stats for dashboard |
| Box Sizes | `box-sizes/` | Packing box size config |
| Vendor Portal | `vendor-portal/` | Vendor-facing bid/quote routes |
| Settings | `settings/` | App-level settings |
| Me | `me/` | Current user info |

---

## Critical Data Flow Rules

### `readyForDispatch` Field
- `false` = unit is **available** for dispatch (default after FA completion)
- `true` = unit has **already been dispatched** (consumed)
- This field is set to `true` ONLY by dispatch scan routes (inside `app/api/dispatch-orders/`)
- **NEVER set `readyForDispatch = true` during FA completion** — doing so removes the unit from dispatch queries permanently

### Unit Status Flow
```
PENDING → IN_PROGRESS → COMPLETED → APPROVED
```
- `COMPLETED` = work submitted by employee
- `APPROVED` = approved by manager (or auto-approved at FA stage)
- `APPROVED` is the **final state** at Final Assembly — there is no separate manager sign-off step
- Both `COMPLETED` and `APPROVED` count as "done" in all counters and badge logic

### Barcode Formats
| Stage | Format |
|---|---|
| Powerstage | `{code}PS{YY}{seq}` |
| Brainboard | `{code}BB{YY}{seq}` |
| Assembly | `{code}AY{YY}{seq}` |
| QC | `{code}QC{YY}{seq}` |
| Final Assembly | `{code}{YY}{MONTH}{seq}` |

When adding a new barcode type, ALL of the following must be updated together:
1. `lib/barcode.ts` — generation logic
2. `app/api/work/route.ts` — work submission
3. `app/api/approvals/route.ts` — approval logic
4. `app/(main)/orders/[id]/page.tsx` — order detail data fetching and stage grouping
5. `app/(main)/orders/[id]/OrderDetail.tsx` — order detail UI rendering

---

## Module Boundaries — DO NOT Modify Without Explicit Instruction

### Manufacturing (Powerstage / Brainboard)
**Owns:** PS and BB barcode generation, stage work for powerstage and brainboard, component check logic
**Off-limits:** Do not touch board zone logic (`lib/boardZones.ts`) unless explicitly asked

### Assembly
**Owns:** AY barcode generation, assembly stage work submission and approval
**Off-limits:** Do not change the scan routing order without checking all downstream stages

### QC and Software
**Owns:** QC barcode generation, QC records, software flash logging
**Off-limits:** Do not merge QC and software stages — they are tracked separately

### Final Assembly
**Owns:** FA barcode generation (`{code}{YY}{MONTH}{seq}`), final stage approval (auto-approve), setting `readyForDispatch = false` on completion
**Off-limits:** Never set `readyForDispatch = true` here — that belongs to dispatch only

### Dispatch / Shipping
**Owns:** `app/api/dispatch-orders/`, `app/(main)/shipping/`, packing flow, DO lifecycle (DRAFT → PACKED → DISPATCHED), setting `readyForDispatch = true` on scan
**Off-limits:** Do not change DO status transitions without understanding the full packing slip flow

### Inventory
**Owns:** Stock categories, stock movements, GRN (goods receipt), low-stock alerts, reorder PRs
**Off-limits:** Do not modify stock movement logic without checking both issue and adjust flows

### Sales / Proforma / Invoices
**Owns:** Proforma invoices, client records, invoice generation, payment tracking
**Off-limits:** Invoice number generation is in `lib/invoice-number.ts` — do not modify format without explicit instruction

### Purchase
**Owns:** Purchase requests, purchase orders, vendor bid invitations, GRN linking
**Off-limits:** Do not change PO approval flow without checking vendor portal routes

### Admin
**Owns:** User CRUD, role assignment, stage checklist config, app settings, face enrollment
**Off-limits:** Do not change role enum values in schema without explicit instruction — roles are referenced throughout the codebase

### Rework
**Owns:** Rework records, repair logs, replacement unit flow (`app/api/rework/replacement/`)
**Off-limits:** Replacement flow creates new units — do not modify without checking unit serial assignment

### Auth / Accounts
**Owns:** `lib/auth.ts`, `app/api/auth/`, face verification (`lib/face-verify-server.ts`), session cookies
**Off-limits:** Never modify auth logic without explicit instruction — it gates all routes

---

## Key Files — Handle With Care

| File | Risk | Notes |
|---|---|---|
| `lib/barcode.ts` | High | Barcode generation for all stage types — changes affect every unit |
| `lib/auth.ts` | High | Session auth and role checking — gates all API routes |
| `lib/prisma.ts` | High | Singleton Prisma client — do not create new instances |
| `prisma/schema.prisma` | Critical | DB schema — **never modify without explicit user confirmation** |
| `components/StageWorkFlow.tsx` | High | Stage state machine used by every work stage UI |
| `app/(main)/orders/[id]/page.tsx` | High | Order detail data fetching, stage grouping, all barcode type queries |
| `app/(main)/orders/[id]/OrderDetail.tsx` | High | Order detail UI, status badges, done counters |
| `lib/timeline.ts` | Medium | Timeline log helper used across all stage completions |
| `lib/serial.ts` | Medium | Serial number generation — changing format breaks lookups |
| `lib/invoice-number.ts` | Medium | Invoice number sequence — do not reformat |

---

## Change Rules for AI Agents

1. **Only modify files explicitly mentioned in the user request.** Do not "clean up" or refactor adjacent files.
2. **When fixing a bug in Module A, do NOT refactor or update Module B** — even if you notice an improvement opportunity.
3. **Always check `readyForDispatch` semantics** before touching any dispatch or FA completion logic.
4. **Never modify `prisma/schema.prisma`** without explicit user confirmation, even for "safe" additions.
5. **Never change authentication logic** (`lib/auth.ts`, middleware, session handling) without explicit instruction.
6. **When adding a new barcode type**, update ALL five files listed in the Barcode Formats section above — missing any one breaks the flow.
7. **Always deploy from `/Users/mr.yash/Desktop/production`** (production-peach-tau.vercel.app) — NEVER deploy from a git worktree.
8. **Test with real DB data** before marking a fix complete — seed data does not cover all edge cases.
9. **When in doubt about field semantics**, read the existing API routes in `app/api/` first before assuming.
10. **Check both employee and manager views** when fixing UI bugs — they are often separate code paths.

---

## Common Mistakes to Avoid

- Setting `readyForDispatch = true` during FA completion — this permanently removes the unit from dispatch queries
- Deploying from a git worktree (`/.claude/worktrees/`) instead of the main project directory
- Fixing only the employee view and missing the manager/admin view (or vice versa)
- Counting only `COMPLETED` as "done" — `APPROVED` is also a terminal done state (especially at FA)
- Forgetting to backfill existing DB records when adding a new barcode type or schema field
- Creating a new Prisma client instance instead of importing from `lib/prisma.ts`
- Changing a role check in one API route and forgetting to apply the same fix to sibling routes
- Assuming `SHIPPING` role is active — it is deprecated, use `ACCOUNTS` for shipping approval

---

## Status Badge Logic (`OrderDetail.tsx`)

| Display | Condition |
|---|---|
| DONE (checkmark) | `currentStatus === 'COMPLETED'` OR `currentStatus === 'APPROVED'` |
| Active | `currentStatus === 'IN_PROGRESS'` OR `currentStatus === 'WAITING_APPROVAL'` |
| Pending | Stage not yet started |

The "X of Y done" counter increments for both `COMPLETED` and `APPROVED` statuses. Never change this to count only `COMPLETED` — `APPROVED` is the final state at FA and must be included.

---

## Roles Reference

| Role | Access |
|---|---|
| `ADMIN` | Full access |
| `PRODUCTION_MANAGER` | Approvals, all production data, reports |
| `PRODUCTION_EMPLOYEE` | Own stage work, own performance |
| `SALES` | Proformas, invoices, clients |
| `ACCOUNTS` | Invoices, payments, shipping approval |
| `PACKING` | Dispatch order scanning and packing |
| `PURCHASE_MANAGER` | Purchase requests, POs, vendor management |
| `STORE_MANAGER` | GRN, stock adjustments, inventory |
| `SHIPPING` | Deprecated — do not use for new logic |

---

## Tax Invoice System (completed)

### Generation
- Tax invoices are **auto-generated** — no manual button
- Triggered by `useEffect` in `ShippingPanel.tsx` completed tab when DO is APPROVED with no invoices
- API: `POST /api/dispatch-orders/[id]/generate-invoice` and `POST /api/dispatch-orders/[id]/approve`
- **Split number bug fix**: always derive n2 = n1 + 1 by string manipulation — NEVER call `generateNextFinalInvoiceNumber` twice (both DB queries return same number before any insert)

### Number Format
- Export/Global: `TSM/ES/YY-YY/NNN`  |  Domestic/Indian: `TSM/DS/YY-YY/NNN`
- Fiscal year resets each April 1

### Print Page (`/print/invoice/[id]` → `PrintInvoice.tsx`)
- A4 portrait, auto-prints on load (600ms delay) — blocks browser automation screenshots
- LUT bar (bold black `color:#000; font-weight:700`) above info-bar — export only
- 2-row info-bar: Row1=Invoice No/Date/Currency; Row2=Payment Terms/Delivery Terms/Approved By (Accounts)
- Row separators between items ONLY when `productItems.length > 1`
- Footer: compact `padding:4px 10px`, sign-wrap uses `margin-top:18px` (no `height:100%`/`space-between`)
- Tracking lines stripped from notes before display
- `approvedBy` from `dispatchOrder.approvedBy.name` (included in page.tsx Prisma query)

---

## Invoice List UI (`/sales` → `ProformaList.tsx`)

### Tab Structure
- **3 tabs**: Proforma | Invoice | Returns  (Status tab removed)
- **Invoice tab** has two sub-tabs:
  - **Current** (green): this calendar month → DO→Invoice folders, all open, no search bar
  - **History** (blue): all past months → Month→DO→Invoice folders, months collapsed by default, search bar auto-expands matches
- Search covers: customer name, invoice no., DO no., order no.
- `InvoiceDOFolder` is a shared sub-component defined above `ProformaList` export
- `buildDOGroups()` — groups by DO only (Current tab)
- `buildMonthGroups()` — groups by month then DO (History tab)

### ACCOUNTS accessing /sales
- ACCOUNTS bottom nav "Invoices" links to `/sales` (NOT `/accounts`)
- They see all 3 tabs including Invoice tab with Current/History sub-tabs

---

## Accounts Panel (`/accounts` → `AccountsPanel.tsx`)

- **No tabs** — single scrollable view with two sections
- **Pending** (amber badge): submitted DOs + legacy dispatches + pending_approval proformas
- **Complete** (collapsed by default, grey badge): approved/rejected DOs + approved/converted proformas

---

## Shipping Panel (`/shipping` → `ShippingPanel.tsx`)

- 4 tabs: Ready | Packing | Pending Approval | Completed
- Completed tab: 2-col grid — Invoice | Tracking columns
- Invoice auto-generates silently via `useEffect` watching `completedDOs` state
- Tracking stored as `"Tracking: {number}"` appended to invoice notes

---

## Known Minor Bugs (next to fix)
- Number inputs on trackpad: scroll-wheel changes value — fix with `onWheel={(e) => e.currentTarget.blur()}`
- PrintProforma: voltage range not shown per item in PDF
- PrintInvoice: voltage range not shown per item in PDF
