import ExcelJS from 'exceljs';

import type { Order } from '@/features/orders/OrderContext';
import { mapOrderToListExportRow } from '@/features/orders/utils/exportOrdersListExcel';
import { formatDateForInput } from '@/lib/dateRangePresets';
import {
  downloadExcelWorkbook,
  EXCEL_EXPORT_HEADER_FILL,
  formatExportGeneratedAt,
  writeExcelExportMetaRow,
  writeExcelExportTitleRow,
} from '@/lib/excel.helpers';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';

const YELLOW = 'FFFDE68A';
const GRAY = 'FFD1D5DB';
const LIGHT_GRAY = 'FFF3F4F6';
const GREEN_TINT = 'FFDCFCE7';
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};
const PHP = '"₱"#,##0.00';

const TOP_BRAND_COL = { start: 1, end: 6 };
const TOP_AGENT_COL = { start: 8, end: 12 };
const FIXED_COLS = { date: 1, agent: 2, orderNumber: 3, client: 4 };
const SPACER_AFTER_BRAND = true;

const SUB_HEADERS = [
  'VARIANTS',
  'Qty',
  'Price',
  'Line Total',
  'Units Sold',
  'Pending Sold',
  'Approved Rev',
  'Pending Rev',
] as const;
const BRAND_COLS = SUB_HEADERS.length;

type BrandLineItem = { variant: string; qty: number; price: number };

type WideExportOrder = {
  agent: string;
  orderNumber: string;
  client: string;
  date: string;
  statusPrimary: string;
  statusSub: string | null;
  statusPrimaryVariant: 'default' | 'secondary' | 'destructive';
  statusSubKind: 'deposit_recorded' | 'awaiting_slip' | 'awaiting_remittance' | null;
  approved: boolean;
  brandItems: Record<string, BrandLineItem[]>;
};

type ColumnLayout = {
  brands: string[];
  brandStarts: { name: string; start: number }[];
  statusCol: number;
  lastCol: number;
  productsStart: number;
  productsEnd: number;
};

export type OrderBreakdownExportMeta = {
  dateRangeLabel: string;
  periodStart: string;
  periodEnd: string;
  tabLabel: string;
  orderCount: number;
};

const PRIMARY_STATUS_TEXT_COLORS = {
  default: 'FF472160',
  secondary: 'FF1A0F2E',
  destructive: 'FFEF4444',
} as const;

const SUB_STATUS_TEXT_COLORS = {
  deposit_recorded: 'FF1D4ED8',
  awaiting_slip: 'FFC2410C',
  awaiting_remittance: 'FFB45309',
} as const;

function isOrderApproved(order: Order): boolean {
  return order.status === 'approved' || order.stage === 'admin_approved';
}

function extractBrandsFromOrders(orders: Order[]): string[] {
  const brands = new Set<string>();
  for (const order of orders) {
    for (const item of order.items) {
      brands.add(item.brandName?.trim() || 'Unknown');
    }
  }
  return [...brands].sort((a, b) => a.localeCompare(b));
}

function buildColumnLayout(brands: string[]): ColumnLayout {
  let col = 5;
  const brandStarts: ColumnLayout['brandStarts'] = [];
  for (let i = 0; i < brands.length; i++) {
    brandStarts.push({ name: brands[i], start: col });
    col += BRAND_COLS;
    if (SPACER_AFTER_BRAND && i < brands.length - 1) col += 1;
  }
  return {
    brands,
    brandStarts,
    statusCol: col,
    lastCol: col,
    productsStart: 5,
    productsEnd: col - 1,
  };
}

function mapOrderToWideExport(order: Order, brands: string[]): WideExportOrder {
  const exportRow = mapOrderToListExportRow(order);
  const brandItems: Record<string, BrandLineItem[]> = Object.fromEntries(
    brands.map((b) => [b, []])
  );

  for (const item of order.items) {
    const brand = item.brandName?.trim() || 'Unknown';
    if (!brandItems[brand]) brandItems[brand] = [];
    brandItems[brand].push({
      variant: item.variantName,
      qty: item.quantity,
      price: item.unitPrice,
    });
  }

  return {
    agent: order.agentName,
    orderNumber: order.orderNumber,
    client: order.clientName,
    date: new Date(order.date).toLocaleDateString(),
    statusPrimary: exportRow.statusPrimary,
    statusSub: exportRow.statusSub,
    statusPrimaryVariant: exportRow.statusPrimaryVariant,
    statusSubKind: exportRow.statusSubKind,
    approved: isOrderApproved(order),
    brandItems,
  };
}

function splitLineMetrics(qty: number, lineTotal: number, approved: boolean) {
  return {
    unitsSold: approved ? qty : 0,
    pendingSold: approved ? 0 : qty,
    approvedRev: approved ? lineTotal : 0,
    pendingRev: approved ? 0 : lineTotal,
  };
}

function sumBrandMetrics(items: BrandLineItem[], approved: boolean) {
  return items.reduce(
    (acc, it) => {
      const lineTotal = it.qty * it.price;
      const m = splitLineMetrics(it.qty, lineTotal, approved);
      acc.lineTotal += lineTotal;
      acc.unitsSold += m.unitsSold;
      acc.pendingSold += m.pendingSold;
      acc.approvedRev += m.approvedRev;
      acc.pendingRev += m.pendingRev;
      return acc;
    },
    { lineTotal: 0, unitsSold: 0, pendingSold: 0, approvedRev: 0, pendingRev: 0 }
  );
}

function borderRange(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      ws.getRow(r).getCell(c).border = THIN;
    }
  }
}

function styleHeaderCell(cell: ExcelJS.Cell, fill = YELLOW) {
  cell.font = { bold: true };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.border = THIN;
}

function fillGray(cell: ExcelJS.Cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } };
}

function applyStatusCellStyle(cell: ExcelJS.Cell, order: WideExportOrder) {
  const primaryColor = PRIMARY_STATUS_TEXT_COLORS[order.statusPrimaryVariant];
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };

  if (!order.statusSub || !order.statusSubKind) {
    cell.value = order.statusPrimary;
    cell.font = { bold: true, color: { argb: primaryColor }, size: 10 };
    return;
  }

  const subColor = SUB_STATUS_TEXT_COLORS[order.statusSubKind];
  cell.value = {
    richText: [
      {
        text: order.statusPrimary,
        font: { bold: true, size: 10, color: { argb: primaryColor } },
      },
      {
        text: `\n${order.statusSub}`,
        font: { bold: true, size: 9, color: { argb: subColor } },
      },
    ],
  };
}

function aggregateAllOrders(orders: WideExportOrder[], brands: string[]) {
  const byBrand: Record<
    string,
    { unitsSold: number; pendingSold: number; approvedRev: number; pendingRev: number }
  > = {};
  for (const brand of brands) {
    byBrand[brand] = { unitsSold: 0, pendingSold: 0, approvedRev: 0, pendingRev: 0 };
  }
  for (const order of orders) {
    for (const brand of brands) {
      const items = order.brandItems[brand] ?? [];
      const m = sumBrandMetrics(items, order.approved);
      byBrand[brand].unitsSold += m.unitsSold;
      byBrand[brand].pendingSold += m.pendingSold;
      byBrand[brand].approvedRev += m.approvedRev;
      byBrand[brand].pendingRev += m.pendingRev;
    }
  }
  return byBrand;
}

function aggregateByAgent(orders: WideExportOrder[], brands: string[]) {
  const byAgent: Record<string, { approved: number; pending: number }> = {};
  for (const order of orders) {
    if (!byAgent[order.agent]) byAgent[order.agent] = { approved: 0, pending: 0 };
    for (const brand of brands) {
      const items = order.brandItems[brand] ?? [];
      const m = sumBrandMetrics(items, order.approved);
      byAgent[order.agent].approved += m.approvedRev;
      byAgent[order.agent].pending += m.pendingRev;
    }
  }
  return Object.entries(byAgent)
    .map(([agent, v]) => ({
      agent,
      approved: v.approved,
      pending: v.pending,
      total: v.approved + v.pending,
    }))
    .sort((a, b) => b.total - a.total);
}

function writeExportHeader(
  ws: ExcelJS.Worksheet,
  startRow: number,
  lastCol: number,
  meta: OrderBreakdownExportMeta,
  generatedAt: Date
): number {
  const dateRangeLabel =
    meta.periodStart === 'all' && meta.periodEnd === 'all'
      ? 'All time'
      : meta.dateRangeLabel;

  let row = writeExcelExportTitleRow(ws, startRow, 'Order Breakdown Export', lastCol, {
    fillArgb: EXCEL_EXPORT_HEADER_FILL,
    height: 22,
  });
  row = writeExcelExportMetaRow(ws, row, 'Generated at', formatExportGeneratedAt(generatedAt));
  row = writeExcelExportMetaRow(ws, row, 'Tab', meta.tabLabel);
  row = writeExcelExportMetaRow(ws, row, 'Date range', dateRangeLabel);
  row = writeExcelExportMetaRow(ws, row, 'Orders exported', meta.orderCount);
  return row + 1;
}

function writeBrandGrandSummary(
  ws: ExcelJS.Worksheet,
  startRow: number,
  orders: WideExportOrder[],
  brands: string[],
  dateRangeLabel: string
) {
  const { start: sc, end: ec } = TOP_BRAND_COL;
  const byBrand = aggregateAllOrders(orders, brands);
  let row = startRow;

  ws.mergeCells(row, sc, row, ec);
  const title = ws.getRow(row).getCell(sc);
  title.value = 'Product Summary (by Brand)';
  title.font = { bold: true, size: 13 };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
  row += 2;

  for (const [label, value] of [
    ['Date range', dateRangeLabel],
    ['Brand count', String(brands.length)],
  ]) {
    const mr = ws.getRow(row);
    mr.getCell(sc).value = label;
    mr.getCell(sc).font = { bold: true };
    ws.mergeCells(row, sc + 1, row, ec);
    mr.getCell(sc + 1).value = value;
    row++;
  }
  row += 1;

  const summaryHeaders = [
    'Brand',
    'Units Sold',
    'Pending Sold',
    'Approved Revenue',
    'Pending Revenue',
    'Total Revenue',
  ];
  const hdr = ws.getRow(row);
  summaryHeaders.forEach((label, i) => {
    styleHeaderCell(hdr.getCell(sc + i));
    hdr.getCell(sc + i).value = label;
  });
  row++;

  let grandUnits = 0;
  let grandPending = 0;
  let grandAppr = 0;
  let grandPend = 0;

  for (const brand of brands) {
    const b = byBrand[brand];
    const totalRev = b.approvedRev + b.pendingRev;
    const dr = ws.getRow(row);
    dr.getCell(sc).value = brand;
    dr.getCell(sc).font = { bold: true };
    dr.getCell(sc + 1).value = b.unitsSold;
    dr.getCell(sc + 1).alignment = { horizontal: 'center' };
    dr.getCell(sc + 2).value = b.pendingSold;
    dr.getCell(sc + 2).alignment = { horizontal: 'center' };
    dr.getCell(sc + 3).value = b.approvedRev;
    dr.getCell(sc + 3).numFmt = PHP;
    dr.getCell(sc + 3).alignment = { horizontal: 'right' };
    dr.getCell(sc + 4).value = b.pendingRev;
    dr.getCell(sc + 4).numFmt = PHP;
    dr.getCell(sc + 4).alignment = { horizontal: 'right' };
    dr.getCell(sc + 5).value = totalRev;
    dr.getCell(sc + 5).numFmt = PHP;
    dr.getCell(sc + 5).alignment = { horizontal: 'right' };
    borderRange(ws, row, sc, row, ec);
    grandUnits += b.unitsSold;
    grandPending += b.pendingSold;
    grandAppr += b.approvedRev;
    grandPend += b.pendingRev;
    row++;
  }

  const totalRow = ws.getRow(row);
  totalRow.getCell(sc).value = 'TOTAL';
  totalRow.getCell(sc).font = { bold: true };
  totalRow.getCell(sc + 1).value = grandUnits;
  totalRow.getCell(sc + 1).font = { bold: true };
  totalRow.getCell(sc + 1).alignment = { horizontal: 'center' };
  totalRow.getCell(sc + 2).value = grandPending;
  totalRow.getCell(sc + 2).font = { bold: true };
  totalRow.getCell(sc + 2).alignment = { horizontal: 'center' };
  totalRow.getCell(sc + 3).value = grandAppr;
  totalRow.getCell(sc + 3).numFmt = PHP;
  totalRow.getCell(sc + 3).font = { bold: true };
  totalRow.getCell(sc + 3).alignment = { horizontal: 'right' };
  totalRow.getCell(sc + 4).value = grandPend;
  totalRow.getCell(sc + 4).numFmt = PHP;
  totalRow.getCell(sc + 4).font = { bold: true };
  totalRow.getCell(sc + 4).alignment = { horizontal: 'right' };
  totalRow.getCell(sc + 5).value = grandAppr + grandPend;
  totalRow.getCell(sc + 5).numFmt = PHP;
  totalRow.getCell(sc + 5).font = { bold: true };
  totalRow.getCell(sc + 5).alignment = { horizontal: 'right' };
  for (let c = sc; c <= ec; c++) fillGray(totalRow.getCell(c));
  borderRange(ws, row, sc, row, ec);
  row += 2;

  ws.mergeCells(row, sc, row, sc + 1);
  ws.getRow(row).getCell(sc).value = 'Amount summary';
  ws.getRow(row).getCell(sc).font = { bold: true, size: 11 };
  ws.getRow(row).getCell(sc).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: LIGHT_GRAY },
  };
  row++;

  const brandSummaryLines: [string, number][] = [
    ['Total revenue', grandAppr + grandPend],
    ['Approved revenue', grandAppr],
    ['Pending revenue', grandPend],
    ['Approved + Pending', grandAppr + grandPend],
  ];
  for (const [label, amount] of brandSummaryLines) {
    const sr = ws.getRow(row);
    sr.getCell(sc).value = label;
    sr.getCell(sc).font = { bold: true };
    sr.getCell(sc + 1).value = amount;
    sr.getCell(sc + 1).numFmt = PHP;
    sr.getCell(sc + 1).font = { bold: label.includes('Approved + Pending') };
    if (label.includes('Approved + Pending')) {
      sr.getCell(sc + 1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: GREEN_TINT },
      };
    }
    row++;
  }

  ws.getRow(row).getCell(sc).value = 'Units Sold (approved)';
  ws.getRow(row).getCell(sc).font = { bold: true };
  ws.getRow(row).getCell(sc + 1).value = grandUnits;
  ws.getRow(row).getCell(sc + 1).font = { bold: true };
  row++;
  ws.getRow(row).getCell(sc).value = 'Pending Sold';
  ws.getRow(row).getCell(sc).font = { bold: true };
  ws.getRow(row).getCell(sc + 1).value = grandPending;
  ws.getRow(row).getCell(sc + 1).font = { bold: true };

  return row + 1;
}

function writeAgentAnalyticsSummary(
  ws: ExcelJS.Worksheet,
  startRow: number,
  agentRows: { agent: string; approved: number; pending: number; total: number }[],
  dateRangeLabel: string
) {
  const { start: sc, end: ec } = TOP_AGENT_COL;
  let row = startRow;

  ws.mergeCells(row, sc, row, ec);
  const title = ws.getRow(row).getCell(sc);
  title.value = 'Agent Analytics';
  title.font = { bold: true, size: 13 };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
  row += 2;

  for (const [label, value] of [
    ['Date range', dateRangeLabel],
    ['Agents', String(agentRows.length)],
  ]) {
    const mr = ws.getRow(row);
    mr.getCell(sc).value = label;
    mr.getCell(sc).font = { bold: true };
    ws.mergeCells(row, sc + 1, row, ec);
    mr.getCell(sc + 1).value = value;
    row++;
  }
  row += 1;

  const headers = ['Agent', 'Approved Revenue', 'Pending Revenue', 'Total Revenue'];
  const hdr = ws.getRow(row);
  headers.forEach((label, i) => {
    styleHeaderCell(hdr.getCell(sc + i));
    hdr.getCell(sc + i).value = label;
  });
  row++;

  let totAppr = 0;
  let totPend = 0;

  for (const a of agentRows) {
    const dr = ws.getRow(row);
    dr.getCell(sc).value = a.agent;
    dr.getCell(sc).font = { bold: true };
    dr.getCell(sc + 1).value = a.approved;
    dr.getCell(sc + 1).numFmt = PHP;
    dr.getCell(sc + 1).alignment = { horizontal: 'right' };
    dr.getCell(sc + 2).value = a.pending;
    dr.getCell(sc + 2).numFmt = PHP;
    dr.getCell(sc + 2).alignment = { horizontal: 'right' };
    dr.getCell(sc + 3).value = a.total;
    dr.getCell(sc + 3).numFmt = PHP;
    dr.getCell(sc + 3).alignment = { horizontal: 'right' };
    borderRange(ws, row, sc, row, ec);
    totAppr += a.approved;
    totPend += a.pending;
    row++;
  }

  const totalRow = ws.getRow(row);
  totalRow.getCell(sc).value = 'TOTAL';
  totalRow.getCell(sc).font = { bold: true };
  totalRow.getCell(sc + 1).value = totAppr;
  totalRow.getCell(sc + 1).numFmt = PHP;
  totalRow.getCell(sc + 1).font = { bold: true };
  totalRow.getCell(sc + 1).alignment = { horizontal: 'right' };
  totalRow.getCell(sc + 2).value = totPend;
  totalRow.getCell(sc + 2).numFmt = PHP;
  totalRow.getCell(sc + 2).font = { bold: true };
  totalRow.getCell(sc + 2).alignment = { horizontal: 'right' };
  totalRow.getCell(sc + 3).value = totAppr + totPend;
  totalRow.getCell(sc + 3).numFmt = PHP;
  totalRow.getCell(sc + 3).font = { bold: true };
  totalRow.getCell(sc + 3).alignment = { horizontal: 'right' };
  for (let c = sc; c <= ec; c++) fillGray(totalRow.getCell(c));
  borderRange(ws, row, sc, row, ec);
  row += 2;

  ws.mergeCells(row, sc, row, sc + 1);
  ws.getRow(row).getCell(sc).value = 'Amount summary';
  ws.getRow(row).getCell(sc).font = { bold: true, size: 11 };
  ws.getRow(row).getCell(sc).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: LIGHT_GRAY },
  };
  row++;

  const agentSummaryLines: [string, number][] = [
    ['Total approved revenue', totAppr],
    ['Total pending revenue', totPend],
    ['Total revenue', totAppr + totPend],
    ['Approved + Pending', totAppr + totPend],
  ];
  for (const [label, amount] of agentSummaryLines) {
    const sr = ws.getRow(row);
    sr.getCell(sc).value = label;
    sr.getCell(sc).font = { bold: true };
    sr.getCell(sc + 1).value = amount;
    sr.getCell(sc + 1).numFmt = PHP;
    sr.getCell(sc + 1).font = { bold: label.includes('Approved + Pending') };
    if (label.includes('Approved + Pending')) {
      sr.getCell(sc + 1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: GREEN_TINT },
      };
    }
    row++;
  }

  return row + 1;
}

function writeTopSummarySection(
  ws: ExcelJS.Worksheet,
  startRow: number,
  orders: WideExportOrder[],
  brands: string[],
  dateRangeLabel: string
) {
  const agentRows = aggregateByAgent(orders, brands);
  const brandEnd = writeBrandGrandSummary(ws, startRow, orders, brands, dateRangeLabel);
  const agentEnd = writeAgentAnalyticsSummary(ws, startRow, agentRows, dateRangeLabel);
  return Math.max(brandEnd, agentEnd);
}

function writeGlobalHeaders(ws: ExcelJS.Worksheet, startRow: number, layout: ColumnLayout) {
  const { brandStarts, statusCol, lastCol, productsStart, productsEnd } = layout;
  const r1 = startRow;
  const r2 = startRow + 1;
  const r3 = startRow + 2;
  const r4 = startRow + 3;

  const row1 = ws.getRow(r1);
  for (const [col, label] of [
    [FIXED_COLS.date, 'Date'],
    [FIXED_COLS.agent, 'Agent'],
    [FIXED_COLS.orderNumber, 'Order #'],
    [FIXED_COLS.client, 'Client'],
  ] as const) {
    styleHeaderCell(row1.getCell(col));
    row1.getCell(col).value = label;
  }
  ws.mergeCells(r1, productsStart, r1, productsEnd);
  styleHeaderCell(row1.getCell(productsStart));
  row1.getCell(productsStart).value = 'Products';
  styleHeaderCell(row1.getCell(statusCol));
  row1.getCell(statusCol).value = 'Status';

  const row2 = ws.getRow(r2);
  ws.mergeCells(r2, productsStart, r2, productsEnd);
  styleHeaderCell(row2.getCell(productsStart));
  row2.getCell(productsStart).value = 'Brands';

  const row3 = ws.getRow(r3);
  for (const { name, start } of brandStarts) {
    ws.mergeCells(r3, start, r3, start + BRAND_COLS - 1);
    styleHeaderCell(row3.getCell(start));
    row3.getCell(start).value = name;
  }

  const row4 = ws.getRow(r4);
  for (const { start } of brandStarts) {
    SUB_HEADERS.forEach((label, i) => {
      styleHeaderCell(row4.getCell(start + i));
      row4.getCell(start + i).value = label;
    });
  }

  borderRange(ws, r1, 1, r4, lastCol);
  return r4 + 1;
}

function writeOrderBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  order: WideExportOrder,
  layout: ColumnLayout
) {
  const { brandStarts, statusCol, lastCol } = layout;
  const maxItems = Math.max(
    1,
    ...brandStarts.map(({ name }) => order.brandItems[name]?.length ?? 0)
  );
  const totalRow = startRow + maxItems;
  const endRow = totalRow;

  for (const col of [
    FIXED_COLS.date,
    FIXED_COLS.agent,
    FIXED_COLS.orderNumber,
    FIXED_COLS.client,
    statusCol,
  ]) {
    ws.mergeCells(startRow, col, endRow, col);
    const cell = ws.getRow(startRow).getCell(col);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = THIN;
  }

  ws.getRow(startRow).getCell(FIXED_COLS.date).value = order.date;
  ws.getRow(startRow).getCell(FIXED_COLS.agent).value = order.agent;
  ws.getRow(startRow).getCell(FIXED_COLS.orderNumber).value = order.orderNumber;
  ws.getRow(startRow).getCell(FIXED_COLS.client).value = order.client;
  const statusCell = ws.getRow(startRow).getCell(statusCol);
  applyStatusCellStyle(statusCell, order);
  if (order.statusSub) {
    ws.getRow(startRow).height = Math.max(ws.getRow(startRow).height ?? 15, 36);
  }

  for (const { name, start } of brandStarts) {
    const items = order.brandItems[name] ?? [];
    const metrics = sumBrandMetrics(items, order.approved);

    for (let i = 0; i < maxItems; i++) {
      const row = ws.getRow(startRow + i);
      const item = items[i];
      if (item) {
        const lineTotal = item.qty * item.price;
        const m = splitLineMetrics(item.qty, lineTotal, order.approved);
        row.getCell(start).value = item.variant;
        row.getCell(start + 1).value = item.qty;
        row.getCell(start + 1).alignment = { horizontal: 'center' };
        row.getCell(start + 2).value = item.price;
        row.getCell(start + 2).alignment = { horizontal: 'center' };
        row.getCell(start + 3).value = lineTotal;
        row.getCell(start + 3).numFmt = PHP;
        row.getCell(start + 3).alignment = { horizontal: 'right' };
        row.getCell(start + 4).value = m.unitsSold || '';
        row.getCell(start + 4).alignment = { horizontal: 'center' };
        row.getCell(start + 5).value = m.pendingSold || '';
        row.getCell(start + 5).alignment = { horizontal: 'center' };
        if (m.approvedRev) {
          row.getCell(start + 6).value = m.approvedRev;
          row.getCell(start + 6).numFmt = PHP;
          row.getCell(start + 6).alignment = { horizontal: 'right' };
        }
        if (m.pendingRev) {
          row.getCell(start + 7).value = m.pendingRev;
          row.getCell(start + 7).numFmt = PHP;
          row.getCell(start + 7).alignment = { horizontal: 'right' };
        }
      }
      for (let c = start; c < start + BRAND_COLS; c++) {
        row.getCell(c).border = THIN;
      }
    }

    const tr = ws.getRow(totalRow);
    ws.mergeCells(totalRow, start, totalRow, start + 2);
    const totalLabel = tr.getCell(start);
    totalLabel.value = 'TOTAL:';
    totalLabel.font = { bold: true };
    totalLabel.alignment = { horizontal: 'right', vertical: 'middle' };
    fillGray(totalLabel);
    tr.getCell(start + 3).value = metrics.lineTotal;
    tr.getCell(start + 3).numFmt = PHP;
    tr.getCell(start + 3).font = { bold: true };
    tr.getCell(start + 3).alignment = { horizontal: 'right' };
    fillGray(tr.getCell(start + 3));
    tr.getCell(start + 4).value = metrics.unitsSold;
    tr.getCell(start + 4).font = { bold: true };
    tr.getCell(start + 4).alignment = { horizontal: 'center' };
    fillGray(tr.getCell(start + 4));
    tr.getCell(start + 5).value = metrics.pendingSold;
    tr.getCell(start + 5).font = { bold: true };
    tr.getCell(start + 5).alignment = { horizontal: 'center' };
    fillGray(tr.getCell(start + 5));
    tr.getCell(start + 6).value = metrics.approvedRev;
    tr.getCell(start + 6).numFmt = PHP;
    tr.getCell(start + 6).font = { bold: true };
    tr.getCell(start + 6).alignment = { horizontal: 'right' };
    fillGray(tr.getCell(start + 6));
    tr.getCell(start + 7).value = metrics.pendingRev;
    tr.getCell(start + 7).numFmt = PHP;
    tr.getCell(start + 7).font = { bold: true };
    tr.getCell(start + 7).alignment = { horizontal: 'right' };
    fillGray(tr.getCell(start + 7));
    for (let c = start; c < start + BRAND_COLS; c++) {
      tr.getCell(c).border = THIN;
    }
  }

  borderRange(ws, startRow, 1, endRow, lastCol);
  return endRow + 1;
}

function applyWorksheetColumnWidths(ws: ExcelJS.Worksheet, layout: ColumnLayout) {
  ws.getColumn(FIXED_COLS.date).width = 14;
  ws.getColumn(FIXED_COLS.agent).width = 12;
  ws.getColumn(FIXED_COLS.orderNumber).width = 22;
  ws.getColumn(FIXED_COLS.client).width = 10;
  for (const { start } of layout.brandStarts) {
    ws.getColumn(start).width = 16;
    ws.getColumn(start + 1).width = 7;
    ws.getColumn(start + 2).width = 8;
    ws.getColumn(start + 3).width = 12;
    ws.getColumn(start + 4).width = 10;
    ws.getColumn(start + 5).width = 11;
    ws.getColumn(start + 6).width = 13;
    ws.getColumn(start + 7).width = 13;
  }
  ws.getColumn(layout.statusCol).width = 28;
  ws.getColumn(TOP_AGENT_COL.start).width = 16;
  ws.getColumn(TOP_AGENT_COL.start + 1).width = 18;
  ws.getColumn(TOP_AGENT_COL.start + 2).width = 18;
  ws.getColumn(TOP_AGENT_COL.start + 3).width = 16;
}

export function buildOrderBreakdownExportFilename(
  dateRangeFilter: DateRangeFilterValue,
  tab: 'pending' | 'approved' | 'rejected' | 'all'
): string {
  const today = new Date().toISOString().split('T')[0];
  const tabSlug = tab === 'all' ? 'all_orders' : tab;

  if (
    dateRangeFilter.preset === 'custom' &&
    dateRangeFilter.customStart &&
    dateRangeFilter.customEnd
  ) {
    return `orders_breakdown_${tabSlug}_${formatDateForInput(dateRangeFilter.customStart)}_to_${formatDateForInput(dateRangeFilter.customEnd)}_${today}`;
  }

  const presetSlug = dateRangeFilter.preset === 'all' ? 'all_time' : dateRangeFilter.preset;
  return `orders_breakdown_${tabSlug}_${presetSlug}_${today}`;
}

export async function exportOrderBreakdownExcel(
  orders: Order[],
  filenamePrefix: string,
  meta: OrderBreakdownExportMeta
): Promise<void> {
  const brands = extractBrandsFromOrders(orders);
  const layout = buildColumnLayout(brands.length > 0 ? brands : ['No products']);
  const wideOrders = orders.map((o) => mapOrderToWideExport(o, layout.brands));

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Order Breakdown');
  applyWorksheetColumnWidths(ws, layout);

  const dateRangeLabel =
    meta.periodStart === 'all' && meta.periodEnd === 'all'
      ? 'All time'
      : meta.dateRangeLabel;

  let row = 1;
  row = writeExportHeader(ws, row, layout.lastCol, meta, new Date());
  row = writeTopSummarySection(ws, row, wideOrders, layout.brands, dateRangeLabel);

  row += 1;
  ws.mergeCells(row, 1, row, layout.lastCol);
  const divider = ws.getRow(row).getCell(1);
  divider.value = '── Order Details ──';
  divider.font = { bold: true, size: 11, color: { argb: 'FF6B7280' } };
  divider.alignment = { horizontal: 'center', vertical: 'middle' };
  divider.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  ws.getRow(row).height = 20;
  row += 2;

  row = writeGlobalHeaders(ws, row, layout);
  for (const order of wideOrders) {
    row = writeOrderBlock(ws, row, order, layout);
  }

  await downloadExcelWorkbook(workbook, filenamePrefix);
}
