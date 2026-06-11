import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { openKeyAccountShopCorPdf } from '@/features/key-accounts/kaShopCor';

type KeyAccountShopCorViewProps = {
  corPdfPath?: string | null;
  /** Button label when COR exists */
  label?: string;
  /** Shown when no COR on file */
  emptyLabel?: string;
  variant?: 'link' | 'outline' | 'ghost' | 'default';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  /** Stop click from bubbling (e.g. shop card selection) */
  stopPropagation?: boolean;
};

export function KeyAccountShopCorView({
  corPdfPath,
  label = 'View COR',
  emptyLabel = 'No COR on file',
  variant = 'outline',
  size = 'sm',
  className,
  stopPropagation = false,
}: KeyAccountShopCorViewProps) {
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);

  if (!corPdfPath?.trim()) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }

  const handleOpen = async (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    setOpening(true);
    try {
      await openKeyAccountShopCorPdf(corPdfPath);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Could not open COR',
        description: err?.message || 'Failed to load PDF',
      });
    } finally {
      setOpening(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={opening}
      onClick={(e) => void handleOpen(e)}
    >
      {opening ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
      ) : (
        <FileText className="h-4 w-4 mr-1.5" />
      )}
      {opening ? 'Opening…' : label}
    </Button>
  );
}
