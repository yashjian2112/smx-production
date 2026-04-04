# Core Rules — Apply to EVERY task in this project

These rules are non-negotiable. They apply regardless of what's being built.

## Data Rules

1. `readyForDispatch = false` means AVAILABLE. `true` means ALREADY DISPATCHED.
   Only set to `true` inside `app/api/dispatch-orders/`. Nowhere else. Ever.

2. Both `COMPLETED` and `APPROVED` count as "done" in ALL counters, badges, and progress bars.
   Never count only COMPLETED — APPROVED is the final state at FA.

3. Fiscal year runs April 1 – March 31. Invoice numbers reset each April.

4. Split invoice: derive n2 = n1+1 by string manipulation.
   NEVER call generateNextFinalInvoiceNumber twice (race condition — both return same number).

5. GST: Seller is in Gujarat.
   - Intrastate (Gujarat buyer) = CGST 9% + SGST 9%
   - Interstate (other Indian state) = IGST 18%
   - Global/Export = 0% (under LUT/Bond)

## Code Rules

1. Import Prisma from `lib/prisma.ts`. Never `new PrismaClient()`.
2. All API routes must use `requireSession()` or `requireRole()` from `lib/auth.ts`.
3. Run `npx tsc --noEmit` before any commit. Must pass clean.
4. Number inputs always need `onWheel={(e) => e.currentTarget.blur()}`.
5. Print pages (`/print/*`) auto-call `window.print()`. Never open them programmatically from action flows.
6. Never modify `prisma/schema.prisma` without explicit user confirmation.
7. Never modify `lib/auth.ts` without explicit user instruction.
8. Never modify `lib/barcode.ts` without updating all 5 barcode files together.

## UI Rules

1. No emojis. Use lucide-react icons.
2. Follow patterns in `.claude/rules/ui-patterns.md` exactly.
3. Every list page needs at minimum: Pending tab + Completed/History tab.
4. Check BOTH employee view AND manager/admin view when fixing UI bugs.
5. Status colors are standardized — see ui-patterns.md. Never invent new ones.
6. Cards use `className="card p-4 space-y-2"` base pattern.
7. Empty states always show a centered message, never a blank screen.

## Deployment Rules

1. Deploy ONLY from `/Users/mr.yash/Desktop/production`.
2. NEVER deploy from a git worktree (`.claude/worktrees/`).
3. Always commit to `main` branch.
4. Run `npx tsc --noEmit` before pushing.

## Role Rules

1. `SHIPPING` role is deprecated — use `ACCOUNTS` for shipping approval.
2. SALES sees only their own invoices (filter by `createdById`).
3. ACCOUNTS approves Packing Lists (not DOs directly).
4. HARNESS_PRODUCTION is the harness worker role.
5. When building a feature for one role, verify it doesn't break other roles' views.
