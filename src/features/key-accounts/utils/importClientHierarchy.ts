import * as XLSX from 'xlsx';

import { supabase } from '@/lib/supabase';
import {
  formatPaymentTerms,
  generateKeyAccountClientCode,
  generateKeyAccountShopCode,
  KEY_ACCOUNT_CLIENT_CATEGORIES,
} from '@/features/key-accounts/keyAccountCodes';
import type { ClientHierarchyExportTab } from '@/features/key-accounts/utils/exportClientHierarchy';

export type ClientHierarchyImportResult = {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type ImportRow = Record<string, string>;

const FIELD_BY_HEADER: Record<string, keyof ImportRow | string> = {
  companyid: 'companyId',
  client: 'clientName',
  clientname: 'clientName',
  code: 'code',
  clientcode: 'code',
  shopcode: 'code',
  category: 'category',
  contact: 'contact',
  contactperson: 'contact',
  contactname: 'contact',
  email: 'email',
  phone: 'phone',
  paymentterms: 'paymentTerms',
  notes: 'notes',
  shop: 'shopName',
  shopname: 'shopName',
  location: 'location',
  region: 'region',
  operatinghours: 'operatingHours',
  cor: 'cor',
  label: 'label',
  addresslabel: 'label',
  address: 'address',
  fulladdress: 'address',
  instructions: 'instructions',
  deliveryinstructions: 'instructions',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cellValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function parseRows(rawRows: Record<string, unknown>[]): ImportRow[] {
  return rawRows.map((raw) => {
    const row: ImportRow = {};
    Object.entries(raw).forEach(([header, value]) => {
      const field = FIELD_BY_HEADER[normalizeHeader(header)];
      if (!field) return;
      row[field] = cellValue(value);
    });
    return row;
  });
}

function isEmptyRow(row: ImportRow, tab: ClientHierarchyExportTab): boolean {
  if (tab === 'clients') {
    return !row.clientName && !row.code && !row.category && !row.contact && !row.email;
  }
  if (tab === 'shops') {
    return !row.shopName && !row.code && !row.location && !row.contact;
  }
  return !row.label && !row.address && !row.location && !row.contact;
}

function isSampleRow(row: ImportRow): boolean {
  const blob = [row.notes, row.instructions, row.clientName, row.shopName, row.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    blob.includes('reference only') ||
    blob.includes('abc trading inc') ||
    blob.includes('example street') ||
    blob.includes('brgy. sample')
  );
}

function parseLocation(location: string) {
  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    city: parts[0] || null,
    province: parts[1] || null,
    region: parts[2] || null,
    zip: parts[3] || null,
  };
}

function matchCategory(value: string) {
  const normalized = value.trim().toLowerCase();
  return KEY_ACCOUNT_CLIENT_CATEGORIES.find((category) => category === normalized) ?? null;
}

async function readSpreadsheetRows(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

export async function importClientHierarchyFile(options: {
  file: File;
  tab: ClientHierarchyExportTab;
  companyId: string;
  userId: string;
  selectedClientId?: string | null;
  selectedShopId?: string | null;
}): Promise<ClientHierarchyImportResult> {
  const { file, tab, companyId, userId, selectedClientId, selectedShopId } = options;
  const result: ClientHierarchyImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  if (tab === 'shops' && !selectedClientId) {
    throw new Error('Select a client before importing shops.');
  }
  if (tab === 'addresses' && !selectedShopId) {
    throw new Error('Select a shop before importing addresses.');
  }

  const parsed = parseRows(await readSpreadsheetRows(file)).filter(
    (row) => !isEmptyRow(row, tab)
  );
  if (parsed.length === 0) {
    throw new Error('No valid rows found in the file.');
  }

  for (const row of parsed) {
    const label =
      row.clientName || row.shopName || row.label || row.code || 'Unknown row';

    if (isSampleRow(row)) {
      result.skipped += 1;
      continue;
    }

    try {
      if (tab === 'clients') {
        if (!row.clientName) {
          throw new Error('Client name is required.');
        }
        const category = matchCategory(row.category);
        if (!category) {
          throw new Error(
            `Invalid category. Use: ${KEY_ACCOUNT_CLIENT_CATEGORIES.join(', ')}`
          );
        }
        const clientCode = row.code || (await generateKeyAccountClientCode(companyId));
        const { error } = await supabase.from('key_account_clients').insert({
          company_id: companyId,
          client_code: clientCode,
          client_name: row.clientName,
          client_category: category,
          contact_person: row.contact || null,
          contact_email: row.email || null,
          contact_phone: row.phone || null,
          payment_terms: formatPaymentTerms(
            row.paymentTerms ? row.paymentTerms.split(',') : []
          ) || null,
          notes: row.notes || null,
          created_by: userId,
          industry: null,
          credit_limit: 0,
        });
        if (error) throw error;
      } else if (tab === 'shops') {
        if (!row.shopName) {
          throw new Error('Shop name is required.');
        }
        const location = parseLocation(row.location || '');
        const shopCode = row.code || (await generateKeyAccountShopCode(selectedClientId!));
        const { error } = await supabase.from('key_account_shops').insert({
          client_id: selectedClientId,
          shop_code: shopCode,
          shop_name: row.shopName,
          city: location.city,
          province: location.province,
          region: row.region || location.region,
          contact_person: row.contact || null,
          contact_phone: row.phone || null,
          contact_email: row.email || null,
          operating_hours: row.operatingHours || null,
          notes: row.notes || null,
          created_by: userId,
        });
        if (error) throw error;
      } else {
        if (!row.label || !row.address) {
          throw new Error('Label and Address are required.');
        }
        const location = parseLocation(row.location || '');
        const { error } = await supabase.from('key_account_delivery_addresses').insert({
          shop_id: selectedShopId,
          address_label: row.label,
          full_address: row.address,
          city: location.city,
          province: location.province,
          region: location.region,
          zip_code: location.zip,
          contact_name: row.contact || null,
          contact_phone: row.phone || null,
          delivery_instructions: row.instructions || null,
          is_default: false,
          receiving_hours: null,
        });
        if (error) throw error;
      }
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(
        `${label}: ${error instanceof Error ? error.message : 'Import failed.'}`
      );
    }
  }

  return result;
}
