# Client Order Returns — UI design

Visual mock only. Flag: `SHOW_CLIENT_RETURN_MOCK` in `src/features/orders/client-returns/clientReturnMock.ts`. Confirm does not write to the database.

Use this file as the source of truth for **tables, cards, and list columns** so the return UI stays consistent.

Breakpoint: **768px** (`useIsMobile()` in `src/hooks/use-mobile.tsx`).

- Desktop ≥ 768: **table**
- Mobile &lt; 768: **cards** (`QtyInputCard`)

No table/cards toggle. Layout follows viewport only.

**No migration yet.** Schema below is the agreed model for when we wire RPC. Do not FK inventory rows to returns — join `company_id` + `variant_id` (+ `agent_id` on agent inventory).

---

## Data model (agreed, not migrated)

Numbering: `CR-{INITIALS}-{YYYYMM}-000001` (RPC bumps from latest row for that company). Example: `CR-MTS-202609-000001`. Six-digit sequence (1–999999).

`reason` is **TEXT**, not an enum. UI options: Defect, Duplicate order, Missing parts, Other (free text).

**Status** exists on the header (`posted` | `cancelled`) for later void. The history UI currently **hides** Status because everything is posted.

Not in this schema yet (UI already mocks them — add when migrating):

- Change-item / exchange lines (always required; match brand + qty, not price)
- Agent signature
- Team leader approval (`pending_leader` → skip if TL created the ORD)

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
| `return_number` | text | `CR-{INITIALS}-{YYYYMM}-000001` (RPC bumps from latest row, 6-digit sequence) |
| `company_id` | uuid FK → `companies` | |
| `client_order_id` | uuid FK → `client_orders` | The ORD |
| `order_number` | text | Snapshot `ORD-2026-AB-0042` |
| `client_id` | uuid FK → `clients` | |
| `client_name` | text | Snapshot |
| `returned_by` | uuid FK → `profiles` | Who posted it |
| `returned_by_name` | text | Snapshot |
| `original_agent_id` | uuid FK → `profiles` NULL | Seller on the ORD |
| `return_date` | date | Day goods came back |
| `reason` | text NOT NULL | `defect` / `duplicate_order` / `missing_parts` / or Other text |
| `notes` | text NULL | Extra explanation |
| `status` | text | `posted` \| `cancelled` |
| `created_at` | timestamptz | When recorded |
| `updated_at` | timestamptz | |
| `cancelled_at` | timestamptz NULL | |
| `cancelled_by` | uuid FK → `profiles` NULL | |
| UNIQUE | `(company_id, return_number)` | |

### 4. `client_order_return_items` (SKU lines)

Returned SKUs only. Cap posted qty ≤ sold qty on the original ORD line.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `return_id` | uuid FK → `client_order_returns` | CASCADE |
| `company_id` | uuid FK → `companies` | |
| `client_order_item_id` | uuid FK → `client_order_items` | Original sold line |
| `variant_id` | uuid FK → `variants` | Maps to both inventory tables |
| `brand_name` | text | Snapshot |
| `variant_name` | text | Snapshot |
| `quantity` | integer CHECK &gt; 0 | |
| `unit_price` | numeric(10,2) | From the ORD line |
| `line_total` | numeric(10,2) | qty × unit price |
| `created_at` | timestamptz | |

### 5. `client_order_return_attachments` (photos)

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

**Rule:** create return → wizard dialog. History list has **two view modes** (toggle, saved in `localStorage`):

| Mode | What you get |
|---|---|
| **Table** | Accordion table. Expand in place. |
| **Cards** | Card list. Eye (top-right) opens `ClientReturnViewDialog`. |

Default: Cards on mobile, Table on desktop. User choice is remembered.

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

---

## Desktop tables (create return)

Always table. One table per brand, inside the brand accordion.

### Return Items

| Column | Align | Notes |
|---|---|---|
| Variant | left | SKU name |
| Type | left | Color badge (see below) |
| Sold | right | Original ORD qty |
| Already returned | right | Mock remaining = sold − already returned |
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

## History list table

File: `src/features/orders/client-returns/ClientOrderReturnsPage.tsx`

**No Status column.** A posted CR is live; Posted on every row adds nothing until cancel exists.

**View** (Eye) opens a dialog. No accordion on this page.

| Column | Notes |
|---|---|
| CR # | `CR-{INITIALS}-{YYYYMM}-000001` |
| ORD # | Original order |
| Client | Client name |
| Returned by | Agent who posted |
| Returned date | Date only (`MMM d, yyyy`) |
| Created | Date + time |
| Reason | Badge |
| Qty | Total units, rose, right |
| (Eye) | Opens view dialog |

Default page size **25**.

### Mobile (&lt; 768)

**Cards**. Eye icon is **top-right**.

Each card:

- CR # left, Eye right
- ORD #
- Client name
- Returned by / Returned date / Created (label–value rows)
- Reason badge + qty

### View dialog

File: `src/features/orders/client-returns/ClientReturnViewDialog.tsx`

Header: CR # · ORD # · client · qty.

Body:

```
Client name:  …
Agent name:   …
Reason:       …
Notes:        …

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
| `ClientOrderReturnsPage.tsx` | CR history list |
| `ClientReturnViewDialog.tsx` | View one CR (meta + brand tables) |
| `ReturnedStockDetailDialog.tsx` | Inventory returned-qty drill-in |
| `ClientReturnBrandTable.tsx` | Brand/variant table + type badges |
| `ClientReturnExpandedMeta.tsx` | Expand block: client, agent, reason, notes, photos |
| `ClientOrderReturnTimeline.tsx` | Order timeline (returns as events) |
| `clientReturnMock.ts` | Dummy data + mock flag |

---

## Next (not built yet)

1. **Team leader approval** of agent-submitted returns (`pending_leader` → approve / reject).
2. **Skip approval** when the team leader created the original order — auto-post.
3. **Return-process timeline** (submitted → pending leader → approved / rejected / posted), not only a single “Return posted” event.

Open questions:

- Reject: send back so the agent can edit and resubmit, or reject = closed CR?
- Pending list: new “Pending client returns” for the leader, or approve only from Client Order Returns?
