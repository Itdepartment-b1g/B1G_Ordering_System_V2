import { useEffect, useState } from 'react';
import { BookOpen, Check, Copy, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  fetchReferenceNamingCatalog,
  type ReferenceNamingBrand,
} from '@/features/orders/referenceNamingCatalogApi';

export default function ReferenceNamingCatalogDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState<ReferenceNamingBrand[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const catalog = await fetchReferenceNamingCatalog();
        if (cancelled) return;
        setBrands(catalog.brands);
        setSelectedBrandId((prev) => {
          if (prev && catalog.brands.some((b) => b.id === prev)) return prev;
          return catalog.brands[0]?.id ?? '';
        });
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load reference naming';
        toast({ title: 'Error', description: message, variant: 'destructive' });
        setBrands([]);
        setSelectedBrandId('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setCopiedKey(null);
    }
  }, [open]);

  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedBrand = brands.find((b) => b.id === selectedBrandId) ?? null;
  const variants = selectedBrand?.variants ?? [];

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast({ title: 'Copied', description: text });
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1500);
    } catch {
      toast({
        title: 'Error',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const CopyButton = ({ copyKey, value }: { copyKey: string; value: string }) => {
    const copied = copiedKey === copyKey;
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          void copyText(copyKey, value);
        }}
        title={`Copy "${value}"`}
      >
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <BookOpen className="h-4 w-4 mr-2" />
          Reference naming
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reference naming</DialogTitle>
          <DialogDescription>
            Use these names as a guide when creating your warehouse catalog. You choose which names
            to adopt. All reference brands and variants are listed, including those with zero stock.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : brands.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No reference brands found.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0 flex-1 overflow-hidden">
            <div className="lg:col-span-1 border rounded-lg flex flex-col min-h-0 overflow-hidden">
              <div className="p-3 border-b space-y-2">
                <div className="font-medium text-sm">Brands</div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search brands..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="overflow-y-auto flex-1 max-h-[55vh] p-2 space-y-1">
                {filteredBrands.map((brand) => (
                  <div
                    key={brand.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedBrandId === brand.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedBrandId(brand.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{brand.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {brand.variants.length} variant{brand.variants.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <CopyButton copyKey={`brand-${brand.id}`} value={brand.name} />
                    </div>
                  </div>
                ))}
                {filteredBrands.length === 0 && (
                  <p className="text-sm text-muted-foreground p-3 text-center">No brands match.</p>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 border rounded-lg flex flex-col min-h-0 overflow-hidden">
              <div className="p-3 border-b">
                <div className="font-medium text-sm">
                  {selectedBrand ? `${selectedBrand.name} — Variants` : 'Variants'}
                </div>
              </div>
              <div className="overflow-y-auto flex-1 max-h-[55vh]">
                {!selectedBrand ? (
                  <p className="text-sm text-muted-foreground p-6 text-center">
                    Select a brand to view variants.
                  </p>
                ) : variants.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-6 text-center">
                    No variants for this brand.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variants.map((variant) => (
                        <TableRow key={variant.id}>
                          <TableCell className="font-medium">{variant.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{variant.variant_type}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {variant.sku || '—'}
                          </TableCell>
                          <TableCell>
                            <CopyButton copyKey={`variant-${variant.id}`} value={variant.name} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
