import ExcelJS from 'exceljs';

import type { AccountingAgentSummary } from '../hooks/useCompanyAgentInventory';
import { inventoryVariantKey, type InventorySoldVariant } from './inventorySalesSummary';
import {
  downloadExcelWorkbook,
  excelWrappedRowHeight,
  formatExportGeneratedAt,
} from '@/lib/excel.helpers';

const YELLOW = 'FFFFFF00';
const GREEN = 'FFB6D7A8';
const BORDERS: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, bottom: { style: 'thin' },
  left: { style: 'thin' }, right: { style: 'thin' },
};
const HEADERS = ['BRAND', 'VARIANT', 'TYPE', 'QTY', 'TOTAL QTY'];

type InventoryLine = {
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  variantType: string;
  qty: number;
};

type InventoryTeam = {
  leader?: AccountingAgentSummary;
  name: string;
  members: AccountingAgentSummary[];
};

/** Every owner belongs to exactly one team; mobile-sales chains resolve to a TL. */
function buildTeams(people: AccountingAgentSummary[]): InventoryTeam[] {
  const byId = new Map<string, AccountingAgentSummary>();
  for (const person of people) {
    if (byId.has(person.agentId)) throw new Error('Duplicate inventory owner found.');
    if (person.agentRole !== 'team_leader' && person.agentRole !== 'mobile_sales') {
      throw new Error(`Unsupported inventory role: ${person.agentRole}`);
    }
    byId.set(person.agentId, person);
  }
  const teams = new Map<string, InventoryTeam>();
  for (const person of people) {
    if (person.agentRole === 'team_leader') {
      teams.set(person.agentId, { leader: person, name: person.agentName, members: [] });
    }
  }
  for (const person of people) {
    if (person.agentRole === 'team_leader') continue;
    const visited = new Set([person.agentId]);
    let current = person;
    let leader: AccountingAgentSummary | undefined;
    while (current.leaderId) {
      if (visited.has(current.leaderId)) {
        throw new Error(`Circular team assignment found for ${person.agentName}.`);
      }
      visited.add(current.leaderId);
      const parent = byId.get(current.leaderId);
      if (!parent) break;
      if (parent.agentRole === 'team_leader') { leader = parent; break; }
      current = parent;
    }
    const key = leader?.agentId ?? '__unassigned__';
    const team = teams.get(key) ?? { name: 'Unassigned', members: [] };
    team.members.push(person);
    teams.set(key, team);
  }
  return [...teams.values()]
    .sort((a, b) => Number(!a.leader) - Number(!b.leader) || a.name.localeCompare(b.name))
    .map((team) => ({ ...team, members: team.members.sort((a, b) => a.agentName.localeCompare(b.agentName)) }));
}

/** Deduplicate source records before aggregating distinct variant IDs. */
function aggregateInventory(people: AccountingAgentSummary[]): InventoryLine[] {
  const seen = new Map<string, { owner: string; item: string }>();
  const lines = new Map<string, InventoryLine>();
  for (const person of people) {
    for (const item of person.inventory) {
      if (!item.variantId || !Number.isFinite(item.qty) || item.qty < 0) {
        throw new Error(`Invalid inventory record for ${person.agentName}. Refresh and retry.`);
      }
      const variantType = item.variantType?.trim().toLowerCase() || '';
      const key = JSON.stringify([item.brandId, item.variantId, variantType]);
      const signature = JSON.stringify([key, item.qty]);
      const previous = seen.get(item.id);
      if (previous) {
        if (previous.owner !== person.agentId || previous.item !== signature) {
          throw new Error('Conflicting inventory ownership or balances found. Refresh and retry.');
        }
        continue;
      }
      seen.set(item.id, { owner: person.agentId, item: signature });
      if (item.qty === 0) continue;
      const existing = lines.get(key);
      if (existing) existing.qty += item.qty;
      else lines.set(key, { ...item, variantType });
    }
  }
  return [...lines.values()].sort((a, b) =>
    a.brandName.localeCompare(b.brandName) || a.brandId.localeCompare(b.brandId) ||
    a.variantName.localeCompare(b.variantName) || a.variantType.localeCompare(b.variantType) ||
    a.variantId.localeCompare(b.variantId));
}

function typeLabel(type: string): string {
  if (!type) return '—';
  if (type === 'foc') return 'FOC';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** One green block beside the unit rows, matching the sold-total layout. */
function writeMergedQtyTotal(ws: ExcelJS.Worksheet, firstRow: number, lastRow: number, col: number, value: ExcelJS.CellValue) {
  if (lastRow > firstRow) ws.mergeCells(firstRow, col, lastRow, col);
  const span = lastRow - firstRow + 1;
  const font = { name: 'Arial', size: span >= 2 ? 24 : 12, bold: true, color: { argb: 'FF000000' } };
  for (let row = firstRow; row <= lastRow; row++) {
    const cell = ws.getCell(row, col);
    cell.font = font;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    cell.border = BORDERS;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.numFmt = '#,##0';
  }
  ws.getCell(firstRow, col).value = value;
}

function writeHeading(ws: ExcelJS.Worksheet, row: number, text: string, startCol: number, fill = 'FFFFD966', columnCount = 5): number {
  ws.mergeCells(row, startCol, row, startCol + columnCount - 1);
  const cell = ws.getCell(row, startCol);
  cell.value = text;
  cell.font = { name: 'Arial', size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const width = Array.from({ length: columnCount }, (_, offset) => ws.getColumn(startCol + offset).width ?? 14).reduce((sum, value) => sum + value, 0);
  ws.getRow(row).height = Math.max(ws.getRow(row).height ?? 0, excelWrappedRowHeight([{ text, width }], 21));
  return row + 1;
}

function writeTeamHeading(ws: ExcelJS.Worksheet, row: number, team: InventoryTeam, startCol: number, columnCount = 5): number {
  row = writeHeading(ws, row, team.name, startCol, 'FFFFD966', columnCount);
  return writeHeading(ws, row, team.members.map((p) => p.agentName).join(', ') || 'No assigned agents', startCol, 'FFFCE5CD', columnCount);
}

function combineInventoryWithSales(companyLines: InventoryLine[], soldVariants: InventorySoldVariant[]): Array<InventoryLine & { soldQty: number }> {
  const combined = new Map<string, InventoryLine & { soldQty: number }>();
  for (const line of companyLines) combined.set(inventoryVariantKey(line), { ...line, soldQty: 0 });
  for (const sold of soldVariants) {
    const key = inventoryVariantKey(sold);
    const line = combined.get(key) ?? { ...sold, variantType: sold.variantType?.trim().toLowerCase() || '', qty: 0, soldQty: 0 };
    line.soldQty += sold.quantity;
    combined.set(key, line);
  }
  return [...combined.values()].sort((a, b) => a.brandName.localeCompare(b.brandName) || a.brandId.localeCompare(b.brandId) ||
    a.variantName.localeCompare(b.variantName) || a.variantType.localeCompare(b.variantType) || a.variantId.localeCompare(b.variantId));
}

function writeDetailedInventoryTable(ws: ExcelJS.Worksheet, row: number, lines: InventoryLine[], startCol: number, totalLabel = 'GRAND TOTAL', soldVariants?: InventorySoldVariant[]): number {
  const showSales = soldVariants !== undefined;
  const reportLines = combineInventoryWithSales(lines, soldVariants ?? []);
  const qtyCol = startCol + 3;
  const totalCol = startCol + 4;
  const soldCol = startCol + 5;
  const soldTotalCol = startCol + 6;
  const lastCol = showSales ? soldTotalCol : totalCol;
  const header = ws.getRow(row++);
  [...HEADERS, ...(showSales ? ['UNIT SOLD QTY', 'TOTAL UNIT SOLD QTY'] : [])].forEach((label, i) => {
    const cell = header.getCell(startCol + i);
    cell.value = label;
    cell.font = { name: 'Arial', size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDERS;
  });
  header.height = Math.max(header.height ?? 0, 23);
  const brands = new Map<string, typeof reportLines>();
  for (const line of reportLines) {
    const group = brands.get(line.brandId) ?? [];
    group.push(line);
    brands.set(line.brandId, group);
  }
  const totalCells: string[] = [];
  const soldCells: string[] = [];
  let grandTotal = 0;
  for (const group of brands.values()) {
    const first = row;
    const last = first + group.length - 1;
    const total = group.reduce((sum, line) => sum + line.qty, 0);
    grandTotal += total;
    for (const line of group) {
      const data = ws.getRow(row++);
      data.getCell(startCol + 1).value = line.variantName;
      data.getCell(startCol + 2).value = typeLabel(line.variantType);
      data.getCell(qtyCol).value = line.qty;
      if (showSales) {
        data.getCell(soldCol).value = line.soldQty;
        soldCells.push(data.getCell(soldCol).address);
      }
      data.height = Math.max(
        excelWrappedRowHeight([
          { text: line.variantName, width: ws.getColumn(startCol + 1).width ?? 22 },
          { text: typeLabel(line.variantType), width: ws.getColumn(startCol + 2).width ?? 14 },
        ], 21),
        data.height ?? 0,
        Math.ceil((group[0].brandName.length * 7 + 12) / group.length)
      );
      for (let c = startCol; c <= lastCol; c++) {
        data.getCell(c).border = BORDERS;
        data.getCell(c).font = { name: 'Arial', size: 10 };
        data.getCell(c).alignment = { vertical: 'middle', horizontal: c === qtyCol || c === soldCol ? 'right' : 'left', wrapText: true };
      }
      data.getCell(qtyCol).numFmt = '#,##0';
      if (showSales) data.getCell(soldCol).numFmt = '#,##0';
    }
    if (last > first) {
      ws.mergeCells(first, startCol, last, startCol);
      ws.mergeCells(first, totalCol, last, totalCol);
    }
    const brandCell = ws.getCell(first, startCol);
    brandCell.value = group[0].brandName;
    brandCell.alignment = { textRotation: 90, vertical: 'middle', horizontal: 'center' };
    const totalCell = ws.getCell(first, totalCol);
    totalCell.value = { formula: `SUM(${ws.getCell(first, qtyCol).address}:${ws.getCell(last, qtyCol).address})`, result: total };
    totalCell.font = { name: 'Arial', size: 24 };
    totalCell.numFmt = '#,##0';
    totalCell.alignment = { vertical: 'middle', horizontal: 'center' };
    for (let r = first; r <= last; r++) {
      ws.getCell(r, totalCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    }
    totalCells.push(totalCell.address);
    if (showSales) {
      writeMergedQtyTotal(ws, first, last, soldTotalCol, {
        formula: `SUM(${ws.getCell(first, soldCol).address}:${ws.getCell(last, soldCol).address})`,
        result: group.reduce((sum, line) => sum + line.soldQty, 0),
      });
    }
  }
  if (!reportLines.length) row = writeHeading(ws, row, 'No current stock', startCol, 'FFFFFFFF', showSales ? 7 : 5);
  ws.mergeCells(row, startCol, row, qtyCol);
  ws.getCell(row, startCol).value = totalLabel;
  ws.getCell(row, totalCol).value = totalCells.length
    ? { formula: totalCells.join('+'), result: grandTotal }
    : 0;
  if (showSales) {
    ws.getCell(row, soldCol).value = soldCells.length
      ? { formula: `SUM(${soldCells[0]}:${soldCells[soldCells.length - 1]})`, result: reportLines.reduce((sum, line) => sum + line.soldQty, 0) }
      : 0;
    ws.getCell(row, soldCol).numFmt = '#,##0';
    ws.getCell(row, soldTotalCol).value = ws.getCell(row, soldCol).value;
    ws.getCell(row, soldTotalCol).numFmt = '#,##0';
  }
  for (let c = startCol; c <= lastCol; c++) {
    const cell = ws.getCell(row, c);
    cell.border = BORDERS;
    cell.font = { name: 'Arial', size: 10 };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  }
  ws.getCell(row, totalCol).numFmt = '"TOTAL: "#,##0';
  ws.getRow(row).height = Math.max(ws.getRow(row).height ?? 0, 21);
  return row + 3;
}

export type DetailedInventoryReportMeta = {
  companyLabel: string;
  generatedAt?: Date;
  soldVariants?: InventorySoldVariant[];
};

function writeBrandQtySummary(ws: ExcelJS.Worksheet, lines: InventoryLine[], soldVariants: InventorySoldVariant[]): { nextRow: number; lastCol: number } {
  const headers = ['BRAND', 'FLAVOR QTY', 'BATTERY QTY', 'FOC QTY', 'TOTAL QTY', 'TOTAL UNIT SOLD QTY'];
  const lastCol = headers.length;
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell('A1').value = 'BRAND QTY SUMMARY';
  ws.getCell('A1').font = { name: 'Arial', size: 12 };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 25;
  headers.forEach((label, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = label;
    cell.font = { name: 'Arial', size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDERS;
    ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width ?? 0, i === 0 ? 18 : 16);
  });
  ws.getRow(2).height = 25;
  const brands = new Map<string, { name: string; quantities: number[]; total: number; sold: number }>();
  for (const line of combineInventoryWithSales(lines, soldVariants)) {
    const brand = brands.get(line.brandId) ?? { name: line.brandName, quantities: [0, 0, 0], total: 0, sold: 0 };
    const typeIndex = ['flavor', 'battery', 'foc'].indexOf(line.variantType);
    if (typeIndex >= 0) brand.quantities[typeIndex] += line.qty;
    brand.total += line.qty;
    brand.sold += line.soldQty;
    brands.set(line.brandId, brand);
  }
  let row = 3;
  const totals = Array(lastCol - 1).fill(0) as number[];
  for (const brand of brands.values()) {
    ws.getCell(row, 1).value = brand.name;
    brand.quantities.forEach((qty, i) => {
      ws.getCell(row, i + 2).value = qty;
      totals[i] += qty;
    });
    const brandTotal = brand.total;
    const unlistedQty = brandTotal - brand.quantities.reduce((sum, qty) => sum + qty, 0);
    ws.getCell(row, 5).value = {
      formula: `SUM(B${row}:D${row})${unlistedQty ? `+${unlistedQty}` : ''}`,
      result: brandTotal,
    };
    ws.getCell(row, 6).value = brand.sold;
    totals[3] += brandTotal;
    totals[4] += brand.sold;
    ws.getRow(row).height = excelWrappedRowHeight([{ text: brand.name, width: ws.getColumn(1).width }], 21);
    row++;
  }
  ws.getCell(row, 1).value = 'GRAND TOTAL:';
  for (let col = 2; col <= lastCol; col++) {
    ws.getCell(row, col).value = brands.size
      ? { formula: `SUM(${ws.getCell(3, col).address}:${ws.getCell(row - 1, col).address})`, result: totals[col - 2] }
      : 0;
  }
  ws.getRow(row).height = 24;
  for (let r = 3; r <= row; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Arial', size: 10 };
      cell.border = BORDERS;
      cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle', wrapText: c === 1 };
      if (c > 1) cell.numFmt = '#,##0';
    }
  }
  return { nextRow: row + 3, lastCol };
}

function writeVariantQtySummary(ws: ExcelJS.Worksheet, companyLines: InventoryLine[], soldVariants: InventorySoldVariant[]): { nextRow: number; lastCol: number } {
  const combined = combineInventoryWithSales(companyLines, soldVariants);
  const brands = new Map<string, { name: string; lines: Array<InventoryLine & { soldQty: number }> }>();
  for (const line of combined) {
    const brand = brands.get(line.brandId) ?? { name: line.brandName, lines: [] };
    brand.lines.push(line);
    brands.set(line.brandId, brand);
  }
  for (const brand of brands.values()) {
    brand.lines.sort((a, b) => a.variantName.localeCompare(b.variantName) || a.variantType.localeCompare(b.variantType) || a.variantId.localeCompare(b.variantId));
  }
  const sortedBrands = [...brands.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name) || a[0].localeCompare(b[0]));
  const lastCol = Math.max(5, sortedBrands.length * 5);
  if (lastCol > 16384) throw new Error('Too many brands for a single Excel sheet.');
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell('A1');
  title.value = 'VARIANT QTY SUMMARY';
  title.font = { name: 'Arial', size: 12 };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 25;
  if (!sortedBrands.length) {
    [18, 14, 14, 14].forEach((width, i) => { ws.getColumn(i + 1).width = width; });
    const row = writeHeading(ws, 2, 'No current stock', 1, 'FFFFFFFF');
    return { nextRow: row + 2, lastCol: 5 };
  }
  const height = sortedBrands.reduce((max, [, brand]) => Math.max(max, brand.lines.length), 0);
  sortedBrands.forEach(([, brand], brandIndex) => {
    const start = 1 + brandIndex * 5; // A:E, F:J, K:O; no spacer between brands.
    const qtyCol = start + 2;
    const totalCol = start + 3;
    const brandSoldCol = start + 4;
    const lines = brand.lines;
    const maxVariant = lines.reduce((max, line) => Math.max(max, line.variantName.length), 0);
    const maxType = lines.reduce((max, line) => Math.max(max, typeLabel(line.variantType).length), 0);
    [Math.min(40, Math.max(18, maxVariant + 2)), Math.min(24, Math.max(14, maxType + 2)), 14, 18, 24]
      .forEach((width, offset) => { ws.getColumn(start + offset).width = width; });
    ws.mergeCells(2, start, 2, brandSoldCol);
    const brandCell = ws.getCell(2, start);
    brandCell.value = brand.name;
    brandCell.font = { name: 'Arial', size: 11 };
    brandCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ['VARIANT', 'TYPE', 'QTY', 'UNIT SOLD QTY', 'TOTAL UNIT SOLD QTY'].forEach((label, offset) => {
      const cell = ws.getCell(3, start + offset);
      cell.value = label;
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = BORDERS;
    });
    ws.getRow(2).height = Math.max(ws.getRow(2).height ?? 0, excelWrappedRowHeight([{ text: brand.name, width: 60 }], 23));
    ws.getRow(3).height = 25;
    let row = 4;
    const grandTotal = lines.reduce((sum, line) => sum + line.qty, 0);
    const soldTotal = lines.reduce((sum, line) => sum + line.soldQty, 0);
    [lines].forEach((group) => {
      for (let index = 0; index < height; index++) {
        const line = group[index];
        if (line) {
          ws.getCell(row, start).value = line.variantName;
          ws.getCell(row, start + 1).value = typeLabel(line.variantType);
          ws.getCell(row, qtyCol).value = line.qty;
          ws.getCell(row, totalCol).value = line.soldQty;
        }
        ws.getRow(row).height = Math.max(ws.getRow(row).height ?? 0,
          excelWrappedRowHeight([{ text: line?.variantName ?? '', width: ws.getColumn(start).width },
            { text: line ? typeLabel(line.variantType) : '', width: ws.getColumn(start + 1).width }], 21));
        for (let col = start; col <= brandSoldCol; col++) {
          const cell = ws.getCell(row, col);
          cell.font = { name: 'Arial', size: 10 };
          cell.border = BORDERS;
          cell.alignment = { horizontal: col >= qtyCol ? 'right' : 'left', vertical: 'middle', wrapText: true };
        }
        ws.getCell(row, qtyCol).numFmt = '#,##0';
        ws.getCell(row, totalCol).numFmt = '#,##0';
        row++;
      }
    });
    writeMergedQtyTotal(ws, 4, row - 1, brandSoldCol, {
      formula: `SUM(${ws.getCell(4, totalCol).address}:${ws.getCell(row - 1, totalCol).address})`,
      result: soldTotal,
    });
    ws.mergeCells(row, start, row, qtyCol - 1);
    ws.getCell(row, start).value = 'GRAND TOTAL:';
    ws.getCell(row, qtyCol).value = { formula: `SUM(${ws.getCell(4, qtyCol).address}:${ws.getCell(row - 1, qtyCol).address})`, result: grandTotal };
    ws.getCell(row, totalCol).value = { formula: `SUM(${ws.getCell(4, totalCol).address}:${ws.getCell(row - 1, totalCol).address})`, result: soldTotal };
    ws.getCell(row, brandSoldCol).value = ws.getCell(row, totalCol).value;
    for (let col = start; col <= brandSoldCol; col++) {
      const cell = ws.getCell(row, col);
      cell.font = { name: 'Arial', size: 10 };
      cell.border = BORDERS;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F3F3' } };
      cell.alignment = { horizontal: col >= qtyCol ? 'right' : 'left', vertical: 'middle' };
      cell.numFmt = '#,##0';
    }
    ws.getRow(row).height = 24;
  });
  return { nextRow: 4 + height + 3, lastCol };
}

/** Exposed separately from downloading so the workbook can be validated. */
export function buildDetailedInventoryWorkbook(people: AccountingAgentSummary[], meta: DetailedInventoryReportMeta): ExcelJS.Workbook {
  const teams = buildTeams(people);
  const companyLines = aggregateInventory(people); // Validate ownership across the entire report.
  const soldByOwner = new Map<string, InventorySoldVariant[]>();
  for (const sold of meta.soldVariants ?? []) {
    if (!sold.agentId) continue;
    const ownerSales = soldByOwner.get(sold.agentId) ?? [];
    ownerSales.push(sold);
    soldByOwner.set(sold.agentId, ownerSales);
  }
  const salesFor = (owners: AccountingAgentSummary[]) => owners.flatMap((owner) => soldByOwner.get(owner.agentId) ?? []);
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  const generatedAt = meta.generatedAt ?? new Date();
  const endingBalanceLabel = `ENDING BALANCE AS OF: ${formatExportGeneratedAt(generatedAt)} (current balances)`;
  workbook.creator = 'B1G Ordering System';
  workbook.title = 'Detailed Inventory Report';
  workbook.subject = `${meta.companyLabel} • ${formatExportGeneratedAt(generatedAt)} • Full company, all statuses`;
  const specs = [
    ['Variant Summary', 'Variant Summary'],
    ['Brand Summary', 'Brand Summary'],
    ['Team Leader Inventory', 'Team Leader Inventory'],
    ['Mobile Sales Inventory', 'Mobile Sales Inventory'],
    ['Agent Inventory - TL & ML', 'Agent Inventory (Combined TL & ML)'],
    ['Combined Ending Balance', 'Combined Ending Balance (Team Leader + Agents)'],
  ] as const;
  for (const [name, title] of specs) {
    const isEndingBalance = name === 'Combined Ending Balance';
    const isTeamLeaderInventory = name === 'Team Leader Inventory';
    const isMobileSalesInventory = name === 'Mobile Sales Inventory';
    const tableColumns = 7;
    const frozenRows = isEndingBalance || name === 'Variant Summary' ? 3 : isTeamLeaderInventory ? 1 : 2;
    const ws = workbook.addWorksheet(name, {
      properties: { defaultRowHeight: 21 },
      views: [{ state: 'frozen', ySplit: frozenRows, topLeftCell: `A${frozenRows + 1}`, showGridLines: true, zoomScale: 90 }],
    });
    const companySummary = name === 'Brand Summary'
      ? writeBrandQtySummary(ws, companyLines, meta.soldVariants ?? [])
      : name === 'Variant Summary' ? writeVariantQtySummary(ws, companyLines, meta.soldVariants ?? []) : undefined;
    const tableStartRow = companySummary?.nextRow ?? 1;
    const sheetTeams = isMobileSalesInventory
      ? teams.flatMap((team) => team.members.map((person) => ({ ...team, members: [person] })))
      : teams.filter((team) => !isTeamLeaderInventory || team.leader);
    let lastRow = companySummary ? tableStartRow - 3 : 1;
    let lastCol = companySummary?.lastCol ?? 5;
    sheetTeams.forEach((team, index) => {
      const startCol = 1 + index * (tableColumns + 1);
      if (startCol + tableColumns - 1 > 16384) throw new Error('Too many inventory tables for a single Excel sheet.');
      const owners = isMobileSalesInventory ? team.members : isTeamLeaderInventory ? [team.leader!] : [...(team.leader ? [team.leader] : []), ...team.members];
      const lines = aggregateInventory(owners);
      const sizingLines = combineInventoryWithSales(lines, salesFor(owners));
      const maxVariant = sizingLines.reduce((max, line) => Math.max(max, line.variantName.length), 0);
      const maxType = sizingLines.reduce((max, line) => Math.max(max, typeLabel(line.variantType).length), 0);
      [14, Math.min(40, Math.max(18, maxVariant + 2)), Math.min(24, Math.max(14, maxType + 2)), 14, 14, 18, 24]
        .forEach((width, offset) => { ws.getColumn(startCol + offset).width = Math.max(ws.getColumn(startCol + offset).width ?? 0, width); });
      if (index < sheetTeams.length - 1) ws.getColumn(startCol + tableColumns).width = 14;
      let row = isMobileSalesInventory
        ? writeHeading(ws, tableStartRow, `MOBILE SALES: ${team.members[0].agentName}`, startCol, 'FFFFD966', tableColumns)
        : isTeamLeaderInventory
        ? writeHeading(ws, tableStartRow, team.name, startCol, 'FFFFD966', tableColumns)
        : writeTeamHeading(ws, tableStartRow, team, startCol, tableColumns);
      if (isMobileSalesInventory) {
        row = writeHeading(ws, row, `TEAM LEADER: ${team.name}`, startCol, 'FFFCE5CD', tableColumns);
      }
      if (isEndingBalance) {
        row = writeHeading(ws, row, endingBalanceLabel, startCol, 'FFFCE5CD', tableColumns);
      }
      if (name === 'Variant Summary' || name === 'Brand Summary' || isEndingBalance || isMobileSalesInventory) {
        row = writeDetailedInventoryTable(ws, row, lines, startCol, 'GRAND TOTAL', salesFor(owners));
      } else if (name === 'Team Leader Inventory') {
        row = writeDetailedInventoryTable(ws, row, lines, startCol, 'GRAND TOTAL', salesFor(owners));
      } else {
        const selected = owners;
        for (const person of selected) {
          const role = person.agentRole === 'team_leader' ? 'Team Leader' : 'Mobile Sales';
          row = writeHeading(ws, row, `${role.toUpperCase()}: ${person.agentName} • ${person.status}`, startCol, 'FFFFD966', tableColumns);
          if (person.leaderName) row = writeHeading(ws, row, `ASSIGNED TO: ${person.leaderName}`, startCol, 'FFFCE5CD', tableColumns);
          row = writeDetailedInventoryTable(ws, row, aggregateInventory([person]), startCol, 'GRAND TOTAL', salesFor([person]));
        }
        row = writeHeading(ws, row, 'COMBINED TEAM TOTAL', startCol, 'FFFFD966', tableColumns);
        row = writeDetailedInventoryTable(ws, row, aggregateInventory(selected), startCol, 'GRAND TOTAL', salesFor(selected));
      }
      lastRow = Math.max(lastRow, row - 3);
      lastCol = Math.max(lastCol, startCol + tableColumns - 1);
    });
    if (!sheetTeams.length) {
      [14, 18, 14, 14, 14, 18, 24].forEach((width, i) => { ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width ?? 0, width); });
      let row = writeHeading(ws, tableStartRow, isMobileSalesInventory ? 'No mobile sales personnel' : 'No inventory owners', 1, 'FFFFD966', tableColumns);
      if (isEndingBalance) {
        row = writeHeading(ws, row, 'No assigned agents', 1, 'FFFCE5CD', tableColumns);
        row = writeHeading(ws, row, endingBalanceLabel, 1, 'FFFCE5CD', tableColumns);
      }
      lastRow = writeDetailedInventoryTable(ws, row, [], 1, 'GRAND TOTAL', []) - 3;
      lastCol = Math.max(lastCol, tableColumns);
    }
    // Print at readable size across pages rather than shrinking every team onto one page.
    ws.pageSetup = {
      orientation: 'landscape', paperSize: 9, scale: 85, fitToPage: false,
      printArea: `A1:${ws.getCell(lastRow, lastCol).address}`, printTitlesRow: isTeamLeaderInventory ? '1:1' : '1:2',
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    };
    ws.headerFooter.oddHeader = `&L${meta.companyLabel.replace(/&/g, '&&')}&R${title}`;
    ws.headerFooter.oddHeader += ' | Sold: all-time pending + approved';
    ws.headerFooter.oddFooter = `&L${formatExportGeneratedAt(generatedAt)}&RPage &P of &N`;
  }
  return workbook;
}

export async function exportDetailedInventoryExcel(people: AccountingAgentSummary[], meta: DetailedInventoryReportMeta): Promise<void> {
  const generatedAt = meta.generatedAt ?? new Date();
  const workbook = buildDetailedInventoryWorkbook(people, { ...meta, generatedAt });
  const date = generatedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  await downloadExcelWorkbook(workbook, `detailed-inventory-report-${date}`);
}
