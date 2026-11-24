import type { CompanyPriceChangeAgreement, CompanyPriceChangeBatch } from './companyPriceChangeApi';
import {
  PriceChangeItemsGroupedTable,
  type PriceItemsViewMode,
} from './PriceChangeItemsGroupedTable';

/** Confirm / agreement list — brand + wave groups with New / Confirmed. */
export function PriceChangeItemsFlatTable({
  batch,
  myAgreement,
  compact = false,
  viewMode = 'table',
}: {
  batch: CompanyPriceChangeBatch;
  myAgreement?: CompanyPriceChangeAgreement | null;
  compact?: boolean;
  viewMode?: PriceItemsViewMode;
  /** @deprecated Type is always shown next to variant */
  showType?: boolean;
}) {
  return (
    <PriceChangeItemsGroupedTable
      batch={batch}
      myAgreement={myAgreement}
      compact={compact}
      showStatus
      viewMode={viewMode}
    />
  );
}
