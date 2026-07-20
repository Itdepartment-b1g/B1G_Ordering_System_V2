import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function MainInventoryManual() {
  return (
    <BorderSection id="main-inventory">
      <ContentSection>MAIN INVENTORY</ContentSection>
      <InstructionBorder>
        <TitleSection>How Main Inventory Works?</TitleSection>
        <p>Main Inventory is a document that is used to manage the stock of the main warehouse.</p>
        <hr className="my-2 border-gray-500"/>
        <p>The Main Inventory list only displays brands and variants that currently have stock in the main warehouse. Items with no available stock are not shown.</p>
      </InstructionBorder>
    </BorderSection>
  );
}
