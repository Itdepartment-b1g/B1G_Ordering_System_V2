# Analytics — Client Returns (Refund, Change Item, Restock, Disposal)

**Status:** plan only. Do not implement until this file is picked up as a build ticket.

**Related:** [client-order-returns-ui.md](./client-order-returns-ui.md), [super-admin-workflow.md](./super-admin-workflow.md), [team-leader-workflow.md](./team-leader-workflow.md)

This is the Standard Account `/analytics` stack, **not** Key Account analytics (`/key-accounts/analytics`). KA already swaps change-item rebate SKUs. Copy that pattern; do not mix the two datasets.

---

## Warehouse link required (hard gate)

Client returns (`CR-…`) already only exist for warehouse-linked Standard Account companies (`canShowClientOrderReturns` → `hasWarehouseHubLink` / `get_linked_warehouse_company_id()`).

The refund / change-item / restock / disposal overlay is **the same gate**:

| Company | Analytics |
|---|---|
| **Linked to warehouse** | Gross orders **plus** posted CR overlay (this plan) |
| **Not linked** | Keep today’s gross-order analytics. No CR fetch, no extra columns, no Returns strip. |
| **Key Account / warehouse hub** | Out of scope |

Do not show return KPIs while `hasWarehouseHubLink` is false or still loading. Unlinked tenants have no `client_order_returns` UI, so there is nothing to overlay.

---

## Why this exists

Today Standard Account analytics is **gross orders only**. Loaders read `client_orders` + `client_order_items` and never join client returns (`CR-…`).

That means:

- A **refund** still counts as sold qty and revenue.
- A **change item** still counts the original SKU; the replacement SKU never appears.
- **Restock vs disposal** is invisible, even though stock already moves on `posted`.

Client returns are already live in:

| Piece | Where |
|---|---|
| Header | `client_order_returns` (`return_type` = `refund` \| `change_item`) |
| Returned lines | `client_order_return_items` (`unit_price`, `line_total`, `stock_fate`) |
| Replacement SKUs | `client_order_return_change_items` (qty only — **no price snapshot yet**) |
| Stock on post | `apply_client_order_return_posted_stock` |

`stock_fate` is independent of CR type. Refund and change-item can both restock or dispose.

---

## Surfaces to update (all of them)

Shared date/status rules already live in `src/features/analytics/orderListAnalyticsHelpers.ts`. Returns must go through the **same helper**, then every consumer, or numbers will drift.

| Surface | File(s) | What breaks if we skip it |
|---|---|---|
| City / product tabs | `AnalyticsPage.tsx` | Brand/city qty + ₱ stay gross |
| Agent KPIs | `loadAgentKPIs.ts`, `AgentAnalyticsTab.tsx` | Agent revenue/qty stay gross |
| Standalone product page | `ProductAnalyticsPage.tsx` (`/product-analytics`) | Duplicate product table stays gross |
| Client drill-down | `ClientAnalyticsPage.tsx` (`/analytics/client/:id`) | Client “spent” stays gross |
| Excel | `exportProductAnalyticsExcel.ts`, `exportCityAnalyticsExcel.ts`, `exportAgentAnalyticsExcel.ts` | Exports disagree with screen |
| Order list helpers | `orderListAnalyticsHelpers.ts` | Fetch + status buckets |

Do **not** change Key Account analytics in this ticket.

---

## Counting rules (locked)

Only **`status = 'posted'`** CRs affect analytics. Pending / rejected / cancelled do nothing.

Pending refunds (`pending_super_admin`, `pending_finance`) are cash not yet paid. Do not reduce revenue until Finance posts.

### 1. Refund (`return_type = 'refund'`)

Client paid, then got money back. Original order lines stay in the DB; we overlay a **negative adjustment**.

For each posted refund line:

- **Qty:** subtract `quantity` from the original SKU.
- **Revenue:** subtract `line_total` (fallback `qty × unit_price`). Same formula as `getClientReturnRefundAmount`.
- **Agent:** `original_agent_id` (fallback `returned_by`).
- **Client / city / order:** join `client_order_id`.

Replacement SKUs do not exist on refunds.

### 2. Change item (`return_type = 'change_item'`)

Client kept a different SKU. Same overlay pattern as KA `buildRebateSwapByPoItemId` / `buildKeyAccountProductAnalyticsRows`.

For each posted change-item CR:

- **Returned SKU:** subtract qty + original line ₱ (same as refund).
- **Replacement SKU:** add qty to the change-item variant.
- **Replacement ₱:** use a **snapshot on the change line** (see gap below). Until that column exists, do not guess from live `agent_inventory` prices — those change later.

Net company revenue for a change-item is usually near zero if qty matches and prices match. Analytics still **must move qty between SKUs**, or product/brand charts stay wrong.

### 3. Restock vs disposal (`stock_fate` on returned lines)

This is **inventory fate**, not a third return type. It does **not** change the refund vs change-item revenue rule above.

| Fate | Stock already (on post) | Analytics meaning |
|---|---|---|
| `restock` | Qty goes back to the holder’s **sellable** `agent_inventory.stock` | Not a write-off. Optional “returned to bag” qty. |
| `disposal` | Qty goes to `returned_stock` / RL holds | Unsellable write-off. Count in disposal KPIs. |

Use this for return-quality / inventory KPIs, **not** for double-counting revenue.

Change-item replacements still deduct from the filer’s sellable bag either way.

---

## Date attribution (locked)

Two clocks, two views. Default the existing tabs to **net sales**.

| View | Date used | Purpose |
|---|---|---|
| **Net sales** (default on Cities / Products / Agents / Client) | Original `client_orders.order_date` | “What did this agent/SKU/city actually keep in that period?” |
| **Returns activity** (new breakdown / optional tab) | CR `approved_at` (posted timestamp) | “What came back / was refunded / restocked / disposed this month?” |

Example: order in August, refund posted in September.

- August net sales: original sale minus the refund.
- September returns activity: refund ₱ + returned qty.
- Do **not** subtract August and also subtract September on the same KPI, or we double-count.

KPI cards should show **Gross** (orders only) and **Net** (orders − posted returns + change-item replacements) so Super Admin can see the gap.

---

## Known schema gap (do this first)

`client_order_return_change_items` has qty, not price.

Add on create/post (migration + RPC):

- `unit_price numeric(10,2) not null default 0`
- `line_total numeric(10,2) not null default 0`

Snapshot the filer’s bag price at submit (`agent_inventory.allocated_price`, then DSP/RSP if that was the order strategy). Without this, product revenue for replacements is not auditable.

Returned lines already have `unit_price` / `line_total` from the original ORD. Do not rewrite those.

---

## Implementation (concrete)

### Step 1 — Shared adjustment module

New file: `src/features/analytics/clientReturnAnalyticsAdjustments.ts`

Responsibilities:

1. Fetch posted CRs for `company_id` (paginate like existing helpers).
2. Join items + change items + parent order (`order_date`, `agent_id`, `client_id`, city if needed).
3. Build maps keyed the same way current analytics rows are keyed:

```ts
type ReturnAdjustment = {
  variantId: string;
  brandName: string;
  variantName: string;
  agentId: string | null;
  clientId: string | null;
  orderId: string;
  orderDate: string;      // net-sales clock
  postedAt: string;       // activity clock
  returnType: 'refund' | 'change_item';
  stockFate: 'restock' | 'disposal';
  returnedQty: number;
  returnedRevenue: number;
  replacementQty: number;
  replacementRevenue: number;
};
```

4. Helpers:

- `adjustProductRows(rows, adjustments, view)`
- `adjustAgentKpis(kpis, adjustments, view)`
- `adjustCityRows(...)`
- `sumReturnKpis(adjustments)` → refunded ₱, change-item qty, restocked qty, disposed qty

Reuse `fetchAllPaginated`. Filter by company through the order join / `client_order_returns.company_id`.

**Posted-only SQL shape:**

```sql
SELECT
  cr.id, cr.return_type, cr.status, cr.approved_at, cr.return_date,
  cr.original_agent_id, cr.returned_by, cr.client_id, cr.client_order_id,
  co.order_date, co.agent_id, co.total_amount,
  i.variant_id, i.quantity, i.unit_price, i.line_total, i.stock_fate,
  i.client_order_item_id
FROM client_order_returns cr
JOIN client_orders co ON co.id = cr.client_order_id
JOIN client_order_return_items i ON i.return_id = cr.id
WHERE cr.company_id = :companyId
  AND cr.status = 'posted';
```

Plus a second fetch for `client_order_return_change_items`.

### Step 2 — Wire every loader

Order of wiring (so QA can check one tab at a time):

1. `fetchProductOrderItemsForDateRange` / product tab + `/product-analytics`
2. City tab (`fetchCityOrderItemsForDateRange`)
3. `loadAgentKPIs` + `AgentAnalyticsTab`
4. `ClientAnalyticsPage`
5. Excel exporters (same adjusted rows the UI uses — do not re-query a different formula)

Keep existing approved/pending buckets. Returns only overlay **approved** posted sales. Do not apply CR adjustments to pending orders.

### Step 3 — UI on existing `/analytics`

Do not hide returns in a separate app. Add to the current page:

**Summary strip (all tabs)**

- Gross revenue
- Refunded ₱
- Change-item returned qty / replacement qty
- Net revenue
- Restocked qty
- Disposed qty

**Product / city tables — extra columns (can start collapsed)**

- Returned qty
- Refunded ₱
- Change-item in (replacement qty)
- Restocked
- Disposed
- Net qty / net ₱

**Toggle:** `Show net (default)` vs `Gross orders only`. Persist in `localStorage` (`analytics-returns-view`).

**Optional later tab:** `Returns` — one row per posted CR, filterable by type + fate. Nice for Finance/SA; not required to make KPIs correct.

### Step 4 — Excel

Add the same extra columns. Header note: `Figures are net of posted client returns (CR). Pending returns excluded.`

---

## Worked examples

### Refund + disposal

ORD sold 10 Menthol @ ₱150. Posted refund 2 pcs, `stock_fate = disposal`.

| | Qty | ₱ |
|---|---|---|
| Gross | 10 | 1,500 |
| Refund overlay | −2 | −300 |
| **Net sales** | **8** | **1,200** |
| Returns activity | disposed 2 | refunded ₱300 |

Sellable bag does not get the 2 back.

### Change item + restock

ORD sold 5 Menthol @ ₱150. Posted change-item: return 5 Menthol (restock), give 5 Iced Cola @ ₱150.

| SKU | Gross qty | Net qty | Net ₱ |
|---|---|---|---|
| Menthol | 5 | 0 | 0 |
| Iced Cola | 0 | 5 | 750 |

Menthol 5 goes back to the bag (restock). Iced Cola 5 leaves the filer’s bag.

### Mixed fate on one CR

Allowed by schema (per line). Analytics must group by `stock_fate` per line, not per header.

---

## What not to do

- Do not mutate `client_orders.total_amount` or `client_order_items` when a CR posts. Overlay only.
- Do not treat `inventory_transactions.transaction_type = 'client_order_return'` as the analytics source. Use CR tables (typed, priced, statused).
- Do not count `pending_finance` refunds as revenue out.
- Do not apply restock as extra **sales** qty.
- Do not reuse Key Account rebate math against Standard Account CRs.
- Do not overlay CRs for companies that are not warehouse-linked.

---

## QA checklist

- [ ] Posted refund reduces product, agent, city, client net ₱ and qty.
- [ ] Pending refund does not.
- [ ] Posted change-item moves qty from returned SKU to replacement SKU.
- [ ] Restock vs disposal KPIs match `stock_fate` on posted lines.
- [ ] August sale + September refund: August net drops; September activity shows the refund; company all-time net drops once.
- [ ] Excel matches on-screen net.
- [ ] Team leader `/analytics` only sees their team’s agents (existing scope) including those agents’ CRs.
- [ ] **Unlinked company:** no return strip / extra columns; numbers stay gross orders only.
- [ ] **Linked company:** posted CR overlay applies; still company-scoped (not warehouse hub stock).

---

## Suggested build order

1. Snapshot `unit_price` / `line_total` on change items (migration + create RPC).
2. Shared adjustment helper + unit tests with the three examples above.
3. Product tab + product Excel.
4. City, agent KPI, client page, remaining Excel.
5. Summary strip + gross/net toggle.
6. Optional Returns activity tab.

---

## Open follow-ups (out of this plan)

- War Room / Super Admin dashboard KPI cards still use order totals — same overlay later.
- Finance `/finance` `financial_transactions` does not yet get a refund row on CR post. If that is added, analytics should still use CR tables as source of truth, not duplicate cash rows.
