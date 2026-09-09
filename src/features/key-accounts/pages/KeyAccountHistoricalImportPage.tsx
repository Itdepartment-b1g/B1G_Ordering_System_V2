import { useMemo, useRef, useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2, Upload } from 'lucide-react';

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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { downloadKAHistoricalPoTemplate } from '@/features/key-accounts/utils/exportHistoricalPoTemplate';
import {
  parseHistoricalPoExcel,
  type KAHistoricalExcelRow,
} from '@/features/key-accounts/utils/parseHistoricalPoExcel';

const IMPORT_PO_CHUNK = 20;

type PreviewItem = {
  excel_row?: number;
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
  address: string;
  kam: string;
  rfpf_number: string | null;
  warehouse: string;
  line_count: number;
  total_amount: number;
  items?: PreviewItem[];
  issues: string[];
};

function peso(value: number) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

type DryRunResult = {
  dry_run: true;
  po_count: number;
  line_count: number;
  ready_to_import: boolean;
  blocking_pos: number;
  purchase_orders: PreviewPo[];
};

type ImportPoResult = {
  external_po_ref: string;
  ok: boolean;
  po_number?: string;
  issues?: string[];
};

async function kaPost<T>(action: 'dry-run' | 'import', rows: KAHistoricalExcelRow[]): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const res = await fetch('/api/key-account/historical-import', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, rows }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Request failed');
  return body as T;
}

function groupRows(rows: KAHistoricalExcelRow[]) {
  const map = new Map<string, KAHistoricalExcelRow[]>();
  for (const row of rows) {
    const ref = String(row.external_po_ref || '').trim();
    if (!map.has(ref)) map.set(ref, []);
    map.get(ref)!.push(row);
  }
  return map;
}

export function KeyAccountHistoricalImportPage() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<KAHistoricalExcelRow[]>([]);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [importResults, setImportResults] = useState<ImportPoResult[]>([]);
  const [busy, setBusy] = useState<'parse' | 'dry' | 'import' | null>(null);
  const [importProgress, setImportProgress] = useState('');
  const [linesPo, setLinesPo] = useState<PreviewPo | null>(null);

  const readyPos = useMemo(
    () => dryRun?.purchase_orders.filter((po) => po.would_insert) || [],
    [dryRun]
  );
  const blockedPos = useMemo(
    () => dryRun?.purchase_orders.filter((po) => !po.would_insert) || [],
    [dryRun]
  );

  const resetResults = () => {
    setDryRun(null);
    setImportResults([]);
    setImportProgress('');
    setLinesPo(null);
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setBusy('parse');
    resetResults();
    try {
      const parsed = await parseHistoricalPoExcel(file);
      setRows(parsed);
      setFileName(file.name);
      toast({ title: 'File loaded', description: `${parsed.length} line(s) ready for dry-run.` });
    } catch (error) {
      setRows([]);
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
    try {
      const result = await kaPost<DryRunResult>('dry-run', rows);
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

  const runImport = async () => {
    if (!readyPos.length) return;
    setBusy('import');
    setImportResults([]);
    const grouped = groupRows(rows);
    const refs = readyPos.map((po) => po.external_po_ref);
    const chunks: string[][] = [];
    for (let i = 0; i < refs.length; i += IMPORT_PO_CHUNK) {
      chunks.push(refs.slice(i, i + IMPORT_PO_CHUNK));
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
      const imported = all.filter((r) => r.ok).length;
      const failed = all.filter((r) => !r.ok).length;
      toast({
        title: failed ? 'Import finished with errors' : 'Import complete',
        description: `${imported} PO(s) imported, ${failed} failed. Delivered and paid. No warehouse stock cut.`,
      });
      if (imported) {
        const leftover = rows.filter((row) => {
          const ref = String(row.external_po_ref || '').trim();
          return !all.some((r) => r.ok && r.external_po_ref === ref);
        });
        setRows(leftover);
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
        <h1 className="text-2xl font-semibold">Historical PO import</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Import old Key Account purchase orders as already delivered, fully paid, and commissioned. Fill names (client, shop,
          brand + variant). The system matches OMS records. Stock is not deducted. You only need the PO header
          and RFPF on the first line of each PO; leave them blank on extra lines. Write brand_name again only when the brand changes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">1. Template</CardTitle>
            <CardDescription>
              One row per product. First line of a PO has ref, client, RFPF; extra lines can leave those blank. Same for brand until it changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => downloadKAHistoricalPoTemplate().catch((error) => {
                toast({ variant: 'destructive', title: 'Download failed', description: String(error) });
              })}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Download Excel template
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">2. Upload & dry-run</CardTitle>
            <CardDescription>Validates lookups and totals. Inserts nothing.</CardDescription>
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
            <p className="text-sm text-muted-foreground">{fileName ? `${fileName} · ${rows.length} line(s)` : 'No file selected'}</p>
            <Button onClick={() => void runDryRun()} disabled={!rows.length || !!busy}>
              {busy === 'dry' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dry-run
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">3. Import ready POs</CardTitle>
            <CardDescription>Creates delivered, paid, and commissioned POs. One CASH payment, optional RFPF. No warehouse queue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {dryRun
                ? `${readyPos.length} ready · ${blockedPos.length} blocked`
                : 'Run a dry-run first'}
            </p>
            <Button onClick={() => void runImport()} disabled={!readyPos.length || !!busy}>
              {busy === 'import' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {readyPos.length || ''} ready PO{readyPos.length === 1 ? '' : 's'}
            </Button>
            {importProgress ? <p className="text-sm text-muted-foreground">{importProgress}</p> : null}
          </CardContent>
        </Card>
      </div>

      {dryRun ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Dry-run result
            </CardTitle>
            <CardDescription>
              Nothing was written. Fix blocked POs in Excel and dry-run again. Click Lines to check brands and variants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {blockedPos.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium">Blocked</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Legacy ref</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedPos.map((po) => (
                      <TableRow key={po.external_po_ref}>
                        <TableCell className="font-mono text-sm">{po.external_po_ref}</TableCell>
                        <TableCell>{po.client}</TableCell>
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
                    <TableHead>Legacy ref</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>RFPF</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readyPos.map((po) => (
                    <TableRow key={po.external_po_ref}>
                      <TableCell className="font-mono text-sm">{po.external_po_ref}</TableCell>
                      <TableCell>{po.order_date}</TableCell>
                      <TableCell>{po.client}</TableCell>
                      <TableCell>{po.rfpf_number || '—'}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 font-medium tabular-nums"
                          onClick={() => setLinesPo(po)}
                        >
                          {po.line_count}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">{peso(po.total_amount)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">paid / delivered / commissioned</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!readyPos.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        No POs are ready to import.
                      </TableCell>
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
              {linesPo
                ? `${linesPo.client} · ${linesPo.order_date} · ${peso(linesPo.total_amount)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Excel row</TableHead>
                  <TableHead>Excel brand</TableHead>
                  <TableHead>Excel variant</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(linesPo?.items || []).map((item, index) => (
                  <TableRow key={`${item.excel_row || index}-${item.excel_variant || item.variant}`}>
                    <TableCell className="tabular-nums">{item.excel_row ?? '—'}</TableCell>
                    <TableCell>{item.excel_brand || item.brand || '—'}</TableCell>
                    <TableCell>{item.excel_variant || item.variant || '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{item.sku || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(item.unit_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(item.line_total)}</TableCell>
                    <TableCell>
                      {item.lookup_ok ? (
                        <Badge variant="secondary">Matched</Badge>
                      ) : (
                        <Badge variant="destructive">Not matched</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!linesPo?.items?.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      No line items on this preview.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinesPo(null)}>
              Close
            </Button>
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
                  <TableHead>Legacy ref</TableHead>
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
                      {row.ok ? (
                        <Badge>Imported</Badge>
                      ) : (
                        <span className="text-sm text-destructive">{row.issues?.join(' · ') || 'Failed'}</span>
                      )}
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
