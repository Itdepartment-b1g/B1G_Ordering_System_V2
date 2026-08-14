import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type RequestStockManualProps = {
  embedded?: boolean;
};

export default function RequestStockManual({ embedded = false }: RequestStockManualProps) {
  return (
    <BorderSection id="request-stock" embedded={embedded}>
      {!embedded && (
        <div className="flex flex-col items-center">
          <ContentSection>REQUEST STOCK</ContentSection>
          <p className="text-sm text-gray-500">Sub Warehouse</p>
        </div>
      )}

      <InstructionBorder>
        <TitleSection>How Request Stock Works?</TitleSection>
        <p>
          Request Stock is used by sub-warehouse accounts to ask the main warehouse for inventory.
          Main warehouse reviews the request on{" "}
          <Link to="/inventory/sub-stock-requests" className="text-blue-500">
            Stock Transfer
          </Link>
          , approves it, and delivers the stock. You confirm receive here when the shipment arrives.
        </p>
        <hr className="my-2 border-gray-500" />
        <p>Status flow from your side:</p>
        <span>
          1. <span className="text-blue-500">Pending approval</span> — waiting for main warehouse
          review
        </span>
        <span>
          2. <span className="text-blue-500">Approved</span> — approved, awaiting main to deliver
        </span>
        <span>
          3. <span className="text-blue-500">Pending receive</span> — main has delivered; you can
          confirm receive
        </span>
        <span>
          4. <span className="text-blue-500">Partially received</span> /{" "}
          <span className="text-blue-500">Fully received</span> — after you confirm what arrived
        </span>
        <span>
          5. <span className="text-blue-500">Rejected</span> — main rejected the request
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Create a Stock Request?</TitleSection>
        {embedded ? (
          <span>1. Use this page to request stock from the main warehouse.</span>
        ) : (
          <span>
            1. Go to{" "}
            <Link to="/inventory/request-stock" className="text-blue-500">
              Request Stock
            </Link>
          </span>
        )}
        <span>
          2. Click <span className="text-blue-500">New stock request</span>
        </span>
        <span>
          3. Select a brand and enter quantities for each variant you need (only lines with quantity
          greater than 0 are included)
        </span>
        <span>
          4. Optionally add notes, then submit the request. A request number (RN-…) is assigned
        </span>
        <span>
          5. Wait for main warehouse to approve and deliver via{" "}
          <Link to="/inventory/sub-stock-requests" className="text-blue-500">
            Stock Transfer
          </Link>
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Confirm Receive?</TitleSection>
        <span>
          1. When status is <span className="text-blue-500">Pending receive</span> or{" "}
          <span className="text-blue-500">Partially received</span>, click{" "}
          <span className="text-blue-500">Receive</span> on the row
        </span>
        <span>
          2. Enter the quantity you actually received for each line (cannot exceed the remaining
          delivered quantity)
        </span>
        <span>
          3. Upload proof photos and add your e-signature, then click{" "}
          <span className="text-blue-500">Confirm receive</span>
        </span>
        <span>
          4. A receive PDF opens automatically. Your on-hand stock increases by the confirmed
          quantity
        </span>
        <span>
          5. If all delivered quantities are received, status becomes{" "}
          <span className="text-gray-700">Fully received</span>
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How Partial Receive Works?</TitleSection>
        <p>
          If you received less than the delivered quantity, enter the actual received qty for each
          short line and select a shortage reason (Missing, Damaged, Wrong packaging, or Other).
        </p>
        <hr className="my-2 border-gray-500" />
        <p>
          Status becomes <span className="text-blue-500">Partially received</span>. Main warehouse
          opens a shortage investigation on{" "}
          {embedded ? (
            <Link to="/warehouse-manual#delivery-shortages" className="text-blue-500">
              Delivery Shortages
            </Link>
          ) : (
            <a href="#delivery-shortages" className="text-blue-500">
              Delivery Shortages
            </a>
          )}{" "}
          → <span className="text-blue-500">Sub Warehouse Allocations &amp; Requests</span>.
        </p>
        <span>
          1. You cannot receive again until main resolves the shortage and runs{" "}
          <span className="text-blue-500">Allocate Remaining</span> on Stock Transfer
        </span>
        <span>
          2. When the next delivery wave is unlocked, receive the remaining stock using the same
          confirm receive flow
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Return Stock to Main?</TitleSection>
        <p>
          To send stock back to the main warehouse, use{" "}
          <Link to="/inventory/stock-returns" className="text-blue-500">
            Stock Returns
          </Link>{" "}
          or the <span className="text-blue-500">Return stock</span> action on{" "}
          <Link to="/inventory/sub-warehouses" className="text-blue-500">
            Sub Warehouses
          </Link>
          . Main warehouse inspects the return and restocks good units or sends damaged units to the
          Disposal Log.
        </p>
      </InstructionBorder>
    </BorderSection>
  );
}
