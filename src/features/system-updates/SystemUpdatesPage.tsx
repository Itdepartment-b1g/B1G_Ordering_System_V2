import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Eye, Loader2, Plus } from 'lucide-react';
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
import { SYSTEM_UPDATES_QUERY_KEY, fetchSystemUpdates } from './systemUpdatesApi';

function statusBadge(status: string) {
  if (status === 'published') return <Badge>Published</Badge>;
  if (status === 'archived') return <Badge variant="secondary">Archived</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export default function SystemUpdatesPage() {
  const { data: updates = [], isLoading, error } = useQuery({
    queryKey: [SYSTEM_UPDATES_QUERY_KEY],
    queryFn: fetchSystemUpdates,
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Updates</h1>
          <p className="text-sm text-muted-foreground">
            Publish version notes and track company acknowledgments.
          </p>
        </div>
        <Button asChild>
          <Link to="/system-updates/new">
            <Plus className="mr-2 h-4 w-4" />
            New update
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All updates</CardTitle>
          <CardDescription>Drafts stay hidden until you publish.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading updates…
            </div>
          ) : error ? (
            <p className="py-8 text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load updates'}
            </p>
          ) : updates.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">No updates yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Companies</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {updates.map((update) => (
                    <TableRow key={update.id}>
                      <TableCell>
                        <div className="font-medium">{update.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {update.short_description || '—'}
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(update.status)}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <span className="text-sm">
                          {update.company_names.length > 0
                            ? update.company_names.join(', ')
                            : 'None'}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {update.published_at
                          ? format(new Date(update.published_at), 'MMM d, yyyy h:mm a')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/system-updates/${update.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
