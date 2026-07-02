import ExcelJS from 'exceljs';

import { formatLotDate } from '@/features/inventory/physical-count/utils/formatLotDate';

import type { WarehouseAllocationGroup } from '../types';
import { formatManilaDateTime } from '../table/TableRow';

function styleHeader(row: ExcelJS.Row, fill: string) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  });
}

function variantTypeLabel(type: string | null): string {
  if (!type) return '—';
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'Flavor';
  if (normalized === 'battery') return 'Battery';
  if (normalized === 'foc') return 'FOC';
  return type;
}

export async function exportWarehouseAllocationHistoryExcel(
  rows: WarehouseAllocationGroup[],
  filenamePrefix: string
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Allocation History');
  worksheet.columns = [
    { width: 24 },
    { width: 24 },
    { width: 18 },
    { width: 24 },
    { width: 10 },
    { width: 12 },
  ];

  const tableHeader = ['Date', 'Sub-Warehouse', 'Brand', 'Performed By', 'SKUs', 'Total Units'];
  const variantHeader = ['Brand', 'Variant', 'Type', 'Quantity', 'Batch', 'Expiration', 'Batch Qty'];
  let rowCursor = 1;

  rows.forEach((group, index) => {
    const headerRow = worksheet.getRow(rowCursor++);
    tableHeader.forEach((value, i) => (headerRow.getCell(i + 1).value = value));
    styleHeader(headerRow, 'FFFDE68A');

    const dataRow = worksheet.getRow(rowCursor++);
    dataRow.getCell(1).value = formatManilaDateTime(group.createdAt);
    dataRow.getCell(2).value = group.locationName;
    dataRow.getCell(3).value = group.brandName ?? '—';
    dataRow.getCell(4).value = group.performedByName;
    dataRow.getCell(5).value = group.lineCount;
    dataRow.getCell(6).value = group.totalQuantity;

    const sectionRow = worksheet.getRow(rowCursor++);
    worksheet.mergeCells(`A${sectionRow.number}:F${sectionRow.number}`);
    sectionRow.getCell(1).value = 'Variants and batches';
    styleHeader(sectionRow, 'FFBBF7D0');

    const vhRow = worksheet.getRow(rowCursor++);
    variantHeader.forEach((value, i) => (vhRow.getCell(i + 1).value = value));
    styleHeader(vhRow, 'FFE5E7EB');

    if (group.lines.length === 0) {
      const emptyRow = worksheet.getRow(rowCursor++);
      worksheet.mergeCells(`A${emptyRow.number}:G${emptyRow.number}`);
      emptyRow.getCell(1).value = 'No linked variant lines';
      emptyRow.getCell(1).font = { italic: true };
    } else {
      group.lines.forEach((line) => {
        if (line.batches.length === 0) {
          const lineRow = worksheet.getRow(rowCursor++);
          lineRow.getCell(1).value = line.brandName;
          lineRow.getCell(2).value = line.variantName;
          lineRow.getCell(3).value = variantTypeLabel(line.variantType);
          lineRow.getCell(4).value = line.quantity;
          lineRow.getCell(5).value = '—';
          lineRow.getCell(6).value = '—';
          lineRow.getCell(7).value = '—';
        } else {
          line.batches.forEach((batch, batchIndex) => {
            const lineRow = worksheet.getRow(rowCursor++);
            if (batchIndex === 0) {
              lineRow.getCell(1).value = line.brandName;
              lineRow.getCell(2).value = line.variantName;
              lineRow.getCell(3).value = variantTypeLabel(line.variantType);
              lineRow.getCell(4).value = line.quantity;
            }
            lineRow.getCell(5).value = batch.batchNumber;
            lineRow.getCell(6).value = formatLotDate(batch.expirationDate);
            lineRow.getCell(7).value = batch.quantity;
          });
        }
      });
    }

    if (index < rows.length - 1) rowCursor += 1;
  });

  const fileBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const downloadUrl = URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${filenamePrefix}_${date}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}
