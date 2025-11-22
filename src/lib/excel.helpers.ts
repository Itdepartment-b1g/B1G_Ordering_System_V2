
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

    // Add header row
    // Capitalize and replace underscores for better readability
    const formattedHeaders = headers.map(h =>
        h.charAt(0).toUpperCase() + h.slice(1).replace(/_/g, ' ')
    );
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
