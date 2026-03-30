# Floor Stock System — Implementation Plan

## Problem
Bulk consumables (screws, bolts, washers) can't be issued per-unit. Currently, Store issues them via Job Card each time → wasteful paperwork. Instead: issue in bulk to the production floor, auto-deduct from floor stock per BOM on each job card, and reconcile via periodic physical audits.

## Changes

### 1. Schema — Add `FloorStock` model + `isBulkConsumable` flag

```prisma
// Add to RawMaterial:
isBulkConsumable  Boolean @default(false) @map("is_bulk_consumable")

// New model:
model FloorStock {
  id              String   @id @default(cuid())
  rawMaterialId   String   @unique @map("raw_material_id")   // one floor stock per material
  currentQty      Float    @default(0) @map("current_qty")    // system-tracked qty on floor
  lastAuditQty    Float?   @map("last_audit_qty")             // last physical count
  lastAuditAt     DateTime? @map("last_audit_at")
  lastAuditById   String?  @map("last_audit_by_id")
  reorderThreshold Float   @default(0) @map("reorder_threshold") // alert when floor qty drops below
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  rawMaterial     RawMaterial @relation(fields: [rawMaterialId], references: [id])
  lastAuditBy     User?       @relation(fields: [lastAuditById], references: [id])
  transfers       FloorStockTransfer[]

  @@map("floor_stocks")
}

model FloorStockTransfer {
  id              String   @id @default(cuid())
  floorStockId    String   @map("floor_stock_id")
  type            String   @map("type")          // REPLENISH | DEDUCT | AUDIT_ADJUST
  quantity        Float
  reference       String?                        // job card number, audit note, etc.
  notes           String?
  createdById     String   @map("created_by_id")
  createdAt       DateTime @default(now()) @map("created_at")

  floorStock      FloorStock @relation(fields: [floorStockId], references: [id])
  createdBy       User       @relation(fields: [createdById], references: [id])

  @@map("floor_stock_transfers")
}
```

### 2. API Routes

#### `GET /api/inventory/floor-stock` — List all floor stock items
- Role: ADMIN, STORE_MANAGER, INVENTORY_MANAGER
- Returns: all FloorStock records with rawMaterial details, low-stock flag

#### `POST /api/inventory/floor-stock/replenish` — Transfer from store to floor
- Role: STORE_MANAGER, INVENTORY_MANAGER, ADMIN
- Body: `{ rawMaterialId, quantity }`
- Logic:
  1. Decrement `RawMaterial.currentStock` (same FIFO batch logic)
  2. Increment `FloorStock.currentQty`
  3. Create `FloorStockTransfer` (type: REPLENISH)
  4. Create `StockMovement` (type: OUT, adjustmentType: FLOOR_TRANSFER)

#### `POST /api/inventory/floor-stock/audit` — Physical count reconciliation
- Role: STORE_MANAGER, INVENTORY_MANAGER, ADMIN
- Body: `{ rawMaterialId, actualQty, notes }`
- Logic:
  1. Compare `actualQty` vs `FloorStock.currentQty`
  2. If different → wastage = system - actual
  3. Set `FloorStock.currentQty = actualQty`
  4. Set `lastAuditQty`, `lastAuditAt`, `lastAuditById`
  5. Create `FloorStockTransfer` (type: AUDIT_ADJUST, quantity: diff)
  6. If wastage > 0: create `StockMovement` (type: OUT, adjustmentType: SCRAP)

### 3. Job Card Auto-Deduct Change

**File: `app/api/inventory/job-cards/[id]/issue/route.ts`**

Current: ALL materials deducted from `RawMaterial.currentStock` + batches (FIFO).

New logic for bulk consumables:
- If `rawMaterial.isBulkConsumable === true` AND `FloorStock` exists with sufficient qty:
  - Deduct from `FloorStock.currentQty` (NOT from store stock)
  - Create `FloorStockTransfer` (type: DEDUCT, reference: job card number)
  - JobCardItem shows "Deducted from floor stock" in UI
  - NO StockMovement from store (already transferred earlier via replenish)
- If floor stock insufficient → fall back to normal store issue + alert

### 4. Inventory UI — New "Floor Stock" tab

**File: `app/(main)/inventory/InventoryPanel.tsx`**

Add new tab between Materials and GRN:
- **Floor Stock** tab showing:
  - List of bulk consumable materials with floor qty
  - Color coding: red (below threshold), green (healthy)
  - "Replenish" button per item → modal for qty
  - "Physical Count" button → modal for actual qty + notes
  - Transfer history log per item
  - Wastage summary (% over BOM per audit cycle)

### 5. Material Settings — Bulk consumable toggle

In the material edit form (Settings tab or material detail):
- Add toggle: "Bulk Consumable (Floor Stock)"
- When enabled, creates initial `FloorStock` record with qty=0
- Sets `reorderThreshold` (default: 0)

### 6. Nav — No changes needed
Inventory Manager nav already has: Inventory | GRN | Job Cards | Req. Order

## Files to create/modify:
1. `prisma/schema.prisma` — add FloorStock, FloorStockTransfer models + isBulkConsumable
2. `app/api/inventory/floor-stock/route.ts` — GET list
3. `app/api/inventory/floor-stock/replenish/route.ts` — POST replenish
4. `app/api/inventory/floor-stock/audit/route.ts` — POST physical count
5. `app/api/inventory/job-cards/[id]/issue/route.ts` — modify for floor stock deduction
6. `app/(main)/inventory/InventoryPanel.tsx` — add Floor Stock tab
7. User relations in schema for lastAuditBy + createdBy on transfers
