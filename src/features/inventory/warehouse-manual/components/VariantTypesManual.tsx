import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function VariantTypesManual() {
  return (
    <BorderSection id="variant-types">
      <ContentSection>VARIANT TYPES</ContentSection>
      <InstructionBorder>
      <TitleSection>How to create a Variant Types?</TitleSection>
      <span>1. Go to <Link to="/variant-types" className="text-blue-500">Variant Types</Link></span>
      <span>2. Click on <span className="text-blue-500">Create Type</span></span>
      <span>3. Enter the details of variant type <span className="text-gray-700">(eg. Flavor, Battery, FOC etc.)</span> and click on <span className="text-blue-500">Create Type</span></span>
      <span>4. The variant type will be created and you can see it in the list.</span>
      </InstructionBorder>

      <InstructionBorder>
      <TitleSection>How to edit a Variant Type?</TitleSection>
      <span>5. You can edit the variant type by clicking on <span className="text-blue-500">Edit Icon</span></span>
      </InstructionBorder>

      <InstructionBorder>
      <TitleSection>How to delete a Variant Type?</TitleSection>
      <span>6. You can delete the variant type by clicking on <span className="text-blue-500">Delete Icon</span></span>
      <span>7. You will be asked to confirm the deletion. Click on <span className="text-blue-500">Delete</span> to confirm.</span>
      <span>8. The variant type will be deleted and you can see it in the list.</span>
      </InstructionBorder>
    </BorderSection>
  );
}
