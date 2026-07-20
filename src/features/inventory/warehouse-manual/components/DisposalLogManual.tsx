import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function DisposalLogManual() {
  return (
    <BorderSection id="disposal-log">
      <ContentSection>DISPOSAL LOG</ContentSection>
      <InstructionBorder>
        <TitleSection>How Disposal Log Works?</TitleSection>
        <p>Disposal Log is a record of damaged or unsellable stock that can no longer be sold. These units are removed from sellable inventory and logged here for audit.</p>
        <hr className="my-2 border-gray-500"/>
        <p>Good-condition returns are restocked to inventory. Only damaged units appear in the Disposal Log and are not counted as sellable stock.</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How Disposal Records Are Created?</TitleSection>
        <p>Disposal records are created automatically when damaged stock is logged during inspection.</p>
        <hr className="my-2 border-gray-500"/>
        <span><span className="font-bold">Sub-warehouse return: </span>When main warehouse inspects a <Link to="/inventory/stock-returns" className="text-blue-500">Stock Return</Link> and marks units as <span className="text-blue-500">Damaged</span></span>
        <span><span className="font-bold">Rebate return: </span>When damaged units are recorded during rebate return inspection</span>
        <span><span className="font-bold">Adjustment: </span>When stock is removed through other approved disposal-related processes</span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to View Disposal Records?</TitleSection>
        <span>1. Go to <Link to="/inventory/disposals" className="text-blue-500">Disposal Log</Link></span>
        <span>2. Review the summary cards for total disposal entries and units disposed</span>
        <span>3. Main warehouse users can filter by location using <span className="text-blue-500">All locations</span> or a specific warehouse</span>
        <span>4. Use the search box to find a brand, variant, PO, rebate, or location</span>
        <span>5. Use the date range filter to narrow down the results</span>
        <span>6. Each row shows the date, location, product details, quantity, source, related PO or rebate, who disposed it, and notes</span>
      </InstructionBorder>
    </BorderSection>
  );
}
