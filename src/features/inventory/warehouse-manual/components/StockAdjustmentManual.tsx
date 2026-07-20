import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function StockAdjustmentManual() {
  return (
    <BorderSection id="stock-adjustment">
      <div className="flex flex-col items-center">
        <ContentSection>STOCK ADJUSTMENT</ContentSection>
        <p className="text-sm text-gray-500" >Main Warehouse</p>
      </div>
      <InstructionBorder>
        <TitleSection>How Stock Adjustment Works?</TitleSection>
        <p>Stock Adjustment is used to apply audited corrections to warehouse stock. Each adjustment is recorded with a reason, batch, and the user who performed it.</p>
        <hr className="my-2 border-gray-500"/>
        <p>You can add or remove stock from an existing batch lot, or create a new <span className="text-gray-700">ADJ</span> batch when adding stock. For supplier inbound stock, use <Link to="/inventory/stock-requests" className="text-blue-500">Stock Requests → Receive</Link> instead.</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Create a Stock Adjustment?</TitleSection>
        <span>1. Go to <Link to="/inventory/stock-adjustments" className="text-blue-500">Stock Adjustments</Link></span>
        <span>2. Click on <span className="text-blue-500">New adjustment</span></span>
        <span>3. Select the <span className="text-blue-500">Location</span>, <span className="text-blue-500">Brand</span>, and <span className="text-blue-500">Variant</span></span>
        <span>4. Select the batch to adjust, or choose <span className="text-blue-500">Create new ADJ batch</span> when adding stock</span>
        <span>5. Choose the direction: <span className="text-blue-500">Add stock (+)</span> or <span className="text-blue-500">Remove stock (−)</span></span>
        <span>6. Enter the quantity and select a reason <span className="text-gray-700">(eg. Cycle count correction, Damaged, Obsolete, Supplier discrepancy, Other)</span></span>
        <span>7. Optionally add notes, then click on <span className="text-blue-500">Apply adjustment</span></span>
        <span>8. The adjustment will be saved and you can see it in the adjustment history list</span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How Add Stock and Remove Stock Works?</TitleSection>
        <p><span className="font-bold">Add stock (+): </span>Increases stock in the selected batch. You can add to an existing batch lot or create a new ADJ batch.</p>
        <hr className="my-2 border-gray-500"/>
        <p><span className="font-bold">Remove stock (−): </span>Decreases stock from an existing batch lot. You can only remove up to the batch's remaining quantity.</p>
        <hr className="my-2 border-gray-500"/>
        <p>If you choose <span className="text-blue-500">Create new ADJ batch</span>, only <span className="text-blue-500">Add stock (+)</span> is available.</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to View Adjustment History?</TitleSection>
        <span>1. All past adjustments are shown in the list on the Stock Adjustments page</span>
        <span>2. You can search by variant, brand, reason, or batch</span>
        <span>3. Use the date range, brand, and direction filters to narrow down the results</span>
        <span>4. Each row shows the date, location, product, direction, quantity, reason, batch, and who performed the adjustment</span>
      </InstructionBorder>
    </BorderSection>
  );
}
