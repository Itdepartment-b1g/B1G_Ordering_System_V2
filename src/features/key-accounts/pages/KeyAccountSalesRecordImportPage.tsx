import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  applySalesRecordAliases,
  parseClientSalesRecordExcel,
  remapSalesRecordParse,
} from '@/features/key-accounts/utils/parseClientSalesRecordExcel';
import { productAliasKey } from '@/features/key-accounts/utils/unpivotClientSalesRecord';
import {
  SALES_RECORD_ALIAS_STORAGE_KEY,
  SALES_RECORD_IMPORT_PO_CHUNK,
  type KASalesRecordExcelRow,
  type SalesRecordAliases,
  type SalesRecordColumnOverride,
  type SalesRecordIdentityField,
  type SalesRecordParseResult,
} from '@/features/key-accounts/utils/clientSalesRecordTypes';

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
  line_total: number;
  lookup_ok: boolean;
};

type PreviewPo = {
  external_po_ref: string;
  would_insert: boolean;
  order_date: string;
  client: string;
  shop: string;
  kam: string;
  rfpf_number: string | null;
  line_count: number;
  total_amount: number;
  payment_amount: number;
  payment_status: string;
  po_order_kind: string;
  commissioned: boolean;
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
  line_count: number;
  ready_to_import: boolean;
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

const IDENTITY_FIELDS: { id: SalesRecordIdentityField; label: string }[] = [
  { id: 'rfpf', label: 'RFPF' },
  { id: 'order_date', label: 'Order date' },
  { id: 'delivery_date', label: 'Delivery date' },
  { id: 'agent', label: 'Agent' },
  { id: 'client_name', label: 'Client' },
  { id: 'shop_name', label: 'Shop / trade name' },
  { id: 'address_label', label: 'Address' },
  { id: 'client_category', label: 'Category' },
  { id: 'contact_phone', label: 'Contact' },
  { id: 'province', label: 'Province' },
  { id: 'city', label: 'City' },
  { id: 'warehouse_location_name', label: 'Warehouse' },
  { id: 'payment_amount', label: 'Amount paid' },
  { id: 'payment_date', label: 'Payment date' },
  { id: 'payment_method', label: 'Payment method' },
  { id: 'remaining_balance', label: 'Remaining balance' },
  { id: 'inventory_kind', label: 'Inventory / consignment' },
  { id: 'excel_status', label: 'Status' },
  { id: 'comm_released', label: 'Commission released' },
  { id: 'notes', label: 'Notes' },
  { id: 'proof_url', label: 'Proof URL' },
];

function peso(value: number) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function loadAliases(): SalesRecordAliases {
  try {
    const raw = localStorage.getItem(SALES_RECORD_ALIAS_STORAGE_KEY);
    if (!raw) return { agents: {}, products: {} };
    const parsed = JSON.parse(raw) as SalesRecordAliases;
    return { agents: parsed.agents || {}, products: parsed.products || {} };
  } catch {
    return { agents: {}, products: {} };
  }
}

function saveAliases(aliases: SalesRecordAliases) {
  localStorage.setItem(SALES_RECORD_ALIAS_STORAGE_KEY, JSON.stringify(aliases));
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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

export function KeyAccountSalesRecordImportPage() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<SalesRecordParseResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Record<number, SalesRecordColumnOverride>>>({});
  const [aliases, setAliases] = useState<SalesRecordAliases>(() => loadAliases());
  const [kams, setKams] = useState<{ email: string; full_name: string | null }[]>([]);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [importResults, setImportResults] = useState<ImportPoResult[]>([]);
  const [busy, setBusy] = useState<'parse' | 'dry' | 'import' | null>(null);
  const [importProgress, setImportProgress] = useState('');
  const [linesPo, setLinesPo] = useState<PreviewPo | null>(null);
  const [productDrafts, setProductDrafts] = useState<Record<string, { brand_name: string; variant_name: string; sku: string }>>({});
  const [createMissing, setCreateMissing] = useState(true);

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
    setLinesPo(null);
  };

  const persistAliases = (next: SalesRecordAliases) => {
    setAliases(next);
    saveAliases(next);
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setBusy('parse');
    resetResults();
    try {
      const next = await parseClientSalesRecordExcel(file);
      setParsed(next);
      setOverrides({});
      setFileName(file.name);
      toast({
        title: 'File loaded',
        description: `${next.rows.length} line(s) from ${next.sheets.length} product sheet(s).`,
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

  const applyColumnMap = () => {
    if (!parsed) return;
    const next = remapSalesRecordParse(parsed, overrides, aliases);
    setParsed(next);
    resetResults();
    toast({
      title: 'Columns applied',
      description: next.needs_column_map
        ? 'Some required columns are still missing.'
        : `${next.rows.length} line(s) ready.`,
    });
  };

  const runDryRun = async () => {
    if (!rows.length) return;
    setBusy('dry');
    setImportResults([]);
    try {
      const result = await kaPost<DryRunResult>('dry-run', rows, createMissing);
      setDryRun(result);
      toast({
        title: result.ready_to_import ? 'Dry-run passed' : 'Dry-run found issues',
        description: `${result.po_count} PO(s), ${result.blocking_pos} blocked. Nothing was inserted.`,
      });
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
      const imported = all.filter((r) => r.ok).length;
      const failed = all.filter((r) => r.ok === false).length;
      toast({
        title: failed ? 'Import finished with errors' : 'Import complete',
        description: `${imported} PO(s) imported, ${failed} failed. Delivered. Stock was not deducted.`,
      });
      if (imported) {
        setDryRun(null);
      }
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
        <h1 className="text-2xl font-semibold">Sales record import</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Upload a Client Sales Record workbook. Flavor columns become PO lines, grouped by RFPF.
          Existing sales are imported as delivered. Paid / unpaid / partial and consignment follow the Excel.
          Missing clients and shops (trade name) are created on import. Warehouse brands/variants are not.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">1. Upload workbook</CardTitle>
            <CardDescription>Product sheets are unpivoted. The sales tracker is only used for commission / status hints.</CardDescription>
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
              {fileName ? `${fileName} · ${rows.length} line(s) · ${parsed ? new Set(rows.map((r) => r.external_po_ref)).size : 0} RFPF(s)` : 'No file selected'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">2. Dry-run</CardTitle>
            <CardDescription>
              Validates KAMs and hub brands/variants. Missing clients/shops are listed as would-create when enabled.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="create-missing"
                checked={createMissing}
                onCheckedChange={(value) => {
                  setCreateMissing(value === true);
                  resetResults();
                }}
              />
              <Label htmlFor="create-missing" className="text-sm font-normal leading-snug">
                Create missing clients, shops (trade name), and a default address on import
              </Label>
            </div>
            <Button onClick={() => void runDryRun()} disabled={!rows.length || !!busy || Boolean(parsed?.needs_column_map)}>
              {busy === 'dry' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dry-run
            </Button>
            {parsed?.needs_column_map ? (
              <p className="text-sm text-destructive">Map required columns first.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">3. Import ready POs</CardTitle>
            <CardDescription>
              Creates delivered POs after creating any missing clients/shops. Payments follow Excel. No warehouse queue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {dryRun ? `${readyPos.length} ready · ${blockedPos.length} blocked` : 'Run a dry-run first'}
            </p>
            <Button onClick={() => void runImport()} disabled={!readyPos.length || !!busy}>
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
            <CardDescription>These appear on the sales tracker but have no flavor breakdown on a product sheet. They will not import.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {parsed.tracker_only.map((item) => `${item.rfpf} (${item.client_name || item.product})`).join(' · ')}
          </CardContent>
        </Card>
      ) : null}

      {parsed?.needs_column_map ? (
        <Card>
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
            <CardDescription>Some sheets are missing RFPF, client, order date, or flavor columns. Map them, then apply.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {parsed.sheets.filter((sheet) => sheet.missing_required.length).map((sheet) => (
              <div key={sheet.name} className="space-y-2">
                <h3 className="font-medium">
                  {sheet.name}{' '}
                  <span className="text-destructive text-sm font-normal">Missing: {sheet.missing_required.join(', ')}</span>
                </h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {sheet.columns.filter((col) => col.header.trim()).slice(0, 24).map((col) => (
                    <div key={`${sheet.name}-${col.index}`} className="flex items-center gap-2">
                      <Label className="w-40 truncate text-xs" title={col.header}>{col.header}</Label>
                      <Select
                        value={
                          overrides[sheet.name]?.[col.index]?.role === 'flavor'
                            ? 'flavor'
                            : overrides[sheet.name]?.[col.index]?.role === 'ignore'
                              ? 'ignore'
                              : overrides[sheet.name]?.[col.index]?.field
                                || (col.role === 'flavor' ? 'flavor' : col.field || 'ignore')
                        }
                        onValueChange={(value) => {
                          setOverrides((prev) => {
                            const sheetMap = { ...(prev[sheet.name] || {}) };
                            if (value === 'flavor') sheetMap[col.index] = { role: 'flavor' };
                            else if (value === 'ignore') sheetMap[col.index] = { role: 'ignore' };
                            else sheetMap[col.index] = { role: 'identity', field: value as SalesRecordIdentityField };
                            return { ...prev, [sheet.name]: sheetMap };
                          });
                        }}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flavor">Flavor / variant</SelectItem>
                          <SelectItem value="ignore">Ignore</SelectItem>
                          {IDENTITY_FIELDS.map((field) => (
                            <SelectItem key={field.id} value={field.id}>{field.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button type="button" onClick={applyColumnMap}>Apply column map</Button>
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
              const current = aliases.agents[key];
              return (
              <div key={agent} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <Label className="w-40">{agent}</Label>
                <Select
                  value={current}
                  onValueChange={(email) => {
                    persistAliases({
                      ...aliases,
                      agents: { ...aliases.agents, [key]: email },
                    });
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
            <CardDescription>
              These Excel flavors were not found in the linked warehouse hub. Enter the OMS brand + variant, or a SKU. Do not create hub products here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unmatchedProducts.map(([key, item]) => (
              <div key={key} className="grid gap-2 md:grid-cols-4">
                <p className="text-sm md:col-span-4 font-medium">{item.brand} · {item.variant}</p>
                <Input
                  placeholder="OMS brand"
                  value={productDrafts[key]?.brand_name ?? ''}
                  onChange={(e) => setProductDrafts((prev) => ({ ...prev, [key]: { brand_name: e.target.value, variant_name: prev[key]?.variant_name || '', sku: prev[key]?.sku || '' } }))}
                />
                <Input
                  placeholder="OMS variant"
                  value={productDrafts[key]?.variant_name ?? ''}
                  onChange={(e) => setProductDrafts((prev) => ({ ...prev, [key]: { brand_name: prev[key]?.brand_name || '', variant_name: e.target.value, sku: prev[key]?.sku || '' } }))}
                />
                <Input
                  placeholder="SKU (optional)"
                  value={productDrafts[key]?.sku ?? ''}
                  onChange={(e) => setProductDrafts((prev) => ({ ...prev, [key]: { brand_name: prev[key]?.brand_name || '', variant_name: prev[key]?.variant_name || '', sku: e.target.value } }))}
                />
              </div>
            ))}
            <Button type="button" variant="outline" onClick={applyProductMaps}>Save product maps</Button>
          </CardContent>
        </Card>
      ) : null}

      {dryRun ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Dry-run result
            </CardTitle>
            <CardDescription>
              Nothing was written. Fix blocked POs, then dry-run again. Click Lines to inspect flavors.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {pendingMaster.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium">Will create on import</h3>
                <p className="text-sm text-muted-foreground">
                  Trade name is used as the shop name. Category defaults to retail unless the Excel has distributor.
                  Warehouse brands and variants are never created here.
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
                      <TableRow key={`${row.client_name}|${row.shop_name}|${row.address_label}`}>
                        <TableCell>{row.client_name}</TableCell>
                        <TableCell>{row.shop_name}</TableCell>
                        <TableCell className="text-sm">
                          {row.address_label}
                          {row.full_address && row.full_address !== row.shop_name ? (
                            <span className="block text-muted-foreground">{row.full_address}</span>
                          ) : null}
                        </TableCell>
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
            {blockedPos.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium">Blocked</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>RFPF</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedPos.map((po) => (
                      <TableRow key={po.external_po_ref}>
                        <TableCell className="font-mono text-sm">{po.external_po_ref}</TableCell>
                        <TableCell>
                          {po.client}
                          {po.will_create_client ? <Badge className="ml-1" variant="outline">new client</Badge> : null}
                          {po.will_create_shop ? <Badge className="ml-1" variant="outline">new shop</Badge> : null}
                        </TableCell>
                        <TableCell className="text-destructive text-sm">{po.issues.join(' · ')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            <div className="space-y-2">
              <h3 className="font-medium">Ready</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RFPF</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readyPos.map((po) => (
                    <TableRow key={po.external_po_ref}>
                      <TableCell className="font-mono text-sm">{po.external_po_ref}</TableCell>
                      <TableCell>{po.order_date}</TableCell>
                      <TableCell>
                        {po.client}
                        {po.will_create_client ? <Badge className="ml-1" variant="outline">new client</Badge> : null}
                        {po.will_create_shop ? <Badge className="ml-1" variant="outline">new shop</Badge> : null}
                      </TableCell>
                      <TableCell>{po.po_order_kind}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{po.payment_status}</Badge>
                        {po.commissioned ? <Badge className="ml-1" variant="outline">commissioned</Badge> : null}
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="link" className="h-auto p-0 font-medium tabular-nums" onClick={() => setLinesPo(po)}>
                          {po.line_count}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">{peso(po.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                  {!readyPos.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">No POs are ready to import.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={!!linesPo} onOpenChange={(open) => { if (!open) setLinesPo(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Lines · {linesPo?.external_po_ref}</DialogTitle>
            <DialogDescription>
              {linesPo ? `${linesPo.client} · ${linesPo.order_date} · ${peso(linesPo.total_amount)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Excel brand</TableHead>
                  <TableHead>Excel variant</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(linesPo?.items || []).map((item, index) => (
                  <TableRow key={`${item.excel_row || index}-${item.excel_variant || item.variant}`}>
                    <TableCell className="text-xs">{item.sheet_name || '—'}</TableCell>
                    <TableCell>{item.excel_brand || item.brand || '—'}</TableCell>
                    <TableCell>{item.excel_variant || item.variant || '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{item.sku || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(item.unit_price)}</TableCell>
                    <TableCell>
                      {item.lookup_ok ? <Badge variant="secondary">Matched</Badge> : <Badge variant="destructive">Not matched</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinesPo(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    <TableCell className="font-mono text-sm">{row.external_po_ref}</TableCell>
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
