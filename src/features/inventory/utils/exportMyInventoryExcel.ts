import ExcelJS from 'exceljs';

import { downloadExcelWorkbook, excelWrappedRowHeight, formatExportGeneratedAt } from '@/lib/excel.helpers';

const YELLOW = 'FFFFFF00';
const GREEN = 'FFB6D7A8';
const BORDERS: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  bottom: { style: 'thin' },
  left: { style: 'thin' },
  right: { style: 'thin' },
};
const HEADERS = ['BRAND', 'VARIANT', 'TYPE', 'QTY', 'TOTAL QTY'];

export type MyInventoryExcelLine = {
  brandId: string;
  brandName: string;
  variantName: string;
  variantType: string;
  qty: number;
};

export type MyInventoryExcelInput = {
  heldByName?: string | null;
  lines: MyInventoryExcelLine[];
};

function typeLabel(type: string): string {
  const key = type?.trim().toLowerCase() || '';
  if (!key) return '—';
  if (key === 'foc') return 'FOC';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function writeHeading(ws: ExcelJS.Worksheet, row: number, text: string, fill: string): number {
  ws.mergeCells(row, 1, row, HEADERS.length);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: 'Arial', size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const width = HEADERS.reduce((sum, _, index) => sum + (ws.getColumn(index + 1).width ?? 14), 0);
  ws.getRow(row).height = Math.max(ws.getRow(row).height ?? 0, excelWrappedRowHeight([{ text, width }], 21));
  return row + 1;
}

export async function exportMyInventoryExcel(input: MyInventoryExcelInput): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'B1G Ordering System';
  workbook.calcProperties.fullCalcOnLoad = true;
  const generatedAt = new Date();
  const heldBy = input.heldByName?.trim() || 'My Inventory';
  workbook.title = 'My Inventory';
  workbook.subject = `${heldBy} • ${formatExportGeneratedAt(generatedAt)}`;

  const ws = workbook.addWorksheet('My Inventory', {
    properties: { defaultRowHeight: 21 },
    views: [{ state: 'frozen', ySplit: 2, topLeftCell: 'A3', showGridLines: true, zoomScale: 90 }],
  });

  const lines = [...input.lines].sort(
    (a, b) =>
      a.brandName.localeCompare(b.brandName) ||
      a.brandId.localeCompare(b.brandId) ||
      a.variantName.localeCompare(b.variantName) ||
      a.variantType.localeCompare(b.variantType)
  );
  const maxVariant = lines.reduce((max, line) => Math.max(max, line.variantName.length), 0);
  const maxType = lines.reduce((max, line) => Math.max(max, typeLabel(line.variantType).length), 0);
  [14, Math.min(40, Math.max(18, maxVariant + 2)), Math.min(24, Math.max(14, maxType + 2)), 14, 14].forEach(
    (width, index) => {
      ws.getColumn(index + 1).width = width;
    }
  );

  let row = writeHeading(ws, 1, heldBy, 'FFFFD966');
  const header = ws.getRow(row++);
  HEADERS.forEach((label, index) => {
    const cell = header.getCell(index + 1);
    cell.value = label;
    cell.font = { name: 'Arial', size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDERS;
  });
  header.height = Math.max(header.height ?? 0, 23);

  const brands = new Map<string, MyInventoryExcelLine[]>();
  for (const line of lines) {
    const group = brands.get(line.brandId) ?? [];
    group.push(line);
    brands.set(line.brandId, group);
  }

  const totalCells: string[] = [];
  let grandTotal = 0;
  for (const group of brands.values()) {
    const first = row;
    const last = first + group.length - 1;
    const total = group.reduce((sum, line) => sum + line.qty, 0);
    grandTotal += total;
    for (const line of group) {
      const data = ws.getRow(row++);
      data.getCell(2).value = line.variantName;
      data.getCell(3).value = typeLabel(line.variantType);
      data.getCell(4).value = line.qty;
      data.height = Math.max(
        excelWrappedRowHeight(
          [
            { text: line.variantName, width: ws.getColumn(2).width ?? 22 },
            { text: typeLabel(line.variantType), width: ws.getColumn(3).width ?? 14 },
          ],
          21
        ),
        data.height ?? 0,
        Math.ceil((group[0].brandName.length * 7 + 12) / group.length)
      );
      for (let column = 1; column <= 5; column += 1) {
        const cell = data.getCell(column);
        cell.border = BORDERS;
        cell.font = { name: 'Arial', size: 10 };
        cell.alignment = {
          vertical: 'middle',
          horizontal: column === 4 ? 'right' : 'left',
          wrapText: true,
        };
      }
      data.getCell(4).numFmt = '#,##0';
    }
    if (last > first) {
      ws.mergeCells(first, 1, last, 1);
      ws.mergeCells(first, 5, last, 5);
    }
    const brandCell = ws.getCell(first, 1);
    brandCell.value = group[0].brandName;
    brandCell.alignment = { textRotation: 90, vertical: 'middle', horizontal: 'center' };
    const totalCell = ws.getCell(first, 5);
    totalCell.value = { formula: `SUM(${ws.getCell(first, 4).address}:${ws.getCell(last, 4).address})`, result: total };
    totalCell.font = { name: 'Arial', size: 24 };
    totalCell.numFmt = '#,##0';
    totalCell.alignment = { vertical: 'middle', horizontal: 'center' };
    for (let brandRow = first; brandRow <= last; brandRow += 1) {
      ws.getCell(brandRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    }
    totalCells.push(totalCell.address);
  }

  ws.mergeCells(row, 1, row, 4);
  ws.getCell(row, 1).value = 'GRAND TOTAL';
  ws.getCell(row, 5).value = totalCells.length ? { formula: totalCells.join('+'), result: grandTotal } : 0;
  for (let column = 1; column <= 5; column += 1) {
    const cell = ws.getCell(row, column);
    cell.border = BORDERS;
    cell.font = { name: 'Arial', size: 10 };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  }
  ws.getCell(row, 5).numFmt = '"TOTAL: "#,##0';
  ws.getRow(row).height = 21;

  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    scale: 85,
    fitToPage: false,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  ws.headerFooter.oddHeader = `&L${heldBy.replace(/&/g, '&&')}&RMy Inventory`;
  ws.headerFooter.oddFooter = `&L${formatExportGeneratedAt(generatedAt)}&RPage &P of &N`;

  const date = generatedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  await downloadExcelWorkbook(workbook, `my-inventory-${date}`);
}
