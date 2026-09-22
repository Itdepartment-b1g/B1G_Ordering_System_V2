import ExcelJS from 'exceljs';

import {
  downloadExcelWorkbook,
  EXCEL_EXPORT_HEADER_FILL,
  formatExportGeneratedAt,
  writeExcelExportMetaRow,
  writeExcelExportTitleRow,
} from '@/lib/excel.helpers';

import type { CompanyRecipientOption } from '../hooks/useCompanyTeamLeaders';
import {
  aggregateAllocationHistoryByTeamLeader,
  aggregateAllocationHistoryByTeamLeaderBrand,
  formatRecipientRoleLabel,
  formatRecipientStatusLabel,
  type RecipientAllocationSummary,
  type TlBrandAllocationSummary,
} from './aggregateAllocationHistoryByTeamLeader';
import type { AllocationHistoryGroup } from './allocationHistoryMappers';
import { formatManilaDateTime } from '../table/TableRow';

const YELLOW = 'FFFDE68A';
const GREEN_TINT = 'FFBBF7D0';
const GRAY = 'FFE5E7EB';
const LIGHT_GRAY = 'FFF3F4F6';
const MS_HEADER_FILL = 'FFE0E7FF';
const INACTIVE_FILL = 'FFFECACA';
const SPACER = 1;
const BREAKDOWN_LAST_COL = 4;

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

function styleHeader(row: ExcelJS.Row, fill: string, startCol: number, endCol: number) {
  for (let c = startCol; c <= endCol; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.border = THIN;
  }
}

function variantTypeLabel(type: string | null): string {
  if (!type) return '—';
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'Flavor';
  if (normalized === 'battery') return 'Battery';
  if (normalized === 'foc') return 'FOC';
  return type;
}

function startColFor(index: number, colsPerBlock: number): number {
  return 1 + index * (colsPerBlock + SPACER);
}

function underLabel(summary: {
  role: RecipientAllocationSummary['role'];
  teamLeaderName: string | null;
}): string {
  // Only meaningful for mobile sales
  if (summary.role !== 'mobile_sales') return '';
  return summary.teamLeaderName
    ? `Under: ${summary.teamLeaderName}`
    : 'Under: Unassigned';
}

function headerFillFor(summary: {
  role: RecipientAllocationSummary['role'];
  status: RecipientAllocationSummary['status'];
}): string {
  if (summary.status === 'inactive') return INACTIVE_FILL;
  if (summary.role === 'mobile_sales') return MS_HEADER_FILL;
  return YELLOW;
}

type SideBySideSummary = {
  recipientName: string;
  role: RecipientAllocationSummary['role'];
  status: RecipientAllocationSummary['status'];
  teamLeaderName: string | null;
  totalUnits: number;
  lineCount: number;
  getCellValues: (lineIndex: number) => (string | number)[] | null;
};

function applyColumnWidths(
  ws: ExcelJS.Worksheet,
  personCount: number,
  colsPerBlock: number,
  columnWidths: number[]
) {
  for (let i = 0; i < personCount; i++) {
    const start = startColFor(i, colsPerBlock);
    columnWidths.forEach((width, wi) => {
      const col = ws.getColumn(start + wi);
      col.width = Math.max(col.width ?? 0, width);
    });
    if (i < personCount - 1) {
      ws.getColumn(start + colsPerBlock).width = 2;
    }
  }
}

/**
 * Writes one side-by-side people table. Returns the next free row.
 */
function writePeopleSideBySideTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  options: {
    sectionTitle: string;
    headers: string[];
    summaries: SideBySideSummary[];
    showUnderRow: boolean;
    emptyMessage: string;
  }
): number {
  const { sectionTitle, headers, summaries, showUnderRow, emptyMessage } = options;
  const colsPerBlock = headers.length;
  const qtyColOffset = colsPerBlock - 1;
  const lastCol = Math.max(
    colsPerBlock,
    startColFor(Math.max(summaries.length - 1, 0), colsPerBlock) + colsPerBlock - 1
  );

  let row = startRow;

  ws.mergeCells(row, 1, row, lastCol);
  const section = ws.getRow(row).getCell(1);
  section.value = sectionTitle;
  section.font = { bold: true, size: 12 };
  section.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
  row += 2;

  if (summaries.length === 0) {
    ws.mergeCells(row, 1, row, lastCol);
    ws.getRow(row).getCell(1).value = emptyMessage;
    ws.getRow(row).getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
    return row + 2;
  }

  // Name row
  const nameRow = ws.getRow(row);
  summaries.forEach((person, i) => {
    const start = startColFor(i, colsPerBlock);
    const end = start + colsPerBlock - 1;
    const fill = headerFillFor(person);
    if (start !== end) ws.mergeCells(row, start, row, end);
    nameRow.getCell(start).value = person.recipientName;
    for (let c = start; c <= end; c++) {
      nameRow.getCell(c).border = THIN;
      nameRow.getCell(c).font = { bold: true, size: 11 };
      nameRow.getCell(c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      nameRow.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fill },
      };
    }
  });
  row += 1;

  // Status row (Active / Inactive only — no superior here)
  const statusRow = ws.getRow(row);
  summaries.forEach((person, i) => {
    const start = startColFor(i, colsPerBlock);
    const end = start + colsPerBlock - 1;
    if (start !== end) ws.mergeCells(row, start, row, end);
    statusRow.getCell(start).value = formatRecipientStatusLabel(person.status);
    for (let c = start; c <= end; c++) {
      statusRow.getCell(c).border = THIN;
      statusRow.getCell(c).font = { size: 9, bold: true };
      statusRow.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      statusRow.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: LIGHT_GRAY },
      };
    }
  });
  row += 1;

  // "Under: TL name" — Mobile Sales table only (never for Team Leaders)
  if (showUnderRow) {
    const underRow = ws.getRow(row);
    summaries.forEach((person, i) => {
      const start = startColFor(i, colsPerBlock);
      const end = start + colsPerBlock - 1;
      if (start !== end) ws.mergeCells(row, start, row, end);
      underRow.getCell(start).value = underLabel(person);
      for (let c = start; c <= end; c++) {
        underRow.getCell(c).border = THIN;
        underRow.getCell(c).font = { size: 9, italic: true };
        underRow.getCell(c).alignment = {
          horizontal: 'center',
          vertical: 'middle',
          wrapText: true,
        };
      }
    });
    row += 1;
  }

  const headerRow = ws.getRow(row);
  summaries.forEach((_, i) => {
    const start = startColFor(i, colsPerBlock);
    headers.forEach((label, hi) => {
      headerRow.getCell(start + hi).value = label;
    });
    styleHeader(headerRow, GRAY, start, start + colsPerBlock - 1);
  });
  row += 1;

  const maxLines = Math.max(0, ...summaries.map((s) => s.lineCount));
  for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
    const dataRow = ws.getRow(row);
    summaries.forEach((person, i) => {
      const start = startColFor(i, colsPerBlock);
      const values = person.getCellValues(lineIdx);
      if (!values) return;
      values.forEach((value, vi) => {
        dataRow.getCell(start + vi).value = value;
        if (vi === qtyColOffset) {
          dataRow.getCell(start + vi).alignment = { horizontal: 'right' };
        }
      });
      for (let c = start; c < start + colsPerBlock; c++) {
        dataRow.getCell(c).border = THIN;
      }
    });
    row += 1;
  }

  const totalRow = ws.getRow(row);
  summaries.forEach((person, i) => {
    const start = startColFor(i, colsPerBlock);
    totalRow.getCell(start).value = 'TOTAL';
    totalRow.getCell(start + qtyColOffset).value = person.totalUnits;
    totalRow.getCell(start + qtyColOffset).alignment = { horizontal: 'right' };
    for (let c = start; c < start + colsPerBlock; c++) {
      totalRow.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: LIGHT_GRAY },
      };
      totalRow.getCell(c).border = THIN;
      totalRow.getCell(c).font = { bold: true };
    }
  });

  return row + 2;
}

function sortMobileSalesColumns(summaries: SideBySideSummary[]): SideBySideSummary[] {
  return [...summaries].sort((a, b) => {
    const underA = a.teamLeaderName ?? 'zzz';
    const underB = b.teamLeaderName ?? 'zzz';
    const underCmp = underA.localeCompare(underB);
    if (underCmp !== 0) return underCmp;
    return a.recipientName.localeCompare(b.recipientName);
  });
}

function writeSideBySideSummarySheet(
  ws: ExcelJS.Worksheet,
  options: {
    sheetTitle: string;
    sectionLabel: string;
    headers: string[];
    summaries: SideBySideSummary[];
    sessionCount: number;
    totalUnits: number;
    dateRangeLabel: string;
    columnWidths: number[];
  }
) {
  const {
    sheetTitle,
    sectionLabel,
    headers,
    summaries,
    sessionCount,
    totalUnits,
    dateRangeLabel,
    columnWidths,
  } = options;

  const teamLeaders = summaries
    .filter((s) => s.role === 'team_leader')
    .sort((a, b) => a.recipientName.localeCompare(b.recipientName));
  const mobileSales = sortMobileSalesColumns(
    summaries.filter((s) => s.role === 'mobile_sales')
  );

  const colsPerBlock = headers.length;
  const widest = Math.max(teamLeaders.length, mobileSales.length, 1);
  const lastCol = Math.max(
    colsPerBlock,
    startColFor(widest - 1, colsPerBlock) + colsPerBlock - 1
  );

  applyColumnWidths(ws, widest, colsPerBlock, columnWidths);

  let row = writeExcelExportTitleRow(ws, 1, sheetTitle, lastCol, {
    fillArgb: EXCEL_EXPORT_HEADER_FILL,
  });
  row = writeExcelExportMetaRow(ws, row, 'Generated at', formatExportGeneratedAt());
  row = writeExcelExportMetaRow(ws, row, 'Date range', dateRangeLabel);
  row = writeExcelExportMetaRow(ws, row, 'Team leaders', teamLeaders.length);
  row = writeExcelExportMetaRow(ws, row, 'Mobile sales', mobileSales.length);
  row = writeExcelExportMetaRow(ws, row, 'Allocation sessions', sessionCount);
  row = writeExcelExportMetaRow(ws, row, 'Total units', totalUnits);
  row += 1;

  ws.mergeCells(row, 1, row, lastCol);
  const title = ws.getRow(row).getCell(1);
  title.value = sectionLabel;
  title.font = { bold: true, size: 13 };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
  row += 1;

  ws.mergeCells(row, 1, row, lastCol);
  ws.getRow(row).getCell(1).value = `Date filtered: ${dateRangeLabel}`;
  ws.getRow(row).getCell(1).font = { italic: true };
  row += 2;

  row = writePeopleSideBySideTable(ws, row, {
    sectionTitle: 'TEAM LEADERS',
    headers,
    summaries: teamLeaders,
    showUnderRow: false,
    emptyMessage: 'No team leaders in roster.',
  });

  writePeopleSideBySideTable(ws, row, {
    sectionTitle: 'MOBILE SALES',
    headers,
    summaries: mobileSales,
    showUnderRow: true,
    emptyMessage: 'No mobile sales in roster.',
  });
}

function toVariantSideBySide(summaries: RecipientAllocationSummary[]): SideBySideSummary[] {
  return summaries.map((person) => ({
    recipientName: person.recipientName,
    role: person.role,
    status: person.status,
    teamLeaderName: person.teamLeaderName,
    totalUnits: person.totalUnits,
    lineCount: person.lines.length,
    getCellValues: (lineIndex) => {
      const line = person.lines[lineIndex];
      if (!line) return null;
      return [
        line.brandName,
        line.variantName,
        variantTypeLabel(line.variantType),
        line.quantity,
      ];
    },
  }));
}

function toBrandSideBySide(summaries: TlBrandAllocationSummary[]): SideBySideSummary[] {
  return summaries.map((person) => ({
    recipientName: person.recipientName,
    role: person.role,
    status: person.status,
    teamLeaderName: person.teamLeaderName,
    totalUnits: person.totalUnits,
    lineCount: person.lines.length,
    getCellValues: (lineIndex) => {
      const line = person.lines[lineIndex];
      if (!line) return null;
      return [line.brandName, variantTypeLabel(line.variantType), line.quantity];
    },
  }));
}

type BreakdownSection = {
  recipientId: string;
  recipientName: string;
  role: RecipientAllocationSummary['role'];
  status: RecipientAllocationSummary['status'];
  teamLeaderName: string | null;
  sessions: AllocationHistoryGroup[];
  sessionCount: number;
  totalUnits: number;
};

function buildBreakdownSections(
  groups: AllocationHistoryGroup[],
  rosterById: Map<string, CompanyRecipientOption>
): BreakdownSection[] {
  const byRecipient = new Map<string, BreakdownSection>();

  for (const group of groups) {
    const roster = rosterById.get(group.allocatedToId);
    let section = byRecipient.get(group.allocatedToId);
    if (!section) {
      section = {
        recipientId: group.allocatedToId,
        recipientName: roster?.name ?? group.allocatedToName,
        role: roster?.role ?? 'unknown',
        status: roster?.status ?? 'unknown',
        teamLeaderName: roster?.teamLeaderName ?? null,
        sessions: [],
        sessionCount: 0,
        totalUnits: 0,
      };
      byRecipient.set(group.allocatedToId, section);
    } else if (group.allocatedToName && group.allocatedToName !== 'Unknown') {
      section.recipientName = group.allocatedToName;
    }
    section.sessions.push(group);
    section.sessionCount += 1;
    section.totalUnits += group.totalQuantity;
  }

  const sections = [...byRecipient.values()].map((section) => ({
    ...section,
    sessions: [...section.sessions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
  }));

  // Same hierarchy as summary columns
  const tls = sections
    .filter((s) => s.role === 'team_leader')
    .sort((a, b) => a.recipientName.localeCompare(b.recipientName));
  const ms = sections.filter((s) => s.role === 'mobile_sales');
  const unknown = sections.filter((s) => s.role === 'unknown');
  const ordered: BreakdownSection[] = [];
  const placed = new Set<string>();

  for (const tl of tls) {
    ordered.push(tl);
    ms
      .filter((m) => {
        const roster = rosterById.get(m.recipientId);
        return roster?.teamLeaderId === tl.recipientId;
      })
      .sort((a, b) => a.recipientName.localeCompare(b.recipientName))
      .forEach((m) => {
        ordered.push(m);
        placed.add(m.recipientId);
      });
  }

  ms.filter((m) => !placed.has(m.recipientId))
    .sort((a, b) => a.recipientName.localeCompare(b.recipientName))
    .forEach((m) => ordered.push(m));

  unknown
    .sort((a, b) => a.recipientName.localeCompare(b.recipientName))
    .forEach((u) => ordered.push(u));

  return ordered;
}

function writeReadableBreakdownSheet(
  ws: ExcelJS.Worksheet,
  groups: AllocationHistoryGroup[],
  roster: CompanyRecipientOption[],
  dateRangeLabel: string
) {
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 12;

  let row = writeExcelExportTitleRow(
    ws,
    1,
    'Allocation History — Breakdown by Recipient',
    BREAKDOWN_LAST_COL,
    { fillArgb: EXCEL_EXPORT_HEADER_FILL }
  );
  row = writeExcelExportMetaRow(ws, row, 'Generated at', formatExportGeneratedAt());
  row = writeExcelExportMetaRow(ws, row, 'Date range', dateRangeLabel);
  row = writeExcelExportMetaRow(
    ws,
    row,
    'How to read',
    'Team leaders first, then their mobile sales. Newest sessions first.'
  );
  row += 1;

  const rosterById = new Map(roster.map((r) => [r.id, r]));
  const sections = buildBreakdownSections(groups, rosterById);

  sections.forEach((section, sectionIndex) => {
    const fill = headerFillFor(section);
    ws.mergeCells(row, 1, row, BREAKDOWN_LAST_COL);
    const header = ws.getRow(row);
    const under = underLabel(section);
    header.getCell(1).value =
      `${section.recipientName}  ·  ${formatRecipientRoleLabel(section.role)}  ·  ${formatRecipientStatusLabel(section.status)}` +
      (section.role === 'mobile_sales' ? `  ·  ${under}` : '') +
      `  ·  ${section.sessionCount} session${section.sessionCount === 1 ? '' : 's'}  ·  ${section.totalUnits.toLocaleString()} units`;
    header.getCell(1).font = { bold: true, size: 11 };
    header.getCell(1).alignment = { vertical: 'middle', wrapText: true };
    for (let c = 1; c <= BREAKDOWN_LAST_COL; c++) {
      header.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fill },
      };
      header.getCell(c).border = THIN;
    }
    header.height = 28;
    row += 2;

    section.sessions.forEach((group, sessionIndex) => {
      ws.mergeCells(row, 1, row, BREAKDOWN_LAST_COL);
      const sessionMeta = ws.getRow(row);
      sessionMeta.getCell(1).value =
        `${formatManilaDateTime(group.createdAt)}  ·  Allocated by: ${group.allocatedByName}  ·  ${group.totalQuantity.toLocaleString()} units`;
      sessionMeta.getCell(1).font = { bold: true, size: 10 };
      for (let c = 1; c <= BREAKDOWN_LAST_COL; c++) {
        sessionMeta.getCell(c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: GREEN_TINT },
        };
      }
      row += 1;

      const vhRow = ws.getRow(row);
      ['Brand', 'Variant', 'Type', 'Qty'].forEach((label, i) => {
        vhRow.getCell(i + 1).value = label;
      });
      styleHeader(vhRow, GRAY, 1, BREAKDOWN_LAST_COL);
      row += 1;

      if (group.lines.length === 0) {
        ws.mergeCells(row, 1, row, BREAKDOWN_LAST_COL);
        const emptyRow = ws.getRow(row);
        emptyRow.getCell(1).value = 'No linked variant lines';
        emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
        row += 1;
      } else {
        for (const line of group.lines) {
          const lineRow = ws.getRow(row);
          lineRow.getCell(1).value = line.brandName;
          lineRow.getCell(2).value = line.variantName;
          lineRow.getCell(3).value = variantTypeLabel(line.variantType);
          lineRow.getCell(4).value = line.quantity;
          lineRow.getCell(4).alignment = { horizontal: 'right' };
          for (let c = 1; c <= BREAKDOWN_LAST_COL; c++) {
            lineRow.getCell(c).border = THIN;
          }
          row += 1;
        }
      }

      if (sessionIndex < section.sessions.length - 1) row += 1;
    });

    if (sectionIndex < sections.length - 1) row += 2;
  });
}

export type TlSummaryExportMeta = {
  dateRangeLabel: string;
  roster: CompanyRecipientOption[];
};

/**
 * Export Variant Summary, Brand Summary, and Breakdown for all team leaders
 * and mobile sales (with Active/Inactive + Under TL tagging).
 */
export async function exportAllocationHistoryTlSummaryExcel(
  groups: AllocationHistoryGroup[],
  filenamePrefix: string,
  meta: TlSummaryExportMeta
): Promise<void> {
  const roster = meta.roster;
  const variantSummaries = aggregateAllocationHistoryByTeamLeader(groups, roster);
  const brandSummaries = aggregateAllocationHistoryByTeamLeaderBrand(variantSummaries);

  if (variantSummaries.length === 0) {
    throw new Error('No team leaders or mobile sales found to export.');
  }

  const totalUnits = variantSummaries.reduce((sum, s) => sum + s.totalUnits, 0);
  const workbook = new ExcelJS.Workbook();

  const variantSheet = workbook.addWorksheet('Variant Summary');
  writeSideBySideSummarySheet(variantSheet, {
    sheetTitle: 'Allocation History — Variant Summary',
    sectionLabel: 'VARIANT SUMMARY',
    headers: ['Brand', 'Variant', 'Type', 'Qty'],
    summaries: toVariantSideBySide(variantSummaries),
    sessionCount: groups.length,
    totalUnits,
    dateRangeLabel: meta.dateRangeLabel,
    columnWidths: [18, 22, 12, 10],
  });

  const brandSheet = workbook.addWorksheet('Brand Summary');
  writeSideBySideSummarySheet(brandSheet, {
    sheetTitle: 'Allocation History — Brand Summary',
    sectionLabel: 'BRAND SUMMARY',
    headers: ['Brand', 'Type', 'Qty'],
    summaries: toBrandSideBySide(brandSummaries),
    sessionCount: groups.length,
    totalUnits,
    dateRangeLabel: meta.dateRangeLabel,
    columnWidths: [20, 12, 10],
  });

  const breakdownSheet = workbook.addWorksheet('Breakdown');
  writeReadableBreakdownSheet(breakdownSheet, groups, roster, meta.dateRangeLabel);

  const date = new Date().toISOString().split('T')[0];
  await downloadExcelWorkbook(workbook, `${filenamePrefix}_${date}`);
}
