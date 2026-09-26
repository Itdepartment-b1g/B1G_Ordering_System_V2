import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Loader2, Upload } from 'lucide-react';

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
import { displayRfpfCode } from '@/features/key-accounts/utils/parseKeyAccountSalesOrderExcel';
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
};

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
  const raw = String(po.rfpf_number || po.external_po_ref || '').trim();
  const code = raw && !raw.includes('|') ? displayRfpfCode(raw) : '';
  return code || raw || 'NO RFPF';
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

function paymentIsPaid(po: PreviewPo) {
  return String(po.payment_status || '').toLowerCase() === 'paid';
}

function paymentIsUnpaid(po: PreviewPo) {
  const status = String(po.payment_status || '').toLowerCase().replace(/\s+/g, '');
  return status === 'unpaid' || status === 'partial' || status.includes('balance');
}

function poHasRfpf(po: PreviewPo) {
  const raw = String(po.rfpf_number || po.external_po_ref || '').trim();
  if (!raw || raw.includes('|')) return false;
  const display = displayRfpfCode(raw);
  return /RFPF\s*[-–—]?\s*\d+/i.test(raw) || /RFPF\s*[-–—]?\s*\d+/i.test(display);
}

function SoftCheckOrderList({
  orders,
  emptyLabel,
  showIssues,
}: {
  orders: PreviewPo[];
  emptyLabel: string;
  showIssues?: boolean;
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
                  {!po.would_insert ? <Badge variant="destructive">Blocked</Badge> : null}
                  <span className="tabular-nums text-muted-foreground">{po.line_count} line(s)</span>
                  <span className="tabular-nums font-medium">{peso(po.total_amount)}</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pl-1">
                {showIssues && po.issues.length ? (
                  <ul className="list-disc space-y-1 pl-4 text-sm text-destructive">
                    {po.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
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

function groupRows(rows: KASalesRecordExcelRow[]) {
  const map = new Map<string, KASalesRecordExcelRow[]>();
  for (const row of rows) {
    const ref = String(row.external_po_ref || '').trim();
    if (!map.has(ref)) map.set(ref, []);
    map.get(ref)!.push(row);
  }
  return map;
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
  const [productDrafts, setProductDrafts] = useState<Record<string, { brand_name: string; variant_name: string; sku: string }>>({});
  const [createMissing, setCreateMissing] = useState(true);
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
  const blockedPos = useMemo(
    () => dryRun?.purchase_orders.filter((po) => !po.would_insert) || [],
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

  const namedAgents = useMemo(
    () => (parsed?.agents || []).filter((agent) => !isEmail(agent)),
    [parsed]
  );

  const unmatchedProducts = useMemo(() => {
    const map = new Map<string, { brand: string; variant: string; sheets: Set<string>; rfpf: Set<string> }>();
    for (const po of dryRun?.purchase_orders || []) {
      for (const item of po.items || []) {
        if (item.lookup_ok) continue;
        const brand = item.excel_brand || item.brand;
        const variant = item.excel_variant || item.variant;
        const key = productAliasKey(brand, variant);
        if (key === '||') continue;
        if (aliases.products[key]) continue;
        const existing = map.get(key) || { brand, variant, sheets: new Set<string>(), rfpf: new Set<string>() };
        if (item.sheet_name) existing.sheets.add(item.sheet_name);
        existing.rfpf.add(orderRfpfLabel(po));
        map.set(key, existing);
      }
    }
    return [...map.entries()].map(([key, value]) => ({
      key,
      brand: value.brand,
      variant: value.variant,
      sheets: [...value.sheets],
      rfpfCount: value.rfpf.size,
    }));
  }, [dryRun, aliases]);

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
      const result = await kaPost<DryRunResult>('dry-run', rows, createMissing);
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
    if (!readyPos.length) return;
    setBusy('import');
    setImportResults([]);
    const grouped = groupRows(rows);
    const refs = readyPos.map((po) => po.external_po_ref);
    const chunks: string[][] = [];
    for (let i = 0; i < refs.length; i += SALES_RECORD_IMPORT_PO_CHUNK) {
      chunks.push(refs.slice(i, i + SALES_RECORD_IMPORT_PO_CHUNK));
    }
    const all: ImportPoResult[] = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        setImportProgress(`Importing batch ${i + 1} of ${chunks.length}…`);
        const batchRows = chunks[i].flatMap((ref) => grouped.get(ref) || []);
        const result = await kaPost<{ results: ImportPoResult[] }>('import', batchRows, createMissing);
        all.push(...(result.results || []));
        setImportResults([...all]);
      }
      const imported = all.filter((row) => row.ok).length;
      const failed = all.filter((row) => row.ok === false).length;
      toast({
        title: failed ? 'Import finished with errors' : 'Import complete',
        description: `${imported} PO(s) imported, ${failed} failed. Delivered. Stock was not deducted.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
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
          {' '}(RFPF, date, agent, client, trade name as shop). Flavor/device lines come from brand sheets joined by the same RFPF.
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
                Create missing clients, shops (trade name), and delivery addresses from Excel
              </Label>
            </div>
            <Button onClick={() => void runDryRun()} disabled={!rows.length || !!busy}>
              {busy === 'dry' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dry-run
            </Button>
            {dryRun ? (
              <p className="text-sm text-muted-foreground">
                {readyPos.length} can import · {blockedPos.length} cannot
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">3. Soft Check</CardTitle>
            <CardDescription>Review Can import vs Cannot import before writing anything.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {dryRun
                ? softChecked
                  ? `Reviewed · ${readyPos.length} ready · ${blockedPos.length} blocked`
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
                  : `${readyPos.length} ready · ${blockedPos.length} skipped`}
            </p>
            <Button onClick={() => void runImport()} disabled={!softChecked || !readyPos.length || !!busy}>
              {busy === 'import' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {readyPos.length || ''} ready PO{readyPos.length === 1 ? '' : 's'}
            </Button>
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
              Paid / Unpaid (with variant) are ready-line reviews. Needs brand sheet groups RFPFs with no flavor breakdown so you can request that brand sheet from sales.
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
                  Trade name is used as the shop name. Warehouse brands and variants are never created here.
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

            <Tabs defaultValue={blockedPos.length ? 'blocked' : 'ready'}>
              <TabsList className="flex h-auto flex-wrap gap-1">
                <TabsTrigger value="ready">Can import ({readyPos.length})</TabsTrigger>
                <TabsTrigger value="blocked">Cannot import ({blockedPos.length})</TabsTrigger>
                <TabsTrigger value="missing">Missing brands ({unmatchedProducts.length})</TabsTrigger>
                <TabsTrigger value="has-rfpf">Has RFPF ({withRfpfPos.length})</TabsTrigger>
                <TabsTrigger value="no-rfpf">No RFPF ({withoutRfpfPos.length})</TabsTrigger>
                <TabsTrigger value="paid-variant">Paid w/ variant ({paidWithVariantPos.length})</TabsTrigger>
                <TabsTrigger value="unpaid-variant">Unpaid w/ variant ({unpaidWithVariantPos.length})</TabsTrigger>
                <TabsTrigger value="paid-no-variant">Paid no variant ({paidWithoutVariantPos.length})</TabsTrigger>
                <TabsTrigger value="unpaid-no-variant">Unpaid no variant ({unpaidWithoutVariantPos.length})</TabsTrigger>
                <TabsTrigger value="needs-sheet">Needs brand sheet ({noVariantPos.length})</TabsTrigger>
                <TabsTrigger value="consigned">Consigned ({consignedPos.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="ready" className="space-y-2">
                <SoftCheckOrderList orders={readyPos} emptyLabel="No orders can be imported yet." />
              </TabsContent>
              <TabsContent value="blocked" className="space-y-2">
                <SoftCheckOrderList orders={blockedPos} emptyLabel="Every order can be imported." showIssues />
              </TabsContent>
              <TabsContent value="missing" className="space-y-4">
                {unmatchedProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    Every brand/variant on dry-run lines matched the hub warehouse catalog.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      These Excel flavors were not found in the linked warehouse hub. Map them to an existing OMS brand + variant (or SKU), save, then dry-run again.
                      Warehouse products are never auto-created here.
                    </p>
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
                  RFPFs with no variant breakdown, grouped by brand (tracker PRODUCT). Ask sales for the flavor sheet for each brand below.
                </p>
                {noVariantByBrand.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Every RFPF has at least one variant line.</p>
                ) : (
                  <>
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <p className="font-medium mb-2">Brands to request from sales</p>
                      <ul className="list-disc space-y-1 pl-5">
                        {noVariantByBrand.map((group) => (
                          <li key={group.brand}>
                            <span className="font-medium">{group.brand}</span>
                            <span className="text-muted-foreground"> — {group.rfpfCount} RFPF(s)</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Accordion type="multiple" className="w-full">
                      {noVariantByBrand.map((group) => (
                        <AccordionItem key={group.brand} value={group.brand}>
                          <AccordionTrigger className="hover:no-underline text-left">
                            <div className="flex flex-1 items-center justify-between gap-3 pr-3">
                              <span className="font-semibold tracking-wide">{group.brand}</span>
                              <Badge variant="secondary">{group.rfpfCount} RFPF(s)</Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>RFPF</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Client</TableHead>
                                  <TableHead>Shop</TableHead>
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
                      ))}
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
            </Tabs>
          </CardContent>
        </Card>
      ) : null}

      {importResults.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Import result</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RFPF</TableHead>
                  <TableHead>System PO</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importResults.map((row) => (
                  <TableRow key={row.external_po_ref}>
                    <TableCell className="font-mono text-sm">
                      {displayRfpfCode(row.external_po_ref) || row.external_po_ref}
                    </TableCell>
                    <TableCell className="font-mono">{row.po_number || '—'}</TableCell>
                    <TableCell>
                      {row.ok
                        ? <Badge>Imported</Badge>
                        : <span className="text-sm text-destructive">{row.issues?.join(' · ') || 'Failed'}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
