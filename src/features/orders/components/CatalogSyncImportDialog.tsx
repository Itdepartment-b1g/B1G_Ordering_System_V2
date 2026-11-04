import { useRef, useState } from 'react';
import { FileUp, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  applyCatalogSyncImport,
  parseCatalogSyncExcel,
  previewCatalogSyncImport,
  type CatalogSyncPreviewItem,
} from '@/features/orders/utils/catalogSyncImport';

type CatalogSyncImportDialogProps = {
  companyId: string;
  onApplied: () => void | Promise<void>;
};

function actionBadge(action: CatalogSyncPreviewItem['action']) {
  switch (action) {
    case 'create_brand':
      return <Badge>Create brand + variant</Badge>;
    case 'create_variant':
      return <Badge variant="secondary">Create variant</Badge>;
    case 'update_variant':
      return <Badge variant="outline">Update</Badge>;
    case 'skip':
      return <Badge variant="secondary">Skip</Badge>;
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
    default:
      return null;
  }
}

export default function CatalogSyncImportDialog({ companyId, onApplied }: CatalogSyncImportDialogProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<CatalogSyncPreviewItem[]>([]);

  const counts = preview.reduce(
    (acc, item) => {
      acc[item.action] = (acc[item.action] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const canApply =
    preview.length > 0 &&
    !loading &&
    !applying &&
    (counts.create_brand || 0) + (counts.create_variant || 0) + (counts.update_variant || 0) > 0;

  const reset = () => {
    setPreview([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    try {
      const rows = await parseCatalogSyncExcel(file);
      const next = await previewCatalogSyncImport(companyId, rows);
      setPreview(next);
      setOpen(true);
      toast({
        title: 'Catalog file loaded',
        description: `${next.length} row(s) ready for review.`,
      });
    } catch (err) {
      toast({
        title: 'Import failed',
        description: err instanceof Error ? err.message : 'Could not read catalog file.',
        variant: 'destructive',
      });
      reset();
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!canApply) return;
    setApplying(true);
    try {
      const result = await applyCatalogSyncImport(companyId, preview);
      await onApplied();
      toast({
        title: 'Catalog sync applied',
        description: [
          `${result.createdBrands} brand(s) created`,
          `${result.createdVariants} variant(s) created`,
          `${result.updatedVariants} variant(s) updated`,
          `${result.skipped} skipped`,
          result.errors.length ? `${result.errors.length} error(s)` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        variant: result.errors.length ? 'destructive' : 'default',
      });
      if (result.errors.length) {
        console.warn('Catalog sync errors', result.errors);
      }
      setOpen(false);
      reset();
    } catch (err) {
      toast({
        title: 'Apply failed',
        description: err instanceof Error ? err.message : 'Could not apply catalog sync.',
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] || null)}
      />
      <Button
        variant="outline"
        disabled={loading || !companyId}
        title="Import flat catalog from standard company (create missing, update type/sku when names match)"
        onClick={() => inputRef.current?.click()}
      >
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
        {loading ? 'Reading…' : 'Import Catalog Sync'}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Catalog Sync</DialogTitle>
            <DialogDescription>
              Matches by exact brand + variant name (case-insensitive). Creates missing rows and updates
              variant type / SKU. Does not rename differently spelled products (e.g. FORGE → X-FORGE) —
              map those in Sales Tracker V2 or rename manually.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>Create brand: {counts.create_brand || 0}</span>
            <span>· Create variant: {counts.create_variant || 0}</span>
            <span>· Update: {counts.update_variant || 0}</span>
            <span>· Skip: {counts.skip || 0}</span>
            <span>· Error: {counts.error || 0}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((item) => (
                  <TableRow key={`${item.excel_row}-${item.brand_name}-${item.variant_name}`}>
                    <TableCell>{item.excel_row}</TableCell>
                    <TableCell>{actionBadge(item.action)}</TableCell>
                    <TableCell className="font-medium">{item.brand_name || '—'}</TableCell>
                    <TableCell>{item.variant_name || '—'}</TableCell>
                    <TableCell>{item.variant_type || '—'}</TableCell>
                    <TableCell>{item.sku || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.message || ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={applying}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleApply()} disabled={!canApply}>
              {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}
              {applying ? 'Applying…' : 'Apply changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
