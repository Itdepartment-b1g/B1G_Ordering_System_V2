import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type PaymentSettingsManualProps = {
  embedded?: boolean;
};

export default function PaymentSettingsManual({ embedded = false }: PaymentSettingsManualProps) {
  return (
    <BorderSection id="payment-settings" embedded={embedded}>
      {!embedded && <ContentSection>PAYMENT SETTINGS</ContentSection>}
      <InstructionBorder>
        <TitleSection>How to create a Bank Accounts?</TitleSection>
        {embedded ? (
          <span>1. Use this page to manage payment settings and bank accounts.</span>
        ) : (
          <span>1. Go to <Link to="/finance/payment-settings" className="text-blue-500">Payment Settings</Link></span>
        )}
        <span>2. Click on <span className="text-blue-500">Add Bank</span></span>
        <span>3. Enter the details of bank and click on <span className="text-blue-500">Add Bank</span></span>
        <span>4. The bank will be created and you can see it in the list.</span>
      </InstructionBorder>
      <InstructionBorder>
        <TitleSection>How to edit a Bank?</TitleSection>
        <span>5. You can edit the bank by clicking on <span className="text-blue-500">Edit Icon</span></span>
      </InstructionBorder>
      <InstructionBorder>
        <TitleSection>How to delete a Bank?</TitleSection>
        <span>6. You can delete the bank by clicking on <span className="text-blue-500">Delete Icon</span></span>
      </InstructionBorder>
    </BorderSection>
  );
}
