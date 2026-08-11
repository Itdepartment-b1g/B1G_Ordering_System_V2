import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type MainInventoryManualProps = {
  embedded?: boolean;
};

export default function MainInventoryManual({ embedded = false }: MainInventoryManualProps) {
  return (
    <BorderSection id="main-inventory" embedded={embedded}>
      {!embedded && <ContentSection>MAIN INVENTORY</ContentSection>}
      <InstructionBorder>
        <TitleSection>How Main Inventory Works?</TitleSection>
        <p>
          Main Inventory shows stock levels for your warehouse company. The list only displays brands
          and variants that currently have stock. Items with no stock are not shown.
        </p>
        <hr className="my-2 border-gray-500" />
        <p>
          Sub-warehouse users see their own location&apos;s stock without Allocated or PO Reserved
          columns. Main warehouse users see the full breakdown below.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Stock Columns Explained</TitleSection>
        <span>
          <span className="font-bold">Total</span> — on-hand units at main warehouse
        </span>
        <span>
          <span className="font-bold">Allocated</span> — units reserved for sub-warehouses or other
          outbound allocations
        </span>
        <span>
          <span className="font-bold">PO Reserved</span> — units reserved for approved transfer
          purchase orders not yet fulfilled
        </span>
        <span>
          <span className="font-bold">Available</span> — free stock: Total − Allocated − PO
          Reserved
        </span>
        <hr className="my-2 border-gray-500" />
        <p>
          Summary cards at the top show totals across all displayed brands. Box packing is entered
          when you receive a{" "}
          <Link to="/inventory/stock-requests" className="text-blue-500">
            Stock Request
          </Link>{" "}
          and can be viewed from{" "}
          <Link to="/inventory/batches" className="text-blue-500">
            Batch View
          </Link>{" "}
          or via <span className="text-blue-500">Packing → View</span> on each variant.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to View Pending Allocations?</TitleSection>
        <span>
          1. Click an <span className="text-blue-500">Allocated</span> cell that shows pending
          mobile sales allocations
        </span>
        <span>
          2. A dialog lists pending orders and quantities reserved against that variant
        </span>
        <span>
          3. The table may show Allocated minus pending so you can see how much is still free for
          new allocations
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to View PO Reserved?</TitleSection>
        <span>
          1. Click a <span className="text-blue-500">PO Reserved</span> cell to see transfer POs
          holding stock for that variant
        </span>
        <span>
          2. Reserved qty is released when the PO is fulfilled or cancelled
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to View Batch Lots?</TitleSection>
        <span>
          1. Click the batch inventory action on a variant row to open batch lot details
        </span>
        <span>
          2. Review quantities per batch lot, expiration dates, and packing where available
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Remove a Variant from Main Inventory?</TitleSection>
        <span>
          1. Click the remove action on a variant row (trash icon)
        </span>
        <span>
          2. Confirm removal. Allocated stock must be zero before a line can be removed
        </span>
        <span>
          3. Removing a line hides it from the list when stock reaches zero — it does not delete the
          product from your catalog
        </span>
      </InstructionBorder>
    </BorderSection>
  );
}
