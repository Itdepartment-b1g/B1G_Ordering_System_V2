import ExcelJS from 'exceljs';

import type { AccountingAgentSummary } from '@/features/accounting/hooks/useAccountingAgentInventory';
import {
  EXCEL_EXPORT_HEADER_FILL,
  downloadExcelWorkbook,
  formatExportGeneratedAt,
  writeExcelExportMetaRow,
  writeExcelExportTitleRow,
} from '@/lib/excel.helpers';

export type AgentInventoryExportRole = 'all' | 'team_leader' | 'mobile_sales';

export interface AgentInventoryExportMeta {
  role: AgentInventoryExportRole;
  roleLabel: string;
  statusLabel: string;
  teamLabel: string;
  brandLabel: string;
  searchLabel: string;
  personLabel?: string;
  fileName?: string;
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

function personRoleLabel(person: AccountingAgentSummary) {
  return person.agentRole === 'mobile_sales' ? 'Mobile Sales' : 'Team Leader';
}

function personTeamLabel(person: AccountingAgentSummary) {
  if (person.agentRole === 'mobile_sales') return person.leaderName || 'Unassigned';
  return '—';
}

function writeMeta(
  worksheet: ExcelJS.Worksheet,
  title: string,
  lastCol: number,
  meta: AgentInventoryExportMeta,
  extra: Array<[string, string | number]>
) {
  let row = writeExcelExportTitleRow(worksheet, 1, title, lastCol, {
    fillArgb: EXCEL_EXPORT_HEADER_FILL,
  });
  row = writeExcelExportMetaRow(worksheet, row, 'Generated at', formatExportGeneratedAt());
  row = writeExcelExportMetaRow(worksheet, row, 'Role', meta.roleLabel);
  row = writeExcelExportMetaRow(worksheet, row, 'Status', meta.statusLabel);
  if (meta.role !== 'team_leader') {
    row = writeExcelExportMetaRow(worksheet, row, 'Team', meta.teamLabel);
  }
  row = writeExcelExportMetaRow(worksheet, row, 'Brand', meta.brandLabel);
  row = writeExcelExportMetaRow(worksheet, row, 'Search', meta.searchLabel || '—');
  if (meta.personLabel) {
    row = writeExcelExportMetaRow(worksheet, row, 'Person', meta.personLabel);
  }
  for (const [label, value] of extra) {
    row = writeExcelExportMetaRow(worksheet, row, label, value);
  }
  return row + 1;
}

function writeSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  title: string,
  headers: string[],
  widths: number[],
  meta: AgentInventoryExportMeta,
  extra: Array<[string, string | number]>,
  rows: Array<Array<string | number>>
) {
  const worksheet = workbook.addWorksheet(name);
  worksheet.columns = widths.map((width) => ({ width }));
  let rowIndex = writeMeta(worksheet, title, headers.length, meta, extra);
  const headerRow = worksheet.getRow(rowIndex++);
  headers.forEach((value, index) => {
    headerRow.getCell(index + 1).value = value;
  });
  styleHeader(headerRow);

  for (const values of rows) {
    const row = worksheet.getRow(rowIndex++);
    values.forEach((value, index) => {
      row.getCell(index + 1).value = value;
    });
  }
}

function personStatusLabel(person: AccountingAgentSummary) {
  return person.status === 'inactive' ? 'Inactive' : 'Active';
}

function personIdentityCells(
  person: AccountingAgentSummary,
  role: AgentInventoryExportRole,
  isAll: boolean
): Array<string | number> {
  if (isAll) {
    return [
      person.agentName,
      personStatusLabel(person),
      personRoleLabel(person),
      personTeamLabel(person),
    ];
  }

  return [
    person.agentName,
    personStatusLabel(person),
    role === 'mobile_sales' ? personTeamLabel(person) : personRoleLabel(person),
  ];
}

function peopleStockRows(
  people: AccountingAgentSummary[],
  role: AgentInventoryExportRole,
  isAll: boolean
) {
  const rows: Array<Array<string | number>> = [];
  const sortedPeople = [...people].sort((a, b) => a.agentName.localeCompare(b.agentName));

  for (const person of sortedPeople) {
    const identity = personIdentityCells(person, role, isAll);
    const items = [...person.inventory].sort((a, b) => {
      const brand = a.brandName.localeCompare(b.brandName);
      if (brand !== 0) return brand;
      return a.variantName.localeCompare(b.variantName);
    });

    if (items.length === 0) {
      rows.push([...identity, '—', '—', '—', 0]);
      continue;
    }

    for (const item of items) {
      rows.push([
        ...identity,
        item.brandName,
        item.variantName,
        item.variantType || '—',
        item.qty,
      ]);
    }
  }

  return rows;
}

function brandBreakdown(people: AccountingAgentSummary[]) {
  const byBrand = new Map<
    string,
    { brandName: string; skuKeys: Set<string>; units: number; people: Set<string> }
  >();

  for (const person of people) {
    for (const item of person.inventory) {
      const existing = byBrand.get(item.brandId);
      if (existing) {
        existing.skuKeys.add(`${item.brandId}:${item.variantName}:${item.variantType}`);
        existing.units += item.qty;
        existing.people.add(person.agentId);
      } else {
        byBrand.set(item.brandId, {
          brandName: item.brandName,
          skuKeys: new Set([`${item.brandId}:${item.variantName}:${item.variantType}`]),
          units: item.qty,
          people: new Set([person.agentId]),
        });
      }
    }
  }

  return Array.from(byBrand.values()).sort((a, b) => a.brandName.localeCompare(b.brandName));
}

function variantBreakdown(people: AccountingAgentSummary[]) {
  const byVariant = new Map<
    string,
    {
      brandName: string;
      variantName: string;
      variantType: string;
      units: number;
      people: Set<string>;
    }
  >();

  for (const person of people) {
    for (const item of person.inventory) {
      const key = `${item.brandId}:${item.variantName}:${item.variantType}`;
      const existing = byVariant.get(key);
      if (existing) {
        existing.units += item.qty;
        existing.people.add(person.agentId);
      } else {
        byVariant.set(key, {
          brandName: item.brandName,
          variantName: item.variantName,
          variantType: item.variantType || '—',
          units: item.qty,
          people: new Set([person.agentId]),
        });
      }
    }
  }

  return Array.from(byVariant.values()).sort((a, b) => {
    const brand = a.brandName.localeCompare(b.brandName);
    if (brand !== 0) return brand;
    return a.variantName.localeCompare(b.variantName);
  });
}

export async function exportAgentInventoryExcel(
  people: AccountingAgentSummary[],
  meta: AgentInventoryExportMeta
) {
  const workbook = new ExcelJS.Workbook();
  const isAll = meta.role === 'all';
  const totalUnits = people.reduce((sum, person) => sum + person.totalStock, 0);
  const peopleRows = peopleStockRows(people, meta.role, isAll);
  const brands = brandBreakdown(people);
  const variants = variantBreakdown(people);

  writeSheet(
    workbook,
    'People',
    'Agent Inventory — People',
    isAll
      ? ['Name', 'Status', 'Role', 'Team', 'Brand', 'Variant', 'Type', 'Qty']
      : [
          'Name',
          'Status',
          meta.role === 'mobile_sales' ? 'Team' : 'Role',
          'Brand',
          'Variant',
          'Type',
          'Qty',
        ],
    isAll ? [28, 12, 16, 24, 22, 28, 12, 12] : [28, 12, 24, 22, 28, 12, 12],
    meta,
    [
      ['People exported', people.length],
      ['Stock lines', peopleRows.length],
      ['Total units', totalUnits],
    ],
    peopleRows
  );

  writeSheet(
    workbook,
    'By Brand',
    'Agent Inventory — Brand Breakdown',
    ['Brand', 'SKUs', 'Units', 'People'],
    [28, 10, 12, 12],
    meta,
    [
      ['Brands', brands.length],
      ['Total units', brands.reduce((sum, brand) => sum + brand.units, 0)],
    ],
    brands.map((brand) => [
      brand.brandName,
      brand.skuKeys.size,
      brand.units,
      brand.people.size,
    ])
  );

  writeSheet(
    workbook,
    'By Variant',
    'Agent Inventory — Variant Breakdown',
    ['Brand', 'Variant', 'Type', 'Qty', 'People'],
    [22, 28, 12, 12, 12],
    meta,
    [
      ['Variants', variants.length],
      ['Total units', variants.reduce((sum, variant) => sum + variant.units, 0)],
    ],
    variants.map((variant) => [
      variant.brandName,
      variant.variantName,
      variant.variantType,
      variant.units,
      variant.people.size,
    ])
  );

  const roleSlug =
    meta.role === 'all' ? 'all' : meta.role === 'mobile_sales' ? 'mobile-sales' : 'team-leader';
  const date = new Date().toISOString().split('T')[0];
  await downloadExcelWorkbook(workbook, meta.fileName ?? `agent-inventory-${roleSlug}-${date}`);
}

export function agentInventoryPersonFileName(person: AccountingAgentSummary) {
  const date = new Date().toISOString().split('T')[0];
  const slug =
    person.agentName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'person';
  return `agent-inventory-${slug}-${date}`;
}

export function exportMetaForPerson(
  person: AccountingAgentSummary,
  role: AgentInventoryExportRole
): AgentInventoryExportMeta {
  return {
    role,
    roleLabel: person.agentRole === 'mobile_sales' ? 'Mobile Sales' : 'Team Leader',
    statusLabel: person.status === 'inactive' ? 'Inactive' : 'Active',
    teamLabel:
      person.agentRole === 'mobile_sales'
        ? person.leaderName || 'Unassigned'
        : person.agentName,
    brandLabel: 'All brands',
    searchLabel: '—',
    personLabel: person.agentName,
    fileName: agentInventoryPersonFileName(person),
  };
}
