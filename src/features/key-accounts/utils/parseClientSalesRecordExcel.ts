import * as XLSX from 'xlsx';

import {
  applySalesRecordAliases,
  buildSalesRecordModel,
  unpivotSalesRecordModel,
} from './unpivotClientSalesRecord';
import type {
  SalesRecordAliases,
  SalesRecordColumnOverride,
  SalesRecordParseResult,
} from './clientSalesRecordTypes';

export async function parseClientSalesRecordExcel(
  file: File,
  overrides?: Record<string, Record<number, SalesRecordColumnOverride>>
): Promise<SalesRecordParseResult> {
  const buffer = await file.arrayBuffer();
  return parseClientSalesRecordBuffer(buffer, overrides);
}

export function parseClientSalesRecordBuffer(
  buffer: ArrayBuffer,
  overrides?: Record<string, Record<number, SalesRecordColumnOverride>>
): SalesRecordParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames.length) throw new Error('Excel has no sheets');
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
    });
    return { name, matrix };
  });
  const model = buildSalesRecordModel(sheets);
  const parsed = unpivotSalesRecordModel(model, overrides);
  if (!parsed.rows.length && !parsed.tracker_only.length) {
    throw new Error('No purchase-order lines found. Use a Client Sales Record workbook with product sheets.');
  }
  return parsed;
}

export function remapSalesRecordParse(
  parsed: SalesRecordParseResult,
  overrides: Record<string, Record<number, SalesRecordColumnOverride>>,
  aliases?: SalesRecordAliases
): SalesRecordParseResult {
  const next = unpivotSalesRecordModel(parsed.model, overrides);
  if (!aliases) return next;
  return {
    ...next,
    rows: applySalesRecordAliases(next.rows, aliases),
  };
}

export { applySalesRecordAliases } from './unpivotClientSalesRecord';
