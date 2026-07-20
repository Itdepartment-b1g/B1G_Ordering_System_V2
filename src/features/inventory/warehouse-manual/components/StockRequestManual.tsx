import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type StockRequestManualProps = {
  embedded?: boolean;
};

export default function StockRequestManual({ embedded = false }: StockRequestManualProps) {
  return (
    <BorderSection id="stock-request" embedded={embedded}>
    {!embedded && (
    <div className="flex flex-col items-center">
      <ContentSection>STOCK REQUEST</ContentSection>
      <p className="text-sm text-gray-500" >Main Warehouse</p>
      </div>
    )}
      <InstructionBorder>
        <TitleSection>How Stock Request Works?</TitleSection>
        <p>Stock Request is used to create inbound stock orders for the main warehouse. When you receive stock, it is added to Main Inventory and grouped into a batch.</p>
        <hr className="my-2 border-gray-500"/>
        <p>You can add variants from one or more brands in a single request. When you receive in one delivery, all items in that receive share the same batch number.</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Create a Stock Request?</TitleSection>
        {embedded ? (
          <span>1. Use this page to create and manage stock requests.</span>
        ) : (
          <span>1. Go to <Link to="/inventory/stock-requests" className="text-blue-500">Stock Requests</Link></span>
        )}
        <span>2. Click on <span className="text-blue-500">New request</span></span>
        <span>3. Click on <span className="text-blue-500">Add from brand</span>, select a brand, then click on <span className="text-blue-500">Add brand</span></span>
        <span>4. Enter the quantity for each variant you want to request <span className="text-gray-700">(only lines with quantity greater than 0 will be included)</span></span>
        <span>5. Optionally set the expected delivery date and notes, then click on <span className="text-blue-500">Create request</span></span>
        <span>6. The stock request will be created and you can see it in the list with a status of <span className="text-gray-700">Pending receive</span></span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Edit a Stock Request?</TitleSection>
        <span>1. Click on the 3 vertical dots icon in the row and click on <span className="text-blue-500">Edit</span></span>
        <span>2. Update the quantities, expected delivery date, or notes, then click on <span className="text-blue-500">Save changes</span></span>
        <span>3. You can only edit a stock request if no stock has been received yet.</span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Receive a Stock Request?</TitleSection>
        <span>1. Click on the 3 vertical dots icon in the row and click on <span className="text-blue-500">Receive</span></span>
        <span>2. Enter the quantity, manufacturing date, expiry date, and unit cost for each variant</span>
        <span>3. Optionally use <span className="text-blue-500">Apply to all rows</span> under batch defaults to fill the same dates and unit cost for all items</span>
        <span>4. Click on <span className="text-blue-500">Confirm receive</span></span>
        <span>5. The received stock will be added to Main Inventory under one batch number</span>
        <span>6. If all ordered quantities are received, the status will update to <span className="text-gray-700">Fully received</span></span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Cancel a Stock Request?</TitleSection>
        <span>1. Click on the 3 vertical dots icon in the row and click on <span className="text-blue-500">Cancel</span></span>
        <span>2. A dialog will be displayed to confirm the cancellation. Click on <span className="text-blue-500">Cancel request</span> to confirm.</span>
        <span>3. You can only cancel a stock request if no stock has been received yet.</span>
      </InstructionBorder>
    </BorderSection>
  );
}
