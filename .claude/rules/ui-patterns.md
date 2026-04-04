# UI Pattern Rules — MANDATORY for all UI work

When building any new page, tab, card, or component — follow these exact patterns.
Do NOT invent new styles. Match the existing codebase exactly.

## Standard Page Layout

Every authenticated page renders inside the (main) layout:
```
min-h-dvh flex flex-col pb-20 md:pb-0
  → Header (sticky top-0 z-40, gradient blur)
  → main (flex-1 p-4 max-w-4xl mx-auto w-full)
  → BottomNav (fixed bottom on mobile)
```

## Standard Tab Pattern

When any page needs categorized views, use tabs. Standard structure:

### Tab Container
```tsx
<div className="flex gap-1 p-1 rounded-xl"
  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
```

### Tab Button
```tsx
<button
  className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-all
    ${active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
  style={active ? {
    background: 'rgba(14,165,233,0.15)',
    border: '1px solid rgba(14,165,233,0.25)'
  } : {}}
>
  {label}
  {count > 0 && (
    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: 'rgba(14,165,233,0.2)' }}>
      {count}
    </span>
  )}
</button>
```

### Default Tab Structure for Workflow Pages
Almost every workflow page follows this pattern:

| Tab | What it shows | Status filter |
|---|---|---|
| Pending / To Do | Items awaiting action | PENDING, OPEN, DRAFT |
| In Progress / Processing | Items being worked on | IN_PROGRESS, PACKING, SUBMITTED |
| Completed / History | Done items | COMPLETED, APPROVED, REJECTED |

ALWAYS include at minimum Pending + Completed tabs for any list page.
If the workflow has an active/processing state, add a middle tab.

### Sub-tabs (when a tab needs further breakdown)
```tsx
<div className="flex gap-1 p-0.5 rounded-lg mt-2"
  style={{ background: 'rgba(255,255,255,0.03)' }}>
  <button className={subActive ? 'bg-colored text-white' : 'text-zinc-500'}>
    Current
  </button>
  <button className={subActive ? 'bg-colored text-white' : 'text-zinc-500'}>
    History
  </button>
</div>
```

Use sub-tabs when:
- Current vs History split (e.g., this month vs older)
- Processing vs Completed within an "Active" tab

## Standard Card Pattern

Every list item is a card:

```tsx
<div className="card p-4 space-y-2">
  {/* Row 1: Header — identifier + action button */}
  <div className="flex items-start justify-between gap-2">
    <div className="flex-1 min-w-0">
      <span className="font-mono font-semibold text-white text-sm">{id}</span>
      <StatusBadge status={status} />
    </div>
    <button className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0
      bg-sky-500/10 text-sky-400 border border-sky-500/20">
      Action
    </button>
  </div>

  {/* Row 2: Description / metadata */}
  <p className="text-sm text-zinc-400">{description}</p>

  {/* Row 3: Meta info */}
  <div className="flex items-center gap-3 text-xs text-zinc-600">
    <span>{date}</span>
    <span>by {user}</span>
  </div>
</div>
```

Card base class (`card` from globals.css) = `bg-zinc-900 rounded-xl`

## Status Badge Pattern

```tsx
<span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
  style={{ background, color, border: `1px solid ${borderColor}` }}>
  {status}
</span>
```

Color mapping (ALWAYS use these exact colors):
| Status | Background | Text Color |
|---|---|---|
| DRAFT / PENDING | rgba(113,113,122,0.1) | #a1a1aa (zinc) |
| PENDING_APPROVAL / SUBMITTED | rgba(251,191,36,0.1) | #fbbf24 (amber) |
| APPROVED / COMPLETED / READY | rgba(34,197,94,0.1) | #4ade80 (green) |
| REJECTED / FAILED / BLOCKED | rgba(239,68,68,0.1) | #f87171 (red) |
| IN_PROGRESS / PACKING / OPEN | rgba(96,165,250,0.12) | #60a5fa (blue) |
| CONVERTED | rgba(56,189,248,0.1) | #38bdf8 (sky) |

## Empty State Pattern

```tsx
<div className="text-center py-8 text-sm text-zinc-500">
  No items found
</div>
```

## Error State Pattern

```tsx
<div className="text-sm text-rose-400 px-3 py-2 rounded-lg"
  style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
  {errorMessage}
</div>
```

## Success State Pattern

```tsx
<div className="text-sm text-emerald-400 px-3 py-2 rounded-lg"
  style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
  {successMessage}
</div>
```

## Modal/Dialog Pattern

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center"
  style={{ background: 'rgba(0,0,0,0.7)' }}>
  <div className="rounded-xl p-6 w-full max-w-sm space-y-4"
    style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)' }}>
    {/* content */}
  </div>
</div>
```

## Button Patterns

| Type | Classes |
|---|---|
| Primary | `bg-sky-500 hover:bg-sky-400 text-white font-medium rounded-lg py-2 px-4` |
| Secondary | `bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg py-2 px-4` |
| Danger | `bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg py-2 px-4` |
| Ghost | `text-zinc-400 hover:text-zinc-200 py-2 px-4` |
| Disabled | Add `disabled:opacity-40 cursor-not-allowed` |

## Input Pattern

```tsx
<input className="w-full px-3 py-2 rounded-lg text-white bg-transparent outline-none text-sm"
  style={{ border: '1px solid rgba(255,255,255,0.15)' }}
  onWheel={(e) => e.currentTarget.blur()} // ALWAYS add for number inputs
/>
```

## Icons — NEVER use emojis

Import from lucide-react. Common icons:
Check, X, Camera, Package, Truck, Plane, AlertTriangle, MapPin,
Building2, ClipboardList, BarChart3, Star, Bot, Trash2, Clock,
Search, Filter, ChevronDown, ChevronRight, Plus, Minus, Edit, Eye

Size: 16x16 default (w-4 h-4), 20x20 for nav (w-5 h-5)

## Text Hierarchy

| Level | Classes |
|---|---|
| Page title | text-xl font-semibold text-white |
| Section header | text-sm font-medium text-zinc-300 uppercase tracking-wider |
| Card title | text-sm font-semibold text-white font-mono |
| Body text | text-sm text-zinc-400 |
| Meta / timestamps | text-xs text-zinc-600 |
| Accent / links | text-sky-400 |

## Responsive Rules

- Mobile-first for production floor pages (harness, orders work, scanning)
- Desktop-first for admin, reports, settings
- Tab buttons: `text-xs` on mobile, readable at all sizes
- Cards: full width, no grid on mobile. Optional 2-col grid on desktop for compact items
- Bottom nav: 64px height, icons 20x20, labels text-[10px]
