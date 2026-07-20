import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function SubwarehouseManual() {
  return (
    <BorderSection id="subwarehouse">
      <ContentSection>SUBWAREHOUSE</ContentSection>
      <InstructionBorder>
        <TitleSection>How to create a Subwarehouse?</TitleSection>
        <span>1. Go to <Link to="/inventory/sub-warehouses" className="text-blue-500">Sub Warehouses</Link></span>
        <span>2. Click on <span className="text-blue-500">Create Subwarehouse</span></span>
        <span>3. Enter the details of subwarehouse and click on <span className="text-blue-500">Create Subwarehouse</span></span>
      </InstructionBorder>
    </BorderSection>
  );
}
