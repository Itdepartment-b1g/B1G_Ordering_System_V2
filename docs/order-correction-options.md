# Order Correction Options (Pending Finance Review)

This document defines two safe ways to correct orders that were submitted with incorrect products/quantities (e.g., wrong line items) while keeping **inventory** and **revenue** accurate.

## Background (current behavior in this codebase)

- **Agent inventory is deducted on submission (pending stage)** via frontend logic in `src/features/orders/OrderContext.tsx` (`addOrder()` subtracts from `agent_inventory` after inserting `client_orders` + `client_order_items`).
- **Main inventory is deducted on approval** via DB function `approve_order_and_verify_deposit(...)` (`supabase/create_approve_order_and_verify_deposit_function.sql` deducts from `main_inventory.stock` and `main_inventory.allocated_stock`).
- **Reject currently does _not_ restore stock**: `reject_client_order(...)` currently updates only `client_orders.status/stage/notes` and does not add back inventory (see `supabase/create_reject_client_order_function.sql`).

Because of the above, any “Reject” or “Return for revision” action that’s meant to *undo* a pending order must **explicitly restore agent inventory** (server-side).

---

## Option 1 — Reject = “Cancel Order”

### Goal
Use **Reject** only when the order should **not proceed at all**. A corrected transaction is created as a **new order** (new order number).

### Correct conditions
- **Allowed** when the order is **not yet approved**:
  - Typical states in UI: **Pending Finance Review** (`stage = 'finance_pending'`, `status = 'pending'`)
  - Also possible: `stage = 'agent_pending'` / other pre-approval stages
- **Not recommended** as a “fix my items” workflow (use Option 2 for that).

### Required behavior (Pending / Not Approved)
When finance/admin rejects an order that is still pending:

- **Order state**
  - Set `client_orders.status = 'rejected'`
  - Set `client_orders.stage = 'admin_rejected'` (or your canonical rejected stage)
  - Store a rejection reason (append to notes or structured column)

- **Inventory**
  - **Restore agent inventory** for the order’s `agent_id`:
    - For each `client_order_items` row:
      - `agent_inventory.stock += client_order_items.quantity`
  - **Main inventory**: **no changes** (because it was not deducted yet)
  - **Leader inventory**: **no changes** (not deducted by current submit flow)
  - (Recommended) write an `inventory_transactions` audit entry per item, e.g. `transaction_type = 'order_rejected_restore'`.

- **Revenue**
  - Ensure revenue reporting logic counts only `client_orders.status = 'approved'`.
  - Rejected orders must be excluded from revenue dashboards/exports.

### Required behavior (If the order was already Approved)
If the order was already approved (or if any approval-side effects ran), then “Reject = Cancel” becomes a **reversal** and must additionally:

- **Restore main inventory**
  - For each `client_order_items` row:
    - `main_inventory.stock += quantity`
    - `main_inventory.allocated_stock += quantity` (if you decrement it during approval)
- **Financial side effects**
  - If approval verifies cash deposits / marks financial transactions complete, define a clear reversal policy:
    - void / refund / reversal transaction
  - Do not silently change history without audit entries.

### Outcome
- Inventory accuracy:
  - **Pending order**: agent inventory restored → all inventories accurate.
  - **Approved order**: only accurate if you also implement approval-side reversal.
- Correction:
  - Agent creates a **new corrected order** (new order number).

---

## Option 2 — Re-evaluate / Return to Agent = “Needs Revision”

### Goal
Send the order back to the agent for correction **without cancelling the transaction intent**. Typically keeps the **same order number** and follows a “revise then resubmit” workflow.

### Correct conditions
- **Only allowed before approval**:
  - Recommended when the order is **Pending Finance Review** (`stage = 'finance_pending'`)
  - Should not be allowed once approved, unless you design a full “post-approval amendment” workflow (separate project).

### Required behavior (Return for revision)
When finance/super-admin/team-leader returns the order for correction:

- **Order state**
  - Set a “revision needed” state. Two common patterns:
    - **Pattern A (reuse existing stages)**:
      - Keep `status = 'pending'`
      - Set `stage = 'agent_pending'` (or a stage that routes back to agent)
    - **Pattern B (new stage)**:
      - Keep `status = 'pending'`
      - Set `stage = 'needs_revision'`
  - Record the revision reason (structured column or appended notes).

- **Inventory**
  - **Restore agent inventory** for the order’s `agent_id` based on current `client_order_items`:
    - For each item: `agent_inventory.stock += quantity`
  - (Recommended) log `inventory_transactions` per item, e.g. `transaction_type = 'order_revision_restore'`.
  - **Main inventory**: no change (still unapproved).

- **Agent editing rules**
  - Only orders in revision state can be edited.
  - Agent updates items/quantities (UI editing experience).

### Required behavior (Resubmit after revision)
When the agent resubmits the revised order:

- **Order state**
  - Keep the same order record (same order number) OR create a revision record if you want history.
  - Move back to finance: `stage = 'finance_pending'`, `status = 'pending'`.

- **Order items**
  - Replace/overwrite `client_order_items` to match the corrected list (avoid partial merges).

- **Inventory**
  - **Deduct agent inventory again** based on the updated items:
    - For each corrected item: `agent_inventory.stock -= quantity`
  - Validation must ensure sufficient agent stock at resubmission time.

- **Revenue**
  - Still excluded until approved (revenue counts only `status='approved'`).

### Outcome
- Inventory accuracy:
  - Restores stock when sent back, re-deducts when resubmitted → stays consistent.
- Correction:
  - Agent corrects and resubmits without needing a new order number (if you keep the same order record).

---

## Implementation requirements (applies to both options)

- **Do inventory changes server-side** in a single RPC/transaction.
  - Avoid doing “restore stock” in the frontend; it can fail mid-way and desync inventory.
- **Use `client_order_items` as the source of truth** for restoration/deduction quantities.
- **Idempotency**
  - Ensure the restore/deduct logic cannot be applied twice for the same transition.
  - Example: block “Reject” or “Return for revision” if already rejected/revisioned.
- **Auditing**
  - Log an `inventory_transactions` entry for each restore/deduct.
  - Store who performed the action and the reason.

