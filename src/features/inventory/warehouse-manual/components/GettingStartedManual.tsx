import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type GettingStartedManualProps = {
  embedded?: boolean;
  /** When set, only the matching setup section is shown. Omit to show both (full manual page). */
  setupPath?: "main" | "sub";
};

function ManualSectionLink({
  sectionId,
  embedded,
  children,
}: {
  sectionId: string;
  embedded: boolean;
  children: React.ReactNode;
}) {
  if (embedded) {
    return (
      <Link to={`/warehouse-manual#${sectionId}`} className="text-blue-500">
        {children}
      </Link>
    );
  }

  return (
    <a href={`#${sectionId}`} className="text-blue-500">
      {children}
    </a>
  );
}

export default function GettingStartedManual({
  embedded = false,
  setupPath,
}: GettingStartedManualProps) {
  const showMainSetup = setupPath !== "sub";
  const showSubSetup = setupPath !== "main";

  return (
    <BorderSection id="getting-started" embedded={embedded}>
      {!embedded && <ContentSection>GETTING STARTED</ContentSection>}
      <InstructionBorder>
        <TitleSection>New to the warehouse system?</TitleSection>
        <p>
          If you have a brand-new account and do not know where to begin, follow the steps below in
          order. Each step builds on the previous one. You can jump to the detailed manual for any
          step using the links.
        </p>
      </InstructionBorder>

      {showMainSetup && (
      <InstructionBorder>
        <TitleSection>Main Warehouse — Step by step setup</TitleSection>
        <p className="text-sm text-gray-500">Follow these steps in order for a new main warehouse account.</p>
        <hr className="my-2 border-gray-500"/>
        <span>
          1. Create{" "}
          <ManualSectionLink sectionId="variant-types" embedded={embedded}>
            Variant Types
          </ManualSectionLink>{" "}
          first <span className="text-gray-700">(eg. Flavor, Battery, FOC)</span> — product
          categories must exist before you can add products
        </span>
        <span>
          2. Create{" "}
          <ManualSectionLink sectionId="brands-and-variants" embedded={embedded}>
            Brands and Variants
          </ManualSectionLink>{" "}
          — build your product catalog under each brand
        </span>
        <span>
          3. Set up{" "}
          <ManualSectionLink sectionId="payment-settings" embedded={embedded}>
            Payment Settings
          </ManualSectionLink>{" "}
          — add bank accounts used for payments
        </span>
        <span>
          4. Create a{" "}
          <ManualSectionLink sectionId="stock-request" embedded={embedded}>
            Stock Request
          </ManualSectionLink>{" "}
          and receive inbound stock — this adds inventory to the main warehouse
        </span>
        <span>
          5. Check{" "}
          <ManualSectionLink sectionId="main-inventory" embedded={embedded}>
            Main Inventory
          </ManualSectionLink>{" "}
          — confirm your received stock appears in the list
        </span>
        <span>
          6.{" "}
          <span className="text-gray-700">(Optional)</span> Create{" "}
          <ManualSectionLink sectionId="subwarehouse" embedded={embedded}>
            Sub Warehouses
          </ManualSectionLink>{" "}
          — only if you have branch or sub-location warehouses
        </span>
        <span>
          7. Handle{" "}
          <ManualSectionLink sectionId="sub-stock-requests" embedded={embedded}>
            Sub Stock Requests
          </ManualSectionLink>{" "}
          — approve and release stock from main warehouse to sub-warehouses
        </span>
        <span>
          8. Process{" "}
          <ManualSectionLink sectionId="purchase-order" embedded={embedded}>
            Purchase Orders
          </ManualSectionLink>{" "}
          — approve and fulfill orders from Moto Sales and Key Accounts
        </span>
      </InstructionBorder>
      )}

      {showSubSetup && (
      <InstructionBorder>
        <TitleSection>Sub Warehouse — Step by step setup</TitleSection>
        <p className="text-sm text-gray-500">Shorter path if you are assigned to a sub-warehouse location.</p>
        <hr className="my-2 border-gray-500"/>
        <span>
          1. Go to{" "}
          <Link to="/inventory/request-stock" className="text-blue-500">
            Request Stock
          </Link>{" "}
          in the sidebar and submit a stock request to the main warehouse
        </span>
        <span>
          2. Wait for the main warehouse to approve and release the stock via{" "}
          <ManualSectionLink sectionId="sub-stock-requests" embedded={embedded}>
            Sub Stock Requests
          </ManualSectionLink>
          , then receive the stock on your end
        </span>
        <span>
          3. For returns or audits, use{" "}
          <ManualSectionLink sectionId="stock-returns" embedded={embedded}>
            Stock Returns
          </ManualSectionLink>{" "}
          and{" "}
          <ManualSectionLink sectionId="physical-count" embedded={embedded}>
            Physical Count
          </ManualSectionLink>{" "}
          as needed
        </span>
      </InstructionBorder>
      )}

      <InstructionBorder>
        <TitleSection>After setup — Daily operations</TitleSection>
        <p>Once your warehouse is set up, these are common day-to-day tasks:</p>
        <hr className="my-2 border-gray-500"/>
        <span>
          <ManualSectionLink sectionId="batch-view" embedded={embedded}>
            Batch View
          </ManualSectionLink>{" "}
          — browse on-hand stock grouped by batch
        </span>
        <span>
          <ManualSectionLink sectionId="physical-count" embedded={embedded}>
            Physical Count
          </ManualSectionLink>{" "}
          — count stock and record variances for audit
        </span>
        <span>
          <ManualSectionLink sectionId="stock-adjustment" embedded={embedded}>
            Stock Adjustment
          </ManualSectionLink>{" "}
          — correct inventory when needed
        </span>
        <span>
          <ManualSectionLink sectionId="stock-returns" embedded={embedded}>
            Stock Returns
          </ManualSectionLink>{" "}
          — handle stock sent back from sub-warehouses
        </span>
        <span>
          <ManualSectionLink sectionId="disposal-log" embedded={embedded}>
            Disposal Log
          </ManualSectionLink>{" "}
          — view damaged or unsellable stock records
        </span>
      </InstructionBorder>
    </BorderSection>
  );
}
