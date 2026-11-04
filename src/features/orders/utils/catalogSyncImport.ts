import ExcelJS from 'exceljs';
import { supabase } from '@/lib/supabase';
import { CATALOG_SYNC_HEADERS } from './exportBrandsAndVariantsExcel';

export type CatalogSyncRow = {
  brand_name: string;
  variant_name: string;
  variant_type: string;
  sku: string;
  excel_row: number;
};

export type CatalogSyncAction = 'create_brand' | 'create_variant' | 'update_variant' | 'skip' | 'error';

export type CatalogSyncPreviewItem = {
  action: CatalogSyncAction;
  brand_name: string;
  variant_name: string;
  variant_type: string;
  sku: string;
  excel_row: number;
  message?: string;
  brand_id?: string;
  variant_id?: string;
  variant_type_id?: string;
};

export type CatalogSyncApplyResult = {
  createdBrands: number;
  createdVariants: number;
  updatedVariants: number;
  skipped: number;
  errors: string[];
};

function cellText(value: ExcelJS.CellValue | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (typeof value === 'object' && 'text' in value && typeof (value as { text?: unknown }).text === 'string') {
    return String((value as { text: string }).text).trim();
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellText((value as { result?: ExcelJS.CellValue }).result);
  }
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeTypeKey(value: string): string {
  const key = value.trim().toLowerCase();
  if (key === 'posm') return 'posm';
  return key;
}

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Parse a flat Catalog Sync workbook exported from Brands
 * (columns: brand_name, variant_name, variant_type, sku).
 */
export async function parseCatalogSyncExcel(file: File): Promise<CatalogSyncRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet =
    workbook.getWorksheet('Catalog Sync') ||
    workbook.worksheets.find((ws) => {
      const first = ws.getRow(1);
      const headers = [1, 2, 3, 4].map((col) => normalizeHeader(cellText(first.getCell(col).value)));
      return headers[0] === 'brand_name' && headers[1] === 'variant_name';
    }) ||
    workbook.worksheets[0];

  if (!sheet) throw new Error('No worksheet found in the Excel file.');

  const headerRow = sheet.getRow(1);
  const headerMap = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const key = normalizeHeader(cellText(cell.value));
    if (key) headerMap.set(key, col);
  });

  const aliases: Record<(typeof CATALOG_SYNC_HEADERS)[number], string[]> = {
    brand_name: ['brand_name', 'brand'],
    variant_name: ['variant_name', 'variant'],
    variant_type: ['variant_type', 'type'],
    sku: ['sku'],
  };

  const cols: Partial<Record<(typeof CATALOG_SYNC_HEADERS)[number], number>> = {};
  for (const field of CATALOG_SYNC_HEADERS) {
    for (const alias of aliases[field]) {
      const col = headerMap.get(alias);
      if (col) {
        cols[field] = col;
        break;
      }
    }
  }

  if (!cols.brand_name || !cols.variant_name || !cols.variant_type) {
    throw new Error(
      'Missing required columns. Expected brand_name, variant_name, variant_type (sku optional).'
    );
  }

  const rows: CatalogSyncRow[] = [];
  const seen = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const brand_name = cellText(row.getCell(cols.brand_name!).value);
    const variant_name = cellText(row.getCell(cols.variant_name!).value);
    const variant_type = cellText(row.getCell(cols.variant_type!).value);
    const sku = cols.sku ? cellText(row.getCell(cols.sku).value) : '';
    if (!brand_name && !variant_name) return;
    if (!brand_name || !variant_name) {
      rows.push({
        brand_name,
        variant_name,
        variant_type,
        sku,
        excel_row: rowNumber,
      });
      return;
    }
    const key = `${nameKey(brand_name)}||${nameKey(variant_name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ brand_name, variant_name, variant_type, sku, excel_row: rowNumber });
  });

  if (rows.length === 0) throw new Error('No catalog rows found in the file.');
  return rows;
}

type HubBrand = { id: string; name: string; is_active: boolean | null };
type HubVariant = {
  id: string;
  brand_id: string;
  name: string;
  variant_type: string | null;
  sku: string | null;
  is_active: boolean | null;
};
type HubType = { id: string; name: string };

export async function previewCatalogSyncImport(
  companyId: string,
  rows: CatalogSyncRow[]
): Promise<CatalogSyncPreviewItem[]> {
  const [{ data: brands, error: brandsErr }, { data: variants, error: variantsErr }, { data: types, error: typesErr }] =
    await Promise.all([
      supabase
        .from('brands')
        .select('id, name, is_active')
        .eq('company_id', companyId),
      supabase
        .from('variants')
        .select('id, brand_id, name, variant_type, sku, is_active')
        .eq('company_id', companyId),
      supabase
        .from('variant_types')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true),
    ]);

  if (brandsErr) throw brandsErr;
  if (variantsErr) throw variantsErr;
  if (typesErr) throw typesErr;

  const brandByName = new Map<string, HubBrand>();
  for (const b of (brands || []) as HubBrand[]) {
    brandByName.set(nameKey(b.name), b);
  }

  const variantsByBrand = new Map<string, HubVariant[]>();
  for (const v of (variants || []) as HubVariant[]) {
    const list = variantsByBrand.get(v.brand_id) || [];
    list.push(v);
    variantsByBrand.set(v.brand_id, list);
  }

  const typeByName = new Map<string, HubType>();
  for (const t of (types || []) as HubType[]) {
    typeByName.set(normalizeTypeKey(t.name), t);
  }

  return rows.map((row) => {
    if (!row.brand_name.trim() || !row.variant_name.trim()) {
      return {
        action: 'error' as const,
        ...row,
        message: 'brand_name and variant_name are required',
      };
    }
    if (!row.variant_type.trim()) {
      return {
        action: 'error' as const,
        ...row,
        message: 'variant_type is required',
      };
    }

    const type = typeByName.get(normalizeTypeKey(row.variant_type));
    if (!type) {
      return {
        action: 'error' as const,
        ...row,
        message: `Unknown variant_type "${row.variant_type}". Create it under Variant Types first.`,
      };
    }

    const brand = brandByName.get(nameKey(row.brand_name));
    if (!brand) {
      return {
        action: 'create_brand' as const,
        ...row,
        variant_type_id: type.id,
        message: 'Brand will be created',
      };
    }
    if (brand.is_active === false) {
      return {
        action: 'create_brand' as const,
        ...row,
        brand_id: brand.id,
        variant_type_id: type.id,
        message: 'Brand exists inactive — will reactivate and add variant',
      };
    }

    const existingVariant = (variantsByBrand.get(brand.id) || []).find(
      (v) => nameKey(v.name) === nameKey(row.variant_name)
    );

    if (!existingVariant || existingVariant.is_active === false) {
      return {
        action: 'create_variant' as const,
        ...row,
        brand_id: brand.id,
        variant_id: existingVariant?.id,
        variant_type_id: type.id,
        message: existingVariant ? 'Variant inactive — will reactivate' : undefined,
      };
    }

    const typeSame = normalizeTypeKey(existingVariant.variant_type || '') === normalizeTypeKey(row.variant_type);
    const skuIncoming = row.sku.trim();
    const skuSame = !skuIncoming || (existingVariant.sku || '') === skuIncoming;
    if (typeSame && skuSame) {
      return {
        action: 'skip' as const,
        ...row,
        brand_id: brand.id,
        variant_id: existingVariant.id,
        variant_type_id: type.id,
        message: 'Already matches',
      };
    }

    return {
      action: 'update_variant' as const,
      ...row,
      brand_id: brand.id,
      variant_id: existingVariant.id,
      variant_type_id: type.id,
      message: [
        !typeSame ? `type ${existingVariant.variant_type || '—'} → ${row.variant_type}` : null,
        skuIncoming && !skuSame ? `sku → ${skuIncoming}` : null,
      ]
        .filter(Boolean)
        .join('; '),
    };
  });
}

export async function applyCatalogSyncImport(
  companyId: string,
  items: CatalogSyncPreviewItem[]
): Promise<CatalogSyncApplyResult> {
  const result: CatalogSyncApplyResult = {
    createdBrands: 0,
    createdVariants: 0,
    updatedVariants: 0,
    skipped: 0,
    errors: [],
  };

  const brandIdByName = new Map<string, string>();

  for (const item of items) {
    if (item.action === 'skip') {
      result.skipped += 1;
      continue;
    }
    if (item.action === 'error') {
      result.errors.push(`Row ${item.excel_row}: ${item.message || 'Invalid row'}`);
      continue;
    }

    try {
      let brandId = item.brand_id || brandIdByName.get(nameKey(item.brand_name));

      if (item.action === 'create_brand' || !brandId) {
        if (item.brand_id) {
          const { error } = await supabase
            .from('brands')
            .update({ is_active: true, name: item.brand_name.trim() })
            .eq('id', item.brand_id)
            .eq('company_id', companyId);
          if (error) throw error;
          brandId = item.brand_id;
        } else {
          const { data: existingList, error: findErr } = await supabase
            .from('brands')
            .select('id, name, is_active')
            .eq('company_id', companyId);
          if (findErr) throw findErr;
          const existing = (existingList || []).find((b) => nameKey(b.name) === nameKey(item.brand_name));

          if (existing?.id) {
            if (existing.is_active === false) {
              const { error } = await supabase
                .from('brands')
                .update({ is_active: true, name: item.brand_name.trim() })
                .eq('id', existing.id)
                .eq('company_id', companyId);
              if (error) throw error;
            }
            brandId = existing.id;
          } else {
            const { data: created, error } = await supabase
              .from('brands')
              .insert({
                company_id: companyId,
                name: item.brand_name.trim(),
                is_active: true,
              })
              .select('id')
              .single();
            if (error) throw error;
            brandId = created.id;
            result.createdBrands += 1;
          }
        }
        brandIdByName.set(nameKey(item.brand_name), brandId);
      }

      if (!brandId) throw new Error('Brand id missing after create');
      if (!item.variant_type_id) throw new Error('variant_type_id missing');

      if (item.action === 'create_brand' || item.action === 'create_variant') {
        if (item.variant_id) {
          const { error } = await supabase
            .from('variants')
            .update({
              is_active: true,
              name: item.variant_name.trim(),
              variant_type_id: item.variant_type_id,
              sku: item.sku.trim() || null,
            })
            .eq('id', item.variant_id)
            .eq('company_id', companyId);
          if (error) throw error;
          result.createdVariants += 1;
        } else {
          const { data: existingList, error: findErr } = await supabase
            .from('variants')
            .select('id, name, is_active')
            .eq('company_id', companyId)
            .eq('brand_id', brandId);
          if (findErr) throw findErr;
          const existingVariant = (existingList || []).find(
            (v) => nameKey(v.name) === nameKey(item.variant_name)
          );

          if (existingVariant?.id) {
            const { error } = await supabase
              .from('variants')
              .update({
                is_active: true,
                name: item.variant_name.trim(),
                variant_type_id: item.variant_type_id,
                sku: item.sku.trim() || null,
              })
              .eq('id', existingVariant.id)
              .eq('company_id', companyId);
            if (error) throw error;
            if (existingVariant.is_active === false) result.createdVariants += 1;
            else result.updatedVariants += 1;
          } else {
            const { error } = await supabase.from('variants').insert({
              company_id: companyId,
              brand_id: brandId,
              name: item.variant_name.trim(),
              variant_type_id: item.variant_type_id,
              sku: item.sku.trim() || null,
              is_active: true,
            });
            if (error) throw error;
            result.createdVariants += 1;
          }
        }
        continue;
      }

      if (item.action === 'update_variant' && item.variant_id) {
        const { error } = await supabase
          .from('variants')
          .update({
            variant_type_id: item.variant_type_id,
            ...(item.sku.trim() ? { sku: item.sku.trim() } : {}),
          })
          .eq('id', item.variant_id)
          .eq('company_id', companyId);
        if (error) throw error;
        result.updatedVariants += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Row ${item.excel_row}: ${item.brand_name} / ${item.variant_name} — ${message}`);
    }
  }

  return result;
}
