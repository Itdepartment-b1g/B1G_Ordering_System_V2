import type {
  SubWarehouseReceiveProof,
  SubWarehouseStockRequest,
} from '../components/SubWarehouseStockRequestDialog';
import { exportInternalStockRequestReportPdf } from './exportInternalStockRequestReportPdf';

export type SubWarehouseReceivePdfInput = {
  request: SubWarehouseStockRequest;
  proof: SubWarehouseReceiveProof;
  receivedByName?: string;
  shortQuantity?: number;
  statusLabel?: string;
};

/**
 * Opens the unified main+sub attachment report.
 * `proof` / other fields are accepted for call-site compatibility; the report
 * resolves attachments from the request history/proofs.
 */
export async function exportSubWarehouseReceivePdf(
  input: SubWarehouseReceivePdfInput
): Promise<void> {
  const { request, proof } = input;
  // Ensure the just-confirmed proof is present even if list cache is briefly stale.
  const withProof: SubWarehouseStockRequest = {
    ...request,
    receiveProofs:
      request.receiveProofs && request.receiveProofs.length > 0
        ? request.receiveProofs
        : [proof],
  };
  await exportInternalStockRequestReportPdf(withProof);
}
