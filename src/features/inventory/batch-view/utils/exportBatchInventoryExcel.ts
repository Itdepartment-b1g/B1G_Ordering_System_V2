import ExcelJS from 'exceljs';

import { BATCH_SOURCE_LABELS } from '@/features/inventory/warehouseBatchAging';
import { formatLotDate } from '@/features/inventory/physical-count/utils/formatLotDate';

import type { BatchInventoryGroup } from '../types';
import { formatManilaDateTime } from '../table/BatchViewRow';

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

function sourceLabel(sourceType: string): string {
  return BATCH_SOURCE_LABELS[sourceType] ?? sourceType;
}

export async function exportBatchInventoryExcel(
  rows: BatchInventoryGroup[],
  filenamePrefix: string
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Batch View');
  worksheet.columns = [
    { width: 22 },
    { width: 22 },
    { width: 10 },
    { width: 12 },
    { width: 22 },
    { width: 18 },
  ];

  const tableHeader = ['Batch', 'Warehouse', 'SKUs', 'Total Units', 'Date', 'Source'];
  const variantHeader = ['Brand', 'Variant', 'Type', 'Expiration', 'Quantity'];
  let rowCursor = 1;

  rows.forEach((group, index) => {
    const headerRow = worksheet.getRow(rowCursor++);
    tableHeader.forEach((value, i) => (headerRow.getCell(i + 1).value = value));
    styleHeader(headerRow, 'FFFDE68A');

    const dataRow = worksheet.getRow(rowCursor++);
    dataRow.getCell(1).value = group.batchNumber;
    dataRow.getCell(2).value = group.locationName;
    dataRow.getCell(3).value = group.skuCount;
    dataRow.getCell(4).value = group.totalUnits;
    dataRow.getCell(5).value = formatManilaDateTime(group.receivedAt);
    dataRow.getCell(6).value = sourceLabel(group.sourceType);

    const sectionRow = worksheet.getRow(rowCursor++);
    worksheet.mergeCells(`A${sectionRow.number}:F${sectionRow.number}`);
    sectionRow.getCell(1).value = 'Brands and variants';
    styleHeader(sectionRow, 'FFBBF7D0');

    const vhRow = worksheet.getRow(rowCursor++);
    variantHeader.forEach((value, i) => (vhRow.getCell(i + 1).value = value));
    styleHeader(vhRow, 'FFE5E7EB');

    if (group.brands.length === 0) {
      const emptyRow = worksheet.getRow(rowCursor++);
      worksheet.mergeCells(`A${emptyRow.number}:E${emptyRow.number}`);
      emptyRow.getCell(1).value = 'No active stock in this batch';
      emptyRow.getCell(1).font = { italic: true };
    } else {
      for (const brand of group.brands) {
        for (const [lotIndex, lot] of brand.lots.entries()) {
          const lineRow = worksheet.getRow(rowCursor++);
          if (lotIndex === 0) {
            lineRow.getCell(1).value = brand.brandName;
          }
          lineRow.getCell(2).value = lot.variantName;
          lineRow.getCell(3).value = variantTypeLabel(lot.variantType);
          lineRow.getCell(4).value = formatLotDate(lot.expirationDate);
          lineRow.getCell(5).value = lot.quantity;
        }
      }
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
