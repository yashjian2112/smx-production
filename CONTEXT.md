# 🧠 AI CONTEXT FILE — SMX Drives Production Tracker
> **IMPORTANT FOR AI AGENTS:** Read this file at the start of EVERY session before doing any work.
> Update the "Last Updated", "Last Work Done", and "Pending Tasks" sections after every session.

---

## 📅 Last Updated
- **Date:** 2026-03-11
- **Updated By:** Claude (Anthropic)
- **Session Summary:** PCB detection per-photo, micro/mini components skipped until RPi arrives, image storage confirmed.

---

## 🏭 What Is This App?

**SMX Drives Production Tracker** — A manufacturing execution system (MES) for electronic controller (SMX Drive) production.

### Core Purpose:
- Track units through 6 manufacturing stages (Powerstage → Brainboard → Assembly → QC → Rework → Final Assembly)
- AI-powered photo inspection using Claude Vision (detect missing/wrong/defective components)
- BOM (Bill of Materials) component verification via barcode scanning
- Role-based workforce management (Admin, Manager, Employee)
- Permanent audit trail for regulatory compliance
- Mobile-first UI for factory floor workers

### Live URL:
- **Production:** https://production-peach-tau.vercel.app

### Git Info:
- **Main branch:** `main`
- **Active worktree branch:** `claude/wonderful-swanson` (at `/Users/mr.yash/Desktop/production/.claude/worktrees/wonderful-swanson`)
- **Remote:** GitHub (connected to Vercel auto-deploy)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS |
| **Backend** | Next.js API Routes (Node.js) |
| **Database** | Supabase (PostgreSQL) + Prisma ORM v6 |
| **Auth** | JWT (jose), bcryptjs, HTTP-only cookie sessions |
| **File Storage** | Vercel Blob |
| **AI Vision** | Anthropic `claude-sonnet-4-5` (this is the model available on the project API key) |
| **Face Auth** | face.js (face descriptor, 128-float array in DB) |
| **Image Processing** | sharp (CLAHE, crop, upscale, sharpen) |
| **Barcode/QR** | jsbarcode, qrcode |
| **Deployment** | Vercel (serverless) |

---

## 📁 Key File Locations

### Pages
| Route | File | Purpose |
|-------|------|---------|
| `/dashboard` | `app/(main)/dashboard/page.tsx` | Employee + Manager dashboards |
| `/orders` | `app/(main)/orders/page.tsx` | Order management |
| `/units/[id]` | `app/(main)/units/[id]/page.tsx` | Unit detail (main work page) |
| `/serial` | `app/(main)/serial/page.tsx` | Barcode scan to find unit |
| `/approvals` | `app/(main)/approvals/page.tsx` | Manager approval queue |
| `/admin/checklists` | `app/(main)/admin/checklists/` | Admin AI checklist config |
| `/admin/products` | `app/(main)/admin/products/` | BOM / product management |
| `/admin/users` | `app/(main)/admin/users/` | User + face management |

### Key API Routes
| Method + Route | File | Purpose |
|---------------|------|---------|
| `GET/PUT /api/units/[id]/work` | `app/api/units/[id]/work/route.ts` | **Main AI inspection route** — fetch zones, submit photos, Claude Vision analysis |
| `POST /api/admin/checklists` | `app/api/admin/checklists/route.ts` | Create checklist item (photoZone, positions, etc.) |
| `POST /api/admin/checklists/locate` | `app/api/admin/checklists/locate/route.ts` | Claude Vision: auto-locate component on board |
| `POST /api/units/[id]/qc` | `app/api/units/[id]/qc/route.ts` | Record QC result |
| `POST /api/units/[id]/approve` | `app/api/units/[id]/approve/route.ts` | Manager approval |
| `GET /api/dashboard` | `app/api/dashboard/route.ts` | Dashboard metrics |

### Key Components
| Component | File | Purpose |
|-----------|------|---------|
| **StageWorkFlow** | `components/StageWorkFlow.tsx` | Multi-step photo capture wizard (THE core worker UI) |
| **ChecklistAdmin** | `app/(main)/admin/checklists/ChecklistAdmin.tsx` | Admin tool: define what AI checks per stage |
| **ComponentChecklist** | `app/(main)/units/[id]/ComponentChecklist.tsx` | BOM barcode scan per unit |
| **WorkTabs** | `app/(main)/units/[id]/WorkTabs.tsx` | Tab container for photo submission + history |
| **UnitActions** | `app/(main)/units/[id]/UnitActions.tsx` | Status action buttons |
| **BarcodeScanner** | `components/BarcodeScanner.tsx` | Camera-based barcode scan |
| **ImageEnhancer** | `components/ImageEnhancer.tsx` | CLAHE, sharpen, upscale before upload |
| **BoardLocationPicker** | `components/BoardLocationPicker.tsx` | Admin: click board to set component zone |

### Database
| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | **Source of truth** — all DB models |

---

## 🗄️ Database Models Summary

```
User              → employees/managers/admins, face descriptor, role, stagePermissions
Order             → production orders, quantity, product, due date
Product           → product catalogue (e.g. SMX1000)
ProductComponent  → BOM items per product (with barcode, stage, partNumber)
ControllerUnit    → one per serial number, tracks currentStage + currentStatus
StageAssignment   → which employee is assigned to which stage on a unit
StageLog          → per-transition audit record
StageWorkSubmission → photo upload + AI result per stage submission
StageChecklistItem  → admin-defined check per stage (name, positions, photoZone, reference image)
ComponentCheck    → barcode scan result per component per unit
QCRecord          → QC pass/fail with issue category
ReworkRecord      → rework cycle tracking
TimelineLog       → PERMANENT append-only audit trail (never deleted)
UserPerformanceSummary → cached performance metrics per employee
IssueCategory, RootCauseCategory → dropdown configs
AuditLog          → admin action log
```

### Serial Number Format:
- **Unit serial:** `SMX` + model(4) + year(2) + sequence(3) → e.g. `SMX100026001`
- **Stage barcodes:** `{model}{stage}{year}{seq}` → e.g. `1000PS26001` (PS = Powerstage)

### Stage Types (Enum):
```
POWERSTAGE_MANUFACTURING
BRAINBOARD_MANUFACTURING
CONTROLLER_ASSEMBLY
QC_AND_SOFTWARE
REWORK
FINAL_ASSEMBLY
```

### Unit Status (Enum):
```
PENDING | IN_PROGRESS | COMPLETED | WAITING_APPROVAL | APPROVED | REJECTED_BACK | BLOCKED
```

---

## 🤖 AI Inspection System (Core Feature)

### How It Works:
1. **Admin** configures checklist items per stage:
   - Name, description, reference image, component positions (x,y normalized 0–1)
   - `photoZone`: `full` | `top` | `bottom` (which camera photo this item needs)
   - Claude Vision auto-locates components on board image

2. **Worker** at stage opens StageWorkFlow → multi-step photo wizard:
   - Step 1: Take **full board** photo
   - Step 2 (if needed): Take **top strip** close-up
   - Step 3 (if needed): Take **bottom strip** close-up
   - All zones captured → "Submit All — Run AI Check"

3. **API** (`PUT /api/units/[id]/work`):
   - Groups checklist items by zone
   - For each zone: builds "manifest" (reference crops + submitted crops)
   - Sends zone-specific prompt + images to Claude Vision
   - Merges results → PASS or FAIL
   - Saves imageUrl, imageUrl2, imageUrl3 to `StageWorkSubmission`

4. **Result:** Unit auto-advances (PASS) or gets BLOCKED (FAIL) with issue list

### Image Storage:
- Every submitted photo is saved to Vercel Blob: `stage-work/{unitId}/{stage}/{timestamp}-1/2/3.jpg` (private access)
- URLs stored in `StageWorkSubmission.imageUrl / imageUrl2 / imageUrl3`
- RPi station will upload to the same endpoint — images stored identically

### Photo Zone Logic:
```
photoZone = 'full'    → uses imageUrl  (formData field: 'image')
photoZone = 'top'     → uses imageUrl2 (formData field: 'file2')
photoZone = 'bottom'  → uses imageUrl3 (formData field: 'file3')
```

### Image Processing (per component):
- All full photos downscaled to **1568px max-side, 85% JPEG** before sending to Claude (stays under 5MB Anthropic limit)
- Pad-level crops are size-aware (NOT downscaled — kept at full quality):
  - `micro` → 2.5% crop window → 480px upscale (~9× effective zoom)
  - `mini`  → 4.0% crop window → 400px upscale (~6× effective zoom)
  - `small` → 6.0% crop window → 320px upscale (~3× effective zoom)
- CLAHE contrast enhancement per crop (stronger for micro: 4×4 tiles, slope 6)
- `CANNOT_CONFIRM` status: AI uses this when it can't see a small component clearly — does **NOT** cause FAIL
- Only `MISSING / DEFECTIVE / WRONG_ORIENTATION / SOLDER_ISSUE / MISPLACED` on **required** components causes FAIL

### Auto-Zoom (camera):
- GET API returns `zoneZooms` map computed from smallest component size in each zone
- `SIZE_ZOOM`: micro → 3.5×, mini → 2.5×, small → 2.0×; extra zones default 2.0×
- Camera opens with native zoom applied (Android Chrome `getUserMedia` zoom constraint)

---

## ✅ COMPLETED WORK (Most Recent First)

### [2026-03-11] PCB Detection + Small Component Skip
| Commit | What was fixed |
|--------|---------------|
| `203a62c` | `micro` and `mini` dot sizes skipped entirely from AI manifest until RPi arrives. Remove from `SKIP_SIZES` in `work/route.ts` to re-enable. |
| `3b676ee` | New `/api/check-pcb` (claude-haiku, 512px thumb) called after each zone photo capture — shows "Verifying PCB…" spinner, blocks confirm if not a board. `small` components non-mandatory in FAIL logic (`isSmallOnly` guard). |

### [2026-03-11] AI Inspection — Full Fix Pass (6 commits, both accounts)
All AI inspection issues are now resolved. The full pipeline works end-to-end.

| Commit | What was fixed |
|--------|---------------|
| `9c0c9fa` | Portrait photo preview capped at `min(45vh,340px)` so Submit button never gets pushed off screen |
| `2f05bc5` | Admin checklist thumbnails now clickable → upload reference image (PATCH to `/api/admin/checklists/[id]`) |
| `6f8c5ca` | Model changed to `claude-sonnet-4-5` — the correct model for this API key (resolves `not_found_error`) |
| `816b410` | All photos downscaled to 1568px/85% JPEG before sending to Anthropic (resolves 400 payload-too-large errors) |
| `6e9d67f` | Amber "AI unavailable" screen shows actual error reason (API key / timeout / raw error) |
| `2f9e28d` | `full` zone always required; size-aware CLAHE crops restored; `CANNOT_CONFIRM` status added; generic visual check for stages with no manifest; auto-zoom badge + native camera zoom |
| `092238b` | Catch block defaults to FAIL (not PASS) when AI errors; amber ⚠️ third result state added to worker UI |

### [2026-03-11] Zone-Based Multi-Photo AI Inspection
- **ChecklistAdmin.tsx**: Added photoZone picker (Full/Top/Bottom) + zone badge on item list
- **StageWorkFlow.tsx**: Built full multi-step photo wizard with progress bar, zone instructions, confirm/next flow, thumbnail summary screen
- **`app/api/units/[id]/work/route.ts`**: Zone-grouped AI analysis, fixed all TypeScript strict errors
- Committed: `feat: zone-based multi-photo AI inspection + admin zone picker`
- Deployed to Vercel ✅

### [Prior Sessions] Auto-Zoom Camera
- Camera zooms based on zone (top/bottom = 2.5× zoom) and component size (micro = max zoom)
- Real-time distance guidance algorithm
- Stale closure fix for zoom state

### [Prior Sessions] Pick & Place Dot Sizes
- Admin board mapper shows colored dots per component size
- Micro/mini/small detection system
- CLAHE + 5× upscale crop pairs for reference vs submitted

### [Prior Sessions] Core App Build
- Full 6-stage manufacturing pipeline
- BOM barcode scanning
- QC + Rework workflow
- Permanent audit timeline
- Role-based access (Admin/Manager/Employee)
- Face recognition enrollment
- Dashboard metrics

---

## 🔧 PENDING TASKS (Next To Build)

### HIGH PRIORITY
> (Waiting for Raspberry Pi hardware to arrive — ordered 2026-03-11)
> When RPi arrives: remove `'micro'` and `'mini'` from `SKIP_SIZES` in `app/api/units/[id]/work/route.ts` to re-enable small component inspection.

| Task | Description | Files to Create/Edit |
|------|------------|---------------------|
| **RPi Python Capture Script** | Script running on RPi, handles 2 cameras (wide + macro), triggered by button press, sends to API, shows PASS/FAIL on LCD | New: `scripts/rpi-capture.py` |
| **`/api/station/submit`** | New API endpoint for RPi station with API key auth (not JWT) | New: `app/api/station/submit/route.ts` |
| **Station Prisma Model** | DB schema: `Station { id, name, apiKey, stageType, location, active }` | Edit: `prisma/schema.prisma` |
| **Admin Stations Page** | UI to create/manage stations, show their API keys | New: `app/(main)/admin/stations/` |

### MEDIUM PRIORITY
| Task | Description |
|------|------------|
| **Small Component Skip** | User decided to ignore micro/small components in AI checks for now. Already de-prioritized, no code change needed yet. |
| **Performance Reports** | `/reports` page is a placeholder. Needs real data visualizations. |

### LOW PRIORITY / IDEAS
| Task | Description |
|------|------------|
| **Dispatch Integration** | Mark units as dispatched, generate dispatch reports |
| **Email Notifications** | Alert manager when unit is blocked/waiting approval |
| **Print Labels** | Printable barcode label for each stage |

---

## 🔌 Hardware Plan (AOI Station — Raspberry Pi)

### Parts Ordered (2026-03-11):
| Component | Model | Qty | Purpose |
|-----------|-------|-----|---------|
| SBC | Raspberry Pi 5 (8GB) | 1 per station | Main compute |
| Wide Camera | RPi HQ Camera v3 + 6mm lens | 1 | Full board shot from 35cm height |
| Macro Camera | RPi HQ Camera v3 + 25mm lens | 1 | Close-up top/bottom strips at 12cm |
| Lighting | Ring LED (adjustable) | 1 | Even illumination, no shadows |
| Jig | Acrylic L-bracket | 1 | PCB alignment for repeatability |
| Display | 7" RPi touchscreen | 1 | Show PASS/FAIL result on station |
| Button | Big physical button | 1 | Trigger capture (hands-free) |

### Camera Heights:
- **Wide (6mm):** 35cm above PCB → full board in frame
- **Macro (25mm):** 12cm above PCB → fills frame with one strip

### Workflow:
1. Place PCB in alignment jig
2. Press button → RPi captures wide photo + macro photo (repositioned)
3. Script sends photos to `/api/station/submit` with station API key
4. Waits for Claude Vision response
5. Displays PASS ✅ or FAIL ❌ on screen with issue list

---

## 🚀 How to Deploy

### Local Dev:
```bash
cd /Users/mr.yash/Desktop/production
npm run dev
```

### Check TypeScript:
```bash
npx tsc --noEmit
```

### Deploy to Vercel:
```bash
git add -A
git commit -m "feat: description"
git push origin main   # Vercel auto-deploys on push to main
# OR manual deploy:
npx vercel --prod
```

### DB Changes (Prisma):
```bash
npx prisma db push      # Push schema changes (dev/staging)
npx prisma generate     # Regenerate Prisma client
```

---

## ⚠️ RULES FOR AI AGENTS

1. **Always read this file first** — before touching any code
2. **Update this file** at the end of every session:
   - Move completed tasks from Pending to Completed
   - Add any new pending tasks discovered
   - Update "Last Updated" date and "Last Work Done"
3. **Work on the worktree** at `/Users/mr.yash/Desktop/production/.claude/worktrees/wonderful-swanson` when doing large features; merge to `main` when done
4. **TypeScript strict mode** — no implicit `any`, no `function` declarations inside blocks, use `Array.from()` not spread for Sets/Maps
5. **Never use `git checkout --theirs` carelessly** — always check what you're overwriting
6. **Verify Vercel deploy** — run `npx vercel --prod` and confirm URL after big changes
7. **Two accounts** may be working simultaneously — always pull latest before starting:
   ```bash
   git pull origin main
   ```

---

## 🔑 Environment Variables Needed

```env
DATABASE_URL="postgresql://..."         # Supabase pooler URL (port 6543)
DIRECT_URL="postgresql://..."           # Supabase direct URL (port 5432, for migrations)
JWT_SECRET="..."                         # JWT signing secret
ANTHROPIC_API_KEY="..."                 # Claude Vision API key
BLOB_READ_WRITE_TOKEN="..."             # Vercel Blob token
NEXT_PUBLIC_APP_URL="https://..."       # App URL
```

---

*This file is maintained by AI agents. If you are a human reading this, it reflects the current state of the project as of the "Last Updated" date above.*
