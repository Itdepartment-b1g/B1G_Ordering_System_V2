import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Pencil, Plus, Trash2, AlertCircle, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth/hooks';
import {
  useKeyAccountPaymentTermOptions,
  type KeyAccountPaymentTermOptionRow,
} from '@/features/key-accounts/hooks/useKeyAccountPaymentTermOptions';
import { useAppDispatch } from '@/store/store';
import {
  createKAPaymentTermOption,
  deleteKAPaymentTermOption,
  updateKAPaymentTermOption,
} from '@/store/slices/key-accounts/payment-terms';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function KeyAccountPaymentTermsList() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { options, loading, error, refetch } = useKeyAccountPaymentTermOptions(false);
  const canEdit = user?.role === 'sales_head' || user?.role === 'sales_director';

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const [savingId, setSavingId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<KeyAccountPaymentTermOptionRow | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        (option.created_by_name?.toLowerCase().includes(q) ?? false)
    );
  }, [options, searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize, options.length]);

  const { pageCount, safePage, pagedItems } = useMemo(
    () => getListPaginationSlice(filteredOptions, page, pageSize),
    [filteredOptions, page, pageSize]
  );

  const addTerm = async () => {
    const label = newLabel.trim();
    if (!label || !user?.company_id || !canEdit) return;

    setAdding(true);
    try {
      await dispatch(createKAPaymentTermOption(label)).unwrap();

      setNewLabel('');
      setAddOpen(false);
      toast({ title: 'Payment term added' });
      await refetch();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to add payment term';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (option: KeyAccountPaymentTermOptionRow) => {
    setEditing(option);
    setEditLabel(option.label);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const label = editLabel.trim();
    if (!editing || !label || !canEdit) return;

    setSavingId(editing.id);
    try {
      await dispatch(
        updateKAPaymentTermOption({ id: editing.id, label })
      ).unwrap();

      setEditOpen(false);
      setEditing(null);
      toast({ title: 'Payment term updated' });
      await refetch();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to update payment term';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (option: KeyAccountPaymentTermOptionRow) => {
    if (!canEdit) return;
    setSavingId(option.id);
    try {
      await dispatch(
        updateKAPaymentTermOption({ id: option.id, is_active: !option.is_active })
      ).unwrap();
      await refetch();
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update status',
      });
    } finally {
      setSavingId(null);
    }
  };

  const deleteTerm = async (option: KeyAccountPaymentTermOptionRow) => {
    if (!canEdit) return;
    if (!window.confirm(`Delete payment term "${option.label}"?`)) return;

    setSavingId(option.id);
    try {
      await dispatch(deleteKAPaymentTermOption(option.id)).unwrap();
      toast({ title: 'Payment term deleted' });
      await refetch();
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete payment term',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payment Terms</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View, add, edit, or deactivate payment terms available when creating Key Account
          purchase orders.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Terms Catalog</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-[260px]">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search terms (e.g. Net 30)..."
                  className="pl-8"
                />
              </div>
              {canEdit ? (
                <Button type="button" onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Payment Term
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading payment terms…
            </div>
          ) : filteredOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {options.length === 0
                ? canEdit
                  ? 'No payment terms yet. Add one to get started.'
                  : 'No payment terms yet.'
                : 'No payment terms match your search.'}
            </p>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Created at</TableHead>
                      <TableHead>Created by</TableHead>
                      <TableHead>Status</TableHead>
                      {canEdit ? (
                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((option) => {
                      const busy = savingId === option.id;
                      return (
                        <TableRow key={option.id}>
                          <TableCell className="font-medium">{option.label}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatCreatedAt(option.created_at)}
                          </TableCell>
                          <TableCell>{option.created_by_name || '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={option.is_active ? 'default' : 'outline'}
                                className={
                                  option.is_active
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                                    : ''
                                }
                              >
                                {option.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                              {canEdit ? (
                                <Switch
                                  checked={option.is_active}
                                  disabled={busy}
                                  onCheckedChange={() => toggleActive(option)}
                                  aria-label={
                                    option.is_active
                                      ? `Deactivate ${option.label}`
                                      : `Activate ${option.label}`
                                  }
                                />
                              ) : null}
                            </div>
                          </TableCell>
                          {canEdit ? (
                            <TableCell className="text-right">
                              <div className="inline-flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={busy}
                                  aria-label={`Edit ${option.label}`}
                                  onClick={() => openEdit(option)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  disabled={busy}
                                  aria-label={`Delete ${option.label}`}
                                  onClick={() => deleteTerm(option)}
                                >
                                  {busy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <ListPagination
                pageSize={pageSize}
                safePage={safePage}
                pageCount={pageCount}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(0);
                }}
                onPrevious={() => setPage((p) => Math.max(0, p - 1))}
                onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setNewLabel('');
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Add payment term</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new_payment_term_label">Label</Label>
            <Input
              id="new_payment_term_label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTerm();
                }
              }}
              placeholder="e.g. Net 30, COD…"
              disabled={adding}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={addTerm} disabled={adding || !newLabel.trim()}>
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit payment term</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit_payment_term_label">Label</Label>
            <Input
              id="edit_payment_term_label"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveEdit();
                }
              }}
              placeholder="Payment term label"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveEdit}
              disabled={!editLabel.trim() || savingId === editing?.id}
            >
              {savingId === editing?.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
