# Client Order Returns — UI design

Visual mock only. Flag: `SHOW_CLIENT_RETURN_MOCK` in `src/features/orders/client-returns/clientReturnMock.ts`. Confirm does not write to the database.

Use this file as the source of truth for **tables, cards, list columns, and the planned schema** so the return UI and SQL stay consistent.

**Scope:** warehouse-linked Standard Account companies only (`get_linked_warehouse_company_id()`). Not Return to Warehouse (`RT-…`) and not warehouse Client Stock Returns inspect.

Do not FK inventory rows to returns — join `company_id` + `variant_id` (+ `agent_id` on agent inventory).

**Migration file (not applied until you run it in the SQL editor):**
`supabase/migrations/20260911120000_client_order_returns.sql`

UI stays mock (`SHOW_CLIENT_RETURN_MOCK`) until the app is wired to these RPCs.

---

## Breakpoints

| Surface | Breakpoint | Layout |
|---|---|---|
| Create-return wizard | 768px (`useIsMobile()`) | ≥ 768 table · &lt; 768 `QtyInputCard` |
| History list | 1024px | Cards below `lg`. Table/Cards toggle from `lg` up (`localStorage` key `client-order-returns-view`) |

History default: **Cards** below 1024px, **Table** at 1024px+ (remembered if the user toggles). Old stored value `'dialog'` maps to cards.

---

## Roles

| Role | Create CR | Approve / Reject | List |
|---|---|---|---|
| Mobile sales | Yes → `pending_leader` | No | Own / team returns (when wired) |
| Team leader | Yes → auto-`posted` (RPC; wizard not switched yet) | **Yes** (only role that can act) | Team returns |
| Admin / super admin | View history | **No** (view only) | All company returns |
| Warehouse role | No | No | Use Client Stock Returns (`RT-…`) |

Reject **closes that CR**. Agent may file a **new** CR on the same ORD. Remaining returnable qty = sold − **posted** only (pending / rejected do not consume).

---

## Data model (agreed, not migrated)

Numbering: `CR-{INITIALS}-{YYYYMM}-000001` (RPC bumps from latest row for that company). Example: `CR-MTS-202609-000001`. Six-digit sequence (1–999999).

`reason` is **TEXT**, not an enum. UI options: Defect, Duplicate order, Missing parts, Other (free text).

Internal status: `pending_leader` | `posted` | `rejected` | `cancelled`.

UI labels (do **not** show “Posted”):

| Internal | Badge |
|---|---|
| `pending_leader` | Pending |
| `posted` | Approve |
| `rejected` | Reject |
| `cancelled` | Cancelled |

Badge classes: `clientReturnStatusBadgeClass` in `clientReturnMock.ts`.

Stock moves **only when status becomes `posted`** (TL approve, or TL auto-post on submit).

### 1. `main_inventory` (super admin / admin)

| Column | Type | Notes |
|---|---|---|
| (existing) | | `stock`, `allocated_stock`, prices, … |
| `returned_stock` | integer NOT NULL DEFAULT 0 | Company total returned — **not sellable** |

`main.returned_stock` = sum of `agent.returned_stock` for that SKU.

### 2. `agent_inventory` (team leader / mobile sales)

| Column | Type | Notes |
|---|---|---|
| (existing) | | `agent_id`, `variant_id`, `stock`, prices, … |
| `returned_stock` | integer NOT NULL DEFAULT 0 | That person’s returned holding — **not sellable** |

### 3. `client_order_returns` (header)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `return_number` | text | `CR-{INITIALS}-{YYYYMM}-000001` |
| `company_id` | uuid FK → `companies` | |
| `client_order_id` | uuid FK → `client_orders` | The ORD |
| `order_number` | text | Snapshot `ORD-2026-AB-0042` |
| `client_id` | uuid FK → `clients` | |
| `client_name` | text | Snapshot |
| `returned_by` | uuid FK → `profiles` | Who submitted it |
| `returned_by_name` | text | Snapshot |
| `original_agent_id` | uuid FK → `profiles` NULL | Seller on the ORD |
| `return_date` | date | Day goods came back |
| `reason` | text NOT NULL | `defect` / `duplicate_order` / `missing_parts` / or Other text |
| `notes` | text NULL | Extra explanation |
| `status` | text | `pending_leader` \| `posted` \| `rejected` \| `cancelled` |
| `agent_signature_url` | text NULL | Sign step |
| `approved_at` | timestamptz NULL | Set on approve / auto-post |
| `approved_by` | uuid FK → `profiles` NULL | |
| `approved_by_name` | text NULL | Snapshot for the **Approved by** column |
| `rejected_at` | timestamptz NULL | |
| `rejected_by` | uuid FK → `profiles` NULL | |
| `rejected_by_name` | text NULL | Snapshot for the **Rejected by** column |
| `rejection_note` | text NULL | Optional note on reject |
| `created_at` | timestamptz | When recorded |
| `updated_at` | timestamptz | |
| `cancelled_at` | timestamptz NULL | |
| `cancelled_by` | uuid FK → `profiles` NULL | |
| UNIQUE | `(company_id, return_number)` | |

### 4. `client_order_return_items` (returned SKUs)

Returned SKUs only. Cap **posted** qty ≤ sold qty on the original ORD line.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `return_id` | uuid FK → `client_order_returns` | CASCADE |
| `company_id` | uuid FK → `companies` | |
| `client_order_item_id` | uuid FK → `client_order_items` | Original sold line |
| `variant_id` | uuid FK → `variants` | Maps to both inventory tables |
| `brand_name` | text | Snapshot |
| `variant_name` | text | Snapshot |
| `variant_type` | text | Snapshot (flavor, battery, …) |
| `quantity` | integer CHECK &gt; 0 | |
| `unit_price` | numeric(10,2) | From the ORD line |
| `line_total` | numeric(10,2) | qty × unit price |
| `created_at` | timestamptz | |

### 5. `client_order_return_change_items` (exchange SKUs)

Always required. Match **brand + qty**, not price. Replacement from agent sellable stock.

After a real post: returned SKUs → **Returned** (not sellable). Change-item SKUs stay **Available / Stock**.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `return_id` | uuid FK → `client_order_returns` | CASCADE |
| `company_id` | uuid FK → `companies` | |
| `variant_id` | uuid FK → `variants` | |
| `brand_name` | text | Snapshot — same brand as returned qty |
| `variant_name` | text | Snapshot |
| `variant_type` | text | Snapshot |
| `quantity` | integer CHECK &gt; 0 | Per brand, sum(change) = sum(returned) |
| `created_at` | timestamptz | |

### 6. `client_order_return_attachments` (photos)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `return_id` | uuid FK → `client_order_returns` | CASCADE |
| `company_id` | uuid FK → `companies` | |
| `file_url` | text | Display URL |
| `file_path` | text | Storage path |
| `file_name` | text | |
| `content_type` | text | `image/jpeg`, … |
| `source` | text | `capture` \| `upload` |
| `sort_order` | integer DEFAULT 0 | |
| `uploaded_by` | uuid FK → `profiles` | |
| `created_at` | timestamptz | |

---

## Pattern: accordion vs dialog

| Surface | Pattern |
|---|---|
| Scanning a list (CR history, inventory returned-qty drill-in) | **Accordion** |
| Doing a return (qty, reason, photos, sign, confirm) | **Dialog** |
| Viewing one CR from a card Eye | **View dialog** (read-only Close) |

**Rule:** create return → wizard dialog. History list has **two view modes** (toggle from `lg`, saved in `localStorage`):

| Mode | What you get |
|---|---|
| **Table** | Accordion table. Expand in place. Horizontal scroll. |
| **Cards** | Card list. Eye (top-right) opens `ClientReturnViewDialog`. |

Approve / Reject live on the **list** (cards + table Action), not in the view dialog. Confirm with AlertDialogs (reject optional note). Mock local state only.

Inventory click on returned qty: **dialog shell**, accordion **inside** for CR rows. Do not stack dialog-on-dialog for that list.

---

## Create return dialog

File: `src/features/orders/client-returns/ReturnClientOrderDialog.tsx`

Opened from My Orders on an **approved** ORD (`status === 'approved'` or `stage === 'admin_approved'`).

Header always shows `ORD # · Client name`. Do **not** repeat order number or client name on each item card.

### Steps

1. Return Items
2. Change Items
3. Reason
4. Proof
5. Sign (agent signature only)
6. Review → type **client name** to post

Return Items and Change Items are grouped by **brand accordion**.

After Review, a confirm dialog requires typing the **client name** (case-insensitive trim), same idea as Create PO team-leader name confirm.

Wizard still toasts only (no DB). Submit is not yet switched to pending vs posted by role.

---

## Desktop tables (create return)

Always table. One table per brand, inside the brand accordion.

### Return Items

| Column | Align | Notes |
|---|---|---|
| Variant | left | SKU name |
| Type | left | Color badge (see below) |
| Sold | right | Original ORD qty |
| Already returned | right | Remaining = sold − **posted** returns |
| Return now | right | Number input, clamped. Helper: `max N` or `Max is N.` |

Qty cannot exceed remaining. Exceeding clamps and shows **Max is N.**

### Change Items

| Column | Align | Notes |
|---|---|---|
| Variant | left | Any SKU of that brand (order SKUs + dummy Replacement Mix) |
| Type | left | Color badge |
| Available | right | Mock sellable stock (not the word “Sellable”) |
| Change qty | right | Number input, clamped to `changeSkuMax()` |

Only brands with return qty &gt; 0 appear on this step.

### Review (desktop)

Returned table: Variant, Type, Qty (rose).  
Change item table: Variant, Type, Qty (emerald).

---

## Mobile cards (create return)

Component: `QtyInputCard` in `ReturnClientOrderDialog.tsx`.

Do **not** put order/client on the card. Header of the dialog already has that.

```
┌─────────────────────────────────────┐
│ Flavor A                    [Flavor]│  ← title left, type badge right
│                                     │
│ Sold              │ Already returned│  ← two stats, large numbers, divider
│ 12                │ 2               │
│                                     │
│ ┌─ tinted by type ────────────────┐ │
│ │ Return now                      │ │
│ │ helper text                     │ │
│ │                          [  3 ] │ │  ← full-width, right-aligned input
│ │ Max 10                          │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Card fields by step

| Step | Left stat | Right stat | Action title |
|---|---|---|---|
| Return Items | Sold | Already returned | Return now |
| Change Items | Available | Brand remaining | Change qty |

**Brand remaining** = that brand’s returned qty minus change qty already allocated on other SKUs of the same brand.

Tint of the action block (`inputTintClass`):

| Type | Background |
|---|---|
| Flavor | `bg-blue-50` |
| Battery | `bg-green-50` |
| POSM | `bg-purple-50` |
| FOC | `bg-orange-50` |
| NCV | `bg-pink-50` |
| other | `bg-muted/40` |

No extra icons on the card. Type badge is text only.

Input helper: `Max N`. If the user types over max: clamp + **Max is N.** Invalid field gets `border-destructive` + ring.

---

## Change qty rules

- Replacement can be **any SKU of the same brand**, not the same variant, not matched by price.
- Per brand, **change qty total must equal returned qty**.
- Each change input max is  
  `min(available, returnedQty − qty already allocated on other SKUs of that brand)`  
  Helper: `changeSkuMax()`.
- Example: return 1 Relx → max change on any Relx SKU is 1. After 1 is used, other Relx SKUs max at 0.
- If the user goes back and lowers return qty, extra change qty is reduced to match.

If brand available total &lt; returned qty → **Not enough stock** dialog, stay on Return Items.

After a real post (not mock):

- Returned SKUs → **Returned** (not sellable)
- Change-item SKUs → leave **Available / Stock**

---

## Type badge colors

From `variantTypeBadgeClass` in `ClientReturnBrandTable.tsx`. Use these everywhere (wizard, history, inventory drill-in).

| Type | Badge |
|---|---|
| Flavor | `bg-blue-100 text-blue-700` |
| Battery | `bg-green-100 text-green-700` |
| POSM | `bg-purple-100 text-purple-700` |
| FOC | `bg-orange-100 text-orange-700` |
| NCV | `bg-pink-100 text-pink-700` |

Display labels: Flavor, Battery, POSM, FOC, NCV.

---

## History list

File: `src/features/orders/client-returns/ClientOrderReturnsPage.tsx`

Route: `/client-order-returns`. Page size **25** (`ListPagination`).

Filters (chips, default **All**): All / Pending / Approve / Reject, with counts.

Search haystack: CR #, ORD #, client, returned by, status label, notes, rejection note, approved-by name, rejected-by name, brands.

### Table (desktop)

Accordion rows. Wrapper is `overflow-x-auto` with inner `min-w-[90rem]` so columns do not compress — **scroll the row horizontally**.

Chevron is outside the column grid. **Qty** and **Action** are shrink-0 siblings to the right of the grid (Action `w-[11.75rem]`, Qty `w-10`). Action column exists only for team leaders.

| Column | Width (grid) | Notes |
|---|---|---|
| Return | `11rem` | CR # (mono, semibold) stacked over ORD # (muted). Truncate, `title` tooltip. |
| Client | `9rem` | Truncate |
| Returned by | `8.5rem` | Who submitted |
| Returned date | `7.25rem` | Date only `MMM d, yyyy`. Always a column. |
| Brands | `9rem` | Secondary badges, truncate |
| Status | `6.5rem` | Pending / Approve / Reject badge |
| Approved by | `8.5rem` | Name + date under it, or — |
| Rejected by | `8.5rem` | Name + date under it, or — |
| Qty | `w-10` | Total units, rose, right, outside the grid |
| Action | `w-[11.75rem]` | **Team leader + pending only:** Reject / Approve. Empty for posted/rejected. Hidden for super admin / admin. |

Pending rows: amber left border on cards. Table Action shows both buttons.

Do **not** hide Returned date, Returned by, Brands, Approved by, or Rejected by — scroll instead.

### Accordion expand

Always show:

- **Returned date** (`MMM d, yyyy`)
- **Created** (`MMM d, yyyy · h:mm a`)
- **Reason** badge
- If decided: **Approved by** or **Rejected by** + full datetime

Then `ClientReturnExpandedMeta` + per-brand `BrandReturnedTable`.

### Cards

Eye is **top-right**, circular outline, view-only.

Each card:

- CR #, ORD #, Status badge
- Client name (heading)
- 2-col meta: Returned by, Returned date, Created, Returned brands, Approved by, Rejected by
- Reason badge + units
- Pending + team leader: full-width **Reject / Approve** under a border

### View dialog

File: `src/features/orders/client-returns/ClientReturnViewDialog.tsx`

View-only (Close). No Approve / Reject here.

Header: CR # · ORD # · client · qty.

Body is `ClientReturnExpandedMeta`:

```
Client name:    …
Agent name:     …
Returned date:  …
Created:        …
Status:         …
Approved by / at  (if posted)
Rejected by / at / Rejection  (if rejected)
Reason:         …
Notes:          …

Photo:
[thumb] [thumb]     ← click opens full-size dialog
```

Then per-brand tables (`BrandReturnedTable`):

| Column | Notes |
|---|---|
| Variant | |
| Type | Color badge |
| Qty | Rose, right |

Brand header: brand name + `{n} variants · {qty} qty`. Pagination default 25.

---

## Inventory returned-qty drill-in

File: `src/features/orders/client-returns/ReturnedStockDetailDialog.tsx`

Dialog from Main Inventory / My Inventory **Returned** click.

Inner CR rows: CR #, ORD #, Client, Returned date, Created, Reason, Qty.  
Expand uses the same meta + `BrandReturnedTable` as history.

---

## Validation (Next / stepper jump)

On missing/invalid field:

1. Scroll that control into view (`block: 'center'`).
2. Red border + ring.
3. Expand the brand accordion if the field is inside one.
4. Red clears when the user types or selects.

Targets: first return qty, first change SKU that can still take qty, reason / other / returned date / notes, proof photos, signature.

---

## Files

| File | Role |
|---|---|
| `ReturnClientOrderDialog.tsx` | Create-return wizard, desktop table + mobile `QtyInputCard` |
| `ClientOrderReturnsPage.tsx` | CR history list (table + cards, TL actions) |
| `ClientReturnViewDialog.tsx` | View one CR (meta + brand tables), view-only |
| `ReturnedStockDetailDialog.tsx` | Inventory returned-qty drill-in |
| `ClientReturnBrandTable.tsx` | Brand/variant table + type badges |
| `ClientReturnExpandedMeta.tsx` | Expand / view block: client, dates, status, actors, reason, notes, photos |
| `ClientOrderReturnTimeline.tsx` | Order timeline (returns as events) |
| `clientReturnMock.ts` | Dummy data + mock flag |

---

## RPCs (after migration)

| Function | Who | Result |
|---|---|---|
| `create_client_order_return(...)` | mobile sales, team leader | Sales → `pending_leader`. TL → `posted` + `returned_stock`. |
| `approve_client_order_return(id)` | team leader only | `pending_leader` → `posted` + stock |
| `reject_client_order_return(id, note)` | team leader only | Closes the CR. No stock move. |

Storage bucket: `client-order-return-proofs` (path `{company_id}/...`).

## Next (not built yet)

1. **Run the migration** in the SQL editor, then confirm tables/RPCs exist.
2. **Wire the UI** off mock (`SHOW_CLIENT_RETURN_MOCK`) to the RPCs + SELECT.
3. **Hide the feature** when the company is not warehouse-linked (menu + Return button), same gate as Return to Warehouse.
4. **Return-process timeline** on the ORD (submitted → pending leader → approved / rejected), not only a single “Return posted” event.
