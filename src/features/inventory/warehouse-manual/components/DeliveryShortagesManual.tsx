import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type DeliveryShortagesManualProps = {
  embedded?: boolean;
};

export default function DeliveryShortagesManual({ embedded = false }: DeliveryShortagesManualProps) {
  return (
    <BorderSection id="delivery-shortages" embedded={embedded}>
      {!embedded && (
        <div className="flex flex-col items-center">
          <ContentSection>DELIVERY SHORTAGES</ContentSection>
          <p className="text-sm text-gray-500">Main Warehouse</p>
        </div>
      )}

      <InstructionBorder>
        <TitleSection>How Delivery Shortages Works?</TitleSection>
        <p>
          Delivery Shortages is where Main Warehouse investigates shortfalls reported after a delivery is
          confirmed. Use the page tabs to switch between:
        </p>
        <span>
          • <span className="text-blue-500">PO deliveries</span> — buyer shortfalls on purchase-order DRs
        </span>
        <span>
          • <span className="text-blue-500">Sub Warehouse Allocations &amp; Requests</span> — sub-warehouse
          receive shortages on internal stock requests
        </span>
        <hr className="my-2 border-gray-500" />
        <p>
          Filter by <span className="text-blue-500">Open</span>,{" "}
          <span className="text-blue-500">Resolved</span>, or <span className="text-blue-500">All</span>. Search
          by PO / RN / DR / item / notes, and optionally narrow by date range.
        </p>
        <p>
          Resolving a shortage here closes the investigation. For sub-stock{" "}
          <span className="text-blue-500">Found</span> or{" "}
          <span className="text-blue-500">write off &amp; replace</span>, you must still run{" "}
          <span className="text-blue-500">Allocate Remaining</span> on Sub Stock Requests to re-deliver — this
          page does not ship stock.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Investigate a PO Shortage?</TitleSection>
        {embedded ? (
          <span>1. Use this page and open the <span className="text-blue-500">PO deliveries</span> tab.</span>
        ) : (
          <span>
            1. Go to{" "}
            <Link to="/inventory/delivery-shortages?source=po" className="text-blue-500">
              Delivery Shortages
            </Link>{" "}
            → <span className="text-blue-500">PO deliveries</span>
          </span>
        )}
        <span>
          2. Set status to <span className="text-blue-500">Open</span>, then expand a DR group to review short
          lines (reason, qty, buyer notes)
        </span>
        <span>3. Select one or more open lines and choose a resolution:</span>
        <span>
          • <span className="text-blue-500">Found → restore &amp; redeliver</span> — restore stock so another
          DR can be fulfilled
        </span>
        <span>
          • <span className="text-blue-500">Lost → write off &amp; ship replacement</span> — accept the loss
          without restoring; reopen the PO for another DR
        </span>
        <span>
          • <span className="text-blue-500">Lost → write off only</span> — accept the short with no replacement
        </span>
        <span>4. Add resolution notes if needed, then confirm</span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Investigate a Sub-Stock Shortage?</TitleSection>
        {embedded ? (
          <span>
            1. Use this page and open the{" "}
            <span className="text-blue-500">Sub Warehouse Allocations &amp; Requests</span> tab.
          </span>
        ) : (
          <span>
            1. Go to{" "}
            <Link to="/inventory/delivery-shortages?source=internal" className="text-blue-500">
              Delivery Shortages
            </Link>{" "}
            → <span className="text-blue-500">Sub Warehouse Allocations &amp; Requests</span>
          </span>
        )}
        <span>
          2. Set status to <span className="text-blue-500">Open</span>, then expand a request / DR group to
          review short lines (reason, qty, sub notes)
        </span>
        <span>3. Select open lines and choose a resolution:</span>
        <span>
          • <span className="text-blue-500">Found → restore &amp; redeliver</span> — closes investigation and
          releases the held reservation. Does <strong>not</strong> unlock Sub receive by itself.
        </span>
        <span>
          • <span className="text-blue-500">Lost → write off &amp; ship replacement</span> — same: resolve
          first, then ship a replacement from available stock
        </span>
        <span>
          • <span className="text-blue-500">Lost → write off only</span> — accept the loss; reduce delivered qty;
          no replacement wave
        </span>
        <span>
          4. For Found or write-off &amp; replace, go to{" "}
          {embedded ? (
            <Link to="/warehouse-manual#sub-stock-requests" className="text-blue-500">
              Sub Stock Requests &amp; Allocations
            </Link>
          ) : (
            <a href="#sub-stock-requests" className="text-blue-500">
              Sub Stock Requests &amp; Allocations
            </a>
          )}{" "}
          — the row shows <span className="text-blue-500">Ready to allocate</span>. Use{" "}
          <span className="text-blue-500">Allocate Remaining</span> (rider + proof + new DR) to unlock the next
          receive wave.
        </span>
      </InstructionBorder>
    </BorderSection>
  );
}
