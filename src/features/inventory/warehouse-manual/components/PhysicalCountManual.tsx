import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function PhysicalCountManual() {
  return (
    <BorderSection id="physical-count">
      <ContentSection>PHYSICAL COUNT</ContentSection>
      <InstructionBorder>
        <TitleSection>How Physical Count Works?</TitleSection>
        <p>Physical Count is used to count on-hand stock by batch and lot. You enter the physical quantities you counted in the warehouse and sign to confirm the count session.</p>
        <hr className="my-2 border-gray-500"/>
        <p>The system compares your physical count against the system quantity and records any variances for audit. System stock is not changed automatically. If corrections are needed, use <Link to="/inventory/stock-adjustments" className="text-blue-500">Stock Adjustments</Link>.</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Perform a Physical Count?</TitleSection>
        <span>1. Go to <Link to="/inventory/physical-count" className="text-blue-500">Physical Count</Link></span>
        <span>2. Select the <span className="text-blue-500">Warehouse location</span> and <span className="text-blue-500">Batch</span> you are counting</span>
        <span>3. Add count lines by selecting brand and variant, then clicking <span className="text-blue-500">Add line</span>, or click <span className="text-blue-500">Add all lots in batch</span> to include every lot in that batch</span>
        <span>4. Enter the physical quantity using <span className="text-blue-500">Boxes</span> and <span className="text-blue-500">Qty/box</span> for each line</span>
        <span>5. Optionally add notes, then click on <span className="text-blue-500">Review & submit</span></span>
        <span>6. Review the count summary and any variances, then click on <span className="text-blue-500">Continue to signature</span></span>
        <span>7. Sign to confirm the count and complete the submission</span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How Variances Work?</TitleSection>
        <p>A variance means the physical quantity you counted does not match the system quantity for that lot.</p>
        <hr className="my-2 border-gray-500"/>
        <p>During review, variances are shown before you sign. The count session is saved for audit even when variances exist.</p>
        <hr className="my-2 border-gray-500"/>
        <p>If inventory needs to be corrected after a count, create a stock adjustment in <Link to="/inventory/stock-adjustments" className="text-blue-500">Stock Adjustments</Link>.</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to View Count History?</TitleSection>
        <span>1. Scroll down to the <span className="text-blue-500">Count history</span> section on the Physical Count page</span>
        <span>2. Use the filters to search by batch, location, performer, or date range</span>
        <span>3. Click on <span className="text-blue-500">View</span> in a history row to see the full count details, line items, variances, and signature</span>
        <span>4. Each history row shows the date, batch, location, who counted, number of lines, and net variance</span>
      </InstructionBorder>
    </BorderSection>
  );
}
