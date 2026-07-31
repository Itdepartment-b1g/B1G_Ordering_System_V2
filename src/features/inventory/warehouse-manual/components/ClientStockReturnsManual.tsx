import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type ClientStockReturnsManualProps = {
  embedded?: boolean;
};

export default function ClientStockReturnsManual({ embedded = false }: ClientStockReturnsManualProps) {
  return (
    <BorderSection id="client-stock-returns" embedded={embedded}>
      {!embedded && (
        <div className="flex flex-col items-center">
          <ContentSection>CLIENT STOCK RETURNS</ContentSection>
          <p className="text-sm text-gray-500">Main Warehouse</p>
        </div>
      )}

      <InstructionBorder>
        <TitleSection>How Client Stock Returns Works?</TitleSection>
        <p>
          Client Stock Returns is used when a linked Standard Account sends stock back to the warehouse
          (return numbers look like <span className="text-blue-500">RT-YYYYMM-####</span>).
        </p>
        <hr className="my-2 border-gray-500" />
        <p>
          During inspection, Main Warehouse chooses the location and batch for restock and splits each item
          as <span className="font-bold">Good</span> or <span className="font-bold">Damaged</span>. Good stock
          is restocked to the chosen batch; damaged stock goes to the Disposal Log.
        </p>
        <hr className="my-2 border-gray-500" />
        <p>Status flow:</p>
        <span>
          1. <span className="text-blue-500">Pending inspect</span> — waiting for warehouse inspection
        </span>
        <span>
          2. <span className="text-blue-500">Partially inspected</span> — some lines inspected; more remain
        </span>
        <span>
          3. <span className="text-blue-500">Fully inspected</span> — all returned qty inspected
        </span>
        <span>
          4. <span className="text-blue-500">Cancelled</span> — return cancelled before any inspection
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Inspect a Client Stock Return?</TitleSection>
        <p className="text-sm text-gray-500">Main Warehouse</p>
        {embedded ? (
          <span>1. Use this page to inspect incoming client returns.</span>
        ) : (
          <span>
            1. Go to{" "}
            <Link to="/inventory/client-stock-returns" className="text-blue-500">
              Client Stock Returns
            </Link>
          </span>
        )}
        <span>
          2. Find the return (search by RT number, company, location, or product) and click{" "}
          <span className="text-blue-500">Inspect</span>
        </span>
        <span>
          3. For each variant, select the <span className="text-blue-500">batch</span> (and location) where
          good stock should be restocked
        </span>
        <span>
          4. Enter the <span className="text-blue-500">Good</span> and{" "}
          <span className="text-blue-500">Damaged</span> quantities for each row
        </span>
        <span>
          5. Optionally add inspection notes, then click{" "}
          <span className="text-blue-500">Confirm inspection</span>
        </span>
        <span>
          6. When all returned quantities are inspected, status becomes{" "}
          <span className="text-gray-700">Fully inspected</span>
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Cancel a Client Stock Return?</TitleSection>
        <span>
          1. Click <span className="text-blue-500">Cancel</span> on a return that has not been inspected yet
        </span>
        <span>
          2. Confirm cancellation. Client stock is restored and status becomes{" "}
          <span className="text-blue-500">Cancelled</span>
        </span>
        <span>3. You can only cancel if no stock has been inspected yet.</span>
      </InstructionBorder>
    </BorderSection>
  );
}
