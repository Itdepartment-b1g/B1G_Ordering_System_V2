import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type GettingStartedManualProps = {
  embedded?: boolean;
  /** When set, only the matching setup section is shown. Omit to show both (full manual page). */
  setupPath?: "main" | "sub";
};

const MANUAL_SECTION_ROUTES: Record<string, string> = {
  "variant-types": "/variant-types",
  "brands-and-variants": "/brands",
  "payment-settings": "/finance/payment-settings",
  "stock-request": "/inventory/stock-requests",
  "main-inventory": "/inventory/main",
  subwarehouse: "/inventory/sub-warehouses",
  "sub-stock-requests": "/inventory/sub-stock-requests",
  "purchase-order": "/purchase-orders",
  "batch-view": "/inventory/batches",
  "physical-count": "/inventory/physical-count",
  "stock-adjustment": "/inventory/stock-adjustments",
  "stock-returns": "/inventory/stock-returns",
  "client-stock-returns": "/inventory/client-stock-returns",
  "delivery-shortages": "/inventory/delivery-shortages",
  "disposal-log": "/inventory/disposals",
};

function ManualSectionLink({
  sectionId,
  children,
}: {
  sectionId: string;
  children: React.ReactNode;
}) {
  const pathname = MANUAL_SECTION_ROUTES[sectionId];
  if (!pathname) {
    return <span className="text-blue-500">{children}</span>;
  }

  return (
    <Link to={`${pathname}?manual=1`} className="text-blue-500">
      {children}
    </Link>
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
          <ManualSectionLink sectionId="variant-types">
            Variant Types
          </ManualSectionLink>{" "}
          first <span className="text-gray-700">(eg. Flavor, Battery, FOC)</span> — product
          categories must exist before you can add products
        </span>
        <span>
          2. Create{" "}
          <ManualSectionLink sectionId="brands-and-variants">
            Brands and Variants
          </ManualSectionLink>{" "}
          — build your product catalog under each brand
        </span>
        <span>
          3. Set up{" "}
          <ManualSectionLink sectionId="payment-settings">
            Payment Settings
          </ManualSectionLink>{" "}
          — add bank accounts used for payments
        </span>
        <span>
          4. Create a{" "}
          <ManualSectionLink sectionId="stock-request">
            Stock Request
          </ManualSectionLink>{" "}
          and receive inbound stock — this adds inventory to the main warehouse
        </span>
        <span>
          5. Check{" "}
          <ManualSectionLink sectionId="main-inventory">
            Main Inventory
          </ManualSectionLink>{" "}
          — confirm your received stock appears in the list
        </span>
        <span>
          6.{" "}
          <span className="text-gray-700">(Optional)</span> Create{" "}
          <ManualSectionLink sectionId="subwarehouse">
            Sub Warehouses
          </ManualSectionLink>{" "}
          — only if you have branch or sub-location warehouses
        </span>
        <span>
          7. Handle{" "}
          <ManualSectionLink sectionId="sub-stock-requests">
            Sub Stock Requests
          </ManualSectionLink>{" "}
          — approve and release stock from main warehouse to sub-warehouses
        </span>
        <span>
          8. Process{" "}
          <ManualSectionLink sectionId="purchase-order">
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
          1. Submit a stock request to the main warehouse — see{" "}
          <ManualSectionLink sectionId="sub-stock-requests">
            Sub Stock Requests
          </ManualSectionLink>{" "}
          for how main approves and delivers (use{" "}
          <span className="text-blue-500">Request Stock</span> in the sidebar on your sub account)
        </span>
        <span>
          2. Wait for the main warehouse to approve and release the stock via{" "}
          <ManualSectionLink sectionId="sub-stock-requests">
            Sub Stock Requests
          </ManualSectionLink>
          , then receive the stock on your end
        </span>
        <span>
          3. For returns or audits, use{" "}
          <ManualSectionLink sectionId="stock-returns">
            Stock Returns
          </ManualSectionLink>{" "}
          and{" "}
          <ManualSectionLink sectionId="physical-count">
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
          <ManualSectionLink sectionId="batch-view">
            Batch View
          </ManualSectionLink>{" "}
          — browse on-hand stock grouped by batch
        </span>
        <span>
          <ManualSectionLink sectionId="physical-count">
            Physical Count
          </ManualSectionLink>{" "}
          — count stock and record variances for audit
        </span>
        <span>
          <ManualSectionLink sectionId="stock-adjustment">
            Stock Adjustment
          </ManualSectionLink>{" "}
          — correct inventory when needed
        </span>
        <span>
          <ManualSectionLink sectionId="stock-returns">
            Stock Returns
          </ManualSectionLink>{" "}
          — handle stock sent back from sub-warehouses
        </span>
        <span>
          <ManualSectionLink sectionId="client-stock-returns">
            Client Stock Returns
          </ManualSectionLink>{" "}
          — inspect returns from linked Standard Accounts
        </span>
        <span>
          <ManualSectionLink sectionId="delivery-shortages">
            Delivery Shortages
          </ManualSectionLink>{" "}
          — investigate PO and sub-stock receive shortfalls
        </span>
        <span>
          <ManualSectionLink sectionId="disposal-log">
            Disposal Log
          </ManualSectionLink>{" "}
          — view damaged or unsellable stock records
        </span>
      </InstructionBorder>
    </BorderSection>
  );
}
