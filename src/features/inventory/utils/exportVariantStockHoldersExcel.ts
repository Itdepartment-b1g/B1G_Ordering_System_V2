import ExcelJS from 'exceljs';

import {
  downloadExcelWorkbook,
  formatExportGeneratedAt,
  writeExcelExportMetaRow,
  writeExcelExportTitleRow,
} from '@/lib/excel.helpers';
import { getRoleDisplayName } from '@/lib/roleUtils';

export type VariantStockHoldersExcelLine = {
  holderName: string;
  role: string;
  leaderName?: string | null;
  status: 'active' | 'inactive';
  qty: number;
};

export type VariantStockHoldersExcelInput = {
  brandName: string;
  variantName: string;
  variantType?: string | null;
  lines: VariantStockHoldersExcelLine[];
  /** Optional filename suffix, e.g. a holder name for single-row export. */
  fileSuffix?: string | null;
};

const HEADERS = ['Name', 'Role', 'Team Leader', 'Status', 'Qty'] as const;

export async function exportVariantStockHoldersExcel(
  input: VariantStockHoldersExcelInput
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'B1G Ordering System';
  const generatedAt = new Date();
  const productLabel = `${input.brandName} — ${input.variantName}${
    input.variantType ? ` (${input.variantType})` : ''
  }`;
  workbook.title = 'Stock Holders';
  workbook.subject = `${productLabel} • ${formatExportGeneratedAt(generatedAt)}`;

  const ws = workbook.addWorksheet('Stock Holders', {
    properties: { defaultRowHeight: 20 },
    views: [{ state: 'frozen', ySplit: 3, topLeftCell: 'A4', showGridLines: true }],
  });

  [28, 18, 24, 12, 12].forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });

  let row = writeExcelExportTitleRow(ws, 1, 'Stock Holders', HEADERS.length);
  row = writeExcelExportMetaRow(ws, row, 'Product', productLabel, {
    valueMergeEndCol: HEADERS.length,
  });
  row = writeExcelExportMetaRow(ws, row, 'Generated', formatExportGeneratedAt(generatedAt), {
    valueMergeEndCol: HEADERS.length,
  });

  const header = ws.getRow(row++);
  HEADERS.forEach((label, index) => {
    const cell = header.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.alignment = { vertical: 'middle', horizontal: index === 4 ? 'right' : 'left' };
  });

  for (const line of input.lines) {
    const dataRow = ws.getRow(row++);
    dataRow.getCell(1).value = line.holderName;
    dataRow.getCell(2).value = getRoleDisplayName(line.role);
    dataRow.getCell(3).value =
      line.role === 'mobile_sales' ? line.leaderName?.trim() || 'Unassigned' : '—';
    dataRow.getCell(4).value = line.status === 'inactive' ? 'Inactive' : 'Active';
    dataRow.getCell(5).value = line.qty;
    dataRow.getCell(5).alignment = { horizontal: 'right' };
  }

  const safeProduct = `${input.brandName}_${input.variantName}`
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
  const safeSuffix = (input.fileSuffix || '')
    .trim()
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 24);
  const filename = safeSuffix
    ? `stock_holders_${safeProduct}_${safeSuffix}.xlsx`
    : `stock_holders_${safeProduct}.xlsx`;

  await downloadExcelWorkbook(workbook, filename);
}
