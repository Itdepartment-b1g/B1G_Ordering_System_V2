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
            STOCK TRANSFER
          </ContentSection>
          <p className="text-sm text-gray-500">Main Warehouse</p>
        </div>
      )}

      <InstructionBorder>
        <TitleSection>How Stock Transfer Works?</TitleSection>
        <p>
          Sub stock requests are raised by a sub-warehouse asking the main warehouse for stock.
          Main warehouse handles each request in two steps: <span className="text-blue-500">Approve</span>, then{" "}
          <span className="text-blue-500">Deliver</span>. After deliver, the sub-warehouse confirms receive.
          Main can also use <span className="text-blue-500">Allocate to Sub Warehouse</span> to push stock
          without a prior request — the sub must still confirm receive before their on-hand increases.
        </p>
        <hr className="my-2 border-gray-500" />
        <p>
          This page has two tabs: <span className="text-blue-500">Requests</span> (sub-raised RN-…) and{" "}
          <span className="text-blue-500">Allocations</span> (main-pushed AL-…). After a short receive, use{" "}
          <span className="text-blue-500">Allocate Remaining</span> on the row to unlock the next receive wave
          (blocked while a shortage investigation is open).
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
              Stock Transfer
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
          2. Enter rider name, plate number, and rider photo; upload a proof photo; add your e-signature; then
          click <span className="text-blue-500">Confirm deliver</span>
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
        <TitleSection>How to Allocate to Sub Warehouse?</TitleSection>
        <p>
          Use <span className="text-blue-500">Allocate to Sub Warehouse</span> when Main pushes stock to a
          sub-warehouse without waiting for a request. The sub still confirms receive before their on-hand
          increases.
        </p>
        <hr className="my-2 border-gray-500" />
        {embedded ? (
          <span>
            1. On this page, click <span className="text-blue-500">Allocate to Sub Warehouse</span>
          </span>
        ) : (
          <span>
            1. Go to{" "}
            <Link to="/inventory/sub-stock-requests" className="text-blue-500">
              Stock Transfer
            </Link>{" "}
            and click <span className="text-blue-500">Allocate to Sub Warehouse</span>
          </span>
        )}
        <span>
          2. Choose the destination <span className="text-blue-500">sub-warehouse</span>
        </span>
        <span>
          3. Select a brand, set quantities from available main stock, then click{" "}
          <span className="text-blue-500">Add to allocation</span>. Repeat for more brands if needed. Review
          the cart and remove lines you do not want.
        </span>
        <span>
          4. Optionally add notes. Enter rider name, plate number, and rider photo; upload a proof photo; add
          your e-signature.
        </span>
        <span>
          5. Click <span className="text-blue-500">Confirm allocate</span>. Stock is reserved, a DR is assigned,
          and a Delivery Receipt opens. Status becomes{" "}
          <span className="text-blue-500">Pending receive</span>.
        </span>
        <span>
          6. Find the row under the <span className="text-blue-500">Allocations</span> tab (AL / DR search). Wait
          for the sub-warehouse to confirm receive. Partial receive and shortage investigation work the same as
          for requests.
        </span>
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
          If status is <span className="text-blue-500">Partially received</span>, the sub-warehouse confirmed less
          than the unlocked quantity and must select a shortage reason per short line (Missing / Damaged / Wrong
          packaging / Other).
        </p>
        <hr className="my-2 border-gray-500" />
        <p>
          That opens an investigation. On this page the row shows an{" "}
          <span className="text-blue-500">Open shortage</span> badge, and{" "}
          <span className="text-blue-500">Allocate Remaining</span> stays blocked until you resolve.
        </p>
        <span>
          1. Use <span className="text-blue-500">Investigate shortage</span> /{" "}
          <span className="text-blue-500">Resolve shortage</span> on the row, or go to{" "}
          {embedded ? (
            <Link to="/warehouse-manual#delivery-shortages" className="text-blue-500">
              Delivery Shortages
            </Link>
          ) : (
            <a href="#delivery-shortages" className="text-blue-500">
              Delivery Shortages
            </a>
          )}{" "}
          → <span className="text-blue-500">Sub Warehouse Allocations &amp; Requests</span>
        </span>
        <span>2. Review reason, qty, and notes, then resolve:</span>
        <span>
          • <span className="text-blue-500">Found → restore &amp; redeliver</span> — closes the investigation and
          releases the hold. Resolving does <strong>not</strong> unlock Sub receive by itself.
        </span>
        <span>
          • <span className="text-blue-500">Lost → write off &amp; ship replacement</span> — same: resolve first,
          then ship a replacement wave
        </span>
        <span>
          • <span className="text-blue-500">Lost → write off only</span> — accept the loss (no replacement)
        </span>
        <hr className="my-2 border-gray-500" />
        <p>
          After Found or write-off &amp; replace, the row shows{" "}
          <span className="text-blue-500">Ready to allocate</span>. Then use{" "}
          <span className="text-blue-500">Allocate Remaining</span> (rider photo, plate, proof, new DR) to unlock
          the next receive wave for the sub-warehouse.
        </p>
        <p>
          View the request timeline (3 dots → <span className="text-blue-500">View</span>) for{" "}
          <span className="text-blue-500">Under investigation</span> and the resolution outcome.
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
