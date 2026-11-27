import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Download, Loader2, Pencil, Send, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  SYSTEM_UPDATE_ACK_REPORT_QUERY_KEY,
  SYSTEM_UPDATES_QUERY_KEY,
  archiveSystemUpdate,
  fetchSystemUpdateAckReport,
  fetchSystemUpdateById,
  getSystemUpdateAttachmentUrl,
  publishSystemUpdate,
} from './systemUpdatesApi';
import { useState } from 'react';

function statusBadge(status: string) {
  if (status === 'published') return <Badge>Published</Badge>;
  if (status === 'archived') return <Badge variant="secondary">Archived</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export default function SystemUpdateDetailPage() {
  const { updateId } = useParams<{ updateId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const updateQuery = useQuery({
    queryKey: [SYSTEM_UPDATES_QUERY_KEY, updateId],
    enabled: !!updateId,
    queryFn: () => fetchSystemUpdateById(updateId!),
  });

  const reportQuery = useQuery({
    queryKey: [SYSTEM_UPDATE_ACK_REPORT_QUERY_KEY, updateId],
    enabled: !!updateId && updateQuery.data?.status !== 'draft',
    queryFn: () => fetchSystemUpdateAckReport(updateId!),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishSystemUpdate(updateId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [SYSTEM_UPDATES_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [SYSTEM_UPDATE_ACK_REPORT_QUERY_KEY, updateId] }),
      ]);
      toast({ title: 'Published', description: 'Update is now visible to targeted companies.' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Publish failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveSystemUpdate(updateId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [SYSTEM_UPDATES_QUERY_KEY] });
      toast({ title: 'Archived', description: 'Update is hidden from new popups.' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Archive failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const update = updateQuery.data;
  const stats = reportQuery.data?.stats;
  const rows = reportQuery.data?.rows || [];

  const handleDownload = async (attachmentId: string, filePath: string, fileName: string) => {
    try {
      setDownloadingId(attachmentId);
      const url = await getSystemUpdateAttachmentUrl(filePath);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Could not open attachment.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  if (updateQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!update) {
    return <div className="p-6 text-sm text-destructive">Update not found.</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="mt-0.5">
            <Link to="/system-updates">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{update.title}</h1>
              {statusBadge(update.status)}
            </div>
            <p className="text-sm text-muted-foreground">
              {update.short_description || 'No short description'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {update.status === 'draft' ? (
            <>
              <Button asChild variant="outline">
                <Link to={`/system-updates/${update.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button
                type="button"
                disabled={publishMutation.isPending}
                onClick={() => publishMutation.mutate()}
              >
                {publishMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Publish
              </Button>
            </>
          ) : null}
          {update.status === 'published' ? (
            <Button
              type="button"
              variant="outline"
              disabled={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate()}
            >
              {archiveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              {update.published_at
                ? `Published ${format(new Date(update.published_at), 'MMM d, yyyy h:mm a')}`
                : 'Not published yet'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3 text-sm">
              {update.details.map((item, index) => (
                <li key={`${update.id}-d-${index}`}>
                  <p className="font-medium leading-snug text-foreground">
                    {index + 1}. {item.title}
                  </p>
                  {item.description ? (
                    <p className="mt-1 whitespace-pre-wrap pl-4 font-normal leading-relaxed text-foreground">
                      {item.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Companies</p>
              <p className="text-sm">
                {update.company_names.length > 0 ? update.company_names.join(', ') : 'None'}
              </p>
            </div>
            {update.attachments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Attachments</p>
                {update.attachments.map((file) => (
                  <Button
                    key={file.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={downloadingId === file.id}
                    onClick={() => handleDownload(file.id, file.file_path, file.file_name)}
                  >
                    {downloadingId === file.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    <span className="truncate">{file.file_name}</span>
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {update.status !== 'draft' ? (
          <div className="grid grid-cols-2 gap-3 content-start">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Targeted</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {stats?.total_targeted ?? '—'}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Acknowledged</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold text-green-700">
                {stats?.total_acknowledged ?? '—'}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold text-amber-700">
                {stats?.total_pending ?? '—'}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Completion</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {stats ? `${stats.completion_pct}%` : '—'}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Acknowledgments</CardTitle>
              <CardDescription>Publish this update to start tracking acknowledgments.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {update.status !== 'draft' ? (
        <Card>
          <CardHeader>
            <CardTitle>Acknowledgment tracking</CardTitle>
            <CardDescription>Per-user status for all active users in targeted companies.</CardDescription>
          </CardHeader>
          <CardContent>
            {reportQuery.isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading report…
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">No targeted users found.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Acknowledged At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.user_id}>
                        <TableCell className="font-medium">{row.full_name || '—'}</TableCell>
                        <TableCell>{row.company_name || '—'}</TableCell>
                        <TableCell className="capitalize">
                          {(row.role || '—').replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell>
                          {row.acknowledgment_status === 'acknowledged' ? (
                            <Badge>Acknowledged</Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {row.acknowledged_at
                            ? format(new Date(row.acknowledged_at), 'MMM d, yyyy h:mm a')
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
