
import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { useMyRequests, useMainInventorySummary, Request, GroupedRequest } from './requestHooks';
import { useQueryClient } from '@tanstack/react-query';

import { CreateStockRequestDialog } from './components/CreateStockRequestDialog';
import { StockRequestHistoryList } from './components/StockRequestHistoryList';
import { exportLeaderStockRequestPdf } from './utils/exportLeaderStockRequestPdf';

export default function LeaderStockRequestPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: mainSummary, isLoading: summaryLoading } = useMainInventorySummary();
  const { data: requests = [], isLoading: requestsLoading, refetch: refetchRequests } = useMyRequests();

  const brands = mainSummary?.brands || [];
  const variants = mainSummary?.variants || [];
  const loading = summaryLoading || requestsLoading;


  const [formOpen, setFormOpen] = useState(false);





  // Group requests helper
  const groupedRequests = useMemo(() => {
    const groups: { [key: string]: Request[] } = {};

    requests.forEach(request => {
      // Group by request_number if available, otherwise fallback to timestamp
      const key = request.request_number || `${new Date(request.requested_at).getTime()}-${request.requester_notes || 'no-notes'}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(request);
    });

    return Object.entries(groups).map(([key, requests]) => {
      const firstRequest = requests[0];
      const allSameStatus = requests.every(r => r.status === firstRequest.status);

      return {
        id: key,
        requested_at: firstRequest.requested_at,
        status: allSameStatus ? firstRequest.status : 'mixed',
        productCount: requests.length,
        totalQuantity: requests.reduce((sum, r) => sum + r.requested_quantity, 0),
        requests: requests,
        requester_notes: firstRequest.requester_notes
      } as GroupedRequest;
    }).sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
  }, [requests]);

  // Statistics
  const stats = useMemo(() => {
    // Helper to check status
    // For Leader requests, 'approved_by_leader' means it's waiting for Admin approval (effectively pending admin action)
    // 'pending' would be if they submitted it but didn't self-approve (which we are skipping)
    const pendingAdminCount = groupedRequests.filter(g => g.status === 'approved_by_leader').length;
    
    return {
      total: groupedRequests.length,
      pending: pendingAdminCount, 
      approved: groupedRequests.filter(g => g.status === 'approved_by_admin' || g.status === 'fulfilled').length,
      denied: groupedRequests.filter(g => g.status === 'rejected').length,
    };
  }, [groupedRequests]);
  // Helper for Status Badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved_by_leader':
        return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200"><Clock className="h-3 w-3 mr-1" />Waiting for Admin</Badge>;
      case 'approved_by_admin':
      case 'fulfilled':
        return <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />Denied</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const printStatusLabel = (status: string) => {
    switch (status) {
      case 'approved_by_leader':
        return 'Waiting for Admin';
      case 'approved_by_admin':
      case 'fulfilled':
        return 'Approved';
      case 'rejected':
        return 'Denied';
      case 'mixed':
        return 'Mixed';
      default:
        return status?.trim() || 'Submitted';
    }
  };

  const handlePrint = async (group: GroupedRequest) => {
    try {
      const denialReason = group.requests
        .map(req => req.denial_reason?.trim())
        .find(Boolean) ?? null;

      await exportLeaderStockRequestPdf({
        companyId: user?.company_id,
        requestNumber: group.id.startsWith('SR-') ? group.id : '—',
        statusLabel: printStatusLabel(group.status),
        requestedAt: group.requested_at,
        requestedByName: group.requests[0]?.requested_by_name || user?.full_name || null,
        approvedByName: group.requests[0]?.approved_by_name || null,
        notes: group.requester_notes,
        denialReason,
        lines: group.requests.map(req => ({
          brandName: req.variant?.brand?.name ?? null,
          variantName: req.variant?.name ?? null,
          requestedQuantity: req.requested_quantity,
        })),
      });
    } catch (error) {
      toast({
        title: 'Could not open print view',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    }
  };



  if (loading && requests.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Request Stock</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Request inventory from Head Office (Admin)
          </p>
        </div>
        <Button
          size="lg"
          className="shadow-sm gap-2 w-full sm:w-auto"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['main_inventory_summary'] });
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Stock Request</span>
          <span className="sm:hidden">New Request</span>
        </Button>
        <CreateStockRequestDialog 
          open={formOpen} 
          onOpenChange={setFormOpen}
          products={variants}
          brands={brands}
          isMobileRequest={false} // Leader requesting from Admin

          onRequestSubmitted={() => {
            refetchRequests();
            toast({ title: 'Success', description: 'Request submitted successfully.' });
          }}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-slate-100"><Package className="h-5 w-5 text-slate-600" /></div>
            <div>
              <p className="text-xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Requests</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-blue-100"><Clock className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-xl font-bold">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Detailed to Admin</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-green-100"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-xl font-bold">{stats.approved}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-red-100"><XCircle className="h-5 w-5 text-red-600" /></div>
            <div>
              <p className="text-xl font-bold">{stats.denied}</p>
              <p className="text-xs text-muted-foreground">Denied</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <StockRequestHistoryList
        groups={groupedRequests}
        renderStatus={getStatusBadge}
        onPrint={handlePrint}
        title="Request History"
        description="View your requests to Head Office"
      />
    </div>
  );
}
