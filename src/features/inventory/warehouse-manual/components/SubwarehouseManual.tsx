import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type SubwarehouseManualProps = {
  embedded?: boolean;
};

export default function SubwarehouseManual({ embedded = false }: SubwarehouseManualProps) {
  return (
    <BorderSection id="subwarehouse" embedded={embedded}>
      {!embedded && <ContentSection>SUBWAREHOUSE</ContentSection>}
      <InstructionBorder>
        <TitleSection>How to create a Subwarehouse?</TitleSection>
        {embedded ? (
          <span>1. Use this page to manage sub-warehouses.</span>
        ) : (
          <span>1. Go to <Link to="/inventory/sub-warehouses" className="text-blue-500">Sub Warehouses</Link></span>
        )}
        <span>2. Click on <span className="text-blue-500">Create Subwarehouse</span></span>
        <span>3. Enter the details of subwarehouse and click on <span className="text-blue-500">Create Subwarehouse</span></span>
      </InstructionBorder>
    </BorderSection>
  );
}
