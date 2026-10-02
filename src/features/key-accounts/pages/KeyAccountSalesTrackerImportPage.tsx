import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Download, Loader2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  parseKeyAccountSalesTrackerExcel,
  type SalesTrackerParseResult,
} from '@/features/key-accounts/utils/parseKeyAccountSalesTrackerExcel';
import { applySalesRecordAliases, productAliasKey } from '@/features/key-accounts/utils/unpivotClientSalesRecord';
import {
  SALES_RECORD_IMPORT_PO_CHUNK,
  type KASalesRecordExcelRow,
  type SalesRecordAliases,
} from '@/features/key-accounts/utils/clientSalesRecordTypes';

const ALIAS_KEY = 'ka-sales-tracker-import-aliases-v1';

type PreviewItem = {
  excel_row?: number;
  sheet_name?: string;
  excel_brand?: string;
  excel_variant?: string;
  brand: string;
  variant: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  line_total?: number;
  lookup_ok: boolean;
};

type PreviewPo = {
  external_po_ref: string;
  would_insert: boolean;
  order_date: string;
  client: string;
  shop: string;
  kam: string;
  rfpf_number?: string | null;
  line_count: number;
  total_amount: number;
  payment_amount: number;
  payment_status: string;
  po_order_kind?: string;
  commissioned?: boolean;
  will_create_client?: boolean;
  will_create_shop?: boolean;
  will_create_address?: boolean;
  trade_name?: string;
  vape_shops?: string[];
  shop_choice_required?: boolean;
  items?: PreviewItem[];
  issues: string[];
};

type PendingMaster = {
  client_name: string;
  shop_name: string;
  address_label: string;
  full_address: string;
  category: string;
  create_client: boolean;
  create_shop: boolean;
  create_address: boolean;
};

type DryRunResult = {
  dry_run: true;
  po_count: number;
  blocking_pos: number;
  create_missing?: boolean;
  pending_master?: PendingMaster[];
  purchase_orders: PreviewPo[];
};

type ImportPoResult = {
  external_po_ref: string;
  ok: boolean;
  po_number?: string;
  issues?: string[];
  already_imported?: boolean;
};

function isAlreadyImportedPo(po: PreviewPo) {
  return po.issues.some((issue) => issue.startsWith('already in OMS'));
}

function isAlreadyImportedResult(row: ImportPoResult) {
  return row.already_imported === true
    || (row.issues || []).some((issue) => issue.startsWith('already imported') || issue.startsWith('already in OMS'));
}

function existingPoLabel(po: PreviewPo) {
  const issue = po.issues.find((item) => item.startsWith('already in OMS')) || '';
  return issue.replace(/^already in OMS:\s*/, '').trim();
}

function peso(value: number) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatDateDmy(value: string | null | undefined) {
  const text = String(value || '').trim().slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text || '—';
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = months[Number(match[2]) - 1];
  if (!month) return text;
  return `${match[3]}-${month}-${match[1]}`;
}

function loadAliases(): SalesRecordAliases {
  try {
    const raw = localStorage.getItem(ALIAS_KEY);
    if (!raw) return { agents: {}, products: {} };
    const parsed = JSON.parse(raw) as SalesRecordAliases;
    return { agents: parsed.agents || {}, products: parsed.products || {} };
  } catch {
    return { agents: {}, products: {} };
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function orderRfpfLabel(po: PreviewPo) {
  const raw = String(po.external_po_ref || po.rfpf_number || '').trim();
  return raw || 'NO RFPF';
}

function itemAmount(item: PreviewItem) {
  if (item.line_total != null && Number.isFinite(Number(item.line_total))) return Number(item.line_total);
  return Math.round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100) / 100;
}

function brandsOf(po: PreviewPo) {
  const map = new Map<string, PreviewItem[]>();
  for (const item of po.items || []) {
    const brand = String(item.excel_brand || item.brand || 'Unknown').trim() || 'Unknown';
    if (!map.has(brand)) map.set(brand, []);
    map.get(brand)!.push(item);
  }
  return [...map.entries()];
}

type SameRfpfRow = {
  po: PreviewPo;
  brands: { brand: string; quantity: number; amount: number }[];
};

function SameRfpfTable({ rows, emptyLabel }: { rows: SameRfpfRow[]; emptyLabel: string }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-4">{emptyLabel}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>RFPF</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Client</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Paid</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ po, brands }) => {
          const label = orderRfpfLabel(po);
          const quantity = brands.reduce((sum, brand) => sum + brand.quantity, 0);
          return (
            <Fragment key={po.external_po_ref}>
              {brands.map((brand) => (
                <TableRow key={`${po.external_po_ref}|${brand.brand}`}>
                  <TableCell className="font-mono text-sm">{label}</TableCell>
                  <TableCell className="text-sm">{brand.brand}</TableCell>
                  <TableCell className="text-sm">{po.client || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{brand.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(brand.amount)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50">
                <TableCell className="font-mono text-sm font-medium">{label}</TableCell>
                <TableCell className="text-sm font-medium" colSpan={2}>
                  {brands.length} products with this RFPF → one PO
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">{quantity}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{peso(po.total_amount)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{peso(po.payment_amount)}</TableCell>
              </TableRow>
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PoMasterBadges({ po }: { po: PreviewPo }) {
  return (
    <>
      {po.will_create_client ? <Badge className="ml-1" variant="outline">new client</Badge> : null}
      {po.will_create_shop ? <Badge className="ml-1" variant="outline">new shop</Badge> : null}
      {po.will_create_address ? <Badge className="ml-1" variant="outline">new address</Badge> : null}
    </>
  );
}

function poHasVariantLine(po: PreviewPo) {
  const items = po.items || [];
  return items.some((item) => {
    const variant = String(item.excel_variant || item.variant || '').trim();
    return Boolean(variant) && Number(item.quantity) > 0;
  });
}

function poBrandLabel(po: PreviewPo) {
  for (const item of po.items || []) {
    const brand = String(item.excel_brand || item.brand || '').trim();
    if (brand) return brand;
  }
  return 'Unknown brand';
}

function brandMatchKey(value: string) {
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return '';
  if (key.includes('amz')) return 'amz';
  if (key.includes('xslim') || key.includes('slimbar')) return 'xslimbar';
  if (key.includes('ultralite') || (key.includes('ultra') && key.includes('lite'))) return 'ultralite';
  if (key.includes('xforge') || key === 'forge') return 'xforge';
  if (key.includes('chillax')) return 'chillax';
  if (key.includes('onebar')) return 'onebar';
  if (key.includes('aero')) return 'aero';
  if (key.includes('relx') && key.includes('go')) return 'relxgo';
  if (key.includes('relx') && key.includes('ultra') && key.includes('pro')) return 'relxultrapro';
  return key;
}

function poVariantLabel(po: PreviewPo) {
  const names = new Set<string>();
  for (const item of po.items || []) {
    const variant = String(item.excel_variant || item.variant || '').trim();
    if (variant) names.add(variant);
  }
  return [...names].join(', ') || '—';
}

function paymentIsPaid(po: PreviewPo) {
  return String(po.payment_status || '').toLowerCase() === 'paid';
}

function paymentIsUnpaid(po: PreviewPo) {
  const status = String(po.payment_status || '').toLowerCase().replace(/\s+/g, '');
  return status === 'unpaid' || status === 'partial' || status.includes('balance');
}

function nextStepForSaveError(message: string, po?: PreviewPo) {
  const text = message.toLowerCase();
  if (text.includes('exceeds remaining balance') || (text.includes('payment') && text.includes('exceed'))) {
    const paid = po ? peso(po.payment_amount) : 'the payment';
    const total = po ? peso(po.total_amount) : 'the order total';
    return `Next step: payment ${paid} is higher than the order total ${total}. Lower the Excel payment, or correct the flavor quantities and amounts below, then import this RFPF again.`;
  }
  if (text.includes('not allowed to record payment')) {
    return 'Next step: sign in as Sales Admin or Sales Head for this company, then import this RFPF again.';
  }
  if (text.includes('timeout')) {
    return 'Next step: import this RFPF again. The database stopped the save because it took too long.';
  }
  if (text.includes('duplicate') || text.includes('unique') || text.includes('already')) {
    return 'Next step: this RFPF is already stored, or it duplicates a PO number. Check Already imported before importing it again.';
  }
  return 'Next step: fix the problem named above on this RFPF, then import it again. Orders that already saved stay skipped.';
}

function failedImportOrders(failed: ImportPoResult[], catalog: PreviewPo[]): PreviewPo[] {
  const byRef = new Map(catalog.map((po) => [po.external_po_ref, po]));
  return failed.map((row) => {
    const source = byRef.get(row.external_po_ref);
    const message = row.issues?.filter(Boolean).join(' · ') || 'Failed to save';
    const base: PreviewPo = source || {
      external_po_ref: row.external_po_ref,
      would_insert: false,
      order_date: '',
      client: '',
      shop: '',
      kam: '',
      line_count: 0,
      total_amount: 0,
      payment_amount: 0,
      payment_status: '',
      issues: [],
      items: [],
    };
    return {
      ...base,
      would_insert: false,
      issues: [message, nextStepForSaveError(message, base)],
    };
  });
}

function poHasRfpf(po: PreviewPo) {
  const raw = String(po.rfpf_number || po.external_po_ref || '').trim();
  if (!raw) return false;
  return /RFPF\s*[-–—]?\s*\d+/i.test(raw);
}

function SoftCheckOrderList({
  orders,
  emptyLabel,
  showIssues,
  statusLabel,
}: {
  orders: PreviewPo[];
  emptyLabel: string;
  showIssues?: boolean;
  statusLabel?: string;
}) {
  if (!orders.length) {
    return <p className="text-sm text-muted-foreground py-4">{emptyLabel}</p>;
  }

  return (
    <Accordion type="multiple" className="w-full">
      {orders.map((po) => {
        const brands = brandsOf(po);
        const consigned = String(po.po_order_kind || '').toLowerCase() === 'consignment';
        return (
          <AccordionItem key={po.external_po_ref} value={po.external_po_ref}>
            <AccordionTrigger className="hover:no-underline text-left">
              <div className="flex flex-1 flex-col gap-1 pr-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium font-mono text-sm">{orderRfpfLabel(po)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatDateDmy(po.order_date)} · {po.client}
                    {po.shop ? ` · ${po.shop}` : ''}
                    <PoMasterBadges po={po} />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  {consigned ? <Badge variant="outline">Consigned</Badge> : null}
                  <Badge variant="secondary">{po.payment_status}</Badge>
                  {statusLabel
                    ? <Badge variant="secondary">{statusLabel}</Badge>
                    : !po.would_insert
                      ? <Badge variant="destructive">Blocked</Badge>
                      : null}
                  <span className="tabular-nums text-muted-foreground">{po.line_count} line(s)</span>
                  <span className="tabular-nums font-medium">{peso(po.total_amount)}</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pl-1">
                {showIssues && po.issues.length ? (
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {po.issues.map((issue) => (
                      <li
                        key={issue}
                        className={
                          issue.startsWith('Next step:')
                            ? 'text-foreground'
                            : statusLabel === 'Already imported'
                              ? 'text-muted-foreground'
                              : 'text-destructive'
                        }
                      >
                        {issue}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {brands.map(([brand, items]) => {
                  const brandQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                  const brandAmount = items.reduce((sum, item) => sum + itemAmount(item), 0);
                  return (
                    <div key={`${po.external_po_ref}-${brand}`} className="rounded-md border">
                      <div className="border-b bg-muted/40 px-3 py-2">
                        <p className="text-sm font-semibold tracking-wide">{brand}</p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Variant</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Match</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item, index) => (
                            <TableRow key={`${item.excel_row || index}-${item.excel_variant || item.variant}`}>
                              <TableCell>{item.excel_variant || item.variant || '—'}</TableCell>
                              <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums">{peso(itemAmount(item))}</TableCell>
                              <TableCell>
                                {item.lookup_ok
                                  ? <Badge variant="secondary">Matched</Badge>
                                  : <Badge variant="destructive">Not matched</Badge>}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell className="font-medium">Brand total</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{brandQty}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{peso(brandAmount)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}

                {!brands.length ? (
                  <p className="text-sm text-muted-foreground">No line items on this order.</p>
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

async function kaPost<T>(
  action: 'dry-run' | 'import',
  rows: KASalesRecordExcelRow[],
  createMissing: boolean
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const res = await fetch('/api/key-account/sales-record-import', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, rows, create_missing: createMissing }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Request failed');
  return body as T;
}

function ImportResultTable({
  rows,
  emptyLabel,
  status,
}: {
  rows: ImportPoResult[];
  emptyLabel: string;
  status: 'imported' | 'failed' | 'already';
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-4">{emptyLabel}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>RFPF</TableHead>
          <TableHead>System PO</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.external_po_ref}>
            <TableCell className="font-mono text-sm">
              {row.external_po_ref}
            </TableCell>
            <TableCell className="font-mono">{row.po_number || '—'}</TableCell>
            <TableCell>
              {status === 'imported' ? <Badge>Imported</Badge> : null}
              {status === 'already' ? <Badge variant="secondary">Already imported</Badge> : null}
              {status === 'failed' ? (
                <span className="text-sm text-destructive">{row.issues?.join(' · ') || 'Failed'}</span>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function failedImportPayload(orders: PreviewPo[]) {
  return {
    exported_at: new Date().toISOString(),
    failed_count: orders.length,
    orders: orders.map((po) => {
      const error = po.issues.find((issue) => !issue.startsWith('Next step:')) || 'Failed to save';
      const nextStep = po.issues.find((issue) => issue.startsWith('Next step:')) || '';
      return {
        rfpf: orderRfpfLabel(po),
        order_date: po.order_date || '',
        client: po.client || '',
        shop: po.shop || '',
        payment_status: po.payment_status || '',
        order_kind: po.po_order_kind || '',
        line_count: po.line_count,
        total_amount: po.total_amount,
        payment_amount: po.payment_amount,
        error,
        next_step: nextStep,
        lines: (po.items || []).map((item) => ({
          brand: item.excel_brand || item.brand || '',
          variant: item.excel_variant || item.variant || '',
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: itemAmount(item),
          matched: item.lookup_ok,
        })),
      };
    }),
  };
}

function failedImportSheetRows(orders: PreviewPo[]) {
  const payload = failedImportPayload(orders);
  const rows: Record<string, string | number | boolean>[] = [];
  for (const order of payload.orders) {
    const header = {
      RFPF: order.rfpf,
      Date: order.order_date,
      Client: order.client,
      Shop: order.shop,
      'Payment status': order.payment_status,
      'Order kind': order.order_kind,
      'Line count': order.line_count,
      'Order total': order.total_amount,
      'Total paid': order.payment_amount,
      Error: order.error,
      'Next step': order.next_step,
    };
    if (!order.lines.length) {
      rows.push({ ...header, Brand: '', Variant: '', Qty: '', 'Unit price': '', Amount: '', Matched: '' });
      continue;
    }
    for (const line of order.lines) {
      rows.push({
        ...header,
        Brand: line.brand,
        Variant: line.variant,
        Qty: line.quantity,
        'Unit price': line.unit_price,
        Amount: line.amount,
        Matched: line.matched ? 'Matched' : 'Not matched',
      });
    }
  }
  return rows;
}

function exportFailedImports(orders: PreviewPo[], format: 'csv' | 'xlsx' | 'json') {
  if (!orders.length) return;
  const today = new Date().toISOString().slice(0, 10);
  const filename = `sales-tracker-failed-import_${today}.${format}`;
  if (format === 'json') {
    downloadBlob(
      new Blob([JSON.stringify(failedImportPayload(orders), null, 2)], { type: 'application/json;charset=utf-8;' }),
      filename
    );
    return;
  }
  const sheet = XLSX.utils.json_to_sheet(failedImportSheetRows(orders));
  if (format === 'csv') {
    downloadBlob(new Blob(['\uFEFF' + XLSX.utils.sheet_to_csv(sheet)], { type: 'text/csv;charset=utf-8;' }), filename);
    return;
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Failed to import');
  XLSX.writeFile(workbook, filename);
}

function ShopChoiceTable({
  orders,
  choices,
  onChoose,
}: {
  orders: PreviewPo[];
  choices: Record<string, string>;
  onChoose: (ref: string, shopName: string) => void;
}) {
  if (!orders.length) {
    return <p className="text-sm text-muted-foreground py-4">Every order already has a shop, or the shop name is the same in both columns.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>RFPF</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Trade name</TableHead>
          <TableHead>Vape shop</TableHead>
          <TableHead>Use as shop</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((po) => {
          const chosen = choices[po.external_po_ref] || '';
          const options = shopOptions(po);
          return (
            <TableRow key={po.external_po_ref}>
              <TableCell className="font-mono text-sm">{orderRfpfLabel(po)}</TableCell>
              <TableCell className="text-sm">{po.client || '—'}</TableCell>
              <TableCell className="text-sm">{po.trade_name || '—'}</TableCell>
              <TableCell className="text-sm">{(po.vape_shops || []).join(' · ') || '—'}</TableCell>
              <TableCell className="min-w-52">
                <Select
                  value={chosen || undefined}
                  onValueChange={(value) => onChoose(po.external_po_ref, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose shop" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {chosen ? `Will create ${chosen}` : 'This shop is not in OMS yet.'}
                </p>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ImportResultCard({
  imported,
  failed,
  failedOrders,
  already,
  missingShops,
  shopChoices,
  onChooseShop,
}: {
  imported: ImportPoResult[];
  failed: ImportPoResult[];
  failedOrders: PreviewPo[];
  already: ImportPoResult[];
  missingShops: PreviewPo[];
  shopChoices: Record<string, string>;
  onChooseShop: (ref: string, shopName: string) => void;
}) {
  const defaultValue = !imported.length && !failed.length && missingShops.length
    ? 'choose-shop'
    : failed.length
      ? 'failed'
      : imported.length
        ? 'imported'
        : missingShops.length
          ? 'choose-shop'
          : 'already';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import result</CardTitle>
        <CardDescription>
          {imported.length} imported · {already.length} already imported · {failed.length} failed to save
          {missingShops.length ? ` · ${missingShops.length} need a shop name` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultValue}>
          <TabsList className="flex h-auto flex-wrap gap-1">
            <TabsTrigger value="imported">Imported ({imported.length})</TabsTrigger>
            <TabsTrigger value="failed">Failed to import ({failed.length})</TabsTrigger>
            <TabsTrigger value="already">Already imported ({already.length})</TabsTrigger>
            <TabsTrigger value="choose-shop">Choose shop ({missingShops.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="imported">
            <ImportResultTable
              rows={imported}
              status="imported"
              emptyLabel="No purchase orders were imported in this run."
            />
          </TabsContent>
          <TabsContent value="failed" className="space-y-2">
            {failed.length ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Open an RFPF to see why it did not save, what to change, and the brand and variant on that order.
                  Export keeps the error, the order total, the payment, and each variant line.
                </p>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => exportFailedImports(failedOrders, 'csv')}>
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => exportFailedImports(failedOrders, 'xlsx')}>
                    <Download className="mr-2 h-4 w-4" />
                    XLSX
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => exportFailedImports(failedOrders, 'json')}>
                    <Download className="mr-2 h-4 w-4" />
                    JSON
                  </Button>
                </div>
              </div>
            ) : null}
            <SoftCheckOrderList
              orders={failedOrders}
              emptyLabel="No purchase orders failed to save."
              showIssues
              statusLabel="Failed to save"
            />
          </TabsContent>
          <TabsContent value="already">
            <ImportResultTable
              rows={already}
              status="already"
              emptyLabel="No RFPFs in this file were already in OMS."
            />
          </TabsContent>
          <TabsContent value="choose-shop" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              These orders have no saved shop under the client. Pick the trade name or the vape shop.
              That name is created on import. Run Dry-run again if you want them listed on Can import first.
            </p>
            <ShopChoiceTable orders={missingShops} choices={shopChoices} onChoose={onChooseShop} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function groupRows(rows: KASalesRecordExcelRow[]) {
  const map = new Map<string, KASalesRecordExcelRow[]>();
  for (const row of rows) {
    const ref = String(row.external_po_ref || '').trim();
    if (!map.has(ref)) map.set(ref, []);
    map.get(ref)!.push(row);
  }
  return map;
}

function isShopChoiceIssue(issue: string) {
  return issue.startsWith('choose shop:') || issue.startsWith('shop matches more than one:');
}

function shopSpellKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function shopOptions(po: PreviewPo) {
  const names = [
    ...String(po.trade_name || '').split('|').map((part) => part.trim()),
    ...(po.vape_shops || []),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = shopSpellKey(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function rowsWithShopChoices(source: KASalesRecordExcelRow[], choices: Record<string, string>) {
  return source.map((row) => {
    const chosen = choices[String(row.external_po_ref || '').trim()];
    if (!chosen) return row;
    return {
      ...row,
      shop_name: chosen,
      trade_name: chosen,
      vape_shop_names: chosen,
      shop_name_confirmed: true,
    };
  });
}

export function KeyAccountSalesTrackerImportPage() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<SalesTrackerParseResult | null>(null);
  const [aliases, setAliases] = useState<SalesRecordAliases>(() => loadAliases());
  const [kams, setKams] = useState<{ email: string; full_name: string | null }[]>([]);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [importResults, setImportResults] = useState<ImportPoResult[]>([]);
  const [busy, setBusy] = useState<'parse' | 'dry' | 'import' | null>(null);
  const [importProgress, setImportProgress] = useState('');
  const stopImportRef = useRef(false);
  const [productDrafts, setProductDrafts] = useState<Record<string, { brand_name: string; variant_name: string; sku: string }>>({});
  const [createMissing, setCreateMissing] = useState(true);
  const [shopChoices, setShopChoices] = useState<Record<string, string>>({});
  const [softChecked, setSoftChecked] = useState(false);
  const softCheckRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => (parsed ? applySalesRecordAliases(parsed.rows, aliases) : []),
    [parsed, aliases]
  );

  const readyPos = useMemo(
    () => dryRun?.purchase_orders.filter((po) => po.would_insert) || [],
    [dryRun]
  );
  const alreadyImportedPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => isAlreadyImportedPo(po)),
    [dryRun]
  );
  const blockedPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => !po.would_insert && !isAlreadyImportedPo(po)),
    [dryRun]
  );
  const paidWithVariantPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => paymentIsPaid(po) && poHasVariantLine(po)),
    [dryRun]
  );
  const unpaidWithVariantPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => paymentIsUnpaid(po) && poHasVariantLine(po)),
    [dryRun]
  );
  const paidWithoutVariantPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => paymentIsPaid(po) && !poHasVariantLine(po)),
    [dryRun]
  );
  const unpaidWithoutVariantPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => paymentIsUnpaid(po) && !poHasVariantLine(po)),
    [dryRun]
  );
  const consignedPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => String(po.po_order_kind || '').toLowerCase() === 'consignment'),
    [dryRun]
  );
  const noVariantPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => !poHasVariantLine(po)),
    [dryRun]
  );
  const noVariantByBrand = useMemo(() => {
    const map = new Map<string, PreviewPo[]>();
    for (const po of noVariantPos) {
      const brand = poBrandLabel(po);
      if (!map.has(brand)) map.set(brand, []);
      map.get(brand)!.push(po);
    }
    return [...map.entries()]
      .map(([brand, orders]) => ({ brand, orders, rfpfCount: orders.length }))
      .sort((a, b) => b.rfpfCount - a.rfpfCount || a.brand.localeCompare(b.brand));
  }, [noVariantPos]);
  const withRfpfPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => poHasRfpf(po)),
    [dryRun]
  );
  const withoutRfpfPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => !poHasRfpf(po)),
    [dryRun]
  );
  const sameRfpfPos = useMemo(
    () => (dryRun?.purchase_orders || [])
      .map((po) => {
        const brands = brandsOf(po).map(([brand, items]) => ({
          brand,
          quantity: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
          amount: items.reduce((sum, item) => sum + itemAmount(item), 0),
        }));
        return { po, brands };
      })
      .filter((row) => row.brands.length > 1)
      .sort((a, b) => orderRfpfLabel(a.po).localeCompare(orderRfpfLabel(b.po))),
    [dryRun]
  );
  const sameRfpfReadyPos = useMemo(
    () => sameRfpfPos.filter((row) => row.po.would_insert),
    [sameRfpfPos]
  );
  const missingShopPos = useMemo(
    () => (dryRun?.purchase_orders || []).filter((po) => po.issues.some((issue) => issue.startsWith('choose shop:'))),
    [dryRun]
  );
  const shopNamePos = useMemo(() => {
    return (dryRun?.purchase_orders || []).filter((po) => {
      const trades = String(po.trade_name || '').split('|').map((part) => part.trim()).filter(Boolean);
      const vapes = po.vape_shops || [];
      if (po.shop_choice_required) return true;
      if (!vapes.length || !trades.length) return false;
      const keys = new Set([...trades, ...vapes].map(shopSpellKey).filter(Boolean));
      if (keys.size > 1) return true;
      const raw = new Set([...trades, ...vapes].map((part) => part.trim().toLowerCase()));
      return raw.size > 1;
    });
  }, [dryRun]);
  const shopChoiceReady = useMemo(() => {
    return (dryRun?.purchase_orders || []).filter((po) => {
      if (!po.shop_choice_required) return false;
      if (!shopChoices[po.external_po_ref]) return false;
      if (isAlreadyImportedPo(po)) return false;
      const issues = po.issues.filter((issue) => !issue.startsWith('already in OMS') && !isShopChoiceIssue(issue));
      return issues.length === 0;
    });
  }, [dryRun, shopChoices]);
  const importPos = useMemo(() => {
    const seen = new Set(readyPos.map((po) => po.external_po_ref));
    return [...readyPos, ...shopChoiceReady.filter((po) => !seen.has(po.external_po_ref))];
  }, [readyPos, shopChoiceReady]);

  const namedAgents = useMemo(
    () => (parsed?.agents || []).filter((agent) => !isEmail(agent)),
    [parsed]
  );

  const unmatchedProducts = useMemo(() => {
    const map = new Map<string, { brand: string; variant: string; sheets: Set<string>; rfpf: Set<string>; orderedRfpf: Set<string>; quantity: number }>();
    for (const po of dryRun?.purchase_orders || []) {
      for (const item of po.items || []) {
        if (item.lookup_ok) continue;
        const brand = item.excel_brand || item.brand;
        const variant = item.excel_variant || item.variant;
        const key = productAliasKey(brand, variant);
        if (key === '||') continue;
        if (aliases.products[key]) continue;
        const existing = map.get(key) || {
          brand,
          variant,
          sheets: new Set<string>(),
          rfpf: new Set<string>(),
          orderedRfpf: new Set<string>(),
          quantity: 0,
        };
        if (item.sheet_name) existing.sheets.add(item.sheet_name);
        existing.rfpf.add(orderRfpfLabel(po));
        const quantity = Number(item.quantity) || 0;
        if (quantity > 0) {
          existing.orderedRfpf.add(orderRfpfLabel(po));
          existing.quantity += quantity;
        }
        map.set(key, existing);
      }
    }
    return [...map.entries()].map(([key, value]) => ({
      key,
      brand: value.brand,
      variant: value.variant,
      sheets: [...value.sheets],
      rfpfCount: value.rfpf.size,
      orderedRfpfCount: value.orderedRfpf.size,
      quantity: value.quantity,
    }));
  }, [dryRun, aliases]);

  const missingVariantsByBrand = useMemo(() => {
    const map = new Map<string, typeof unmatchedProducts>();
    for (const item of unmatchedProducts) {
      const key = brandMatchKey(item.brand);
      if (!key || !item.variant.trim()) continue;
      if (!(item.quantity > 0) || item.orderedRfpfCount < 1) continue;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.variant.localeCompare(b.variant));
    }
    return map;
  }, [unmatchedProducts]);

  const pendingMaster = dryRun?.pending_master || [];

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('email, full_name, role')
      .in('role', ['sales_head', 'sales_director', 'key_account_manager', 'sales_admin'])
      .then(({ data }) => {
        setKams((data || []).filter((row) => row.email).map((row) => ({
          email: String(row.email),
          full_name: row.full_name,
        })));
      });
  }, []);

  const resetResults = () => {
    setDryRun(null);
    setImportResults([]);
    setImportProgress('');
    setSoftChecked(false);
  };

  const persistAliases = (next: SalesRecordAliases) => {
    setAliases(next);
    localStorage.setItem(ALIAS_KEY, JSON.stringify(next));
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setBusy('parse');
    resetResults();
    try {
      const next = await parseKeyAccountSalesTrackerExcel(file);
      setParsed(next);
      setFileName(file.name);
      setShopChoices({});
      toast({
        title: 'File loaded',
        description: `${next.tracker_rfpf_total} tracker RFPF(s), ${next.matched_rfpf} matched to brand sheets, ${next.tracker_only.length} tracker-only.`,
      });
    } catch (error) {
      setParsed(null);
      setFileName(null);
      toast({
        variant: 'destructive',
        title: 'Could not read Excel',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openSoftCheck = () => {
    setSoftChecked(true);
    window.setTimeout(() => {
      softCheckRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const runDryRun = async () => {
    if (!rows.length) return;
    setBusy('dry');
    setImportResults([]);
    setSoftChecked(false);
    try {
      const result = await kaPost<DryRunResult>('dry-run', rowsWithShopChoices(rows, shopChoices), createMissing);
      setDryRun(result);
      const ready = result.purchase_orders.filter((po) => po.would_insert).length;
      toast({
        title: result.blocking_pos ? 'Dry-run found issues' : 'Dry-run passed',
        description: `${ready} can import, ${result.blocking_pos} cannot. Nothing was inserted.`,
      });
      openSoftCheck();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Dry-run failed',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const exportMissingBrands = (format: 'csv' | 'xlsx' | 'json') => {
    if (!unmatchedProducts.length) return;
    const rows = unmatchedProducts.map((item) => ({
      brand: item.brand,
      variant: item.variant,
    }));
    const today = new Date().toISOString().slice(0, 10);
    const filename = `missing-brands_${today}.${format}`;
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } else {
      const sheetRows = rows.map((row) => ({
        Brand: row.brand,
        Variant: row.variant,
      }));
      const sheet = XLSX.utils.json_to_sheet(sheetRows);
      if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(sheet);
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } else {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Missing brands');
        XLSX.writeFile(workbook, filename);
      }
    }
    toast({
      title: 'Exported',
      description: `${unmatchedProducts.length} missing brand row(s) as ${format.toUpperCase()}.`,
    });
  };

  const applyProductMaps = () => {
    const products = { ...aliases.products };
    for (const [key, draft] of Object.entries(productDrafts)) {
      if (!draft.brand_name && !draft.variant_name && !draft.sku) continue;
      products[key] = {
        brand_name: draft.brand_name,
        variant_name: draft.variant_name,
        sku: draft.sku || undefined,
      };
    }
    persistAliases({ ...aliases, products });
    resetResults();
    toast({ title: 'Product maps saved', description: 'Run dry-run again to validate hub matches.' });
  };

  const runImport = async () => {
    if (!importPos.length) return;
    stopImportRef.current = false;
    setBusy('import');
    setImportResults([]);
    const grouped = groupRows(rowsWithShopChoices(rows, shopChoices));
    const refs = importPos.map((po) => po.external_po_ref);
    const chunks: string[][] = [];
    for (let i = 0; i < refs.length; i += SALES_RECORD_IMPORT_PO_CHUNK) {
      chunks.push(refs.slice(i, i + SALES_RECORD_IMPORT_PO_CHUNK));
    }
    const all: ImportPoResult[] = [];
    let stopped = false;
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (stopImportRef.current) {
          stopped = true;
          break;
        }
        setImportProgress(`Importing batch ${i + 1} of ${chunks.length}…`);
        const batchRows = chunks[i].flatMap((ref) => grouped.get(ref) || []);
        const result = await kaPost<{ results: ImportPoResult[] }>('import', batchRows, createMissing);
        all.push(...(result.results || []));
        setImportResults([...all]);
      }
      if (stopImportRef.current) stopped = true;
      const imported = all.filter((row) => row.ok).length;
      const already = alreadyImportedPos.length + all.filter((row) => !row.ok && isAlreadyImportedResult(row)).length;
      const failed = all.filter((row) => !row.ok && !isAlreadyImportedResult(row)).length;
      const savedRefs = new Set(all.map((row) => row.external_po_ref));
      const remaining = refs.filter((ref) => !savedRefs.has(ref)).length;
      toast({
        title: stopped ? 'Import stopped' : failed ? 'Import finished with errors' : 'Import complete',
        description: stopped
          ? `${imported} imported, ${failed} failed to save. ${remaining} ready PO${remaining === 1 ? '' : 's'} were not sent. Orders already saved stay saved.`
          : `${imported} imported, ${already} already in OMS, ${failed} failed to save. Delivered orders did not deduct stock.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      stopImportRef.current = false;
      setBusy(null);
      setImportProgress('');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sales tracker import</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Upload Key Account Sales 2026. Headers come from <span className="font-medium">B1G Sales Tracker</span>
          {' '}(RFPF, date, agent, client, trade name). Brand sheets supply the vape shop name and the flavor/device lines, joined by the same RFPF.
          Dry-run first, then Soft Check Can / Cannot import. Missing clients and shops can be created like Sales Record Import.
          Imported POs are delivered; stock is not deducted.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">1. Upload workbook</CardTitle>
            <CardDescription>Tracker + brand sheets (X-FORGE, AMZ, RELX GO, …). VIZMIN GRIND is skipped.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
            />
            <Button variant="outline" disabled={!!busy} onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {busy === 'parse' ? 'Reading…' : 'Choose Excel'}
            </Button>
            <p className="text-sm text-muted-foreground">
              {fileName
                ? `${fileName} · ${parsed?.tracker_rfpf_total || 0} RFPF(s) · ${parsed?.matched_rfpf || 0} matched`
                : 'No file selected'}
            </p>
            {parsed?.sheets.length ? (
              <p className="text-xs text-muted-foreground">
                {parsed.sheets.map((sheet) => `${sheet.name}: ${sheet.orders}`).join(' · ')}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">2. Dry-run</CardTitle>
            <CardDescription>Validates lookups only. Nothing is written.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="tracker-create-missing"
                checked={createMissing}
                onCheckedChange={(value) => {
                  setCreateMissing(value === true);
                  resetResults();
                }}
              />
              <Label htmlFor="tracker-create-missing" className="text-sm font-normal leading-snug">
                Create missing clients, shops, and delivery addresses from Excel. If the shop is not in OMS yet, choose the name on Import result → Choose shop.
              </Label>
            </div>
            <Button onClick={() => void runDryRun()} disabled={!rows.length || !!busy}>
              {busy === 'dry' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dry-run
            </Button>
            {dryRun ? (
              <p className="text-sm text-muted-foreground">
                {readyPos.length} can import · {alreadyImportedPos.length} already imported · {blockedPos.length} cannot
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">3. Soft Check</CardTitle>
            <CardDescription>Review Can import, Already imported, and Cannot import before writing anything.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {dryRun
                ? softChecked
                  ? `Reviewed · ${readyPos.length} ready · ${alreadyImportedPos.length} already imported · ${blockedPos.length} blocked`
                  : 'Dry-run complete. Open Soft Check to inspect.'
                : 'Run a dry-run first'}
            </p>
            <Button
              variant={softChecked ? 'secondary' : 'default'}
              onClick={openSoftCheck}
              disabled={!dryRun || !!busy}
            >
              <ClipboardCheck className="mr-2 h-4 w-4" />
              {softChecked ? 'View Soft Check' : 'Soft Check'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">4. Import ready POs</CardTitle>
            <CardDescription>Only Can import. Creates missing masters when enabled. No warehouse queue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {!dryRun
                ? 'Run a dry-run first'
                : !softChecked
                  ? 'Open Soft Check first'
                  : `${importPos.length} ready · ${alreadyImportedPos.length} already imported · ${blockedPos.length} skipped`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void runImport()} disabled={!softChecked || !importPos.length || !!busy}>
                {busy === 'import' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {importPos.length || ''} ready PO{importPos.length === 1 ? '' : 's'}
              </Button>
              {busy === 'import' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    stopImportRef.current = true;
                    setImportProgress('Stopping after this batch…');
                  }}
                >
                  Stop
                </Button>
              ) : null}
            </div>
            {importProgress ? <p className="text-sm text-muted-foreground">{importProgress}</p> : null}
          </CardContent>
        </Card>
      </div>

      {parsed?.tracker_only.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracker-only RFPFs</CardTitle>
            <CardDescription>
              On B1G Sales Tracker but no matching flavor/device lines on a brand sheet (or product has no sheet).
              These stay on Cannot import until a brand sheet matches the same RFPF.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {parsed.tracker_only
              .slice(0, 40)
              .map((item) => `${item.rfpf} (${item.product || item.client_name || item.shop_name || '—'})`)
              .join(' · ')}
            {parsed.tracker_only.length > 40 ? ` · +${parsed.tracker_only.length - 40} more` : ''}
          </CardContent>
        </Card>
      ) : null}

      {parsed?.brand_only_rfpf.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Brand-sheet RFPFs not on tracker</CardTitle>
            <CardDescription>Skipped because headers come from the tracker only.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {parsed.brand_only_rfpf.slice(0, 30).join(' · ')}
            {parsed.brand_only_rfpf.length > 30 ? ` · +${parsed.brand_only_rfpf.length - 30} more` : ''}
          </CardContent>
        </Card>
      ) : null}

      {parsed && namedAgents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Map agents to KAM emails</CardTitle>
            <CardDescription>Excel uses first names. Each agent must match a Key Account profile email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {namedAgents.map((agent) => {
              const key = agent.trim().toLowerCase();
              return (
                <div key={agent} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <Label className="w-40">{agent}</Label>
                  <Select
                    value={aliases.agents[key]}
                    onValueChange={(email) => {
                      persistAliases({ ...aliases, agents: { ...aliases.agents, [key]: email } });
                      resetResults();
                    }}
                  >
                    <SelectTrigger className="sm:w-[320px]"><SelectValue placeholder="Select KAM email" /></SelectTrigger>
                    <SelectContent>
                      {kams.map((kam) => (
                        <SelectItem key={kam.email} value={kam.email}>
                          {kam.full_name ? `${kam.full_name} (${kam.email})` : kam.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {softChecked && dryRun ? (
        <Card ref={softCheckRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Soft Check
            </CardTitle>
            <CardDescription>
              Nothing has been written. Import only uses the Can import tab.
              Has RFPF / No RFPF split orders by whether an RFPF number is present.
              Paid / Unpaid (with variant) are ready-line reviews. Needs brand sheet groups RFPFs with no flavor breakdown and lists the missing variants for that brand so you can request the sheet from sales.
              Missing brands must be mapped to hub products before those RFPFs can import.
              {createMissing
                ? ' Missing clients/shops/addresses will be created for ready POs.'
                : ' Missing clients/shops stay on Cannot import.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {pendingMaster.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium">Will create on import</h3>
                <p className="text-sm text-muted-foreground">
                  A saved shop is used when trade name and vape shop are the same, or when one of them already matches. Warehouse brands and variants are never created here.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Create</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingMaster.map((row) => (
                      <TableRow key={`${row.client_name}|${row.shop_name}|${row.address_label}|${row.full_address}`}>
                        <TableCell>{row.client_name}</TableCell>
                        <TableCell>{row.shop_name}</TableCell>
                        <TableCell className="text-sm">{row.address_label}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell className="space-x-1">
                          {row.create_client ? <Badge variant="outline">client</Badge> : null}
                          {row.create_shop ? <Badge variant="outline">shop</Badge> : null}
                          {row.create_address ? <Badge variant="outline">address</Badge> : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            <Tabs defaultValue={blockedPos.length ? 'blocked' : alreadyImportedPos.length && !readyPos.length ? 'already' : 'ready'}>
              <TabsList className="flex h-auto flex-wrap gap-1">
                <TabsTrigger value="ready">Can import ({readyPos.length})</TabsTrigger>
                <TabsTrigger value="blocked">Cannot import ({blockedPos.length})</TabsTrigger>
                <TabsTrigger value="already">Already imported ({alreadyImportedPos.length})</TabsTrigger>
                <TabsTrigger value="missing">Missing brands ({unmatchedProducts.length})</TabsTrigger>
                <TabsTrigger value="has-rfpf">Has RFPF ({withRfpfPos.length})</TabsTrigger>
                <TabsTrigger value="no-rfpf">No RFPF ({withoutRfpfPos.length})</TabsTrigger>
                <TabsTrigger value="paid-variant">Paid w/ variant ({paidWithVariantPos.length})</TabsTrigger>
                <TabsTrigger value="unpaid-variant">Unpaid w/ variant ({unpaidWithVariantPos.length})</TabsTrigger>
                <TabsTrigger value="paid-no-variant">Paid no variant ({paidWithoutVariantPos.length})</TabsTrigger>
                <TabsTrigger value="unpaid-no-variant">Unpaid no variant ({unpaidWithoutVariantPos.length})</TabsTrigger>
                <TabsTrigger value="needs-sheet">Needs brand sheet ({noVariantPos.length})</TabsTrigger>
                <TabsTrigger value="consigned">Consigned ({consignedPos.length})</TabsTrigger>
                <TabsTrigger value="same-rfpf">Same RFPF ({sameRfpfPos.length})</TabsTrigger>
                <TabsTrigger value="same-rfpf-ready">Same RFPF · Can import ({sameRfpfReadyPos.length})</TabsTrigger>
                <TabsTrigger value="shop-name">Shop name ({shopNamePos.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="ready" className="space-y-2">
                <SoftCheckOrderList orders={readyPos} emptyLabel="No orders can be imported yet." />
              </TabsContent>
              <TabsContent value="blocked" className="space-y-2">
                <SoftCheckOrderList orders={blockedPos} emptyLabel="Every other order can be imported or is already in OMS." showIssues />
              </TabsContent>
              <TabsContent value="already" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  These RFPFs are already in OMS from an earlier import. Import skips them.
                </p>
                <SoftCheckOrderList
                  orders={alreadyImportedPos}
                  emptyLabel="No RFPFs in this file are already in OMS."
                  showIssues
                  statusLabel="Already imported"
                />
              </TabsContent>
              <TabsContent value="missing" className="space-y-4">
                {unmatchedProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    Every brand/variant on dry-run lines matched the hub warehouse catalog.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        These Excel flavors were not found in the linked warehouse hub. Map them to an existing OMS brand + variant (or SKU), save, then dry-run again.
                        Warehouse products are never auto-created here.
                      </p>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => exportMissingBrands('csv')}>
                          <Download className="mr-2 h-4 w-4" />
                          CSV
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => exportMissingBrands('xlsx')}>
                          <Download className="mr-2 h-4 w-4" />
                          XLSX
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => exportMissingBrands('json')}>
                          <Download className="mr-2 h-4 w-4" />
                          JSON
                        </Button>
                      </div>
                    </div>
                    {unmatchedProducts.map((item) => (
                      <div key={item.key} className="grid gap-2 rounded-md border p-3 md:grid-cols-4">
                        <p className="text-sm md:col-span-4 font-medium">
                          {item.brand} · {item.variant}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {item.rfpfCount} RFPF(s)
                            {item.sheets.length ? ` · ${item.sheets.join(', ')}` : ''}
                          </span>
                        </p>
                        <Input
                          placeholder="OMS brand"
                          value={productDrafts[item.key]?.brand_name ?? ''}
                          onChange={(e) => setProductDrafts((prev) => ({
                            ...prev,
                            [item.key]: { brand_name: e.target.value, variant_name: prev[item.key]?.variant_name || '', sku: prev[item.key]?.sku || '' },
                          }))}
                        />
                        <Input
                          placeholder="OMS variant"
                          value={productDrafts[item.key]?.variant_name ?? ''}
                          onChange={(e) => setProductDrafts((prev) => ({
                            ...prev,
                            [item.key]: { brand_name: prev[item.key]?.brand_name || '', variant_name: e.target.value, sku: prev[item.key]?.sku || '' },
                          }))}
                        />
                        <Input
                          placeholder="SKU (optional)"
                          value={productDrafts[item.key]?.sku ?? ''}
                          onChange={(e) => setProductDrafts((prev) => ({
                            ...prev,
                            [item.key]: { brand_name: prev[item.key]?.brand_name || '', variant_name: prev[item.key]?.variant_name || '', sku: e.target.value },
                          }))}
                        />
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={applyProductMaps}>Save product maps</Button>
                  </>
                )}
              </TabsContent>
              <TabsContent value="has-rfpf" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Orders that have an RFPF number from the tracker / brand sheets.
                </p>
                <SoftCheckOrderList orders={withRfpfPos} emptyLabel="No orders with an RFPF number." showIssues />
              </TabsContent>
              <TabsContent value="no-rfpf" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Orders with no RFPF number (blank, SI-only, or unreadable). Ask sales to fill RFPF on the tracker/brand sheet.
                </p>
                <SoftCheckOrderList orders={withoutRfpfPos} emptyLabel="Every order has an RFPF number." showIssues />
              </TabsContent>
              <TabsContent value="paid-variant" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Paid RFPFs that already have flavor/device variant lines from brand sheets.
                </p>
                <SoftCheckOrderList orders={paidWithVariantPos} emptyLabel="No paid RFPFs with variants in this dry-run." showIssues />
              </TabsContent>
              <TabsContent value="unpaid-variant" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Unpaid / partial RFPFs that already have flavor/device variant lines from brand sheets.
                </p>
                <SoftCheckOrderList orders={unpaidWithVariantPos} emptyLabel="No unpaid RFPFs with variants in this dry-run." showIssues />
              </TabsContent>
              <TabsContent value="paid-no-variant" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Paid RFPFs with no flavor/device variant lines. Ask sales for the brand sheet for these.
                </p>
                <SoftCheckOrderList orders={paidWithoutVariantPos} emptyLabel="No paid RFPFs without variants." showIssues />
              </TabsContent>
              <TabsContent value="unpaid-no-variant" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Unpaid / partial RFPFs with no flavor/device variant lines. Ask sales for the brand sheet for these.
                </p>
                <SoftCheckOrderList orders={unpaidWithoutVariantPos} emptyLabel="No unpaid RFPFs without variants." showIssues />
              </TabsContent>
              <TabsContent value="needs-sheet" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  RFPFs with no variant breakdown, grouped by brand (tracker PRODUCT). Missing variants are flavors for that brand that have an order and a quantity, and are not in the warehouse hub. Flavors with no order or no quantity are left off this tab.
                </p>
                {noVariantByBrand.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Every RFPF has at least one variant line.</p>
                ) : (
                  <>
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <p className="font-medium mb-2">Brands to request from sales</p>
                      <ul className="list-disc space-y-1 pl-5">
                        {noVariantByBrand.map((group) => {
                          const missingVariants = missingVariantsByBrand.get(brandMatchKey(group.brand)) || [];
                          return (
                            <li key={group.brand}>
                              <span className="font-medium">{group.brand}</span>
                              <span className="text-muted-foreground"> — {group.rfpfCount} RFPF(s)</span>
                              {missingVariants.length ? (
                                <span className="text-muted-foreground">
                                  {' '}· missing variants: {missingVariants.map((item) => item.variant).join(', ')}
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <Accordion type="multiple" className="w-full">
                      {noVariantByBrand.map((group) => {
                        const missingVariants = missingVariantsByBrand.get(brandMatchKey(group.brand)) || [];
                        return (
                          <AccordionItem key={group.brand} value={group.brand}>
                            <AccordionTrigger className="hover:no-underline text-left">
                              <div className="flex flex-1 items-center justify-between gap-3 pr-3">
                                <span className="font-semibold tracking-wide">{group.brand}</span>
                                <span className="flex flex-wrap items-center justify-end gap-2">
                                  {missingVariants.length ? (
                                    <Badge variant="outline">{missingVariants.length} missing variant{missingVariants.length === 1 ? '' : 's'}</Badge>
                                  ) : null}
                                  <Badge variant="secondary">{group.rfpfCount} RFPF(s)</Badge>
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-4">
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Missing variants</p>
                                {missingVariants.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No flavor name on file for this brand. These RFPFs only have the tracker product until a brand sheet line exists.
                                  </p>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Variant</TableHead>
                                        <TableHead>Sheet</TableHead>
                                        <TableHead>RFPFs</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {missingVariants.map((item) => (
                                        <TableRow key={item.key}>
                                          <TableCell className="text-sm font-medium">{item.variant}</TableCell>
                                          <TableCell className="text-sm text-muted-foreground">
                                            {item.sheets.length ? item.sheets.join(', ') : '—'}
                                          </TableCell>
                                          <TableCell className="text-sm tabular-nums">{item.orderedRfpfCount}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>RFPF</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Shop</TableHead>
                                    <TableHead>Variant</TableHead>
                                    <TableHead>Payment</TableHead>
                                    <TableHead>Issues</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.orders.map((po) => (
                                    <TableRow key={po.external_po_ref}>
                                      <TableCell className="font-mono text-sm">{orderRfpfLabel(po)}</TableCell>
                                      <TableCell className="text-sm">{formatDateDmy(po.order_date)}</TableCell>
                                      <TableCell className="text-sm">{po.client}</TableCell>
                                      <TableCell className="text-sm">{po.shop || '—'}</TableCell>
                                      <TableCell className="text-sm">{poVariantLabel(po)}</TableCell>
                                      <TableCell><Badge variant="secondary">{po.payment_status}</Badge></TableCell>
                                      <TableCell className="text-sm text-destructive max-w-xs">
                                        {po.issues.length ? po.issues.slice(0, 2).join(' · ') : '—'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </>
                )}
              </TabsContent>
              <TabsContent value="consigned" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  RFPFs marked Consignment on B1G Sales Tracker (INVENTORY / CONSIGNMENT column).
                </p>
                <SoftCheckOrderList orders={consignedPos} emptyLabel="No consigned RFPFs in this dry-run." showIssues />
              </TabsContent>
              <TabsContent value="same-rfpf" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Each product that shares a written RFPF is listed on its own row, with that same RFPF repeated.
                  The shaded row is the one purchase order those rows become.
                  A hyphen is part of the code, so RFPF-1200 and RFPF1200 stay two orders.
                </p>
                <SameRfpfTable rows={sameRfpfPos} emptyLabel="No RFPF is shared by more than one product." />
                <SoftCheckOrderList
                  orders={sameRfpfPos.map((row) => row.po)}
                  emptyLabel="No shared RFPFs in this dry-run."
                  showIssues
                />
              </TabsContent>
              <TabsContent value="same-rfpf-ready" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Same written RFPF, more than one product, and ready to import.
                  Each product is listed with that RFPF so you can see the basis. The shaded row is the one purchase order they become.
                  A hyphen is part of the code, so RFPF-1200 and RFPF1200 stay two orders.
                </p>
                <SameRfpfTable rows={sameRfpfReadyPos} emptyLabel="No shared RFPF is ready to import." />
              </TabsContent>
              <TabsContent value="shop-name" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Tracker TRADE NAME and the brand-sheet Vape Shop / SHOP column. When they are the same shop, or one of them
                  already exists under the client, that shop is used. When they differ and neither is a saved shop, choose which
                  name to save. Chosen rows are included in Import. Run Dry-run again to move them onto Can import.
                </p>
                {shopNamePos.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>RFPF</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Trade name</TableHead>
                        <TableHead>Vape shop</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Use as shop</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shopNamePos.map((po) => {
                        const chosen = shopChoices[po.external_po_ref] || '';
                        const options = shopOptions(po);
                        return (
                          <TableRow key={po.external_po_ref}>
                            <TableCell className="font-mono text-sm">{orderRfpfLabel(po)}</TableCell>
                            <TableCell className="text-sm">{po.client || '—'}</TableCell>
                            <TableCell className="text-sm">{po.trade_name || '—'}</TableCell>
                            <TableCell className="text-sm">{(po.vape_shops || []).join(' · ') || '—'}</TableCell>
                            <TableCell className="text-sm">
                              {po.shop_choice_required
                                ? (chosen ? `Will save as ${chosen}` : 'Choose which name to save')
                                : po.will_create_shop
                                  ? `Will create ${po.shop}`
                                  : `Matched ${po.shop}`}
                            </TableCell>
                            <TableCell className="min-w-52">
                              {po.shop_choice_required ? (
                                <Select
                                  value={chosen || undefined}
                                  onValueChange={(value) => setShopChoices((prev) => ({ ...prev, [po.external_po_ref]: value }))}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose shop" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {options.map((name) => (
                                      <SelectItem key={name} value={name}>{name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Trade name and vape shop agree on every order.</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}

      {importResults.length > 0 || missingShopPos.length > 0 ? (
        <ImportResultCard
          imported={importResults.filter((row) => row.ok)}
          failed={importResults.filter((row) => !row.ok && !isAlreadyImportedResult(row))}
          failedOrders={failedImportOrders(
            importResults.filter((row) => !row.ok && !isAlreadyImportedResult(row)),
            dryRun?.purchase_orders || []
          )}
          already={[
            ...alreadyImportedPos.map((po) => ({
              external_po_ref: po.external_po_ref,
              ok: false,
              po_number: existingPoLabel(po) || undefined,
              issues: po.issues,
              already_imported: true,
            })),
            ...importResults.filter((row) => !row.ok && isAlreadyImportedResult(row)),
          ].filter((row, index, list) => list.findIndex((item) => item.external_po_ref === row.external_po_ref) === index)}
          missingShops={missingShopPos}
          shopChoices={shopChoices}
          onChooseShop={(ref, shopName) => setShopChoices((prev) => ({ ...prev, [ref]: shopName }))}
        />
      ) : null}
    </div>
  );
}
