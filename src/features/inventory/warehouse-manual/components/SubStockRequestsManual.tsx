import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type SubStockRequestsManualProps = {
  embedded?: boolean;
};

export default function SubStockRequestsManual({ embedded = false }: SubStockRequestsManualProps) {
  return (
    <BorderSection id="sub-stock-requests" embedded={embedded}>
      {!embedded && (
        <div className="flex flex-col items-center">
          <ContentSection>
            SUB STOCK REQUESTS
          </ContentSection>
          <p className="text-sm text-gray-500" >Main Warehouse</p>
        </div>
      )}


      <InstructionBorder>
        <TitleSection>How Sub Stock Requests Works?</TitleSection>
        <p>Sub Stock Requests is a document that is used to request stock from the sub warehouse to the main warehouse.</p>
        <hr className="my-2 border-gray-500"/>


        <TitleSection>How to Approve a Sub Stock Request?</TitleSection>
        {embedded ? (
          <span>1. Use this page to review and approve sub stock requests.</span>
        ) : (
          <span>1. Go to <Link to="/inventory/sub-stock-requests" className="text-blue-500">Sub Stock Requests</Link></span>
        )}
        <span>2. Click on the 3 vertical dots icon in the row and click on <span className="text-blue-500">Approve</span></span>
        <span>3. Confirm the approval. Stock is not reserved yet — the request moves to <span className="text-blue-500">Approved</span>.</span>
      </InstructionBorder>
      <InstructionBorder>
        <TitleSection>How to Deliver a Sub Stock Request?</TitleSection>
        <span>1. After a request is approved, click the 3 vertical dots and choose <span className="text-blue-500">Deliver</span></span>
        <span>2. Upload a proof photo and add an e-signature, then click <span className="text-blue-500">Confirm deliver</span></span>
        <span>3. Stock is reserved and the sub warehouse can receive. A <span className="text-blue-500">Delivery Receipt</span> opens automatically (no bank details).</span>
        <span>4. You can reprint anytime via <span className="text-blue-500">Print Delivery Receipt</span></span>
        <span>5. Wait for the sub warehouse to confirm receive</span>
      </InstructionBorder>
      <InstructionBorder>
        <TitleSection>How to Reject a Sub Stock Request?</TitleSection>
        <span>1. Click the 'Reject' button in the sub stock request row to reject the sub stock request.</span>
        <span>2. A dialog will be displayed to confirm the rejection. Click on <span className="text-blue-500">Reject</span> to confirm.</span>
        <span>3. Before you reject the sub stock request, please think twice if you really want to reject the sub stock request. This action cannot be undone.</span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How Partially Received Sub Stock Request Works?</TitleSection>
        <p>If theres a partially received in status of sub stock request, it means that the sub warehouse did not receive the full quantity of the stock requested. Main warehouse needs to invistigate the reason why it happened</p>
        <hr className="my-2 border-gray-500"/>
        <p>You can view the details of issue by clicking the 3 vertical dots icon in the row and click the eye icon <span className="text-blue-500">view</span> then in that way you can see the timeline of that stock request</p>
        <hr className="my-2 border-gray-500"/>
        <p>After that you need to click the 3 vertical dots icon in the row and click <span className="text-blue-500">Allocate Remaining</span> then you can allocate the remaining stock to the sub warehouse and wait for the sub warehouse to receive again the stock</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Export to PDF the report of Stock Request?</TitleSection>
        <span>1. Click on the 3 vertical dots icon in the row and click on <span className="text-blue-500">Export to PDF</span></span>
        <span>2. The report will be exported to PDF and you can see it in the list.</span>
      </InstructionBorder>
    </BorderSection>
  );
}
