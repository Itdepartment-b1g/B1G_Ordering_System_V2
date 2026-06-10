import ExcelJS from 'exceljs';

import type { Order } from '@/features/orders/OrderContext';
import { formatDateForInput } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';

export type OrderStatusPrimaryVariant = 'default' | 'secondary' | 'destructive';

export type OrderStatusSubKind =
  | 'deposit_recorded'
  | 'awaiting_slip'
  | 'awaiting_remittance';

export type OrderListExportRow = {
  orderNumber: string;
  clientName: string;
  agentName: string;
  date: string;
  items: number;
  amount: number;
  statusPrimary: string;
  statusSub: string | null;
  statusPrimaryVariant: OrderStatusPrimaryVariant;
  statusSubKind: OrderStatusSubKind | null;
};

/** Text colors aligned with OrdersPage badge variants (no cell fill — print-friendly). */
const PRIMARY_STATUS_TEXT_COLORS: Record<OrderStatusPrimaryVariant, string> = {
  default: 'FF472160',
  secondary: 'FF1A0F2E',
  destructive: 'FFEF4444',
};

const SUB_STATUS_TEXT_COLORS: Record<OrderStatusSubKind, string> = {
  deposit_recorded: 'FF1D4ED8',
  awaiting_slip: 'FFC2410C',
  awaiting_remittance: 'FFB45309',
};

export type OrderListExportSummary = {
  totalAmount: number;
  approvedAmount: number;
  pendingFinanceReviewAmount: number;
  rejectedAmount: number;
  approvedAndPendingAmount: number;
};

export type OrderListExportMeta = {
  exportType: 'filtered' | 'all';
  tabLabel: string;
  dateLabel: string;
  paymentLabel: string;
  searchLabel: string | null;
  orderCount: number;
  summary: OrderListExportSummary;
};

function isApprovedOrder(order: Order): boolean {
  return order.status === 'approved' || order.stage === 'admin_approved';
}

/** Same queue as Pending tab / filterOrders('pending'). */
function isPendingFinanceReviewOrder(order: Order): boolean {
  return order.stage === 'finance_pending' || order.status === 'pending';
}

/** Same queue as Rejected tab / filterOrders('rejected'). */
function isRejectedOrder(order: Order): boolean {
  return order.status === 'rejected' || order.stage === 'admin_rejected';
}

export function computeOrderListExportSummary(orders: Order[]): OrderListExportSummary {
  let totalAmount = 0;
  let approvedAmount = 0;
  let pendingFinanceReviewAmount = 0;
  let rejectedAmount = 0;

  for (const order of orders) {
    const amount = Number(order.total) || 0;
    totalAmount += amount;
    if (isApprovedOrder(order)) approvedAmount += amount;
    if (isPendingFinanceReviewOrder(order)) pendingFinanceReviewAmount += amount;
    if (isRejectedOrder(order)) rejectedAmount += amount;
  }

  return {
    totalAmount,
    approvedAmount,
    pendingFinanceReviewAmount,
    rejectedAmount,
    approvedAndPendingAmount: approvedAmount + pendingFinanceReviewAmount,
  };
}

const HEADERS = [
  'Order #',
  'Client',
  'Sales Agent',
  'Date',
  'Items',
  'Amount',
  'Status',
] as const;

const PHP_CURRENCY_FMT = '"₱"#,##0.00';
const COLUMN_COUNT = HEADERS.length;

function isZeroValueOrder(order: {
  total?: number | string | null;
  subtotal?: number | string | null;
  tax?: number | string | null;
  discount?: number | string | null;
}): boolean {
  const total = Number(order.total);
  if (!Number.isNaN(total) && Math.abs(total) < 0.01) return true;
  const computed =
    Number(order.subtotal ?? 0) + Number(order.tax ?? 0) - Number(order.discount ?? 0);
  return !Number.isNaN(computed) && Math.abs(computed) < 0.01;
}

function orderHasCashOrCheque(order: Order): boolean {
  if (order.paymentMode === 'SPLIT' && order.paymentSplits) {
    return order.paymentSplits.some((s) => s.method === 'CASH' || s.method === 'CHEQUE');
  }
  return order.paymentMethod === 'CASH' || order.paymentMethod === 'CHEQUE';
}

function getPrimaryStatusLabel(order: Order): string {
  if (order.stage === 'needs_revision') return 'Needs Revision';
  if (order.status === 'pending' || order.stage === 'finance_pending') {
    return 'Pending Finance Review';
  }
  if (order.status === 'approved' || order.stage === 'admin_approved') return 'Approved';
  if (order.status === 'rejected' || order.stage === 'admin_rejected') return 'Rejected';
  return order.status;
}

/** Secondary deposit/remittance badge shown under pending status in the UI table. */
export function getOrderDepositSubStatus(order: Order): string | null {
  const isPendingQueue =
    order.stage === 'finance_pending' || order.status === 'pending';
  if (!isPendingQueue || isZeroValueOrder(order) || !orderHasCashOrCheque(order)) {
    return null;
  }
  if (order.depositId && order.depositBankAccount) return 'Deposit Recorded';
  if (order.depositId) return 'Awaiting Deposit Slip';
  return 'Awaiting Remittance';
}

export function getOrderStatusPrimaryVariant(order: Order): OrderStatusPrimaryVariant {
  const label = getPrimaryStatusLabel(order);
  if (label === 'Needs Revision') return 'secondary';
  if (label.startsWith('Approved')) return 'default';
  if (label.startsWith('Pending')) return 'secondary';
  return 'destructive';
}

export function getOrderStatusSubKind(order: Order): OrderStatusSubKind | null {
  const sub = getOrderDepositSubStatus(order);
  if (!sub) return null;
  if (sub === 'Deposit Recorded') return 'deposit_recorded';
  if (sub === 'Awaiting Deposit Slip') return 'awaiting_slip';
  return 'awaiting_remittance';
}

export function mapOrderToListExportRow(order: Order): OrderListExportRow {
  const statusPrimary = getPrimaryStatusLabel(order);
  const statusSub = getOrderDepositSubStatus(order);
  return {
    orderNumber: order.orderNumber,
    clientName: order.clientName,
    agentName: order.agentName,
    date: new Date(order.date).toLocaleDateString(),
    items: order.items.reduce((sum, item) => sum + (item.quantity || 0), 0),
    amount: order.total,
    statusPrimary,
    statusSub,
    statusPrimaryVariant: getOrderStatusPrimaryVariant(order),
    statusSubKind: getOrderStatusSubKind(order),
  };
}

function applyStatusCellStyle(cell: ExcelJS.Cell, row: OrderListExportRow) {
  const primaryColor = PRIMARY_STATUS_TEXT_COLORS[row.statusPrimaryVariant];
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };

  if (!row.statusSub || !row.statusSubKind) {
    cell.value = row.statusPrimary;
    cell.font = { bold: true, color: { argb: primaryColor }, size: 10 };
    return;
  }

  const subColor = SUB_STATUS_TEXT_COLORS[row.statusSubKind];
  cell.value = {
    richText: [
      {
        text: row.statusPrimary,
        font: { bold: true, size: 10, color: { argb: primaryColor } },
      },
      {
        text: `\n${row.statusSub}`,
        font: { bold: true, size: 9, color: { argb: subColor } },
      },
    ],
  };
}

export function buildOrdersListExportFilename(
  dateRangeFilter: DateRangeFilterValue,
  tab: 'pending' | 'approved' | 'rejected' | 'all',
  exportType: 'filtered' | 'all'
): string {
  const today = new Date().toISOString().split('T')[0];
  const scopeSlug = exportType === 'all' ? 'all_unfiltered' : 'filtered';
  const tabSlug = tab === 'all' ? 'all_orders' : tab;

  if (
    dateRangeFilter.preset === 'custom' &&
    dateRangeFilter.customStart &&
    dateRangeFilter.customEnd
  ) {
    return `orders_list_${scopeSlug}_${tabSlug}_${formatDateForInput(dateRangeFilter.customStart)}_to_${formatDateForInput(dateRangeFilter.customEnd)}_${today}`;
  }

  const presetSlug = exportType === 'all' ? 'all_time' : dateRangeFilter.preset;
  return `orders_list_${scopeSlug}_${tabSlug}_${presetSlug}_${today}`;
}

function styleColumnHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
  });
}

function writeAmountSummaryRow(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  label: string,
  amount: number,
  options?: { emphasis?: boolean }
): number {
  const row = worksheet.getRow(rowIndex);
  worksheet.mergeCells(rowIndex, 1, rowIndex, 5);
  row.getCell(1).value = label;
  row.getCell(1).font = { bold: true, size: options?.emphasis ? 11 : 10 };
  row.getCell(1).alignment = { vertical: 'middle' };

  const amountCell = row.getCell(6);
  amountCell.value = amount;
  amountCell.numFmt = PHP_CURRENCY_FMT;
  amountCell.font = { bold: true, size: options?.emphasis ? 11 : 10 };
  amountCell.alignment = { horizontal: 'right', vertical: 'middle' };

  return rowIndex + 1;
}

function writeMetaRows(worksheet: ExcelJS.Worksheet, meta: OrderListExportMeta): number {
  let rowIndex = 1;

  const titleRow = worksheet.getRow(rowIndex++);
  worksheet.mergeCells(rowIndex - 1, 1, rowIndex - 1, COLUMN_COUNT);
  titleRow.getCell(1).value = 'Order List Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };

  const addMetaRow = (label: string, value: string) => {
    const row = worksheet.getRow(rowIndex++);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    worksheet.mergeCells(rowIndex - 1, 2, rowIndex - 1, COLUMN_COUNT);
    row.getCell(2).value = value;
  };

  addMetaRow(
    'Export',
    meta.exportType === 'filtered' ? 'Filtered (current filters)' : 'All orders (no filters)'
  );
  addMetaRow(
    'Tab',
    meta.exportType === 'all' ? 'All statuses' : meta.tabLabel
  );
  addMetaRow(
    'Date range',
    meta.exportType === 'all' ? 'All time' : meta.dateLabel
  );
  addMetaRow(
    'Payment method',
    meta.exportType === 'all' ? 'All payment methods' : meta.paymentLabel
  );
  if (meta.searchLabel) {
    addMetaRow('Search', meta.searchLabel);
  }
  addMetaRow('Orders exported', String(meta.orderCount));

  rowIndex += 1;

  const summaryHeader = worksheet.getRow(rowIndex++);
  worksheet.mergeCells(rowIndex - 1, 1, rowIndex - 1, COLUMN_COUNT);
  summaryHeader.getCell(1).value = 'Amount summary (exported rows)';
  summaryHeader.getCell(1).font = { bold: true, size: 11 };
  summaryHeader.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F4F6' },
  };

  const { summary } = meta;
  rowIndex = writeAmountSummaryRow(
    worksheet,
    rowIndex,
    'Total amount',
    summary.totalAmount
  );
  rowIndex = writeAmountSummaryRow(
    worksheet,
    rowIndex,
    'Approved amount',
    summary.approvedAmount
  );
  rowIndex = writeAmountSummaryRow(
    worksheet,
    rowIndex,
    'Pending Finance Review amount',
    summary.pendingFinanceReviewAmount
  );
  rowIndex = writeAmountSummaryRow(
    worksheet,
    rowIndex,
    'Rejected amount',
    summary.rejectedAmount
  );
  rowIndex = writeAmountSummaryRow(
    worksheet,
    rowIndex,
    'Approved + Pending Finance Review amount',
    summary.approvedAndPendingAmount,
    { emphasis: true }
  );

  rowIndex += 1;
  return rowIndex;
}

export async function exportOrdersListExcel(
  rows: OrderListExportRow[],
  filenamePrefix: string,
  meta: OrderListExportMeta
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Orders');
  worksheet.columns = [
    { width: 22 },
    { width: 28 },
    { width: 22 },
    { width: 14 },
    { width: 10 },
    { width: 14 },
    { width: 32 },
  ];

  const dataStartRow = writeMetaRows(worksheet, meta);

  const headerRow = worksheet.getRow(dataStartRow);
  HEADERS.forEach((label, i) => {
    headerRow.getCell(i + 1).value = label;
  });
  styleColumnHeader(headerRow);

  rows.forEach((row, index) => {
    const excelRow = worksheet.getRow(dataStartRow + 1 + index);
    excelRow.getCell(1).value = row.orderNumber;
    excelRow.getCell(2).value = row.clientName;
    excelRow.getCell(3).value = row.agentName;
    excelRow.getCell(4).value = row.date;
    excelRow.getCell(5).value = row.items;
    excelRow.getCell(5).alignment = { horizontal: 'right' };
    const amountCell = excelRow.getCell(6);
    amountCell.value = row.amount;
    amountCell.numFmt = PHP_CURRENCY_FMT;
    amountCell.alignment = { horizontal: 'right' };
    const statusCell = excelRow.getCell(7);
    applyStatusCellStyle(statusCell, row);
    if (row.statusSub) {
      excelRow.height = Math.max(excelRow.height ?? 15, 36);
    }
  });

  const fileBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${filenamePrefix}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}
