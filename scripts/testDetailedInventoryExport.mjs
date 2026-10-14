import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL(`../.inventory-export-test-${randomUUID()}.cjs`, import.meta.url));
const require = createRequire(import.meta.url);

try {
  await build({
    absWorkingDir: root,
    entryPoints: ['./src/features/agent-inventory/utils/exportDetailedInventoryExcel.ts'],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    tsconfig: 'tsconfig.app.json',
  });
  const { buildDetailedInventoryWorkbook } = require(output);
  const ExcelJS = require('exceljs');
  const item = (id, variantId, qty, brandId = 'brand-1') => ({
    id, variantId, qty, brandId, brandName: brandId === 'brand-1' ? 'Brand 1' : 'Brand 2',
    variantName: 'Same name', variantType: 'flavor', allocatedPrice: 1, value: qty,
  });
  const person = (id, role, inventory, leaderId, status = 'active') => ({
    agentId: id, agentName: id, agentRole: role, inventory, leaderId, status,
    totalStock: inventory.reduce((sum, line) => sum + line.qty, 0),
  });
  const repeated = item('ms1-row', 'v1', 5);
  const people = [
    person('Leader 1', 'team_leader', [item('tl1-row', 'v1', 10)]),
    person('Mobile 1', 'mobile_sales', [repeated, repeated], 'Leader 1'),
    person('Mobile 2', 'mobile_sales', [item('ms2-row', 'v2', 5)], 'Mobile 1', 'inactive'),
    person('Leader 2', 'team_leader', []),
    person('Unassigned person', 'mobile_sales', [item('unassigned-row', 'v3', 7, 'brand-2')]),
  ];
  const meta = { companyLabel: 'Test company', generatedAt: new Date('2026-10-13T01:00:00Z') };
  const workbook = buildDetailedInventoryWorkbook(people, meta);
  assert.deepEqual(workbook.worksheets.map((ws) => ws.name), [
    'Variant Summary', 'Brand Summary', 'Team Leader Inventory', 'Mobile Sales Inventory', 'Agent Inventory - TL & ML',
    'Combined Ending Balance',
  ]);

  function grandTotals(ws) {
    const totals = [];
    const step = 8;
    for (let startCol = 1; startCol <= ws.columnCount; startCol += step) {
      ws.eachRow((row) => {
        if (row.getCell(startCol).value === 'GRAND TOTAL') {
          const value = row.getCell(startCol + 4).value;
          totals.push(typeof value === 'number' ? value : value.result);
        }
      });
    }
    return totals;
  }
  assert.deepEqual(grandTotals(workbook.getWorksheet('Variant Summary')), [20, 0, 7]);
  assert.deepEqual(grandTotals(workbook.getWorksheet('Brand Summary')), [20, 0, 7]);
  assert.deepEqual(grandTotals(workbook.getWorksheet('Combined Ending Balance')), [20, 0, 7]);
  assert.deepEqual(grandTotals(workbook.getWorksheet('Team Leader Inventory')), [10, 0]);
  assert.deepEqual(grandTotals(workbook.getWorksheet('Mobile Sales Inventory')), [5, 5, 7]);
  assert.deepEqual(grandTotals(workbook.getWorksheet('Agent Inventory - TL & ML')), [10, 5, 5, 20, 0, 0, 7, 7]);

  // Serialize and reload a real XLSX to check merged cells, styles and cached formulas.
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reloaded.getWorksheet('Variant Summary');
  const brandSheet = reloaded.getWorksheet('Brand Summary');
  assert.equal(brandSheet.getCell('A1').value, 'BRAND QTY SUMMARY');
  assert.equal(brandSheet.getCell('E1').master.address, 'A1');
  assert.deepEqual(brandSheet.getRow(2).values.slice(1, 6), ['BRAND', 'FLAVOR QTY', 'BATTERY QTY', 'FOC QTY', 'TOTAL QTY']);
  assert.equal(brandSheet.getCell('B3').value, 20); // Includes both TL and agents; duplicate source record excluded.
  assert.equal(brandSheet.getCell('E3').value.result, 20);
  assert.equal(brandSheet.getCell('E5').value.result, 27); // Includes unassigned stock too.
  assert.equal(brandSheet.getCell('E5').value.formula, 'SUM(E3:E4)');
  assert.equal(brandSheet.getCell('A8').value, 'Leader 1');
  assert.equal(brandSheet.getCell('I8').value, 'Leader 2');
  const mixedTypes = buildDetailedInventoryWorkbook([
    person('Leader', 'team_leader', [
      item('flavor', 'v1', 5),
      { ...item('battery', 'v2', 6), variantType: ' BATTERY ' },
      { ...item('foc', 'v3', 7), variantType: 'FOC' },
      { ...item('posm', 'v4', 8), variantType: 'posm' },
    ]),
  ], meta).getWorksheet('Brand Summary');
  assert.equal(mixedTypes.getCell('E2').value, 'TOTAL QTY');
  assert.deepEqual(mixedTypes.getRow(3).values.slice(2, 5), [5, 6, 7]);
  assert.equal(mixedTypes.getCell('E3').value.result, 26);
  assert.equal(mixedTypes.getCell('E3').value.formula, 'SUM(B3:D3)+8');
  assert.equal(mixedTypes.getCell('E4').value.result, 26);
  const formulaRows = [];
  sheet.eachRow((row) => {
    const qty = row.getCell(5);
    if (qty.value?.formula?.startsWith('SUM(D') && qty.master.address === qty.address && row.getCell(1).alignment?.textRotation === 90) {
      formulaRows.push(row.number);
    }
  });
  const first = formulaRows[0];
  assert.equal(sheet.getCell(first, 5).value.result, 20);
  assert.equal(sheet.getCell(first, 1).alignment.textRotation, 90);
  assert.equal(sheet.getCell(first + 1, 1).master.address, `A${first}`);
  assert.equal(sheet.getCell(first + 1, 5).master.address, `E${first}`);
  assert.equal(sheet.getCell(first, 5).fill.fgColor.argb, 'FFB6D7A8');
  assert.equal(sheet.getCell(first - 1, 1).fill.fgColor.argb, 'FFFFFF00');
  assert.equal(sheet.getCell(first, 2).border.top.style, 'thin');
  assert.equal(sheet.getCell(first, 4).value, 15);
  assert.equal(sheet.getCell(first + 1, 4).value, 5); // Distinct IDs survive identical names.
  assert.equal(first, 12);
  assert.equal(sheet.getCell('A1').value, 'VARIANT QTY SUMMARY');
  assert.equal(sheet.getCell('A2').value, 'Brand 1');
  assert.equal(sheet.getCell('F2').value, 'Brand 2');
  assert.deepEqual(sheet.getRow(3).values.slice(1, 6), ['VARIANT', 'TYPE', 'QTY', 'UNIT SOLD QTY', 'TOTAL UNIT SOLD QTY']);
  assert.equal(sheet.getCell('D4').value, 0);
  assert.equal(sheet.getCell('D5').isMerged, false);
  assert.equal(sheet.getCell('E4').fill.fgColor.argb, 'FFB6D7A8');
  assert.equal(sheet.getCell('E4').font.bold, true);
  assert.equal(sheet.getCell('E4').font.size, 24);
  assert.equal(sheet.getCell('E4').alignment.horizontal, 'center');
  assert.equal(sheet.getCell('E4').alignment.vertical, 'middle');
  assert.equal(sheet.getCell('E5').master.address, 'E4');
  assert.equal(sheet.getCell('E5').fill.fgColor.argb, 'FFB6D7A8');
  assert.equal(sheet.getCell('A6').value, 'GRAND TOTAL:');
  assert.equal(sheet.getCell('C6').value.result, 20);
  assert.equal(sheet.getCell('H6').value.result, 7);
  assert.equal(sheet.getCell('D6').value.formula, 'SUM(D4:D5)');
  assert.equal(sheet.getCell('A9').value, 'Leader 1');
  assert.equal(sheet.getCell('I9').value, 'Leader 2');
  assert.equal(sheet.getCell('Q9').value, 'Unassigned');
  assert.equal(sheet.getCell('E1').master.address, 'A1');
  assert.equal(sheet.getCell('O10').master.address, 'I10');
  assert.equal(sheet.getCell('H9').value, null);
  assert.equal(sheet.getCell('P9').value, null);
  assert.equal(sheet.getCell('U12').value.formula, 'SUM(T12:T12)');
  assert.equal(sheet.getCell('U13').value.formula, 'U12');
  assert.equal(sheet.getCell('A1').fill.fgColor.argb, 'FFFFD966');
  assert.equal(sheet.getCell('A10').fill.fgColor.argb, 'FFFCE5CD');
  assert.equal(sheet.getCell('U13').numFmt, '"TOTAL: "#,##0');
  const battery = (id, qty) => ({ ...item(id, 'amz-battery', qty), brandName: 'AMZ', variantName: 'AMZ BATTERY', variantType: 'battery' });
  const combinedVariant = buildDetailedInventoryWorkbook([
    person('TL 1', 'team_leader', [battery('amz-1', 998)]),
    person('TL 2', 'team_leader', [battery('amz-2', 1977)]),
  ], meta).getWorksheet('Variant Summary');
  assert.equal(combinedVariant.getCell('A4').value, 'AMZ BATTERY');
  assert.equal(combinedVariant.getCell('C4').value, 2975);
  assert.equal(combinedVariant.getCell('D4').value, 0);
  assert.equal(combinedVariant.getCell('C5').value.result, 2975);
  assert.equal(combinedVariant.getCell('A5').value, 'GRAND TOTAL:');
  const salesCode = await transform(await readFile(new URL('../src/features/agent-inventory/utils/inventorySalesSummary.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' });
  const { aggregateInventoryOrderSales } = await import(`data:text/javascript;base64,${Buffer.from(salesCode.code).toString('base64')}`);
  const sale = (itemId, status, quantity, stage = null) => ({
    itemId, status, quantity, stage, brandId: 'brand-1', brandName: 'AMZ',
    variantId: 'amz-battery', variantName: 'AMZ BATTERY', variantType: ' BATTERY ',
  });
  const approvedSale = sale('approved', 'approved', 20);
  const soldVariants = aggregateInventoryOrderSales([
    sale('pending', 'pending', 10, 'finance_pending'), approvedSale, approvedSale,
    sale('rejected', 'rejected', 99), sale('rejected-stage', 'pending', 50, 'admin_rejected'),
    sale('cancelled', 'cancelled', 60),
    { ...sale('sold-only', 'pending', 7, 'needs_revision'), brandId: 'brand-2', brandName: 'Sold Only', variantId: 'sold-only', variantName: 'Empty Stock', variantType: 'flavor' },
  ]);
  const withSales = buildDetailedInventoryWorkbook([
    person('TL', 'team_leader', [battery('current', 10)]),
  ], { ...meta, soldVariants });
  const salesSheet = withSales.getWorksheet('Variant Summary');
  assert.equal(salesSheet.getCell('C4').value, 10);
  assert.equal(salesSheet.getCell('D4').value, 30);
  assert.equal(salesSheet.getCell('H4').value, 0);
  assert.equal(salesSheet.getCell('I4').value, 7);
  assert.equal(salesSheet.getCell('D5').value.result, 30);
  assert.deepEqual(grandTotals(withSales.getWorksheet('Team Leader Inventory')), [10]);
  const ownerSale = (itemId, agentId, quantity, variantId = 'v1') => ({
    itemId, agentId, quantity, variantId, status: 'pending', stage: 'finance_pending',
    brandId: 'brand-1', brandName: 'Brand 1', variantName: 'Same name', variantType: 'flavor',
  });
  const ownerSoldVariants = aggregateInventoryOrderSales([
    ownerSale('owner-tl', 'Leader 1', 3),
    ownerSale('owner-ms1', 'Mobile 1', 8),
    ownerSale('owner-ms2', 'Mobile 2', 2),
  ]);
  assert.equal(ownerSoldVariants.length, 3); // Same variant remains separate for each owner.
  const ownerWorkbook = buildDetailedInventoryWorkbook(people, { ...meta, soldVariants: ownerSoldVariants });
  assert.equal(ownerWorkbook.getWorksheet('Team Leader Inventory').getCell('F3').value, 3);
  assert.equal(ownerWorkbook.getWorksheet('Mobile Sales Inventory').getCell('F4').value, 8);
  assert.equal(ownerWorkbook.getWorksheet('Mobile Sales Inventory').getCell('N4').value, 2);
  assert.equal(ownerWorkbook.getWorksheet('Mobile Sales Inventory').getCell('L4').value, 0); // Sold-only variant for this owner.
  assert.equal(ownerWorkbook.getWorksheet('Variant Summary').getCell('D4').value, 13);
  const combinedSoldTotals = [];
  ownerWorkbook.getWorksheet('Agent Inventory - TL & ML').eachRow((row) => {
    if (row.getCell(1).value === 'GRAND TOTAL') {
      const sold = row.getCell(6).value;
      combinedSoldTotals.push(typeof sold === 'number' ? sold : sold.result);
    }
  });
  assert.deepEqual(combinedSoldTotals, [3, 8, 2, 13]);
  assert.deepEqual(grandTotals(ownerWorkbook.getWorksheet('Combined Ending Balance')), [20, 0, 7]);
  assert.equal(ownerWorkbook.getWorksheet('Brand Summary').getCell('F2').value, 'TOTAL UNIT SOLD QTY');
  assert.equal(ownerWorkbook.getWorksheet('Brand Summary').getCell('F3').value, 13);
  assert.equal(ownerWorkbook.getWorksheet('Brand Summary').getCell('F5').value.result, 13);
  for (const name of ['Variant Summary', 'Brand Summary', 'Combined Ending Balance']) {
    const ws = ownerWorkbook.getWorksheet(name);
    const soldTotals = [];
    ws.eachRow((row) => {
      if (row.getCell(1).value === 'GRAND TOTAL') soldTotals.push(row.getCell(6).value.result ?? row.getCell(6).value);
    });
    assert.deepEqual(soldTotals, [13], `${name} has the correct team sold total`);
  }

  assert.throws(() => buildDetailedInventoryWorkbook([
    person('a', 'mobile_sales', [], 'b'), person('b', 'mobile_sales', [], 'a'),
  ], meta), /Circular/);
  assert.throws(() => buildDetailedInventoryWorkbook([
    person('a', 'team_leader', [repeated]), person('b', 'mobile_sales', [repeated], 'a'),
  ], meta), /Conflicting inventory ownership/);
  const empty = buildDetailedInventoryWorkbook([], meta);
  assert.equal(empty.worksheets.length, 6);
  for (const ws of empty.worksheets) assert.deepEqual(grandTotals(ws), [0]);
  const large = buildDetailedInventoryWorkbook([
    person('Leader', 'team_leader', Array.from({ length: 1201 }, (_, i) => item(`row-${i}`, `variant-${i}`, 1))),
  ], meta);
  assert.deepEqual(grandTotals(large.getWorksheet('Variant Summary')), [1201]);
  const ending = buildDetailedInventoryWorkbook([
        person('Leader', 'team_leader', [item('ending-tl', 'v1', 20)]),
        person('Agent 1', 'mobile_sales', [item('ending-a1', 'v1', 10)], 'Leader'),
        person('Agent 2', 'mobile_sales', [item('ending-a2', 'v1', 15)], 'Leader'),
        person('Agent 3', 'mobile_sales', [item('ending-a3', 'v1', 5)], 'Leader'),
      ], meta);
  assert.deepEqual(grandTotals(ending.getWorksheet('Combined Ending Balance')), [50]);
  assert.deepEqual(grandTotals(ending.getWorksheet('Variant Summary')), [50]);
  assert.match(ending.getWorksheet('Combined Ending Balance').getCell('A3').value, /current balances/);
  assert.match(ending.getWorksheet('Combined Ending Balance').getCell('A3').value, /Oct 13, 2026/);
  assert.equal(ending.getWorksheet('Combined Ending Balance').getCell('E5').value.result, 50);
  assert.equal(ending.getWorksheet('Combined Ending Balance').views[0].ySplit, 3);
  const afterTransfer = structuredClone(people);
  afterTransfer[0].inventory[0].qty -= 3;
  afterTransfer[1].inventory[0].qty += 3;
  assert.deepEqual(grandTotals(buildDetailedInventoryWorkbook(afterTransfer, meta).getWorksheet('Combined Ending Balance')), [20, 0, 7]);
  if (process.argv.includes('--preview')) {
    const demoPeople = [];
    for (let team = 1; team <= 3; team++) {
      const leader = `TEAM LEADER ${team}`;
      const inventory = Array.from({ length: 15 }, (_, i) => ({
        ...item(`demo-${team}-${i}`, `v${i}`, 5, `brand-${Math.floor(i / 5) + 1}`),
        brandName: `BRAND ${Math.floor(i / 5) + 1}`,
        variantName: `Variant ${i % 5 + 1}`,
        variantType: i % 5 === 0 || i % 5 === 2 ? 'flavor' : 'battery',
      }));
      demoPeople.push(person(leader, 'team_leader', inventory));
      for (let agent = 1; agent <= 3; agent++) {
        demoPeople.push({ ...person(`team-${team}-agent-${agent}`, 'mobile_sales', [], leader), agentName: `AGENT ${agent}` });
      }
    }
    const demoSoldVariants = demoPeople[0].inventory.map((line, i) => ({
      agentId: demoPeople[0].agentId, brandId: line.brandId, brandName: line.brandName, variantId: line.variantId,
      variantName: line.variantName, variantType: line.variantType, quantity: 10 + i,
    }));
    const demo = buildDetailedInventoryWorkbook(demoPeople, {
      ...meta, companyLabel: 'B1G • Sample data', soldVariants: demoSoldVariants,
    });
    const directory = new URL('../artifacts/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('detailed-inventory-design-preview.xlsx', directory), await demo.xlsx.writeBuffer());
  }
  console.log('Detailed inventory export checks passed: totals, ownership, hierarchy, XLSX formulas/styles, empty and large reports.');
} finally {
  await unlink(output).catch((error) => { if (error.code !== 'ENOENT') throw error; });
}
