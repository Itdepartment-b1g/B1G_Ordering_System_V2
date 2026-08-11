import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type SubwarehouseManualProps = {
  embedded?: boolean;
};

export default function SubwarehouseManual({ embedded = false }: SubwarehouseManualProps) {
  return (
    <BorderSection id="subwarehouse" embedded={embedded}>
      {!embedded && <ContentSection>SUB WAREHOUSES</ContentSection>}
      <InstructionBorder>
        <TitleSection>How Sub Warehouses Works?</TitleSection>
        <p>
          Sub Warehouses lets the main warehouse create branch locations and manage linked sub-warehouse
          accounts. Stock is pushed to sub-warehouses through{" "}
          <Link to="/inventory/sub-stock-requests" className="text-blue-500">
            Stock Transfer
          </Link>
          , not from this page directly.
        </p>
        <hr className="my-2 border-gray-500" />
        <p>
          The locations table shows each warehouse name, linked user, email, and type (Main or Sub).
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Create a Sub-Warehouse?</TitleSection>
        <p className="text-sm text-gray-500">Main Warehouse only</p>
        {embedded ? (
          <span>1. Use this page to manage sub-warehouses.</span>
        ) : (
          <span>
            1. Go to{" "}
            <Link to="/inventory/sub-warehouses" className="text-blue-500">
              Sub Warehouses
            </Link>
          </span>
        )}
        <span>
          2. Click <span className="text-blue-500">Create sub-warehouse</span>
        </span>
        <span>
          3. Enter the location name, user full name, email, and password for the sub-warehouse
          account
        </span>
        <span>
          4. A short location code is generated from the name. Request numbers for that sub will
          look like <span className="text-blue-500">RN-SR-0001</span> (code varies by location name)
        </span>
        <span>
          5. Click <span className="text-blue-500">Create</span>. The new sub-warehouse appears in
          the locations table and can log in to request stock
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Allocate Stock to a Sub-Warehouse?</TitleSection>
        <p>
          Use{" "}
          <Link to="/inventory/sub-stock-requests" className="text-blue-500">
            Stock Transfer
          </Link>{" "}
          to approve sub requests or use{" "}
          <span className="text-blue-500">Allocate to Sub Warehouse</span> to push stock without a
          prior request. See the{" "}
          {embedded ? (
            <Link to="/warehouse-manual#sub-stock-requests" className="text-blue-500">
              Stock Transfer manual
            </Link>
          ) : (
            <a href="#sub-stock-requests" className="text-blue-500">
              Stock Transfer manual
            </a>
          )}{" "}
          for full steps.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Return Stock?</TitleSection>
        <p className="text-sm text-gray-500">Sub Warehouse</p>
        <span>
          1. On this page, click <span className="text-blue-500">Return stock</span>
        </span>
        <span>
          2. Select batch lots and enter return quantities, then submit. Main warehouse inspects on{" "}
          <Link to="/inventory/stock-returns" className="text-blue-500">
            Stock Returns
          </Link>
        </span>
        <hr className="my-2 border-gray-500" />
        <p className="text-sm text-gray-500">Main Warehouse</p>
        <span>
          1. Click <span className="text-blue-500">Submit return</span> to start a return on behalf
          of a sub-warehouse if needed
        </span>
      </InstructionBorder>
    </BorderSection>
  );
}
