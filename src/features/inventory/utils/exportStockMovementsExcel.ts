import ExcelJS from 'exceljs';
import { format } from 'date-fns';

import {
  downloadExcelWorkbook,
  formatExportGeneratedAt,
  writeExcelExportMetaRow,
  writeExcelExportTitleRow,
} from '@/lib/excel.helpers';
import type { StockMovementRow } from '../stock-movements/stockMovementsApi';
import { formatStockMovementQtyDisplay } from '../stock-movements/stockMovementTypes';

const HEADERS = [
  'Date',
  'Type',
  'Description',
  'Direction',
  'Product',
  'Qty',
  'From location',
  'To location',
  'Linked to',
  'Done by',
  'Notes',
] as const;

function directionLabel(row: StockMovementRow): string {
  if (row.direction === 'in') return 'In';
  if (row.direction === 'out') return 'Out';
  if (row.direction === 'transfer') return 'Transfer';
  return '—';
}

function qtyDisplay(row: StockMovementRow): string {
  return formatStockMovementQtyDisplay({
    quantity: row.quantity,
    direction: row.direction,
    fromLocationRaw: row.fromLocationRaw,
    toLocationRaw: row.toLocationRaw,
    fromQtyBefore: row.fromQtyBefore,
    fromQtyAfter: row.fromQtyAfter,
    toQtyBefore: row.toQtyBefore,
    toQtyAfter: row.toQtyAfter,
  });
}

export async function exportStockMovementsExcel(opts: {
  rows: StockMovementRow[];
  scopeLabel?: string | null;
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'B1G Ordering System';
  const generatedAt = new Date();
  const scope = opts.scopeLabel?.trim() || 'Stock Movements';
  workbook.title = 'Stock Movements';
  workbook.subject = `${scope} • ${formatExportGeneratedAt(generatedAt)}`;

  const ws = workbook.addWorksheet('Stock Movements', {
    properties: { defaultRowHeight: 20 },
    views: [{ state: 'frozen', ySplit: 3, topLeftCell: 'A4', showGridLines: true }],
  });

  [18, 28, 36, 12, 28, 22, 22, 22, 18, 18, 40].forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });

  let row = writeExcelExportTitleRow(ws, 1, 'Stock Movements', HEADERS.length);
  row = writeExcelExportMetaRow(ws, row, 'Scope', scope, {
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
    cell.alignment = { vertical: 'middle', horizontal: index === 5 ? 'right' : 'left' };
  });

  for (const movement of opts.rows) {
    const dataRow = ws.getRow(row++);
    dataRow.getCell(1).value = format(new Date(movement.createdAt), 'yyyy-MM-dd HH:mm');
    dataRow.getCell(2).value = movement.typeLabel;
    dataRow.getCell(3).value = movement.typeDescription;
    dataRow.getCell(4).value = directionLabel(movement);
    dataRow.getCell(5).value = movement.productName;
    dataRow.getCell(6).value = qtyDisplay(movement);
    dataRow.getCell(6).alignment = { horizontal: 'right' };
    dataRow.getCell(7).value = movement.fromLabel;
    dataRow.getCell(8).value = movement.toLabel;
    dataRow.getCell(9).value = movement.referenceType?.replace(/_/g, ' ') || '—';
    dataRow.getCell(10).value = movement.performedByName;
    dataRow.getCell(11).value = movement.notes?.trim() || '—';
  }

  await downloadExcelWorkbook(
    workbook,
    `stock_movements_${format(generatedAt, 'yyyyMMdd_HHmm')}.xlsx`
  );
}
