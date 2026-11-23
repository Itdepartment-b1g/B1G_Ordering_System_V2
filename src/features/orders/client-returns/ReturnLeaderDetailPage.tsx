import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { fetchReturnLeaderHandovers } from '@/store/slices/moto-sales/return-leader';
import { BrandTypeLinesList } from './BrandTypeLinesList';
import {
  getReturnLeaderLineQty,
  returnLeaderStatusBadgeClass,
  returnLeaderStatusLabel,
} from './returnLeaderApi';

export default function ReturnLeaderDetailPage() {
  const { handoverId = '' } = useParams<{ handoverId: string }>();
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const rows = useAppSelector((state) => state.motoReturnLeader.handovers);
  const status = useAppSelector((state) => state.motoReturnLeader.handoversStatus);

  useEffect(() => {
    if (!user?.company_id) return;
    if (status === 'idle' || status === 'failed') {
      void dispatch(fetchReturnLeaderHandovers());
    }
  }, [dispatch, status, user?.company_id]);

  const row = useMemo(() => rows.find((item) => item.id === handoverId) || null, [rows, handoverId]);
  const loading = status === 'loading' || status === 'idle';
  const qty = row ? getReturnLeaderLineQty(row) : 0;

  if (loading && !row) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading return…
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/client-order-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to client returns
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Return to leader not found</p>
            <Button className="mt-4" asChild>
              <Link to="/client-order-returns">Go to Client Returns</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8 md:p-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/client-order-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to client returns
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <RotateCcw className="h-5 w-5 text-rose-600" />
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{row.returnNumber}</h1>
          <Badge variant="outline" className={`font-normal ${returnLeaderStatusBadgeClass(row.status)}`}>
            {returnLeaderStatusLabel(row.status)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {row.submittedByName} · {qty} unit{qty === 1 ? '' : 's'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Submitted by</p>
          <p className="font-medium">{row.submittedByName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total qty</p>
          <p className="font-medium tabular-nums text-rose-700">{qty.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">SKUs</p>
          <p className="font-medium tabular-nums">{row.lines.length.toLocaleString()}</p>
        </div>
        {row.notes ? (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="font-medium">{row.notes}</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-semibold">Items</p>
        <BrandTypeLinesList
          lines={row.lines.map((line) => ({
            brandName: line.brandName,
            variantName: line.variantName,
            variantType: line.variantType,
            quantity: line.quantity,
            variantId: line.variantId,
            brandId: line.brandId,
            variantTypeId: line.variantTypeId,
          }))}
        />
      </div>

      {row.proofPhotos.length > 0 ? (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">Submitter photos</p>
          <div className="flex flex-wrap gap-2">
            {row.proofPhotos.map((photo) => (
              <a
                key={photo.path}
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="block w-32 overflow-hidden rounded-md border"
              >
                {photo.url ? (
                  <img src={photo.url} alt={photo.fileName} className="h-24 w-full bg-muted object-cover" />
                ) : null}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {row.agentSignatureUrl ? (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">Agent signature</p>
          <div className="rounded-md border bg-white p-3">
            <img
              src={row.agentSignatureUrl}
              alt="Agent signature"
              className="mx-auto max-h-28"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
