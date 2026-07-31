import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type BrandsAndVariantsManualProps = {
  embedded?: boolean;
};

export default function BrandsAndVariantsManual({ embedded = false }: BrandsAndVariantsManualProps) {
  return (
    <BorderSection id="brands-and-variants" embedded={embedded}>
      {!embedded && <ContentSection>BRANDS AND VARIANTS</ContentSection>}
      <InstructionBorder>
      <TitleSection>How to create a Brand and Variants?</TitleSection>
      {embedded ? (
        <span>1. Use this page to manage brands and variants.</span>
      ) : (
        <span>1. Go to <Link to="/brands" className="text-blue-500">Brands & Variants</Link></span>
      )}
      <span>2. Click on <span className="text-blue-500">Create Brand</span></span>
      <span>3. Enter the details of brand and click on <span className="text-blue-500">Create Brand</span></span>
      <span>4. The brand will be created and you can see it in the list.</span>
      </InstructionBorder>
      <InstructionBorder>
      <TitleSection>How to edit a Brand?</TitleSection>
      <span>5. You can edit the brand by clicking on <span className="text-blue-500">Edit Icon</span></span>
      </InstructionBorder>
      <InstructionBorder>
      <TitleSection>How to delete a Brand?</TitleSection>
      <span>6. You can delete the brand by clicking on <span className="text-blue-500">Delete Icon</span></span>
      <span>7. You will be asked to confirm the deletion. Click on <span className="text-blue-500">Delete</span> to confirm.</span>
      <span>8. The brand will be deleted and you can see it in the list.</span>
      </InstructionBorder>
      <InstructionBorder>
      <TitleSection>How to create a Variant?</TitleSection>
      <span>9. You can create a variant by clicking on <span className="text-blue-500">Create Variant</span></span>
      <span>10. Enter the details of variant and click on <span className="text-blue-500">Create Variant</span></span>
      <span>11. The variant will be created and you can see it in the list.</span>
      </InstructionBorder>
      <InstructionBorder>
      <TitleSection>How to edit a Variant?</TitleSection>
      <span>12. You can edit the variant by clicking on <span className="text-blue-500">Edit Icon</span></span>
      </InstructionBorder>
      <InstructionBorder>
      <TitleSection>How to delete a Variant?</TitleSection>
      <span>13. You can delete the variant by clicking on <span className="text-blue-500">Delete Icon</span></span>
      <span>14. You will be asked to confirm the deletion. Click on <span className="text-blue-500">Delete</span> to confirm.</span>
      <span>15. The variant will be deleted and you can see it in the list.</span>
      </InstructionBorder>
    </BorderSection>
  );
}
