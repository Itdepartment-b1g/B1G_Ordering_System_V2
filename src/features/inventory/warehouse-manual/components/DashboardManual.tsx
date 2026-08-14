import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

type DashboardManualProps = {
  embedded?: boolean;
};

export default function DashboardManual({ embedded = false }: DashboardManualProps) {
  return (
    <BorderSection id="dashboard" embedded={embedded}>
      {!embedded && <ContentSection>DASHBOARD</ContentSection>}
      <InstructionBorder>
        <TitleSection>How the Dashboard Works?</TitleSection>
        <p>
          The Dashboard gives you a quick overview of warehouse stock and activity. Use the tabs to
          switch between the stock board, product movement, FSN analysis, and batch aging.
        </p>
        <hr className="my-2 border-gray-500" />
        <p>
          Main warehouse users can switch between main warehouse and sub-warehouse locations using
          the view chips at the top. Use the search box to filter brands or variant names in any tab.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Stock Board Tab</TitleSection>
        {embedded ? (
          <span>1. Use the <span className="text-blue-500">Stock board</span> tab on this page.</span>
        ) : (
          <span>
            1. Go to{" "}
            <Link to="/inventory/board" className="text-blue-500">
              Dashboard
            </Link>{" "}
            and open the <span className="text-blue-500">Stock board</span> tab
          </span>
        )}
        <span>
          2. Main warehouse users can choose <span className="text-blue-500">Main (available)</span>,{" "}
          <span className="text-blue-500">Main (overall)</span>, or a sub-warehouse name to change
          what stock is shown
        </span>
        <span>
          3. <span className="text-blue-500">Available</span> shows free stock after reservations;{" "}
          <span className="text-blue-500">Overall</span> shows total on-hand stock at main
        </span>
        <span>
          4. Each brand column lists variants by type (PODS, DEVICE, POSM, etc.) with color-coded
          stock badges: in stock, low stock, and out of stock
        </span>
        <span>
          5. Main warehouse users can open <span className="text-blue-500">Stock board settings</span>{" "}
          to adjust low-stock thresholds and badge colors
        </span>
        <span>
          6. Click <span className="text-blue-500">Main inventory</span> to jump to the detailed
          inventory list, or use <span className="text-blue-500">Refresh</span> to reload data
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Product Movement Tab</TitleSection>
        <span>
          1. Open the <span className="text-blue-500">Product movement</span> tab to see inbound and
          outbound stock changes by SKU
        </span>
        <span>
          2. Use the date range filter to choose the period you want to review
        </span>
        <span>
          3. Main warehouse users can filter by main warehouse or a specific sub-warehouse location
        </span>
        <span>
          4. Use the search box to narrow results to specific brands or variants
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>FSN Analysis Tab</TitleSection>
        <span>
          1. Open the <span className="text-blue-500">FSN analysis</span> tab to classify variants as
          Fast, Slow, or Non-moving based on transfer PO fulfillments
        </span>
        <span>
          2. Choose the analysis period (eg. last 30, 60, or 90 days) and location scope
        </span>
        <span>
          3. Review each brand&apos;s variants grouped by FSN category to spot slow movers or
          stock that may need attention
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Batch Aging Tab</TitleSection>
        <span>
          1. Open the <span className="text-blue-500">Batch aging</span> tab to see how long batches
          have been in the warehouse
        </span>
        <span>
          2. Filter by main warehouse or a sub-warehouse location
        </span>
        <span>
          3. Search by batch number, brand, or variant to find older stock that may need priority
          fulfillment or review
        </span>
      </InstructionBorder>
    </BorderSection>
  );
}
