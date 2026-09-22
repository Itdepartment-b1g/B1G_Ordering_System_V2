# Company Price Update — Super Admin Set, Agent Cascade, TL + Mobile Sales Agreement, Flattened History

**Status:** in build on `release/v3/b1g-ordering-system/company-price-update-field-agreement`.

**Related:** [super-admin-workflow.md](./super-admin-workflow.md), [team-leader-workflow.md](./team-leader-workflow.md), System Settings (`/system-settings`)

Scope is **one tenant** (`profiles.company_id` / `companies.id`). Super Admin sets selling / DSP / RSP for a brand or variant. After **Team Leaders and Mobile Sales** review and confirm, every agent bag under that company gets the same prices.

This is **not** System Administrator (platform) pricing. This is **not** Key Account rebate replacement pricing.

---

## Warehouse link required (hard gate)

This whole feature — batch create, field agreement, agent cascade, flattened history — is **only for Standard Account companies linked to a warehouse hub**.

Same check as client returns and hub POs:

- UI: `usePermissions().hasWarehouseHubLink` (`get_linked_warehouse_company_id()`)
- DB: `warehouse_company_assignments` has a row for this sales `company_id`

| Company | What they get |
|---|---|
| **Linked to warehouse** | Batch price update + TL **and** Mobile Sales confirm + cascade to all agent bags + flattened history |
| **Not linked** | **No new UI, no RPCs, no history.** Keep today’s Main Inventory single/bulk price edit on `main_inventory` only. Do not cascade to agents. |
| **Warehouse role / hub company** | Out of scope. Hub does not set tenant bag prices. |

RPCs must refuse if `get_linked_warehouse_company_id()` is null (`success: false`, error like `Only warehouse-linked companies can push company prices`). Hide sidebar items and Main Inventory batch dialog while `hasWarehouseHubLink` is false (and while that query is loading).

Catalog for linked tenants is warehouse-owned (`/brands` may be hidden). Selling / DSP / RSP still live on **tenant** `main_inventory` — that is what this flow updates, not warehouse hub cost.

---

## Why this exists

Today Super Admin can already bulk-edit prices on **Main Inventory only**:

- UI: `MainInventoryPage.tsx` → bulk price dialog (flavors or batteries of one brand)
- Write path: `inventoryService.updateVariant()` → `main_inventory.selling_price / dsp_price / rsp_price`
- `unit_price` (cost) is left alone

What does **not** happen:

- `agent_inventory` rows keep the prices copied at **allocation time** (`allocated_price` ← main `selling_price`, plus `dsp_price` / `rsp_price`). See `allocate_to_leader` / stock-request approve RPCs.
- There is no readable history of “RELX Menthol selling ₱120 → ₱150”.
- Field sellers are not asked to confirm, so bags can stay on old prices while main is new (or, if we cascade blindly, bags change with no sign-off). Today teams often return stock just to re-allocate at new prices — this flow removes that.

Orders already **snapshot** `client_order_items.unit_price` at submit. Historical ORDs must not change when prices update.

**Per-variant prices:** variants under one brand may differ. History is always **one row per SKU** with that SKU’s old→new Selling / DSP / RSP — never a single brand-level price.

---

## Locked product rules

1. Company **must** be warehouse-linked. If not, stop — do not create a batch.
2. Super Admin (and Admin if we keep current Main Inventory access) creates a **price change batch** for the company.
3. Scope is always `company_id`. Every `agent_inventory` row for those `variant_id`s under that company is in play — leaders and mobile sales.
4. Columns that move:

   | Location | Columns |
   |---|---|
   | `main_inventory` | `selling_price`, `dsp_price`, `rsp_price` |
   | `agent_inventory` | `allocated_price` (selling), `dsp_price`, `rsp_price` |

   Do **not** bulk-overwrite `main_inventory.unit_price` (cost).
5. **Both** active Team Leaders **and** Mobile Sales must **review and confirm** before their bags use the new prices. Each confirmer’s bag updates **on their confirm**; the batch closes when everyone has confirmed.
6. History is **flat one row per SKU**, not nested JSON from `system_audit_log`.
7. **One open `pending_agreement` batch** per company. Further SA price edits **append** into that batch (upsert by `variant_id`). Confirm once covers the whole flat list until you ack. If SA appends **after** you confirmed, your agreement resets to `pending` and you must confirm again. UI badges: **New** vs **Confirmed** (item `updated_at` ≤ your `last_confirmed_at`).

### Who must confirm

| Role | Confirms? |
|---|---|
| `team_leader` | Yes |
| `mobile_sales` | Yes |
| Super Admin / Admin | No (they create / append the batch) |

Full company “applied” status runs when **every** pending agreement for the batch is confirmed. Individual bags already updated on each confirm.

---

## Recommended workflow (locked)

Main inventory can go live immediately so **new allocations** already use the new price. Each Team Leader / Mobile Sales bag updates **when that person confirms** (not only after everyone confirms). The batch stays `pending_agreement` until all have confirmed (or SA cancels).

```mermaid
flowchart TD
  SA[Super Admin sets brand or variant prices]
  Batch[Insert price-change batch: pending_agreement]
  Main[Apply to main_inventory now]
  Notify[Notify every active team_leader and mobile_sales in company]
  Field[Each TL and MS opens flattened list and confirms]
  Wait{All agreements confirmed?}
  Agents[That confirmer bag updates immediately]
  Hist[Flattened history row per SKU stays forever]
  Done[Batch status: applied when last confirm]

  SA --> Batch --> Main --> Notify --> Field
  Field --> Agents
  Field --> Wait
  Wait -->|no| Field
  Wait -->|yes| Done
  Agents --> Hist
  Done --> Hist
```

### Edge cases

| Case | Behavior |
|---|---|
| Company has **zero** TLs and **zero** Mobile Sales | Auto-confirm. Apply agent cascade in the same RPC as main. |
| New TL or MS created after batch is pending | Include them; they must confirm too. |
| TL or MS deactivated / resigned while pending | Drop from required set; remaining active agreements are enough. |
| One TL or MS rejects | **Not available.** Field can only confirm. SA cancels from Price History if needed. |
| SA needs to abort | `cancelled` — main prices **revert to `old_*` on the batch items** if agent cascade never ran. **Prefer: cancel = revert main + do not touch agents.** |
| SA edits more prices while a batch is pending | **Append** into the open batch (same `batch_number`). Upsert item by variant; bump `updated_at`. Confirmed agreements reset to `pending` so those users re-confirm. |
| Agent has no row for that variant | Skip. Price will copy on next allocation from main. |
| Company **not** warehouse-linked | Feature off. Existing Main Inventory price edit only; no batch / agreement / cascade. |
| Link added later | Feature turns on from that day. No backfill of old price edits into history. |
| Link removed later | Hide UI; in-flight `pending_agreement` batches cannot apply agents until linked again (or SA cancels). |

### Why not “apply agents immediately, field only acks”

Silent bag-price changes while agents are on the road will mismatch printed price lists and ORD snapshots vs bag UI. Confirmation-before-cascade is the safer default — including Mobile Sales, who sell from their own bags.

### Why not “wait for agreements before main”

New stock requests would still allocate at the old selling price, then jump later. Main-first keeps “official company price” and “field bag price” in a known two-step state (batch shows `main_applied` / `pending_agreement`).

### Why TL **and** Mobile Sales (not TL-only)

Mobile Sales hold their own `agent_inventory` and must explicitly agree to sell at the new Selling / DSP / RSP. TL confirm alone is not enough for field bags they do not control day-to-day.

---

## What Super Admin sets in the UI

Extend Main Inventory (do not invent a second catalog). **Only render the batch dialog / “push to agents” CTA when `hasWarehouseHubLink` is true.** Unlinked companies keep the current immediate `updateVariant` price fields.

**Entry points**

1. Existing bulk dialog on a brand (flavors / batteries / POSM — include POSM; today it is skipped).
2. Single variant edit dialog — same batch machinery, one SKU.
3. Optional: “Set prices for this brand (all types)”.

**Dialog fields per SKU (or one value applied to all selected SKUs)**

- Selling price
- DSP
- RSP
- Optional note (“promo 9/18”, “supplier increase”)

Show **current** main prices and a preview table:

```
Brand     Variant      Type     Selling now → new    DSP now → new    RSP now → new
RELX      Menthol      flavor   ₱120 → ₱150          ₱100 → ₱110      ₱135 → ₱160
RELX      Iced Cola    flavor   ₱120 → ₱145          ₱100 → ₱105      ₱135 → ₱155
```

(Variants may have different new prices in the same batch.)

Submit creates **one batch** with N flattened item rows, or **appends** into the company’s open `pending_agreement` batch if one already exists. Confirm copy:

> This updates Main Inventory now. Team Leaders and Mobile Sales must confirm before bags use the new price. Further edits today append to the same open list.

SA / Admin progress chip example: `Confirmed 8 / 12 (2 TL · 6 MS)`. Toast when appending: “Added to open price batch” (+ how many confirmers must confirm again).

---

## Field agreement (Team Leader + Mobile Sales)

New page, e.g. `/inventory/price-agreements` (sidebar under Inventory for `team_leader` **and** `mobile_sales`, **only if `hasWarehouseHubLink`**). Same gate as TL hub PO receive / client returns.

**Inbox:** batches in `pending_agreement` for this `company_id` where the current user still has a `pending` agreement row.

Each batch is a **flattened table** with a Status column (**New** / **Confirmed** for this user’s last confirm):

| Status | Brand | Variant | Type | Selling | DSP | RSP |
|---|---|---|---|---|---|---|
| New | RELX | Menthol | flavor | ₱120 → ₱150 | ₱100 → ₱110 | ₱135 → ₱160 |
| Confirmed | RELX | Iced Cola | flavor | ₱120 → ₱145 | ₱100 → ₱105 | ₱135 → ₱155 |

Actions:

- **Confirm once** for the whole list — requires checkbox: “I reviewed these prices and agree to sell at the new Selling / DSP / RSP for brands and variants I hold.” Your bag updates immediately; others may still be pending.
- If SA appends after you confirmed, the gate returns and you confirm again (New rows highlighted).
- Field users **cannot reject**. Super Admin / Admin **cancel** a pending batch (reverts main). A blocking confirm dialog appears on any page until each TL / MS has an up-to-date confirm.

Notifications: existing `notifications` table, `reference_type = 'company_price_change_batch'`, **one row per active TL and per active Mobile Sales** (on create and when append resets confirmers).

---

## Flattened history (what users read)

Do **not** send people to System History JSON (`old_data` / `new_data` on `system_audit_log`). That is unreadable for “what brand/variant changed.”

Dedicated history page, e.g. `/inventory/price-history`, also linked from the batch after apply. Sidebar + route: warehouse-linked only.

**One row = one SKU in one batch.** Expandable batch header is OK; the SKU rows stay flat.

Example (exactly the shape we want):

```
Batch PCB-MTS-202609-000003    18 Sep 2026 15:02    Super Admin Juan Dela Cruz    Applied
Note: Supplier increase

Brand / Variant / Type          Selling              DSP                 RSP
RELX / Menthol / flavor         ₱120.00 → ₱150.00    ₱100.00 → ₱110.00   ₱135.00 → ₱160.00
RELX / Iced Cola / flavor       ₱120.00 → ₱145.00    ₱100.00 → ₱105.00   ₱135.00 → ₱155.00
FOGER / Classic / flavor        ₱80.00 → ₱80.00      ₱70.00 → ₱72.00     ₱90.00 → ₱90.00   (DSP only)

Agreements
  Maria Santos (team_leader)      Confirmed  18 Sep 15:10
  Pedro Reyes (team_leader)       Confirmed  18 Sep 15:22
  Ana Cruz (mobile_sales)         Confirmed  18 Sep 15:30
  Ben Lim (mobile_sales)          Confirmed  18 Sep 15:41

Agents updated: 12 bags (Menthol), 9 bags (Iced Cola), 12 bags (Classic)
```

Filters: brand, variant, date range, who created, status.

Export Excel with those same columns (not JSON).

Still write a **single** `system_audit_log` row per batch for the existing audit page (`table_name = 'company_price_change_batches'`). Humans use the flattened page.

---

## Data model

Numbering: `PCB-{COMPANY_INITIALS}-{YYYYMM}-000001` (same style as `CR-…`).

### 1. `company_price_change_batches`

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `company_id` | FK companies |
| `batch_number` | unique per company |
| `status` | `pending_agreement` \| `applied` \| `rejected` \| `cancelled` |
| `note` | text null |
| `created_by` / `created_by_name` | Super Admin snapshot |
| `created_at` | |
| `main_applied_at` | when main_inventory was written |
| `agents_applied_at` | when agent cascade ran |
| `cancelled_at` / `cancelled_by_name` | |
| `rejected_at` / `rejection_note` | |

### 2. `company_price_change_items` (flattened history source)

One row per variant in the batch. **Store names as snapshots** so history still reads after a rename.

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `batch_id` | FK |
| `company_id` | |
| `brand_id` / `brand_name` | snapshot name |
| `variant_id` / `variant_name` | |
| `variant_type` | flavor / battery / posm |
| `old_selling_price` / `new_selling_price` | |
| `old_dsp_price` / `new_dsp_price` | |
| `old_rsp_price` / `new_rsp_price` | |
| `agent_rows_updated` | integer, filled on cascade |

Skip inserting a row if all three new prices equal old (no-op). If SA types the same selling but a new DSP, keep the row — history should show “DSP only”.

### 3. `company_price_change_agreements`

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `batch_id` | |
| `company_id` | |
| `profile_id` / `profile_name` | snapshot of who must agree |
| `profile_role` | snapshot: `team_leader` \| `mobile_sales` |
| `status` | `pending` \| `confirmed` \| `revoked` |
| `confirmed_at` | |
| `note` | optional |

Unique `(batch_id, profile_id)`.

Create one pending agreement per **active** profile in the company when the batch is submitted where:

- `profiles.company_id` matches
- `profiles.role` is `team_leader` **or** `mobile_sales`
- profile status is active

Do **not** skip Mobile Sales.

---

## RPCs (do not cascade from the browser)

All writes go through security-definer functions. RLS on the three tables: company members can SELECT; only RPCs INSERT/UPDATE.

### `create_company_price_change_batch(p_items jsonb, p_note text)`

Caller: `super_admin` (and `admin` if Main Inventory already allows them).

1. Require warehouse link (`get_linked_warehouse_company_id()` not null). Else return error.
2. Lock company. If an open `pending_agreement` batch exists → **append** mode (`appended: true`).
3. For each item, read current main prices into `old_*` (on upsert of existing SKU in the open batch, keep original `old_*`, replace `new_*`, bump `updated_at`).
4. Insert batch (if new) + upsert items + ensure agreement rows for every active TL **and** Mobile Sales. On append: reset already-`confirmed` agreements to `pending` (`reset_confirmed_count`).
5. Update `main_inventory` for those `variant_id` + `company_id`.
6. Notify recipients (create or re-notify on reset).
7. If zero agreements (no TL and no MS): call apply-agents internally (`auto_applied: true`).

### `confirm_company_price_change(p_batch_id uuid)`

Caller: `team_leader` **or** `mobile_sales` of that company, and they must own a pending agreement on the batch. Same warehouse-link check.

1. Mark that profile’s agreement confirmed; set `last_confirmed_at = now()` (used for New vs Confirmed badges).
2. **Immediately** update that profile’s `agent_inventory` for the batch variants (new Selling → `allocated_price`, DSP, RSP).
3. If every remaining agreement is confirmed → `apply_company_price_change_to_agents` (company-wide sweep + status `applied`).

### `apply_company_price_change_to_agents(p_batch_id uuid)`

Internal / SA retry.

```sql
UPDATE agent_inventory ai
SET
  allocated_price = i.new_selling_price,
  dsp_price = i.new_dsp_price,
  rsp_price = i.new_rsp_price,
  updated_at = now()
FROM company_price_change_items i
WHERE i.batch_id = p_batch_id
  AND ai.company_id = i.company_id
  AND ai.variant_id = i.variant_id;
```

Updates **all** company bags for those variants (TL bags + MS bags). Confirmation is the gate; cascade is company-wide for the SKUs in the batch.

Count rows per variant into `agent_rows_updated`. Set batch `applied`.

### `cancel_company_price_change(p_batch_id uuid)` / `reject_company_price_change(...)`

If `agents_applied_at` is null: revert main to `old_*`, status `cancelled` / `rejected`.

If agents already applied: **do not silently revert bags**. Status stays `applied`; SA must file a **new** batch to roll forward/back (that new batch is itself history). Document this in the UI.

---

## App files to add/touch

| Area | Path |
|---|---|
| SA create UI | `src/features/inventory/MainInventoryPage.tsx` (replace direct `updateVariant` price writes for this flow) |
| Field inbox | `src/features/inventory/PriceAgreementPage.tsx` + `PriceChangeConfirmGate.tsx` + `PriceChangeItemsFlatTable.tsx` |
| Flattened history | `src/features/inventory/PriceHistoryPage.tsx` |
| API | `src/features/inventory/companyPriceChangeApi.ts` |
| Migrations | `supabase/migrations/20260922120000_*.sql` … `20260922150000_cpc_append_open_batch.sql` |
| Routes | `App.tsx` — `/inventory/price-agreements`, `/inventory/price-history` |
| Sidebar | `AppSidebar.tsx` + `roleMenuHelper.ts` (gate with `hasWarehouseHubLink`; show agreements for `team_leader` and `mobile_sales`) |
| Notifications | `notification.helpers.ts` href → agreements page |

Keep `updateVariant` for **name / stock / single-SKU non-batch edits** until those also move onto the batch (optional follow-up: even single variant price edits must use the batch so history is complete). **Recommendation:** any change to selling/DSP/RSP goes through the batch, including the single-variant dialog.

---

## What does **not** change

- Past `client_order_items.unit_price` / `total_amount`.
- Company pricing **permissions** (`team_leader_allowed_pricing` / `mobile_sales_allowed_pricing` on `/system-settings`). Those only control which column the agent may pick when creating an ORD. After cascade, the numbers **inside** those columns are the new ones.
- Warehouse hub cost / PO prices. This flow only writes tenant `main_inventory` + that tenant’s `agent_inventory`.
- Key Account product prices.
- Unlinked Standard Account companies (they keep the old Main Inventory price edit).

---

## QA checklist

- [ ] SA sets all flavors of brand X → one batch, N flattened rows, main updates immediately.
- [ ] Agent My Inventory still shows old selling/DSP/RSP until **every TL and every Mobile Sales** confirms.
- [ ] After last confirmation, all company bags for those variants match main.
- [ ] History page reads “RELX / Menthol / flavor — Selling ₱120 → ₱150” without opening JSON.
- [ ] History lists confirmers with role (`team_leader` / `mobile_sales`).
- [ ] Same batch can contain different new prices per variant.
- [ ] New ORD after apply uses new bag price; old ORD still shows old line ₱.
- [ ] Cancel / reject before full confirm reverts main; bags untouched.
- [ ] Zero-TL and zero-MS company applies bags in the same submit.
- [ ] New MS hired while batch pending must confirm before cascade.
- [ ] Excel history matches the table.
- [ ] **Unlinked company:** no batch CTA, no price-agreement / price-history menu, RPC rejected.
- [ ] **Linked company:** batch + TL/MS confirm updates tenant `main_inventory` then all agent bags.

---

## Suggested build order

1. Migration: three tables + RPCs + RLS + numbering (`pending_agreement`, agreements for TL + MS).
2. Flattened history page (read-only) — prove the row shape first.
3. SA create batch from Main Inventory (main apply + pending agreements for TL and MS).
4. Field agreement page + notifications (both roles).
5. Agent cascade RPC + counts on history rows.
6. Block leftover direct price updates in `updateVariant` / bulk dialog so nothing bypasses history.
