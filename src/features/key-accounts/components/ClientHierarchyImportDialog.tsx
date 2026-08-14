import { useRef, useState, type DragEvent } from 'react';
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  exportClientHierarchyColumns,
  type ClientHierarchyExportFormat,
  type ClientHierarchyExportTab,
} from '@/features/key-accounts/utils/exportClientHierarchy';
import { importClientHierarchyFile } from '@/features/key-accounts/utils/importClientHierarchy';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

type ClientHierarchyImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: ClientHierarchyExportTab;
  companyId?: string | null;
  userId?: string | null;
  selectedClientId?: string | null;
  selectedShopId?: string | null;
  onImported: () => void;
};

function tabLabel(tab: ClientHierarchyExportTab) {
  if (tab === 'clients') return 'clients';
  if (tab === 'shops') return 'shops';
  return 'addresses';
}

function hasAcceptedExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function ClientHierarchyImportDialog({
  open,
  onOpenChange,
  tab,
  companyId,
  userId,
  selectedClientId,
  selectedShopId,
  onImported,
}: ClientHierarchyImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const resetFile = () => {
    setFile(null);
    setDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetFile();
    onOpenChange(nextOpen);
  };

  const selectFile = (nextFile: File | null | undefined) => {
    if (!nextFile) return;
    if (!hasAcceptedExtension(nextFile.name)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file',
        description: 'Please upload a CSV or XLSX file.',
      });
      return;
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'CSV or XLSX, up to 10 MB.',
      });
      return;
    }
    setFile(nextFile);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const handleImport = async () => {
    if (!file) {
      toast({
        variant: 'destructive',
        title: 'No file selected',
        description: 'Choose a CSV or Excel file to import.',
      });
      return;
    }
    if (!companyId || !userId) {
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: 'Missing company or user information.',
      });
      return;
    }

    setImporting(true);
    try {
      const result = await importClientHierarchyFile({
        file,
        tab,
        companyId,
        userId,
        selectedClientId,
        selectedShopId,
      });

      if (result.imported > 0) onImported();

      const parts = [
        `${result.imported} imported`,
        result.skipped > 0 ? `${result.skipped} sample row(s) skipped` : null,
        result.failed > 0 ? `${result.failed} failed` : null,
      ].filter(Boolean);

      toast({
        variant: result.failed > 0 && result.imported === 0 ? 'destructive' : 'default',
        title: result.imported > 0 ? 'Import complete' : 'Import finished',
        description:
          result.errors[0] && result.failed > 0
            ? `${parts.join(' · ')}. ${result.errors[0]}`
            : parts.join(' · '),
      });

      if (result.errors.length > 1) {
        console.error('Client hierarchy import errors:', result.errors);
      }

      if (result.failed === 0) handleOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Could not import the file.',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExportTemplate = async (format: ClientHierarchyExportFormat) => {
    setExporting(true);
    try {
      await exportClientHierarchyColumns(tab, format);
      toast({
        title: 'Template exported',
        description: `Downloaded ${tabLabel(tab)} template (${format === 'csv' ? 'CSV' : 'Excel'}) with header columns and 1 sample row.`,
      });
    } catch (error) {
      console.error('Client hierarchy template export failed:', error);
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: 'Could not generate the template.',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px] gap-5">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-xl">Import {tabLabel(tab)}</DialogTitle>
          <DialogDescription>
            {tab === 'clients'
              ? 'Required: client name, category, and contact phone. Contact person, email, payment terms, and notes can be blank (saved as empty). Extra columns are ignored. Company ID is applied automatically. The sample row is skipped.'
              : 'Upload a CSV or Excel file using the template columns. Company ID is applied automatically from your account. The sample row is skipped automatically.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => !importing && fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!importing) setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!importing) setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragActive(false);
            }}
            onDrop={handleDrop}
            className={cn(
              'flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
              dragActive
                ? 'border-primary bg-primary/15'
                : 'border-primary/40 bg-primary/[0.06] hover:bg-primary/10',
              importing && 'pointer-events-none opacity-60'
            )}
          >
            <p className="text-sm text-foreground">
              {file ? (
                <span className="font-medium">{file.name}</span>
              ) : (
                <>
                  Drag file here or{' '}
                  <span className="font-semibold text-primary">choose file</span>
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">CSV or XLSX, up to 10 MB</p>
          </div>

          <Button
            type="button"
            className="h-11 w-full rounded-lg text-base font-semibold"
            onClick={() => void handleImport()}
            disabled={importing || !file}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Import'}
          </Button>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Export template</p>
            <p className="text-sm text-muted-foreground">
              Download header columns plus 1 sample row for reference.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg"
              disabled={exporting}
              onClick={() => void handleExportTemplate('csv')}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg"
              disabled={exporting}
              onClick={() => void handleExportTemplate('xlsx')}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Export Excel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
