import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Loader2, Upload } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { parseKeyAccountSalesOrderExcel, displayRfpfCode, type SalesOrderParseResult } from '@/features/key-accounts/utils/parseKeyAccountSalesOrderExcel';
import { applySalesRecordAliases, productAliasKey } from '@/features/key-accounts/utils/unpivotClientSalesRecord';
import {
  SALES_RECORD_IMPORT_PO_CHUNK,
  type KASalesRecordExcelRow,
  type SalesRecordAliases,
} from '@/features/key-accounts/utils/clientSalesRecordTypes';

const ALIAS_KEY = 'ka-sales-order-import-aliases-v1';

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
  items?: PreviewItem[];
  issues: string[];
};

type DryRunResult = {
  dry_run: true;
  po_count: number;
  blocking_pos: number;
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

/** Display as DATE-MONTH-YEAR, e.g. 07-April-2026 */
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
  const raw = String(po.rfpf_number || '').trim();
  const code = raw && !raw.includes('|') ? displayRfpfCode(raw) : '';
  return `RFPF (${code || 'NO RFPF'})`;
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
        return (
          <AccordionItem key={po.external_po_ref} value={po.external_po_ref}>
            <AccordionTrigger className="hover:no-underline text-left">
              <div className="flex flex-1 flex-col gap-1 pr-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{orderRfpfLabel(po)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatDateDmy(po.order_date)} · {po.client}
                    {po.shop ? ` · ${po.shop}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <Badge variant="secondary">{po.payment_status}</Badge>
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
                            <TableHead className="text-right">Amount paid</TableHead>
                            <TableHead>Match</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item, index) => (
                            <TableRow key={`${item.excel_row || index}-${item.excel_variant || item.variant}`}>
                              <TableCell>{item.excel_variant || item.variant || '—'}</TableCell>
                              <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums">{peso(itemAmount(item))}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {index === 0 ? peso(po.payment_amount) : '—'}
                              </TableCell>
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
                            <TableCell className="text-right font-medium tabular-nums">{peso(po.payment_amount)}</TableCell>
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

async function kaPost<T>(action: 'dry-run' | 'import', rows: KASalesRecordExcelRow[]): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const res = await fetch('/api/key-account/sales-record-import', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, rows, create_missing: false }),
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

export function KeyAccountSalesOrderImportPage() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<SalesOrderParseResult | null>(null);
  const [aliases, setAliases] = useState<SalesRecordAliases>(() => loadAliases());
  const [kams, setKams] = useState<{ email: string; full_name: string | null }[]>([]);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [importResults, setImportResults] = useState<ImportPoResult[]>([]);
  const [busy, setBusy] = useState<'parse' | 'dry' | 'import' | null>(null);
  const [importProgress, setImportProgress] = useState('');
  const [productDrafts, setProductDrafts] = useState<Record<string, { brand_name: string; variant_name: string; sku: string }>>({});
  const [softChecked, setSoftChecked] = useState(false);
  const softCheckRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => (parsed ? applySalesRecordAliases(parsed.rows, aliases) : []),
    [parsed, aliases]
  );

  const rfpfByRef = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const ref = String(row.external_po_ref || '').trim();
      const rfpf = displayRfpfCode(String(row.rfpf_number || ''));
      if (!ref || !rfpf || map.has(ref)) continue;
      map.set(ref, rfpf);
    }
    return map;
  }, [rows]);

  const readyPos = useMemo(
    () => dryRun?.purchase_orders.filter((po) => po.would_insert) || [],
    [dryRun]
  );
  const blockedPos = useMemo(
    () => dryRun?.purchase_orders.filter((po) => !po.would_insert) || [],
    [dryRun]
  );

  const namedAgents = useMemo(
    () => (parsed?.agents || []).filter((agent) => !isEmail(agent)),
    [parsed]
  );

  const unmatchedProducts = useMemo(() => {
    const map = new Map<string, { brand: string; variant: string }>();
    for (const po of blockedPos) {
      for (const item of po.items || []) {
        if (item.lookup_ok) continue;
        const brand = item.excel_brand || item.brand;
        const variant = item.excel_variant || item.variant;
        const key = productAliasKey(brand, variant);
        if (key !== '||' && !aliases.products[key]) map.set(key, { brand, variant });
      }
    }
    return [...map.entries()];
  }, [blockedPos, aliases]);

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
      const next = await parseKeyAccountSalesOrderExcel(file);
      setParsed(next);
      setFileName(file.name);
      const orders = new Set(next.rows.map((row) => row.external_po_ref)).size;
      const withRfpf = new Set(
        next.rows
          .filter((row) => displayRfpfCode(String(row.rfpf_number || '')))
          .map((row) => row.external_po_ref)
      ).size;
      toast({
        title: 'File loaded',
        description: `${next.rows.length} line(s), ${orders} order(s), ${withRfpf} with RFPF. Tracker used for RFPF match only.`,
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

  const runDryRun = async () => {
    if (!rows.length) return;
    setBusy('dry');
    setImportResults([]);
    setSoftChecked(false);
    try {
      const result = await kaPost<DryRunResult>('dry-run', rows);
      const purchaseOrders = result.purchase_orders.map((po) => {
        const fromParse = rfpfByRef.get(po.external_po_ref) || '';
        const fromApi = displayRfpfCode(String(po.rfpf_number || ''));
        const rfpf = fromParse || (fromApi && !fromApi.includes('|') ? fromApi : '');
        return { ...po, rfpf_number: rfpf || null };
      });
      setDryRun({ ...result, purchase_orders: purchaseOrders });
      const ready = purchaseOrders.filter((po) => po.would_insert).length;
      toast({
        title: result.blocking_pos ? 'Dry-run found issues' : 'Dry-run passed',
        description: `${ready} can push, ${result.blocking_pos} cannot. Nothing was inserted.`,
      });
      setSoftChecked(true);
      window.setTimeout(() => {
        softCheckRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
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
        const result = await kaPost<{ results: ImportPoResult[] }>('import', batchRows);
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
        <h1 className="text-2xl font-semibold">Sales order import</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Upload the Key Account Sales Order workbook. Each product-sheet row becomes one purchase order.
          Flavor and device columns become lines. The sales tracker is skipped.
          Clients, shops, and hub products that are not already in OMS stay on Cannot push. Nothing is created for them.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">1. Upload workbook</CardTitle>
            <CardDescription>AMZ, Xslimbar, and Ultralite sheets. Identity is date, agent, shop owner, and vape shop.</CardDescription>
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
                ? `${fileName} · ${rows.length} line(s) · ${new Set(rows.map((row) => row.external_po_ref)).size} order(s)`
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
            <CardDescription>Checks existing clients, shops, addresses, KAMs, and hub variants. Nothing is written.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => void runDryRun()} disabled={!rows.length || !!busy}>
              {busy === 'dry' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dry-run
            </Button>
            {dryRun ? (
              <p className="text-sm text-muted-foreground">
                {readyPos.length} can push · {blockedPos.length} cannot
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">3. Import ready POs</CardTitle>
            <CardDescription>Only the Can push tab is imported, as delivered. Stock is not deducted.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => void runImport()} disabled={!softChecked || !readyPos.length || !!busy}>
              {busy === 'import' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {readyPos.length || ''} ready PO{readyPos.length === 1 ? '' : 's'}
            </Button>
            {importProgress ? <p className="text-sm text-muted-foreground">{importProgress}</p> : null}
          </CardContent>
        </Card>
      </div>

      {parsed && namedAgents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Map agents to KAM emails</CardTitle>
            <CardDescription>Excel uses first names. Each agent must match a Key Account profile email before a row can push.</CardDescription>
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

      {unmatchedProducts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Map missing brands / variants</CardTitle>
            <CardDescription>These flavors were not found in the linked warehouse hub. Map them to an existing OMS brand and variant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unmatchedProducts.map(([key, item]) => (
              <div key={key} className="grid gap-2 md:grid-cols-4">
                <p className="text-sm md:col-span-4 font-medium">{item.brand} · {item.variant}</p>
                <Input
                  placeholder="OMS brand"
                  value={productDrafts[key]?.brand_name ?? ''}
                  onChange={(e) => setProductDrafts((prev) => ({
                    ...prev,
                    [key]: { brand_name: e.target.value, variant_name: prev[key]?.variant_name || '', sku: prev[key]?.sku || '' },
                  }))}
                />
                <Input
                  placeholder="OMS variant"
                  value={productDrafts[key]?.variant_name ?? ''}
                  onChange={(e) => setProductDrafts((prev) => ({
                    ...prev,
                    [key]: { brand_name: prev[key]?.brand_name || '', variant_name: e.target.value, sku: prev[key]?.sku || '' },
                  }))}
                />
                <Input
                  placeholder="SKU (optional)"
                  value={productDrafts[key]?.sku ?? ''}
                  onChange={(e) => setProductDrafts((prev) => ({
                    ...prev,
                    [key]: { brand_name: prev[key]?.brand_name || '', variant_name: prev[key]?.variant_name || '', sku: e.target.value },
                  }))}
                />
              </div>
            ))}
            <Button type="button" variant="outline" onClick={applyProductMaps}>Save product maps</Button>
          </CardContent>
        </Card>
      ) : null}

      {softChecked && dryRun ? (
        <Card ref={softCheckRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Soft check
            </CardTitle>
            <CardDescription>
              Can push only when the client, shop, address, KAM, and every line already exist. Cannot push is left out of the import.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={blockedPos.length ? 'blocked' : 'ready'}>
              <TabsList>
                <TabsTrigger value="ready">Can push ({readyPos.length})</TabsTrigger>
                <TabsTrigger value="blocked">Cannot push ({blockedPos.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="ready" className="space-y-2">
                <SoftCheckOrderList
                  orders={readyPos}
                  emptyLabel="No orders can be pushed yet."
                />
              </TabsContent>
              <TabsContent value="blocked" className="space-y-2">
                <SoftCheckOrderList
                  orders={blockedPos}
                  emptyLabel="Every order can be pushed."
                  showIssues
                />
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
                    <TableCell className="text-sm">
                      {`RFPF (${rfpfByRef.get(row.external_po_ref) || 'NO RFPF'})`}
                    </TableCell>
                    <TableCell className="font-mono">{row.po_number || '—'}</TableCell>
                    <TableCell>
                      {row.ok ? <Badge>Imported</Badge> : <span className="text-sm text-destructive">{row.issues?.join(' · ') || 'Failed'}</span>}
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
