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
          <p className="text-sm text-gray-500">Main Warehouse</p>
        </div>
      )}

      <InstructionBorder>
        <TitleSection>How Sub Stock Requests Works?</TitleSection>
        <p>
          Sub stock requests are raised by a sub-warehouse asking the main warehouse for stock.
          Main warehouse handles each request in two steps: <span className="text-blue-500">Approve</span>, then{" "}
          <span className="text-blue-500">Deliver</span>. After deliver, the sub-warehouse confirms receive.
        </p>
        <hr className="my-2 border-gray-500" />
        <p>Status flow:</p>
        <span>
          1. <span className="text-blue-500">Pending approval</span> — waiting for main warehouse review
        </span>
        <span>
          2. <span className="text-blue-500">Approved</span> — approved, but stock is not reserved yet (awaiting deliver)
        </span>
        <span>
          3. <span className="text-blue-500">Pending receive</span> — delivered; sub-warehouse can confirm receive
        </span>
        <span>
          4. <span className="text-blue-500">Partially received</span> /{" "}
          <span className="text-blue-500">Fully received</span> — after the sub confirms
        </span>
        <span>
          5. <span className="text-blue-500">Rejected</span> — request was rejected (before deliver)
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Approve a Sub Stock Request?</TitleSection>
        {embedded ? (
          <span>1. Use this page to review and approve sub stock requests.</span>
        ) : (
          <span>
            1. Go to{" "}
            <Link to="/inventory/sub-stock-requests" className="text-blue-500">
              Sub Stock Requests
            </Link>
          </span>
        )}
        <span>
          2. Click the 3 vertical dots on the row and choose{" "}
          <span className="text-blue-500">Approve</span>
        </span>
        <span>
          3. Confirm the approval. No proof photo or signature is needed at this step. Stock is{" "}
          <strong>not</strong> reserved yet — status becomes <span className="text-blue-500">Approved</span>.
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Deliver a Sub Stock Request?</TitleSection>
        <span>
          1. When status is <span className="text-blue-500">Approved</span>, click the 3 vertical dots and choose{" "}
          <span className="text-blue-500">Deliver</span>
        </span>
        <span>
          2. Upload a proof photo and add an e-signature, then click{" "}
          <span className="text-blue-500">Confirm deliver</span>
        </span>
        <span>
          3. Main warehouse stock is reserved and the sub-warehouse can receive. A{" "}
          <span className="text-blue-500">Delivery Receipt</span> opens automatically (same style as purchase-order
          DRs, without bank details).
        </span>
        <span>
          4. A DR number is assigned (example: <span className="text-blue-500">WHB-2026-07-DR-00001</span>). The
          receipt also shows the request RN number (example: <span className="text-blue-500">RN-STR-0001</span>) in
          Delivery Details.
        </span>
        <span>
          5. You can reprint anytime via <span className="text-blue-500">Print Delivery Receipt</span>
        </span>
        <span>6. Wait for the sub-warehouse to confirm receive</span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Reject a Sub Stock Request?</TitleSection>
        <span>
          1. You can reject while status is <span className="text-blue-500">Pending approval</span> or{" "}
          <span className="text-blue-500">Approved</span> (before deliver). Use{" "}
          <span className="text-blue-500">Reject</span> from the row menu or detail dialog.
        </span>
        <span>
          2. Enter a rejection reason, add your e-signature, then confirm{" "}
          <span className="text-blue-500">Reject</span>
        </span>
        <span>
          3. This cannot be undone. After deliver, use receive / allocate remaining instead of reject.
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How Partially Received Sub Stock Request Works?</TitleSection>
        <p>
          If status is <span className="text-blue-500">Partially received</span>, the sub-warehouse did not confirm
          the full delivered quantity. Main warehouse should investigate the shortage.
        </p>
        <hr className="my-2 border-gray-500" />
        <p>
          View details from the 3 vertical dots → <span className="text-blue-500">View</span> to see the request
          timeline.
        </p>
        <hr className="my-2 border-gray-500" />
        <p>
          Then use <span className="text-blue-500">Allocate Remaining</span> to unlock the short quantity for another
          receive wave, and wait for the sub-warehouse to confirm again.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Print Delivery Receipt vs Export Report?</TitleSection>
        <span>
          1. <span className="text-blue-500">Print Delivery Receipt</span> — shipping document with DR number, RN
          number, delivered items, and sign-off (no bank details). Available after deliver.
        </span>
        <span>
          2. <span className="text-blue-500">Export PDF</span> — activity/history report of the stock request
          (timeline, proofs, signatures). Use this for records, not as the shipping DR.
        </span>
      </InstructionBorder>
    </BorderSection>
  );
}
