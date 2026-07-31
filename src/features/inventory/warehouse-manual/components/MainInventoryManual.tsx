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
        <p>Main Inventory is a document that is used to manage the stock of the main warehouse.</p>
        <hr className="my-2 border-gray-500"/>
        <p>The Main Inventory list only displays brands and variants that currently have stock in the main warehouse. Items with no available stock are not shown.</p>
        <p className="mt-2">Stock counts are shown in units (Total, Allocated, PO Reserved, Available). Box packing is entered when you receive a <Link to="/inventory/stock-requests" className="text-blue-500">Stock Request</Link> and can be opened from <Link to="/inventory/batches" className="text-blue-500">Batch View</Link> or the batch inventory action on each variant via <span className="text-blue-500">Packing → View</span>.</p>
      </InstructionBorder>
    </BorderSection>
  );
}
