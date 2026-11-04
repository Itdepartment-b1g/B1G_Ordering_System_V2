import ExcelJS from 'exceljs';
import { downloadExcelWorkbook } from '@/lib/excel.helpers';

type ExportBrand = { id: string; name: string };
type ExportVariant = {
  brand_id: string;
  name: string;
  variant_type?: string | null;
  sku?: string | null;
};
export type BrandsAndVariantsLayout = 'columns' | 'stacked' | 'flat';

/** Flat catalog columns used for warehouse sync (standard company → warehouse). */
export const CATALOG_SYNC_HEADERS = ['brand_name', 'variant_name', 'variant_type', 'sku'] as const;

export function buildBrandsAndVariantsWorkbook(
  brands: ExportBrand[],
  variants: ExportVariant[],
  layout: BrandsAndVariantsLayout = 'columns'
): ExcelJS.Workbook {
  if (brands.length === 0) throw new Error('No brands available to export.');
  if (layout === 'columns' && brands.length > 16384) throw new Error('Too many brands for one Excel worksheet.');

  const sortedBrands = [...brands].sort((a, b) => a.name.localeCompare(b.name));
  const variantsByBrand = new Map<string, ExportVariant[]>(sortedBrands.map(brand => [brand.id, []]));
  for (const variant of variants) {
    variantsByBrand.get(variant.brand_id)?.push(variant);
  }
  const columns = sortedBrands.map(brand =>
    variantsByBrand.get(brand.id)!.sort((a, b) => a.name.localeCompare(b.name))
  );
  const rowCount = Math.max(0, ...columns.map(column => column.length));
  if (rowCount > 1048575) throw new Error('Too many variants for one Excel worksheet.');

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(layout === 'flat' ? 'Catalog Sync' : 'Brands & Variants');

  if (layout === 'flat') {
    const header = worksheet.addRow([...CATALOG_SYNC_HEADERS]);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.border = { bottom: { style: 'thin' } };
    });
    for (const brand of sortedBrands) {
      const brandVariants = (variantsByBrand.get(brand.id) || []).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      if (brandVariants.length === 0) {
        worksheet.addRow([brand.name, '', '', '']);
        continue;
      }
      for (const variant of brandVariants) {
        worksheet.addRow([
          brand.name,
          variant.name,
          variant.variant_type ?? '',
          variant.sku ?? '',
        ]);
      }
    }
    worksheet.getColumn(1).width = 28;
    worksheet.getColumn(2).width = 36;
    worksheet.getColumn(3).width = 14;
    worksheet.getColumn(4).width = 18;
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    return workbook;
  }

  if (layout === 'stacked') {
    const totalRows = 2 + columns.reduce((count, column) => count + column.length + 2, 0);
    if (totalRows > 1048576) throw new Error('Too many brands and variants for one Excel worksheet.');
    const title = worksheet.addRow(['Brand & Variant OMA']);
    worksheet.mergeCells('A1:B1');
    title.font = { bold: true, size: 16 };
    title.height = 28;
    worksheet.addRow(['']);
    sortedBrands.forEach((brand, index) => {
      const heading = worksheet.addRow([brand.name, 'Variant Type']);
      heading.font = { bold: true, size: 12 };
      heading.getCell(1).border = { bottom: { style: 'thin' } };
      heading.getCell(2).border = { bottom: { style: 'thin' } };
      for (const variant of columns[index]) worksheet.addRow([variant.name, variant.variant_type ?? '']);
      const separator = worksheet.addRow(['', '']);
      separator.getCell(1).border = { top: { style: 'thin' } };
      separator.getCell(2).border = { top: { style: 'thin' } };
    });
    const column = worksheet.getColumn(1);
    let longest = 'Brand & Variant OMA'.length;
    column.eachCell(cell => { longest = Math.max(longest, String(cell.value ?? '').length); });
    column.width = Math.min(80, Math.max(30, longest + 2));
    column.alignment = { vertical: 'top', wrapText: true };
    const typeColumn = worksheet.getColumn(2);
    let longestType = 'Variant Type'.length;
    for (const variant of variants) {
      if (variantsByBrand.has(variant.brand_id)) longestType = Math.max(longestType, variant.variant_type?.length ?? 0);
    }
    typeColumn.width = Math.min(60, Math.max(18, longestType + 2));
    typeColumn.alignment = { vertical: 'top', wrapText: true };
    worksheet.views = [{ state: 'frozen', ySplit: 2 }];
    return workbook;
  }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  const header = worksheet.addRow(sortedBrands.map(brand => brand.name));
  header.font = { bold: true };
  header.eachCell(cell => {
    cell.border = { bottom: { style: 'thin' } };
    cell.alignment = { vertical: 'top', wrapText: true };
  });

  for (let row = 0; row < rowCount; row++) {
    worksheet.addRow(columns.map(column => column[row]?.name ?? ''));
  }
  sortedBrands.forEach((brand, index) => {
    const column = worksheet.getColumn(index + 1);
    const longest = columns[index].reduce((length, variant) => Math.max(length, variant.name.length), brand.name.length);
    column.width = Math.min(60, Math.max(20, longest + 2));
    column.alignment = { vertical: 'top', wrapText: true };
  });
  return workbook;
}

export async function exportBrandsAndVariantsExcel(
  brands: ExportBrand[],
  variants: ExportVariant[],
  layout: BrandsAndVariantsLayout = 'columns'
): Promise<void> {
  const workbook = buildBrandsAndVariantsWorkbook(brands, variants, layout);
  const filename =
    layout === 'stacked'
      ? 'Brand_and_Variant_OMA.xlsx'
      : layout === 'flat'
        ? 'Catalog_Sync_Brand_Variant_Type.xlsx'
        : 'Brands_and_Variants.xlsx';
  await downloadExcelWorkbook(workbook, filename);
}
