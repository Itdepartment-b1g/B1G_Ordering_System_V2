
import { useState, useMemo } from 'react';
import { sendNotification } from '@/features/shared/lib/notification.helpers';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import {
  Package,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUp,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { useMyRequests, useMainInventorySummary, Request, GroupedRequest } from './requestHooks';
import { useQueryClient } from '@tanstack/react-query';

import { CreateStockRequestDialog } from './components/CreateStockRequestDialog'; // New Import

export default function LeaderStockRequestPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: mainSummary, isLoading: summaryLoading } = useMainInventorySummary();
  const { data: requests = [], isLoading: requestsLoading, refetch: refetchRequests } = useMyRequests();

  const brands = mainSummary?.brands || [];
  const variants = mainSummary?.variants || [];
  const loading = summaryLoading || requestsLoading;


  const [searchQuery, setSearchQuery] = useState('');
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
        <Button size="lg" className="shadow-sm gap-2 w-full sm:w-auto" onClick={() => setFormOpen(true)}>
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

      {/* Requests List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Request History</CardTitle>
              <CardDescription>View your requests to Head Office</CardDescription>
            </div>
            <div className="flex gap-2">
               <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search requests..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {groupedRequests.length === 0 ? (
               <div className="text-center py-12 text-muted-foreground">
                 <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                 <p>No stock requests found</p>
               </div>
            ) : (
              groupedRequests
                .filter(group => {
                   if (!searchQuery) return true;
                   const searchLower = searchQuery.toLowerCase();
                   // Simple search on notes or status
                   return group.requester_notes?.toLowerCase().includes(searchLower) || group.status.toLowerCase().includes(searchLower);
                })
                .map((group) => (
                <Card key={group.id} className="border border-border/50">
                  <div className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusBadge(group.status)}
                        <span className="text-xs text-muted-foreground">
                          {new Date(group.requested_at).toLocaleDateString()} at {new Date(group.requested_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <p className="font-medium text-sm">
                        Requesting {group.totalQuantity} items across {group.productCount} products
                        {group.id.startsWith('SR-') && <span className="text-xs text-muted-foreground ml-2">({group.id})</span>}
                      </p>
                      {group.requester_notes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">"{group.requester_notes}"</p>
                      )}
                    </div>
                    {/* Edit button removed as per user request */}
                  </div>
                  {/* Expanded Items Preview - Optional, keeping detailed item view simple for now */}
                   <div className="px-4 pb-4 pt-0 border-t bg-muted/20 mt-2">
                       <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                         {group.requests.map(req => (
                           <div key={req.id} className="text-xs flex justify-between p-2 bg-background rounded border">
                              <span className="truncate pr-2">{req.variant?.brand?.name} - {req.variant?.name}</span>
                              <span className="font-semibold">{req.requested_quantity}</span>
                           </div>
                         ))}
                       </div>
                   </div>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
