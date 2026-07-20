import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function BatchViewManual() {
  return (
    <BorderSection id="batch-view">
      <ContentSection>BATCH VIEW</ContentSection>
      <InstructionBorder>
        <TitleSection>How Batch View Works?</TitleSection>
        <p>Batch View is used to browse on-hand stock grouped by batch. Each batch shows the warehouse, total SKUs, total units, and received date.</p>
        <hr className="my-2 border-gray-500"/>
        <p>Expand a batch to see the brands and variants inside it, including expiration date and quantity. Stock appears here after receiving stock requests, adjustments, or opening balance imports.</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Filter Batch Inventory?</TitleSection>
        <span>1. Go to <Link to="/inventory/batches" className="text-blue-500">Batch View</Link></span>
        <span>2. Use the search box to find a batch number, brand, or variant</span>
        <span>3. Main warehouse users can filter by warehouse location using <span className="text-blue-500">All warehouses</span> or a specific warehouse</span>
        <span>4. Use the brand and date range filters to narrow down the results</span>
        <span>5. Click on <span className="text-blue-500">Clear filters</span> to reset all filters</span>
        <span>6. The summary cards at the top show the total batches, SKUs, and units for the current filtered view</span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to View Batch Details?</TitleSection>
        <span>1. Click on a batch row to expand it</span>
        <span>2. You will see the brands and variants in that batch, including expiration date and quantity</span>
        <span>3. Each batch also shows its source <span className="text-gray-700">(eg. Stock request, Adjustment, Opening balance)</span></span>
        <span>4. Click <span className="text-blue-500">View</span> under Adjustments to see the adjustment history for a specific variant lot</span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Export Batch Inventory?</TitleSection>
        <span>1. Click on <span className="text-blue-500">Export all</span> at the top to export all batch inventory to Excel</span>
        <span>2. Apply filters first, then click on <span className="text-blue-500">Export filtered</span> to export only the filtered results</span>
        <span>3. To export a single batch, click the 3 vertical dots icon in the batch row and choose <span className="text-blue-500">Export to Excel</span> or <span className="text-blue-500">Export to PDF</span></span>
      </InstructionBorder>
    </BorderSection>
  );
}
