import ExcelJS from 'exceljs';

import type { Order } from '@/features/orders/OrderContext';
import {
  isPostedClientReturn,
  type PreviewClientReturn,
  type PreviewClientReturnLine,
} from '@/features/orders/client-returns/clientReturnPreview';
import {
  excelWrappedRowHeight,
  EXCEL_EXPORT_HEADER_FILL,
  formatExportGeneratedAt,
  writeExcelExportMetaRow,
  writeExcelExportTitleRow,
} from '@/lib/excel.helpers';

type PostedReturnsSheetMeta = {
  dateRangeLabel: string;
  periodStart: string;
  periodEnd: string;
  tabLabel: string;
  orderCount: number;
};

const YELLOW = 'FFFDE68A';
const LIGHT_GRAY = 'FFF3F4F6';
const CHANGE_VARIANT_GREEN = 'FF047857';
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const HEADERS = [
  'Date',
  'Agent',
  'Order #',
  'Client',
  'CR #',
  'Returned Brand',
  'Returned Variant',
  'Returned Qty',
  'Change Brand',
  'Change Variant',
  'Change Qty',
] as const;

const COLUMN_COUNT = HEADERS.length;

export type PostedReturnExportRow = {
  date: string;
  agent: string;
  orderNumber: string;
  client: string;
  returnNumber: string;
  returnedBrand: string;
  returnedVariant: string;
  returnedQty: number | null;
  changeBrand: string;
  changeVariant: string;
  changeQty: number | null;
};

export type PostedChangeLine = {
  brandName: string;
  variantName: string;
  quantity: number;
};

function formatReturnDate(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function variantNameKey(brandName: string, variantName: string): string {
  return `${brandName.trim().toLowerCase()}|${variantName.trim().toLowerCase()}`;
}

export function getPostedReturnsForOrder(
  order: Order,
  returns: PreviewClientReturn[]
): PreviewClientReturn[] {
  return returns.filter((cr) => {
    if (!isPostedClientReturn(cr)) return false;
    if (cr.clientOrderId && cr.clientOrderId === order.id) return true;
    return cr.orderNumber === order.orderNumber;
  });
}

function returnLineMatchesOrderItem(
  line: PreviewClientReturnLine,
  item: { clientOrderItemId?: string; brandName: string; variantName: string }
): boolean {
  if (item.clientOrderItemId && line.clientOrderItemId) {
    return item.clientOrderItemId === line.clientOrderItemId;
  }
  return variantNameKey(line.brandName, line.variantName) === variantNameKey(item.brandName, item.variantName);
}

export function getPostedReturnedQtyForOrderItem(
  item: { clientOrderItemId?: string; brandName: string; variantName: string },
  postedReturns: PreviewClientReturn[]
): number {
  let qty = 0;
  for (const cr of postedReturns) {
    for (const line of cr.lines || []) {
      if (returnLineMatchesOrderItem(line, item)) qty += line.quantity;
    }
  }
  return qty;
}

export function getPostedChangeLinesForOrder(
  postedReturns: PreviewClientReturn[]
): PostedChangeLine[] {
  const merged = new Map<string, PostedChangeLine>();
  for (const cr of postedReturns) {
    for (const line of cr.changeLines || []) {
      const brandName = line.brandName?.trim() || 'Unknown';
      const variantName = line.variantName || 'Unknown';
      const key = `${brandName}|${variantName}`;
      const current = merged.get(key);
      if (current) {
        current.quantity += line.quantity;
      } else {
        merged.set(key, { brandName, variantName, quantity: line.quantity });
      }
    }
  }
  return [...merged.values()];
}

export type ChangeVariantPool = Map<string, { variantName: string; remaining: number }[]>;

export function buildChangeVariantPoolByBrand(
  postedReturns: PreviewClientReturn[]
): ChangeVariantPool {
  const byBrand: ChangeVariantPool = new Map();
  for (const line of getPostedChangeLinesForOrder(postedReturns)) {
    const brand = line.brandName.trim() || 'Unknown';
    const list = byBrand.get(brand) || [];
    list.push({ variantName: line.variantName, remaining: line.quantity });
    byBrand.set(brand, list);
  }
  return byBrand;
}

export type AllocatedChangeVariant = {
  variantName: string;
  quantity: number;
};

export function takeChangeVariantsFromPool(
  pool: ChangeVariantPool,
  brandName: string,
  qtyNeeded: number
): AllocatedChangeVariant[] {
  if (qtyNeeded <= 0) return [];
  const list = pool.get(brandName.trim() || 'Unknown');
  if (!list?.length) return [];

  const allocated: AllocatedChangeVariant[] = [];
  let left = qtyNeeded;
  for (const item of list) {
    if (left <= 0) break;
    if (item.remaining <= 0) continue;
    const used = Math.min(item.remaining, left);
    const existing = allocated.find((entry) => entry.variantName === item.variantName);
    if (existing) existing.quantity += used;
    else allocated.push({ variantName: item.variantName, quantity: used });
    item.remaining -= used;
    left -= used;
  }
  return allocated;
}

export function buildPostedReturnExportRows(
  orders: Order[],
  returns: PreviewClientReturn[]
): PostedReturnExportRow[] {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const orderByNumber = new Map(orders.map((order) => [order.orderNumber, order]));
  const rows: PostedReturnExportRow[] = [];

  for (const cr of returns) {
    if (!isPostedClientReturn(cr)) continue;
    const order =
      (cr.clientOrderId ? orderById.get(cr.clientOrderId) : undefined) ||
      orderByNumber.get(cr.orderNumber);
    const returned = cr.lines || [];
    const change = cr.changeLines || [];
    const lineCount = Math.max(returned.length, change.length, 1);

    for (let i = 0; i < lineCount; i++) {
      const returnedLine = returned[i];
      const changeLine = change[i];
      rows.push({
        date: formatReturnDate(cr.returnDate),
        agent: order?.agentName || cr.returnedByName,
        orderNumber: order?.orderNumber || cr.orderNumber,
        client: order?.clientName || cr.clientName,
        returnNumber: cr.returnNumber,
        returnedBrand: returnedLine?.brandName || '',
        returnedVariant: returnedLine?.variantName || '',
        returnedQty: returnedLine ? returnedLine.quantity : null,
        changeBrand: changeLine?.brandName || '',
        changeVariant: changeLine?.variantName || '',
        changeQty: changeLine ? changeLine.quantity : null,
      });
    }
  }

  return rows.sort((a, b) => {
    const orderCmp = a.orderNumber.localeCompare(b.orderNumber);
    if (orderCmp !== 0) return orderCmp;
    const crCmp = a.returnNumber.localeCompare(b.returnNumber);
    if (crCmp !== 0) return crCmp;
    return (a.returnedVariant || a.changeVariant).localeCompare(
      b.returnedVariant || b.changeVariant
    );
  });
}

function styleHeaderCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
  cell.border = THIN;
}

export function writePostedReturnsSheet(
  workbook: ExcelJS.Workbook,
  rows: PostedReturnExportRow[],
  meta: PostedReturnsSheetMeta
): void {
  const ws = workbook.addWorksheet('Posted returns');
  ws.columns = [
    { width: 14 },
    { width: 18 },
    { width: 22 },
    { width: 18 },
    { width: 22 },
    { width: 16 },
    { width: 22 },
    { width: 12 },
    { width: 16 },
    { width: 22 },
    { width: 12 },
  ];

  const dateRangeLabel =
    meta.periodStart === 'all' && meta.periodEnd === 'all'
      ? 'All time'
      : meta.dateRangeLabel;
  const postedCrCount = new Set(rows.map((row) => row.returnNumber).filter(Boolean)).size;
  const returnedQty = rows.reduce((sum, row) => sum + (row.returnedQty || 0), 0);
  const changeQty = rows.reduce((sum, row) => sum + (row.changeQty || 0), 0);

  let rowIndex = writeExcelExportTitleRow(
    ws,
    1,
    'Posted client returns (change items)',
    COLUMN_COUNT,
    { fillArgb: EXCEL_EXPORT_HEADER_FILL, height: 22 }
  );
  rowIndex = writeExcelExportMetaRow(ws, rowIndex, 'Generated at', formatExportGeneratedAt());
  rowIndex = writeExcelExportMetaRow(ws, rowIndex, 'Tab', meta.tabLabel);
  rowIndex = writeExcelExportMetaRow(ws, rowIndex, 'Date range', dateRangeLabel);
  rowIndex = writeExcelExportMetaRow(ws, rowIndex, 'Orders exported', meta.orderCount);
  rowIndex = writeExcelExportMetaRow(ws, rowIndex, 'Posted CRs', postedCrCount);
  rowIndex = writeExcelExportMetaRow(ws, rowIndex, 'Returned qty', returnedQty);
  rowIndex = writeExcelExportMetaRow(ws, rowIndex, 'Change item qty', changeQty);
  rowIndex += 1;

  const headerRow = ws.getRow(rowIndex);
  HEADERS.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    styleHeaderCell(cell);
  });
  rowIndex += 1;

  if (rows.length === 0) {
    ws.mergeCells(rowIndex, 1, rowIndex, COLUMN_COUNT);
    const empty = ws.getRow(rowIndex).getCell(1);
    empty.value = 'No posted client returns for these orders.';
    empty.font = { italic: true, color: { argb: 'FF6B7280' } };
    empty.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
    return;
  }

  rows.forEach((row) => {
    const excelRow = ws.getRow(rowIndex);
    excelRow.getCell(1).value = row.date;
    excelRow.getCell(2).value = row.agent;
    excelRow.getCell(3).value = row.orderNumber;
    excelRow.getCell(4).value = row.client;
    excelRow.getCell(5).value = row.returnNumber;
    excelRow.getCell(6).value = row.returnedBrand;
    excelRow.getCell(7).value = row.returnedVariant;
    excelRow.getCell(8).value = row.returnedQty;
    excelRow.getCell(8).alignment = { horizontal: 'center' };
    excelRow.getCell(9).value = row.changeBrand;
    excelRow.getCell(10).value = row.changeVariant;
    excelRow.getCell(11).value = row.changeQty;
    excelRow.getCell(11).alignment = { horizontal: 'center' };
    for (const nameCol of [2, 4, 6, 7, 9, 10]) {
      excelRow.getCell(nameCol).alignment = { wrapText: true, vertical: 'middle' };
    }
    if (row.changeVariant || row.changeQty) {
      for (const changeCol of [9, 10, 11]) {
        excelRow.getCell(changeCol).font = { color: { argb: CHANGE_VARIANT_GREEN } };
      }
    }
    excelRow.height = excelWrappedRowHeight([
      { text: row.agent, width: 18 },
      { text: row.client, width: 18 },
      { text: row.returnedBrand, width: 16 },
      { text: row.returnedVariant, width: 22 },
      { text: row.changeBrand, width: 16 },
      { text: row.changeVariant, width: 22 },
    ]);
    for (let c = 1; c <= COLUMN_COUNT; c++) {
      excelRow.getCell(c).border = THIN;
    }
    rowIndex += 1;
  });
}
