import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function GettingStartedManual() {
  return (
    <BorderSection id="getting-started">
      <ContentSection>GETTING STARTED</ContentSection>
      <InstructionBorder>
        <TitleSection>New to the warehouse system?</TitleSection>
        <p>
          If you have a brand-new account and do not know where to begin, follow the steps below in
          order. Each step builds on the previous one. You can jump to the detailed manual for any
          step using the links.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Main Warehouse — Step by step setup</TitleSection>
        <p className="text-sm text-gray-500">Follow these steps in order for a new main warehouse account.</p>
        <hr className="my-2 border-gray-500"/>
        <span>
          1. Create{" "}
          <a href="#variant-types" className="text-blue-500">
            Variant Types
          </a>{" "}
          first <span className="text-gray-700">(eg. Flavor, Battery, FOC)</span> — product
          categories must exist before you can add products
        </span>
        <span>
          2. Create{" "}
          <a href="#brands-and-variants" className="text-blue-500">
            Brands and Variants
          </a>{" "}
          — build your product catalog under each brand
        </span>
        <span>
          3. Set up{" "}
          <a href="#payment-settings" className="text-blue-500">
            Payment Settings
          </a>{" "}
          — add bank accounts used for payments
        </span>
        <span>
          4. Create a{" "}
          <a href="#stock-request" className="text-blue-500">
            Stock Request
          </a>{" "}
          and receive inbound stock — this adds inventory to the main warehouse
        </span>
        <span>
          5. Check{" "}
          <a href="#main-inventory" className="text-blue-500">
            Main Inventory
          </a>{" "}
          — confirm your received stock appears in the list
        </span>
        <span>
          6.{" "}
          <span className="text-gray-700">(Optional)</span> Create{" "}
          <a href="#subwarehouse" className="text-blue-500">
            Sub Warehouses
          </a>{" "}
          — only if you have branch or sub-location warehouses
        </span>
        <span>
          7. Handle{" "}
          <a href="#sub-stock-requests" className="text-blue-500">
            Sub Stock Requests
          </a>{" "}
          — approve and release stock from main warehouse to sub-warehouses
        </span>
        <span>
          8. Process{" "}
          <a href="#purchase-order" className="text-blue-500">
            Purchase Orders
          </a>{" "}
          — approve and fulfill orders from Moto Sales and Key Accounts
        </span>
      </InstructionBorder>

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
          <a href="#sub-stock-requests" className="text-blue-500">
            Sub Stock Requests
          </a>
          , then receive the stock on your end
        </span>
        <span>
          3. For returns or audits, use{" "}
          <a href="#stock-returns" className="text-blue-500">
            Stock Returns
          </a>{" "}
          and{" "}
          <a href="#physical-count" className="text-blue-500">
            Physical Count
          </a>{" "}
          as needed
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>After setup — Daily operations</TitleSection>
        <p>Once your warehouse is set up, these are common day-to-day tasks:</p>
        <hr className="my-2 border-gray-500"/>
        <span>
          <a href="#batch-view" className="text-blue-500">
            Batch View
          </a>{" "}
          — browse on-hand stock grouped by batch
        </span>
        <span>
          <a href="#physical-count" className="text-blue-500">
            Physical Count
          </a>{" "}
          — count stock and record variances for audit
        </span>
        <span>
          <a href="#stock-adjustment" className="text-blue-500">
            Stock Adjustment
          </a>{" "}
          — correct inventory when needed
        </span>
        <span>
          <a href="#stock-returns" className="text-blue-500">
            Stock Returns
          </a>{" "}
          — handle stock sent back from sub-warehouses
        </span>
        <span>
          <a href="#disposal-log" className="text-blue-500">
            Disposal Log
          </a>{" "}
          — view damaged or unsellable stock records
        </span>
      </InstructionBorder>
    </BorderSection>
  );
}
