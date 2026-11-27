import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Paperclip, Save, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { SystemUpdateDetailsEditor } from './components/SystemUpdateDetailsEditor';
import {
  SYSTEM_UPDATES_QUERY_KEY,
  createSystemUpdate,
  deleteSystemUpdateAttachment,
  emptySystemUpdateDetail,
  fetchCompaniesForSystemUpdates,
  fetchSystemUpdateById,
  normalizeDetails,
  publishSystemUpdate,
  updateSystemUpdate,
  uploadSystemUpdateAttachment,
  type SystemUpdateDetailItem,
} from './systemUpdatesApi';

export default function SystemUpdateFormPage() {
  const { updateId } = useParams<{ updateId: string }>();
  const isNew = !updateId || updateId === 'new';
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const existingQuery = useQuery({
    queryKey: [SYSTEM_UPDATES_QUERY_KEY, updateId],
    enabled: !isNew && !!updateId,
    queryFn: () => fetchSystemUpdateById(updateId!),
  });

  const companiesQuery = useQuery({
    queryKey: [SYSTEM_UPDATES_QUERY_KEY, 'companies'],
    queryFn: fetchCompaniesForSystemUpdates,
  });

  const existing = existingQuery.data;

  const [title, setTitle] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [details, setDetails] = useState<SystemUpdateDetailItem[]>([emptySystemUpdateDetail()]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    if (isNew || !existing || hydratedId === existing.id) return;
    setTitle(existing.title);
    setShortDescription(existing.short_description);
    setDetails(existing.details.length > 0 ? existing.details : [emptySystemUpdateDetail()]);
    setCompanyIds(existing.company_ids);
    setHydratedId(existing.id);
  }, [existing, hydratedId, isNew]);

  const canEdit = isNew || existing?.status === 'draft';

  const saveMutation = useMutation({
    mutationFn: async (publishAfter: boolean) => {
      if (!title.trim()) throw new Error('Title is required');
      if (companyIds.length === 0) throw new Error('Select at least one company');
      const cleanedDetails = normalizeDetails(details);
      if (publishAfter && cleanedDetails.filter((d) => d.title.trim()).length === 0) {
        throw new Error('Add at least one titled bullet before publishing');
      }

      const payload = {
        title,
        short_description: shortDescription,
        details: cleanedDetails.length > 0 ? cleanedDetails : [emptySystemUpdateDetail()],
        company_ids: companyIds,
        status: 'draft' as const,
      };

      let savedId = updateId;
      if (isNew) {
        if (!user?.id) throw new Error('Not signed in');
        const created = await createSystemUpdate(payload, user.id);
        savedId = created.id;
      } else {
        await updateSystemUpdate(updateId!, payload);
      }

      if (pendingFiles.length > 0 && savedId) {
        for (const file of pendingFiles) {
          await uploadSystemUpdateAttachment(savedId, file);
        }
      }

      if (publishAfter && savedId) {
        await publishSystemUpdate(savedId);
      }
      return savedId!;
    },
    onSuccess: async (id, publishAfter) => {
      setPendingFiles([]);
      await queryClient.invalidateQueries({ queryKey: [SYSTEM_UPDATES_QUERY_KEY] });
      toast({
        title: publishAfter ? 'Published' : 'Saved',
        description: publishAfter
          ? 'Users in selected companies will see this update.'
          : 'Draft saved.',
      });
      navigate(`/system-updates/${id}`);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const companyOptions = companiesQuery.data || [];

  const toggleCompany = (id: string) => {
    setCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllCompanies = () => {
    setCompanyIds(companyOptions.map((c) => c.id));
  };

  const attachmentList = useMemo(() => existing?.attachments || [], [existing?.attachments]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList?.length || !canEdit) return;
    const files = Array.from(fileList);

    // New update: queue locally and upload when the draft is created on save/publish.
    if (isNew) {
      setPendingFiles((prev) => [...prev, ...files]);
      toast({
        title: 'Files added',
        description: 'They will upload when you save or publish.',
      });
      return;
    }

    try {
      setUploading(true);
      for (const file of files) {
        await uploadSystemUpdateAttachment(updateId!, file);
      }
      await queryClient.invalidateQueries({ queryKey: [SYSTEM_UPDATES_QUERY_KEY, updateId] });
      toast({ title: 'Uploaded', description: 'Attachment added.' });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Could not upload file.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    const attachment = attachmentList.find((a) => a.id === attachmentId);
    if (!attachment) return;
    try {
      await deleteSystemUpdateAttachment(attachment);
      await queryClient.invalidateQueries({ queryKey: [SYSTEM_UPDATES_QUERY_KEY, updateId] });
      toast({ title: 'Removed', description: 'Attachment deleted.' });
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Could not delete attachment.',
        variant: 'destructive',
      });
    }
  };

  if (!isNew && existingQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading update…
      </div>
    );
  }

  if (!isNew && existingQuery.isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        {existingQuery.error instanceof Error
          ? existingQuery.error.message
          : 'Failed to load update'}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/system-updates">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? 'New system update' : 'Edit system update'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? 'Prepare the announcement, then publish when ready.'
              : 'Published updates are locked for editing. Use acknowledgment tracking on the detail page.'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Update content</CardTitle>
          <CardDescription>Users see title, description, and bullets in this order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="su-title">Title / version</Label>
            <Input
              id="su-title"
              value={title}
              disabled={!canEdit}
              placeholder="Version 1.2.0"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="su-short">Short description</Label>
            <Textarea
              id="su-short"
              value={shortDescription}
              disabled={!canEdit}
              placeholder="Brief overview of what changed"
              onChange={(e) => setShortDescription(e.target.value)}
            />
          </div>
          <SystemUpdateDetailsEditor
            value={details}
            onChange={canEdit ? setDetails : () => undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attachments</CardTitle>
          <CardDescription>
            {isNew
              ? 'Add files now — they upload automatically when you save or publish.'
              : 'Optional PDFs or supporting files.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            multiple
            disabled={!canEdit || uploading || saveMutation.isPending}
            onChange={(e) => {
              void handleUpload(e.target.files);
              e.target.value = '';
            }}
          />
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </div>
          ) : null}

          {pendingFiles.length > 0 ? (
            <div className="space-y-2">
              {pendingFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">Pending</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removePendingFile(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {!isNew && attachmentList.length === 0 && pendingFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attachments yet.</p>
          ) : null}

          {!isNew && attachmentList.length > 0 ? (
            <div className="space-y-2">
              {attachmentList.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{file.file_name}</span>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => void handleDeleteAttachment(file.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Target companies</CardTitle>
              <CardDescription>Only users in these companies will see the update.</CardDescription>
            </div>
            {canEdit ? (
              <Button type="button" variant="outline" size="sm" onClick={selectAllCompanies}>
                Select all
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {companiesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading companies…
            </div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
              {companyOptions.map((company) => (
                <label
                  key={company.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={companyIds.includes(company.id)}
                    disabled={!canEdit}
                    onCheckedChange={() => toggleCompany(company.id)}
                  />
                  <span className="text-sm">{company.company_name}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(false)}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save draft
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(true)}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Publish
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button asChild variant="outline">
            <Link to={`/system-updates/${updateId}`}>Back to detail</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
