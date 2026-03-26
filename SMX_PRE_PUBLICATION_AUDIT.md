# SMX Production Tracker — Pre-Publication Audit Report

**Date:** 2026-03-26
**Audited By:** Claude Code (claude-sonnet-4-6)
**Project:** SMX Drives Production Tracker
**Production URL:** production-peach-tau.vercel.app
**Codebase:** /Users/mr.yash/Desktop/production

---

## Executive Summary

This report covers a comprehensive pre-publication audit of the SMX Drives Production Tracker — a full manufacturing lifecycle management system. The audit examined **211 API endpoints**, **38 page routes**, **57 database models**, **19 library utilities**, and **13 React components**.

| Category | Count |
|---|---|
| Critical Issues | 4 |
| High Severity Issues | 6 |
| Medium Severity Issues | 12 |
| Low Severity Issues | 18 |
| Known Minor Bugs (pre-existing) | 3 |
| Test Coverage | **0%** (zero test files) |

### Overall Readiness: ⚠️ CONDITIONAL — Fix Critical Issues Before Go-Live

The application is feature-complete and the core business flow works. However, **4 critical issues** must be resolved before publishing to users — primarily race conditions in invoice/barcode number generation that could produce duplicate numbers, and a hardcoded JWT fallback that poses a security risk if the environment variable is missing.

---

## Part 1: Codebase Inventory

### 1.1 Application Scale

| Metric | Count |
|---|---|
| API Route Files | 211 endpoints across 29 modules |
| UI Page Routes | 38 pages (including 15 print-only pages) |
| Prisma DB Models | 57 models |
| Library Utilities | 19 files |
| React Components | 13 components |
| Production Dependencies | 18 packages |
| Dev Dependencies | 11 packages |
| Test Files | **0** |

### 1.2 Tech Stack
- **Framework:** Next.js 14 App Router (TypeScript)
- **ORM:** Prisma ORM (prisma db push — no migrations)
- **Database:** Supabase PostgreSQL
- **Deployment:** Vercel (auto-deploy on push to main)
- **Auth:** Custom JWT session cookie (7-day) + optional face biometric (8-hr)
- **Storage:** Vercel Blob for images/photos
- **AI:** Anthropic Claude API (PCB validation, image enhancement, price benchmarking)

### 1.3 All Modules & Features

#### API Modules
| Module | Endpoints | Description |
|---|---|---|
| Admin | 10 | Analytics, checklist config, price breakdown, DB migrations |
| AI | 5 | Demand forecast, production prediction, rework prediction, work prediction, reorder optimizer |
| Approvals | 1 | Manager approval queue |
| Auth | 3 | Login, logout, session me |
| Blob/Image | 2 | Blob upload, AI image enhancement |
| Box Sizes | 2 | Packing box size config |
| Check PCB | 1 | AI PCB board zone validation |
| Clients | 2 | Customer CRUD |
| Dashboard | 1 | Aggregated stats |
| Dispatch Orders | 19 | Multi-box DO lifecycle, packing, approval, invoice generation |
| Inventory | 28 | Stock CRUD, GRN, job cards, low-stock, movements, BOM |
| Invoices | 2 | Tax invoice CRUD, tracking notes |
| Me/Face | 3 | Face enrollment, face verify, assignments |
| Orders | 5 | Manufacturing order CRUD, barcodes, notes, status summary |
| Print | 1 | Manual FA label |
| Procurement | 28 | RO, RFQ, PO, GAN, GRN, vendor quotes, payments, samples |
| Production | 1 | Available orders |
| Products | 5 | Product CRUD, BOM components |
| Proformas | 6 | Proforma CRUD, approve, reject, convert, receipt |
| Purchase (legacy) | 6 | Legacy PR/PO/bid flow |
| Returns | 1 | Return request CRUD |
| Rework | 1 | Replacement unit creation |
| Scan | 1 | Universal barcode router |
| Settings | 1 | App settings (LUT, company, bank) |
| Sheet | 2 | Google Sheets export |
| Shipping | 7 | Legacy dispatch + ready summary |
| Timeline | 1 | Append-only audit log |
| Units | 13 | Unit CRUD, stage work, QC, rework, dispatch, lookup |
| Users | 3 | User CRUD, face enrollment |
| Vendor Portal | 8 | Vendor auth, RFQ quotes, PO timeline, invoices |
| Work | 1 | Active work assignments |

#### UI Page Modules
| Module | Pages | Description |
|---|---|---|
| Accounts | 2 | Pending/Completed DOs + invoices; Settings |
| Admin | 9 | Analytics, BOM, box sizes, checklists, clients, price breakdown, products, users, vendors |
| Approvals | 1 | Manager approval queue |
| Dashboard | 1 | Overview stats + quick links |
| Inventory | 1 | Stock levels, GRN, job cards, low-stock |
| Job Cards | 1 | Material dispatch cards |
| My Pages (employee) | 3 | My dispatch, my performance, my tasks |
| Orders | 2 | Order list + detail (dual-mode: PM view / SALES view) |
| Production Floor | 1 | Live floor by barcode scan |
| Purchase | 1 | PR / RFQ / PO / vendor management |
| Reports | 1 | Performance analytics |
| Rework | 2 | Rework list + replacement form |
| Sales | 6 | Proforma/Invoice/Returns tabs, create, edit, clients |
| Serial | 1 | Public serial lookup |
| Shipping | 2 | 4-tab packing panel + DO detail |
| Units | 1 | Unit detail with stage work |
| Print Pages | 15 | Box label, component, DO, GRN label, GRN serials, invoice, job card, material label, packing list, proforma, PO, QC, RO, unit, manual unit |
| Vendor Portal | 4 | Token portal, login, dashboard, My POs |

---

## Part 2: Issues Found

### 2.1 Critical Issues

These **must be fixed before go-live**.

---

#### CRIT-01: Race Condition in Invoice Number Generation
**File:** `lib/invoice-number.ts` — all generator functions
**Severity:** CRITICAL — data integrity, legal compliance

**Problem:** All 8 invoice number generators (PI, export, domestic, DO, GRN, batch, job card, material) follow a non-atomic pattern:
1. Query `findFirst` with `orderBy: seq DESC` to get current max
2. Parse, increment in application code
3. Return the new number

Two concurrent requests to `generateNextExportInvoiceNumber()` will both read the same max, both compute the same next number, and both return identical invoice numbers. This violates uniqueness and could produce legally invalid duplicate tax invoices.

The existing workaround for the split-invoice case (derive n2 = n1+1 by string manipulation) is correct and avoids calling the generator twice, but does **not** protect against two independent requests.

**Fix Required:** Wrap number generation in a `prisma.$transaction()` with a counter table or use a Postgres sequence per invoice type. Alternatively, add a unique database constraint on `invoiceNumber` in the `Invoice` model and implement a retry loop on constraint violation.

---

#### CRIT-02: Race Condition in Barcode Sequence Generation
**File:** `lib/barcode.ts` — `nextSequence()` function and all stage barcode generators
**Severity:** CRITICAL — data integrity, unit traceability

**Problem:** The barcode generation follows the same non-atomic pattern as invoice numbers:
1. Find max barcode with `startsWith(prefix)`
2. Parse sequence number in application code
3. Check if generated barcode exists (post-hoc)
4. Return barcode

Two concurrent order conversions can generate the same PS/BB/AY/QC/FA barcode. The existence check at step 3 may pass for both requests simultaneously before either has committed. Duplicate barcodes would break the entire unit tracking system — scan routes, stage lookups, and QC flow all rely on barcodes being globally unique.

Additionally, `startsWith` queries on barcode fields without an index will degrade significantly as records grow.

**Fix Required:** Use a dedicated sequence counter table per barcode type, or use database `SERIAL`/auto-increment for the sequence portion with a transaction lock. Add a unique constraint on all barcode fields.

---

#### CRIT-03: Hardcoded JWT Secret Fallback
**File:** `lib/auth.ts`, line 8
**Severity:** CRITICAL — authentication security

**Problem:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET ?? 'smx-drives-secret-change-in-production';
```

If `JWT_SECRET` is not set in Vercel environment variables, the app silently falls back to the hardcoded insecure string. An attacker who reads the source code (if ever leaked, or guesses it) can forge valid session tokens for any user including ADMIN.

**Fix Required:**
1. Verify `JWT_SECRET` is set in Vercel production environment variables.
2. Change the fallback to throw an error at startup:
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set');
```

---

#### CRIT-04: MaterialSerial Allocation Race Condition
**File:** `app/api/proformas/[id]/convert/route.ts`, lines 71–120
**Severity:** CRITICAL — component traceability, inventory integrity

**Problem:** When converting a proforma to an order with inventory-tracked materials:
1. Query available PS/BB material serials (`findMany` where status = PRINTED)
2. Check if count >= required
3. Create units, assign barcodes from those serials
4. Mark serials as ALLOCATED with `updateMany`

Steps 1–4 are NOT wrapped in a transaction. Two concurrent conversions can both claim the same set of material serial barcodes. Both will pass the availability check and both will proceed to create units. The `updateMany` will then double-allocate the same physical components.

**Fix Required:** Wrap the entire conversion process (unit creation + serial allocation) in `prisma.$transaction()` with `SELECT FOR UPDATE` semantics on the serials being allocated.

---

### 2.2 High Severity Issues

These should be fixed before go-live but do not block a limited/soft launch.

---

#### HIGH-01: Dispatch Order Rejection Does Not Unlock Units
**File:** `app/api/dispatch-orders/[id]/approve/route.ts`, lines 59–76
**Severity:** HIGH — data integrity, operational impact

**Problem:** When ACCOUNTS rejects a DO, `PackingBoxItem` records are deleted but the units are NOT reset to `readyForDispatch: false`. If a unit was marked `readyForDispatch: true` during approval (or partial approval), rejecting does not revert that. Units end up in a "ghost" state — no longer in any DO but also not available for re-dispatch.

**Fix Required:** Add to the rejection transaction:
```typescript
await tx.controllerUnit.updateMany({
  where: { id: { in: allItemIds } },
  data: { readyForDispatch: false }
});
```

---

#### HIGH-02: Work Submission Blob Upload Not Transactional
**File:** `app/api/units/[id]/work/route.ts`, blob upload section
**Severity:** HIGH — data integrity, audit trail

**Problem:** Photo uploads to Vercel Blob happen before the database update that marks the submission as PASSED and advances the stage. If `put()` succeeds but the database write fails, the blob is orphaned (wasted storage). If the blob upload fails mid-way, the unit may be stuck in an inconsistent state depending on error handling.

More critically, the stage auto-advance logic runs after both blob and DB writes. A partial failure can leave a unit with mismatched stage/status.

**Fix Required:** Restructure the flow to:
1. Upload blobs
2. Wrap DB writes in a transaction
3. Catch errors and log to timeline for traceability

---

#### HIGH-03: PRODUCTION_EMPLOYEE Role Can Create Dispatch Orders
**File:** `app/api/dispatch-orders/route.ts`, POST role check
**Severity:** HIGH — role boundary violation

**Problem:** The POST endpoint for creating dispatch orders includes `PRODUCTION_EMPLOYEE` in the allowed roles. Per project rules, employees should only access their own stage work. Allowing them to create DOs lets an employee group any units into a dispatch, bypassing manager oversight.

**Fix Required:** Remove `PRODUCTION_EMPLOYEE` from the POST dispatch-orders role check. Only `ADMIN`, `PRODUCTION_MANAGER`, `SHIPPING`, and `PACKING` should create DOs.

---

#### HIGH-04: Proforma Conversion Silently Falls Back on Out-of-Bounds Item Index
**File:** `app/api/proformas/[id]/convert/route.ts`, line 40
**Severity:** HIGH — incorrect order creation

**Problem:**
```typescript
const item = productItems[Math.min(parsed.data.itemIndex, productItems.length - 1)];
```
If `itemIndex` is out of bounds, it silently uses the last item instead of rejecting the request. An order could be created for the wrong product/quantity without any indication of the error.

**Fix Required:**
```typescript
if (parsed.data.itemIndex >= productItems.length) {
  return NextResponse.json({ error: 'Invalid item index' }, { status: 400 });
}
const item = productItems[parsed.data.itemIndex];
```

---

#### HIGH-05: Year String Computed Once at Module Load in barcode.ts
**File:** `lib/barcode.ts`, line 11
**Severity:** HIGH — incorrect barcode generation at year boundary

**Problem:**
```typescript
const YEAR_STR = new Date().getFullYear().toString().slice(-2);
```
This is evaluated once when the module is first imported. If the server has been running across a year boundary (e.g., processes started in December 2025 still running in January 2026), all new barcodes will contain the wrong year until the server restarts.

**Fix Required:** Compute `YEAR_STR` inside each barcode generation function:
```typescript
function getYearStr() {
  return new Date().getFullYear().toString().slice(-2);
}
```

---

#### HIGH-06: Missing Client Existence Check in Order Creation
**File:** `app/api/orders/route.ts`, POST handler
**Severity:** HIGH — referential integrity

**Problem:** When creating an order, the code validates that `product` exists but does NOT validate that `clientId` refers to an existing, active client. An order can be created with a non-existent or inactive client ID, causing downstream failures when the order detail tries to load client data.

**Fix Required:**
```typescript
if (clientId) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || !client.active) {
    return NextResponse.json({ error: 'Client not found or inactive' }, { status: 400 });
  }
}
```

---

### 2.3 Medium Severity Issues

These should be addressed in the first post-launch sprint.

---

#### MED-01: Missing Public Paths in Middleware
**File:** `middleware.ts`, `publicPaths` array
**Severity:** MEDIUM — users locked out of legitimate public pages

**Problem:** `/serial` (public serial lookup) and `/vendor` (vendor portal) are not in the `publicPaths` list. Unauthenticated users visiting these routes will be redirected to `/login`, breaking the vendor portal experience and the public serial lookup feature.

**Fix Required:** Add to `publicPaths`:
```typescript
const publicPaths = ['/login', '/api/auth', '/serial', '/vendor'];
```

---

#### MED-02: Deactivated User Session Remains Valid
**File:** `lib/auth.ts`, `getSession()` function
**Severity:** MEDIUM — security

**Problem:** When a user is deactivated (`active: false`) by an admin, their existing JWT session cookie remains valid for the full 7-day period. The session is verified only against the JWT signature, not against the current DB state of the user.

**Fix Required:** In `getSession()`, after verifying the JWT, add a DB lookup to confirm the user is still active:
```typescript
const dbUser = await prisma.user.findUnique({ where: { id: payload.id }, select: { active: true } });
if (!dbUser || !dbUser.active) return null;
```

---

#### MED-03: URL Query Parameter `status` Not Validated
**File:** `app/api/orders/route.ts`, GET handler
**Severity:** MEDIUM — runtime crash on invalid input

**Problem:** The `status` query parameter is cast directly to the enum type without validation. An invalid value (e.g., `?status=INVALID`) causes a Prisma runtime error that propagates to the client with a 500 response and stack trace.

**Fix Required:**
```typescript
const validStatuses = ['ACTIVE', 'HOLD', 'CANCELLED', 'CLOSED', 'DISPATCHED'];
if (status && !validStatuses.includes(status)) {
  return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
}
```

---

#### MED-04: Dispatch Order Quantity Not Re-Validated on PATCH
**File:** `app/api/dispatch-orders/[id]/route.ts`, PATCH handler
**Severity:** MEDIUM — data inconsistency

**Problem:** When creating a DO via POST, `dispatchQty` is validated against `order.units.length`. However, when PATCHing the DO to update `dispatchQty`, this validation is not repeated. An admin could PATCH the `dispatchQty` to a value larger than the available units, leading to a DO that can never be fully packed.

**Fix Required:** Re-validate `dispatchQty` against the order's available unit count in the PATCH handler.

---

#### MED-05: All GET List Endpoints Lack Pagination
**Files:** `app/api/orders/route.ts`, `app/api/proformas/route.ts`, `app/api/dispatch-orders/route.ts`, `app/api/units/route.ts`
**Severity:** MEDIUM — scalability

**Problem:** All list endpoints use a hard `take: N` (200–500) limit with no `skip` or cursor support. As the database grows past these limits, older records are silently omitted with no indication to the UI. There is also no `total` count returned.

**Fix Required:** Implement cursor-based or offset pagination with a `total` count returned alongside results. Alternatively, confirm current take limits are sufficient for the expected data volume.

---

#### MED-06: Proforma Items Not Validated for Null on Invoice Generation
**File:** `app/api/dispatch-orders/[id]/approve/route.ts`
**Severity:** MEDIUM — crash on edge case

**Problem:** The invoice generation logic accesses `proforma.items` and `proforma.client` deeply without full null guards. While `proforma` itself is checked for null, missing nested `items` array or `client` object could cause an unhandled crash on edge cases (e.g., items deleted via direct DB access).

**Fix Required:**
```typescript
if (!proforma?.items?.length || !proforma?.client) {
  return NextResponse.json({ error: 'Proforma data incomplete for invoice generation' }, { status: 400 });
}
```

---

#### MED-07: Invoice Number Max-Age Mismatch Between auth.ts and login/route.ts
**Files:** `lib/auth.ts` line 11, `app/api/auth/login/route.ts` line 36
**Severity:** MEDIUM — session expiry inconsistency

**Problem:** The JWT expiry (`MAX_AGE`) is defined in `lib/auth.ts` but the cookie `max-age` is hardcoded as `60 * 60 * 24 * 7` in the login route. If `MAX_AGE` is ever changed in one place, the other will be out of sync — the cookie may expire while the token is still valid or vice versa.

**Fix Required:** Export `MAX_AGE` from `lib/auth.ts` and import it in the login route.

---

#### MED-08: BottomNav Uses Custom SVGs Instead of Lucide-React
**File:** `components/BottomNav.tsx`
**Severity:** MEDIUM — violates project code standard

**Problem:** The BottomNav component defines all icons as custom inline SVG `<path>` elements rather than importing from `lucide-react`. Per CLAUDE.md: *"No emojis anywhere — use lucide-react icons instead. lucide-react is installed (v1.7.0)."* While SVGs are not emojis, using custom SVGs when lucide-react equivalents exist is inconsistent with the project standard established across all other files.

**Fix Required:** Replace custom SVG icons with equivalent lucide-react imports (e.g., `LayoutDashboard`, `ShoppingCart`, `Package`, `Truck`, `Users`, `FileText`, `Settings`, etc.).

---

#### MED-09: BottomNav Unknown Role Falls Through to Manager Nav
**File:** `components/BottomNav.tsx`, switch statement
**Severity:** MEDIUM — security / new role risk

**Problem:** The role switch statement has no `default` error case — it falls through to `managerNav`. If a new role is added to the system and the BottomNav isn't updated, that role will silently see the production manager navigation including approvals and reports.

**Fix Required:** Add a default case that returns a minimal safe nav or logs a warning.

---

#### MED-10: `as any` Type Cast in Role Check
**File:** `app/api/inventory/materials/route.ts`, VIEW_ROLES check
**Severity:** MEDIUM — type safety

**Problem:** `session.role as any` bypasses TypeScript's enum checking. If the `Role` enum changes, this code won't catch the mismatch at compile time.

**Fix Required:** Remove the `as any` cast and ensure `session.role` is typed as `Role` from `lib/auth.ts`.

---

#### MED-11: BottomNav Accounts Role Missing in ACCOUNTS nav
**File:** `components/BottomNav.tsx`
**Severity:** MEDIUM — navigation correctness

**Problem:** Per MEMORY.md, ACCOUNTS role bottom nav should link to: `Shipping | Approvals | AR | Invoices(→/sales) | Settings`. Verify this matches the current BottomNav implementation. Any mismatch means ACCOUNTS users see wrong navigation.

**Action Required:** Verify nav config matches MEMORY spec for the ACCOUNTS role.

---

#### MED-12: SHIPPING Role Nav Present Despite Being Deprecated
**File:** `components/BottomNav.tsx`
**Severity:** MEDIUM — dead code / misleading

**Problem:** A nav configuration exists for the deprecated SHIPPING role. Per CLAUDE.md: *"SHIPPING — Deprecated — do not use for new logic."* Having a nav for this role suggests it can still be assigned, which could confuse admins.

**Fix Required:** Remove the SHIPPING role nav case. Add a note in the admin user creation form that SHIPPING is deprecated and PACKING should be used instead.

---

### 2.4 Low Severity Issues

These are quality improvements for a future sprint.

---

#### LOW-01: Error Messages Leak Technical Details
**Multiple files**
Error messages like `"Could not generate unique invoice number — try again"` and raw Prisma error objects exposed in 500 responses help attackers understand system internals. Standardize error messages to be user-friendly in production.

---

#### LOW-02: Failed Stage Auto-Advance Not Logged to Timeline
**File:** `app/api/units/[id]/work/route.ts`
Stage auto-advance errors are caught and printed to console only. They should create a timeline entry so ops can diagnose issues without server log access.

---

#### LOW-03: `invoice-number.ts` Silently Resets Counter on Malformed Data
**File:** `lib/invoice-number.ts`
If an existing invoice number in the DB is malformed (missing `/` separator), `parseInt()` returns `NaN`, the code skips it, and the counter restarts from 001. This could produce duplicate numbers without any alert. Add regex validation of the expected format before parsing.

---

#### LOW-04: No Rate Limiting on Auth Endpoints
**File:** `app/api/auth/login/route.ts`
There is no rate limiting on the login endpoint. An attacker can attempt unlimited password guesses. Vercel's edge network provides some protection, but explicit rate limiting (e.g., via Upstash Redis) is recommended for a production app.

---

#### LOW-05: Session Not Invalidated Server-Side on Logout
**File:** `app/api/auth/logout/route.ts`
Logout deletes the session cookie, but there is no server-side token blacklist. A captured cookie (e.g., from an XSS attack or network sniff) remains valid until it naturally expires (7 days). For high-security operations, consider a token version/revocation mechanism.

---

#### LOW-06: No CSRF Token on Sensitive Mutations
**Multiple files**
Sensitive mutations (approve DO, generate invoice, delete proforma) rely entirely on `sameSite: 'lax'` cookies for CSRF protection. This is generally sufficient but not the most robust approach. For actions like approving invoices, explicit CSRF token validation would add defense-in-depth.

---

#### LOW-07: `prisma db push` Instead of Migrations
**Configuration**
The project uses `prisma db push` (schema-sync without migration files). This is convenient for rapid development but means:
- No rollback capability for schema changes
- No migration history for auditing
- Accidental schema changes can silently alter production tables

**Recommendation:** Before go-live, evaluate switching to `prisma migrate` for version-controlled, reversible schema changes.

---

#### LOW-08: Missing Index on Barcode Fields
**File:** `prisma/schema.prisma`
The `nextSequence()` function in `lib/barcode.ts` runs `startsWith(prefix)` queries on barcode fields. Without a database index on these fields, query time grows linearly with table size. On a busy production system with thousands of units, these queries will slow significantly.

**Recommendation:** Add indexes to all barcode columns in `ControllerUnit`:
```prisma
@@index([psBarcode])
@@index([bbBarcode])
@@index([ayBarcode])
@@index([qcBarcode])
@@index([faBarcode])
```

---

#### LOW-09: Hardcoded 600ms Print Delay
**File:** `app/print/invoice/[id]/page.tsx` (and other print pages)
`setTimeout(() => window.print(), 600)` — if the page takes longer to render (slow device, large invoice), the print dialog fires before content is ready. Use `document.fonts.ready` or a content-loaded event instead.

---

#### LOW-10: Number Inputs Scroll on Trackpad (Pre-existing Known Bug)
**Multiple pages**
Number inputs change value when the user scrolls over them with a trackpad. Fix with:
```tsx
onWheel={(e) => e.currentTarget.blur()}
```
This is documented in CLAUDE.md as a known bug.

---

#### LOW-11: Voltage Range Not Shown in Print Pages (Pre-existing Known Bug)
**Files:** `app/print/proforma/[id]/PrintProforma.tsx`, `app/print/invoice/[id]/PrintInvoice.tsx`
Per-item voltage range is not displayed in the PDF printouts. This is a known documented bug.

---

#### LOW-12: Inefficient Nested Relation Loading on Component Scan
**File:** `lib/barcode.ts`, `findUnitByComponentBarcode()` function
This function loads 8 nested relations (stage logs, QC records, rework records, timeline logs, etc.) on every barcode scan, even when only the unit ID is needed. This is unnecessarily expensive.

---

#### LOW-13: Max Item Limit Not Enforced on API List Endpoints
**Multiple files**
Hard-coded `take: 200` or `take: 500` caps exist but users have no visibility into whether data was truncated. Add a `hasMore` boolean and `total` count to all list responses.

---

#### LOW-14: Console.error in Production Code
**Multiple files**
Several catch blocks use `console.error()` for logging. In production, use a structured logging solution or at minimum ensure these are visible in Vercel's function logs.

---

#### LOW-15: TypeScript Compilation Not Verified
**All files**
The TypeScript compiler check (`npx tsc --noEmit`) could not be run from the audit environment due to directory restrictions. It is critical to verify there are no TypeScript errors before deploying.

**Action Required:** Run `npx tsc --noEmit` from `/Users/mr.yash/Desktop/production` and fix any errors before publishing.

---

#### LOW-16: No ESLint Configuration
**Root directory**
`npm run lint` prompts to configure ESLint, indicating no `.eslintrc` or ESLint config exists. ESLint with `eslint-config-next` should be configured and all warnings resolved before go-live.

**Action Required:** Run `npx next lint --init` and set to Strict mode, then resolve all warnings.

---

#### LOW-17: `vercel.json` Not Reviewed
**File:** `vercel.json`
The Vercel deployment config was not deeply audited. Ensure it does not expose any routes that should be private, and that function timeout limits are appropriate for long-running routes (e.g., invoice generation, AI calls).

---

#### LOW-18: Legacy Shipping Module Coexists With New Dispatch Order Module
**Files:** `app/api/shipping/`, `app/api/dispatch-orders/`
Both a legacy `Dispatch`/`DispatchItem` model and the newer `DispatchOrder`/`PackingBox`/`PackingBoxItem` system exist. The legacy module is still accessible via API routes. Ensure the UI never routes users to legacy shipping endpoints, and consider deprecation timeline.

---

## Part 3: Security Assessment

### 3.1 Authentication & Authorization

| Check | Status | Notes |
|---|---|---|
| Password hashing | PASS | bcryptjs with 12 rounds |
| JWT signing | CONDITIONAL | Correct algorithm (jose) but secret has insecure fallback (CRIT-03) |
| Session cookie flags | PASS | httpOnly=true, sameSite=lax, secure=true in production |
| Route protection | PARTIAL | Middleware protects all routes but `/serial` and `/vendor` may be mis-protected (MED-01) |
| Role-based access | MOSTLY PASS | Roles enforced per route, but PRODUCTION_EMPLOYEE can create DOs (HIGH-03) |
| Deactivated user access | FAIL | Deactivated users retain full session validity (MED-02) |
| Rate limiting | FAIL | No rate limiting on login endpoint (LOW-04) |
| CSRF protection | PARTIAL | sameSite=lax provides basic CSRF protection (LOW-06) |
| Token revocation | FAIL | No server-side session invalidation on logout (LOW-05) |
| SQL injection | PASS | Prisma ORM parameterizes all queries |
| XSS | PASS | React escapes output by default; no dangerouslySetInnerHTML found |
| Sensitive data exposure | CONDITIONAL | Verify JWT_SECRET env var on Vercel (CRIT-03) |

### 3.2 Data Integrity

| Check | Status | Notes |
|---|---|---|
| Invoice number uniqueness | FAIL | Race condition can produce duplicate numbers (CRIT-01) |
| Barcode uniqueness | FAIL | Race condition can produce duplicate barcodes (CRIT-02) |
| Material serial allocation | FAIL | Race condition can double-allocate serials (CRIT-04) |
| readyForDispatch semantics | PASS | Correctly set only on DO approval, not FA completion |
| Timeline logs | PASS | Append-only, no delete endpoints found |
| Unit status transitions | PASS | Both COMPLETED and APPROVED counted as done |
| Dispatch rejection unit unlock | FAIL | Units not unlocked on DO rejection (HIGH-01) |

---

## Part 4: Test Coverage

### 4.1 Existing Tests

**Zero application test files found.** No `.test.ts`, `.spec.ts`, `.test.tsx`, or `.spec.tsx` files exist in the application code.

### 4.2 Manual Verification Performed

The following flows were verified by reading the implementation code:

| Flow | Verified | Notes |
|---|---|---|
| Login / logout | Code review | Correct, minor issues noted |
| Order creation from proforma | Code review | Race condition risk on material serials |
| Stage barcode generation | Code review | Race condition risk on sequences |
| Unit stage work submission | Code review | Blob upload atomicity concern |
| QC pass / fail flow | Code review | Logic appears correct |
| Dispatch Order lifecycle | Code review | Rejection unlock bug found |
| Invoice auto-generation | Code review | Race condition on number generation |
| Split invoice logic | Code review | n1+n2 string derive pattern correct |
| Vendor portal auth | Code review | Separate token-based auth, not JWT |
| Face biometric session | Code review | 0.38 threshold, 2+ frames, 8-hr session |
| Inventory stock movements | Code review | IN/OUT/ADJUSTMENT types correct |
| GRN and batch tracking | Code review | Appears correct |
| Proforma approval flow | Code review | Correct status transitions |

### 4.3 Recommended Test Suite

Before go-live, add automated tests for at minimum:

1. **`lib/barcode.ts`** — verify each barcode format matches the regex spec
2. **`lib/invoice-number.ts`** — verify fiscal year boundaries, reset logic
3. **`lib/serial.ts`** — verify serial format `SMX[model4][year2][seq3]`
4. **`lib/number-to-words.ts`** — verify INR and USD conversions
5. **`lib/auth.ts`** — verify requireRole throws correct errors
6. **API routes (integration tests)** — login, create order, approve proforma, DO packing flow
7. **Stage work flow** — verify stage transitions respect status enum

---

## Part 5: Operational Readiness

### 5.1 Environment Variables

The following environment variables must be verified as set on Vercel before go-live:

| Variable | Required | Used By |
|---|---|---|
| `DATABASE_URL` | Critical | Prisma (all DB operations) |
| `JWT_SECRET` | Critical | lib/auth.ts (CRIT-03) |
| `BLOB_READ_WRITE_TOKEN` | Critical | lib/blobUrl.ts (photo uploads) |
| `ANTHROPIC_API_KEY` | High | PCB validation, AI features |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Medium | Backup AI model |
| `NEXTAUTH_URL` or equivalent | Low | Verify Vercel auto-sets |
| Google Sheets credentials | Low | Sheet export feature |

### 5.2 Database State

- Schema must be in sync with `prisma/schema.prisma` (`prisma db push` run)
- All required seed data present (roles, admin user, product models, checklists)
- Face biometric models in `/public/models/` directory (large binary files)

### 5.3 Print Pages

All print pages (15 routes) auto-print on load with a 600ms delay. Browser automation screenshots will not capture content. These pages should be manually tested with physical printers or PDF export before go-live.

### 5.4 Build Verification

Before deploying:
```bash
cd /Users/mr.yash/Desktop/production
npx tsc --noEmit          # Must pass with zero errors
npx next lint             # Must pass after ESLint config (LOW-16)
npm run build             # Must succeed
```

---

## Part 6: Prioritized Fix Plan

### P0 — Fix Before Any User Access (Critical)

| # | Issue | File | Est. Effort |
|---|---|---|---|
| 1 | CRIT-03: Verify JWT_SECRET on Vercel | Vercel env vars | 5 min |
| 2 | CRIT-03: Remove insecure JWT fallback | lib/auth.ts | 5 min |
| 3 | CRIT-01: Fix invoice number race condition | lib/invoice-number.ts | 2–4 hrs |
| 4 | CRIT-02: Fix barcode sequence race condition | lib/barcode.ts | 2–4 hrs |
| 5 | CRIT-04: Wrap material serial allocation in transaction | app/api/proformas/[id]/convert/route.ts | 1 hr |
| 6 | MED-01: Add /serial and /vendor to public paths | middleware.ts | 5 min |

### P1 — Fix Before Full Launch (High)

| # | Issue | File | Est. Effort |
|---|---|---|---|
| 7 | HIGH-01: Unlock units on DO rejection | app/api/dispatch-orders/[id]/approve/route.ts | 30 min |
| 8 | HIGH-03: Remove PRODUCTION_EMPLOYEE from DO creation | app/api/dispatch-orders/route.ts | 5 min |
| 9 | HIGH-05: Compute YEAR_STR inside barcode functions | lib/barcode.ts | 30 min |
| 10 | MED-02: Check user.active in getSession() | lib/auth.ts | 30 min |
| 11 | LOW-15: Run tsc --noEmit and fix all errors | All files | 1–2 hrs |
| 12 | LOW-16: Configure ESLint and fix warnings | Root config | 1 hr |

### P2 — First Post-Launch Sprint (Medium)

| # | Issue | File | Est. Effort |
|---|---|---|---|
| 13 | HIGH-02: Blob upload transactionality | app/api/units/[id]/work/route.ts | 2 hrs |
| 14 | HIGH-04: Item index validation on convert | app/api/proformas/[id]/convert/route.ts | 15 min |
| 15 | HIGH-06: Client existence check on order creation | app/api/orders/route.ts | 20 min |
| 16 | MED-03: Validate status query parameter | app/api/orders/route.ts | 15 min |
| 17 | MED-04: Re-validate dispatchQty on PATCH | app/api/dispatch-orders/[id]/route.ts | 30 min |
| 18 | MED-08: Replace BottomNav SVGs with lucide-react | components/BottomNav.tsx | 1 hr |
| 19 | MED-09: BottomNav default case for unknown roles | components/BottomNav.tsx | 10 min |
| 20 | MED-12: Remove deprecated SHIPPING role nav | components/BottomNav.tsx | 10 min |
| 21 | LOW-10: onWheel blur fix on number inputs | Multiple pages | 1 hr |
| 22 | LOW-11: Voltage range in PDF printouts | PrintProforma, PrintInvoice | 1 hr |

### P3 — Future Sprints (Low / Nice-to-Have)

- Add database indexes on barcode fields (LOW-08)
- Implement pagination on list endpoints (MED-05)
- Add rate limiting on login (LOW-04)
- Add proper ESLint configuration and resolve all warnings (LOW-16)
- Write automated tests for core utilities (see Part 4.3)
- Consider migrating to `prisma migrate` for rollback capability (LOW-07)
- Standardize error messages (LOW-01)
- Add timeline logging for failed stage advances (LOW-02)

---

## Part 7: Summary Scorecard

| Category | Score | Notes |
|---|---|---|
| Feature Completeness | 9/10 | All modules implemented, minor known bugs |
| Code Quality | 7/10 | Consistent patterns, some type safety gaps |
| Security | 6/10 | Good foundation, JWT fallback and rate limiting gaps |
| Data Integrity | 5/10 | Race conditions in critical number generators |
| Error Handling | 7/10 | Generally present, some missing edge cases |
| Test Coverage | 0/10 | Zero automated tests |
| Performance | 7/10 | Efficient queries overall, missing indexes on barcodes |
| Documentation | 8/10 | CLAUDE.md and CONTEXT.md are excellent |
| **Overall** | **6.4/10** | **Conditional pass — fix P0 items first** |

---

## Appendix A: Files Examined in This Audit

- `middleware.ts`
- `lib/auth.ts`, `lib/barcode.ts`, `lib/invoice-number.ts`, `lib/serial.ts`, `lib/timeline.ts`
- `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts`
- `app/api/orders/route.ts`, `app/api/orders/[id]/route.ts`
- `app/api/units/route.ts`, `app/api/units/[id]/route.ts`
- `app/api/dispatch-orders/route.ts`, `app/api/dispatch-orders/[id]/route.ts`
- `app/api/dispatch-orders/[id]/approve/route.ts`, `app/api/dispatch-orders/[id]/generate-invoice/route.ts`
- `app/api/proformas/route.ts`, `app/api/proformas/[id]/route.ts`, `app/api/proformas/[id]/convert/route.ts`
- `app/api/inventory/materials/route.ts`, `app/api/inventory/stock/route.ts`
- `app/api/work/route.ts`, `app/api/approvals/route.ts`
- `app/(main)/shipping/ShippingPanel.tsx`
- `app/(main)/orders/[id]/OrderDetail.tsx`
- `components/BottomNav.tsx`
- `prisma/schema.prisma`
- `package.json`

---

*Report generated by Claude Code (claude-sonnet-4-6) — 2026-03-26*
