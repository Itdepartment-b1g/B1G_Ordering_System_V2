import type { SubWarehouseStockRequest } from '../components/SubWarehouseStockRequestDialog';
import {
  canExportInternalStockRequestReport,
  exportInternalStockRequestReportPdf,
} from './exportInternalStockRequestReportPdf';

/** @deprecated Prefer canExportInternalStockRequestReport — kept for existing imports. */
export function canExportMainRequestPdf(request: SubWarehouseStockRequest): boolean {
  return canExportInternalStockRequestReport(request);
}

/** Opens the unified main+sub attachment report. */
export async function exportMainSubStockRequestPdf(
  request: SubWarehouseStockRequest
): Promise<void> {
  await exportInternalStockRequestReportPdf(request);
}
