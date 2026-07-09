
import ExcelJS from 'exceljs';

export const EXCEL_EXPORT_HEADER_FILL = 'FFF3F4F6';

export function formatExportGeneratedAt(date: Date = new Date()): string {
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export type WriteExcelExportMetaRowOptions = {
  valueMergeEndCol?: number;
};

export function writeExcelExportTitleRow(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  lastCol: number,
  options?: { fillArgb?: string; height?: number }
): number {
  worksheet.mergeCells(startRow, 1, startRow, lastCol);
  const cell = worksheet.getRow(startRow).getCell(1);
  cell.value = title;
  cell.font = { bold: true, size: 14 };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  if (options?.fillArgb) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fillArgb } };
  }
  if (options?.height) {
    worksheet.getRow(startRow).height = options.height;
  }
  return startRow + 2;
}

export function writeExcelExportMetaRow(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  label: string,
  value: string | number,
  options?: WriteExcelExportMetaRowOptions
): number {
  const row = worksheet.getRow(rowIndex);
  row.getCell(1).value = label;
  row.getCell(1).font = { bold: true };
  const mergeEnd = options?.valueMergeEndCol;
  if (mergeEnd && mergeEnd > 2) {
    worksheet.mergeCells(rowIndex, 2, rowIndex, mergeEnd);
  }
  row.getCell(2).value = value;
  return rowIndex + 1;
}

/**
 * Exports data to a CSV file which can be opened in Excel.
 * @param data Array of objects to export
 * @param onProgress Optional callback for progress tracking
 * @param filename Optional filename (default: clients_export_[date].csv)
 */
export async function exportClientsToExcel(
    data: any[],
    onProgress?: (current: number, total: number) => void,
    filename?: string
): Promise<void> {
    if (!data || data.length === 0) {
        return;
    }

    // Generate filename with date if not provided
    if (!filename) {
        const date = new Date().toISOString().split('T')[0];
        filename = `clients_export_${date}.csv`;
    }

    // Simulate starting progress
    if (onProgress) onProgress(0, data.length);

    // Get headers from the first object
    const headers = Object.keys(data[0]);

    // Create CSV content
    const csvRows = [];

    // Add header row: human-readable labels (acronyms and common names)
    const headerLabels: Record<string, string> = {
        id: 'ID',
        tin: 'TIN',
        trade_name: 'Trade Name',
        shop_name: 'Shop Name',
        contact_person: 'Contact Person',
        agent_name: 'Agent Name',
        account_type: 'Account Type',
        total_orders: 'Total Orders',
        total_spent: 'Total Spent',
        visit_count: 'Visit Count',
        last_order_date: 'Last Order Date',
        approval_status: 'Approval Status',
        created_at: 'Created At',
        updated_at: 'Updated At',
        location_latitude: 'Location Latitude',
        location_longitude: 'Location Longitude',
        location_accuracy: 'Location Accuracy',
        location_captured_at: 'Location Captured At',
    };
    const formatHeader = (h: string) =>
        headerLabels[h] ?? (h.charAt(0).toUpperCase() + h.slice(1).replace(/_/g, ' '));
    const formattedHeaders = headers.map(formatHeader);
    csvRows.push(formattedHeaders.join(','));

    // Add data rows
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const values = headers.map(header => {
            const val = row[header];
            // Handle strings that might contain commas, quotes or newlines
            const stringVal = val === null || val === undefined ? '' : String(val);
            const escaped = stringVal.replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));

        // Report progress
        // Yield to event loop every 50 items to allow UI updates
        if (i % 50 === 0) {
            if (onProgress) onProgress(i + 1, data.length);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    // Final progress update
    if (onProgress) onProgress(data.length, data.length);

    // Create and download blob
    const csvString = csvRows.join('\n');
    // Add BOM for Excel to correctly interpret UTF-8
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export async function downloadExcelWorkbook(
    workbook: ExcelJS.Workbook,
    filename: string
): Promise<void> {
    const fileBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([fileBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
}
