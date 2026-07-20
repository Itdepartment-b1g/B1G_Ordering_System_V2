import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function StockReturnsManual() {
  return (
    <BorderSection id="stock-returns">
      <ContentSection>STOCK RETURNS</ContentSection>
      <InstructionBorder>
        <TitleSection>How Stock Returns Works?</TitleSection>
        <p>Stock Returns is used when a sub-warehouse sends stock back to the main warehouse. The sub-warehouse submits the return with batch lots, and the main warehouse inspects the returned items.</p>
        <hr className="my-2 border-gray-500"/>
        <p>During inspection, the main warehouse assigns which main batch the stock goes back to and splits each item as <span className="font-bold">Good</span> or <span className="font-bold">Damaged</span>. Good stock is restocked to Main Inventory, and damaged stock is sent to the Disposal Log.</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Submit a Stock Return?</TitleSection>
        <p className="text-sm text-gray-500">Sub Warehouse</p>
        <span>1. Go to <Link to="/inventory/stock-returns" className="text-blue-500">Stock Returns</Link></span>
        <span>2. Click on <span className="text-blue-500">Return stock</span></span>
        <span>3. Select the sub-warehouse batch lot and enter the return quantity for each item</span>
        <span>4. Click on <span className="text-blue-500">Submit return</span></span>
        <span>5. The return request will be created and sent to the main warehouse with a status of <span className="text-gray-700">Pending inspect</span></span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Inspect a Stock Return?</TitleSection>
        <p className="text-sm text-gray-500">Main Warehouse</p>
        <span>1. Go to <Link to="/inventory/stock-returns" className="text-blue-500">Stock Returns</Link></span>
        <span>2. Click on <span className="text-blue-500">Inspect</span> in the return row</span>
        <span>3. For each variant, select the <span className="text-blue-500">Main batch</span> where the stock should be restocked</span>
        <span>4. Enter the <span className="text-blue-500">Good</span> and <span className="text-blue-500">Damaged</span> quantities for each row</span>
        <span>5. Optionally add inspection notes, then click on <span className="text-blue-500">Confirm inspection</span></span>
        <span>6. If all returned quantities are inspected, the status will update to <span className="text-gray-700">Fully inspected</span></span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Cancel a Stock Return?</TitleSection>
        <span>1. Click on <span className="text-blue-500">Cancel</span> in the return row</span>
        <span>2. A dialog will be displayed to confirm the cancellation. Click on <span className="text-blue-500">Cancel request</span> to confirm.</span>
        <span>3. You can only cancel a stock return if no stock has been inspected yet.</span>
      </InstructionBorder>
    </BorderSection>
  );
}
