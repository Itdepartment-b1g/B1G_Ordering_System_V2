import { supabase } from '@/lib/supabase';

export const SYSTEM_UPDATES_QUERY_KEY = 'system-updates';
export const SYSTEM_UPDATE_UNACKED_QUERY_KEY = 'system-updates-unacked';
export const SYSTEM_UPDATE_ACK_REPORT_QUERY_KEY = 'system-updates-ack-report';

export type SystemUpdateStatus = 'draft' | 'published' | 'archived';

export type SystemUpdateAttachment = {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at?: string;
};

export type SystemUpdateDetailItem = {
  title: string;
  description: string;
};

export type SystemUpdate = {
  id: string;
  title: string;
  short_description: string;
  details: SystemUpdateDetailItem[];
  status: SystemUpdateStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  company_ids: string[];
  company_names: string[];
  attachments: SystemUpdateAttachment[];
};

export type SystemUpdateInput = {
  title: string;
  short_description: string;
  details: SystemUpdateDetailItem[];
  company_ids: string[];
  status?: SystemUpdateStatus;
};

export type UnacknowledgedSystemUpdate = {
  id: string;
  title: string;
  short_description: string;
  details: SystemUpdateDetailItem[];
  published_at: string | null;
  attachments: SystemUpdateAttachment[];
};

export type AckReportRow = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  company_id: string;
  company_name: string | null;
  acknowledgment_status: 'acknowledged' | 'pending';
  acknowledged_at: string | null;
};

export type AckReportStats = {
  total_targeted: number;
  total_acknowledged: number;
  total_pending: number;
  completion_pct: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function emptySystemUpdateDetail(): SystemUpdateDetailItem {
  return { title: '', description: '' };
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function detailFromUnknown(item: unknown): SystemUpdateDetailItem | null {
  let value: unknown = parseMaybeJson(item);

  // Older rows may nest the real payload inside title as a JSON string.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = asRecord(value);
    const nested = parseMaybeJson(row.title);
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedRow = asRecord(nested);
      if ('title' in nestedRow || 'description' in nestedRow) {
        value = nested;
      }
    }
  }

  if (typeof value === 'string') {
    const title = value.trim();
    return title ? { title, description: '' } : null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const row = asRecord(value);
  const title = String(row.title ?? '').trim();
  const description = String(row.description ?? '').trim();
  if (!title && !description) return null;
  return { title, description };
}

export function normalizeDetails(details: unknown): SystemUpdateDetailItem[] {
  let raw: unknown = parseMaybeJson(details);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => detailFromUnknown(item))
    .filter((item): item is SystemUpdateDetailItem => item != null);
}

function normalizeAttachments(value: unknown): SystemUpdateAttachment[] {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = asRecord(item);
      const id = row.id == null ? '' : String(row.id);
      const file_name = row.file_name == null ? '' : String(row.file_name);
      const file_path = row.file_path == null ? '' : String(row.file_path);
      if (!id || !file_name || !file_path) return null;
      return {
        id,
        file_name,
        file_path,
        mime_type: row.mime_type == null ? null : String(row.mime_type),
        size_bytes: row.size_bytes == null ? null : Number(row.size_bytes),
        created_at: row.created_at == null ? undefined : String(row.created_at),
      } satisfies SystemUpdateAttachment;
    })
    .filter((item): item is SystemUpdateAttachment => item != null);
}

async function loadAttachments(updateIds: string[]): Promise<Map<string, SystemUpdateAttachment[]>> {
  const map = new Map<string, SystemUpdateAttachment[]>();
  if (updateIds.length === 0) return map;
  const { data, error } = await supabase
    .from('system_update_attachments')
    .select('id, update_id, file_name, file_path, mime_type, size_bytes, created_at')
    .in('update_id', updateIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  for (const row of data || []) {
    const updateId = String(row.update_id);
    const list = map.get(updateId) || [];
    list.push({
      id: String(row.id),
      file_name: String(row.file_name),
      file_path: String(row.file_path),
      mime_type: row.mime_type == null ? null : String(row.mime_type),
      size_bytes: row.size_bytes == null ? null : Number(row.size_bytes),
      created_at: row.created_at == null ? undefined : String(row.created_at),
    });
    map.set(updateId, list);
  }
  return map;
}

async function loadCompanies(
  updateIds: string[]
): Promise<Map<string, { ids: string[]; names: string[] }>> {
  const map = new Map<string, { ids: string[]; names: string[] }>();
  if (updateIds.length === 0) return map;
  const { data, error } = await supabase
    .from('system_update_companies')
    .select('update_id, company_id, companies(id, company_name)')
    .in('update_id', updateIds);
  if (error) throw error;
  for (const row of data || []) {
    const updateId = String(row.update_id);
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    const entry = map.get(updateId) || { ids: [], names: [] };
    entry.ids.push(String(row.company_id));
    if (company?.company_name) entry.names.push(String(company.company_name));
    map.set(updateId, entry);
  }
  return map;
}

function mapUpdate(
  row: Record<string, unknown>,
  companies: { ids: string[]; names: string[] },
  attachments: SystemUpdateAttachment[]
): SystemUpdate {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    short_description: String(row.short_description || ''),
    details: normalizeDetails(row.details),
    status: (String(row.status || 'draft') as SystemUpdateStatus) || 'draft',
    published_at: row.published_at == null ? null : String(row.published_at),
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    company_ids: companies.ids,
    company_names: companies.names,
    attachments,
  };
}

export async function fetchSystemUpdates(): Promise<SystemUpdate[]> {
  const { data, error } = await supabase
    .from('system_updates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const ids = rows.map((r) => String(r.id));
  const [companiesMap, attachmentsMap] = await Promise.all([
    loadCompanies(ids),
    loadAttachments(ids),
  ]);
  return rows.map((row) =>
    mapUpdate(
      asRecord(row),
      companiesMap.get(String(row.id)) || { ids: [], names: [] },
      attachmentsMap.get(String(row.id)) || []
    )
  );
}

export async function fetchSystemUpdateById(id: string): Promise<SystemUpdate | null> {
  const { data, error } = await supabase.from('system_updates').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [companiesMap, attachmentsMap] = await Promise.all([
    loadCompanies([id]),
    loadAttachments([id]),
  ]);
  return mapUpdate(
    asRecord(data),
    companiesMap.get(id) || { ids: [], names: [] },
    attachmentsMap.get(id) || []
  );
}

export async function createSystemUpdate(
  input: SystemUpdateInput,
  createdBy: string
): Promise<SystemUpdate> {
  const details = normalizeDetails(input.details);
  const status = input.status || 'draft';
  const { data, error } = await supabase
    .from('system_updates')
    .insert({
      title: input.title.trim(),
      short_description: input.short_description.trim(),
      details,
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;

  const updateId = String(data.id);
  if (input.company_ids.length > 0) {
    const { error: companyError } = await supabase.from('system_update_companies').insert(
      input.company_ids.map((company_id) => ({ update_id: updateId, company_id }))
    );
    if (companyError) throw companyError;
  }

  return (await fetchSystemUpdateById(updateId))!;
}

export async function updateSystemUpdate(
  id: string,
  input: SystemUpdateInput
): Promise<SystemUpdate> {
  const details = normalizeDetails(input.details);
  const status = input.status || 'draft';
  const existing = await fetchSystemUpdateById(id);
  if (!existing) throw new Error('Update not found');

  const publishedAt =
    status === 'published'
      ? existing.published_at || new Date().toISOString()
      : existing.published_at;

  const { error } = await supabase
    .from('system_updates')
    .update({
      title: input.title.trim(),
      short_description: input.short_description.trim(),
      details,
      status,
      published_at: status === 'published' ? publishedAt : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;

  const { error: deleteCompaniesError } = await supabase
    .from('system_update_companies')
    .delete()
    .eq('update_id', id);
  if (deleteCompaniesError) throw deleteCompaniesError;

  if (input.company_ids.length > 0) {
    const { error: companyError } = await supabase.from('system_update_companies').insert(
      input.company_ids.map((company_id) => ({ update_id: id, company_id }))
    );
    if (companyError) throw companyError;
  }

  return (await fetchSystemUpdateById(id))!;
}

export async function publishSystemUpdate(id: string): Promise<SystemUpdate> {
  const existing = await fetchSystemUpdateById(id);
  if (!existing) throw new Error('Update not found');
  if (existing.company_ids.length === 0) throw new Error('Select at least one company');
  if (!existing.details.some((d) => d.title.trim())) {
    throw new Error('Add at least one titled update detail');
  }

  const { error } = await supabase
    .from('system_updates')
    .update({
      status: 'published',
      published_at: existing.published_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
  return (await fetchSystemUpdateById(id))!;
}

export async function archiveSystemUpdate(id: string): Promise<SystemUpdate> {
  const { error } = await supabase
    .from('system_updates')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return (await fetchSystemUpdateById(id))!;
}

export async function uploadSystemUpdateAttachment(
  updateId: string,
  file: File
): Promise<SystemUpdateAttachment> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${updateId}/${Date.now()}_${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from('system-updates')
    .upload(filePath, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('system_update_attachments')
    .insert({
      update_id: updateId,
      file_name: file.name,
      file_path: filePath,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select('id, file_name, file_path, mime_type, size_bytes, created_at')
    .single();
  if (error) throw error;

  return {
    id: String(data.id),
    file_name: String(data.file_name),
    file_path: String(data.file_path),
    mime_type: data.mime_type == null ? null : String(data.mime_type),
    size_bytes: data.size_bytes == null ? null : Number(data.size_bytes),
    created_at: data.created_at == null ? undefined : String(data.created_at),
  };
}

export async function deleteSystemUpdateAttachment(attachment: SystemUpdateAttachment): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from('system-updates')
    .remove([attachment.file_path]);
  if (storageError) throw storageError;
  const { error } = await supabase
    .from('system_update_attachments')
    .delete()
    .eq('id', attachment.id);
  if (error) throw error;
}

export async function getSystemUpdateAttachmentUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('system-updates')
    .createSignedUrl(filePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function fetchUnacknowledgedSystemUpdates(): Promise<UnacknowledgedSystemUpdate[]> {
  const { data, error } = await supabase.rpc('list_unacknowledged_system_updates');
  if (error) throw error;

  const mapped = (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    title: String(row.title || ''),
    short_description: String(row.short_description || ''),
    details: normalizeDetails(row.details),
    published_at: row.published_at == null ? null : String(row.published_at),
    attachments: normalizeAttachments(row.attachments),
  }));

  // Fallback: if RPC returned empty attachment arrays, load from table (RLS-safe for company users).
  const missingIds = mapped.filter((u) => u.attachments.length === 0).map((u) => u.id);
  if (missingIds.length === 0) return mapped;

  try {
    const attachmentsMap = await loadAttachments(missingIds);
    return mapped.map((update) => ({
      ...update,
      attachments:
        update.attachments.length > 0
          ? update.attachments
          : attachmentsMap.get(update.id) || [],
    }));
  } catch {
    return mapped;
  }
}

export async function acknowledgeSystemUpdate(updateId: string): Promise<void> {
  const { data, error } = await supabase.rpc('acknowledge_system_update', {
    p_update_id: updateId,
  });
  if (error) throw error;
  const result = asRecord(data);
  if (result.success === false) {
    throw new Error(String(result.error || 'Failed to acknowledge update'));
  }
}

export async function fetchSystemUpdateAckReport(
  updateId: string
): Promise<{ rows: AckReportRow[]; stats: AckReportStats }> {
  const { data, error } = await supabase.rpc('list_system_update_acknowledgment_report', {
    p_update_id: updateId,
  });
  if (error) throw error;
  const result = asRecord(data);
  if (result.success === false) {
    throw new Error(String(result.error || 'Failed to load acknowledgment report'));
  }
  const stats = asRecord(result.stats);
  return {
    rows: Array.isArray(result.rows) ? (result.rows as AckReportRow[]) : [],
    stats: {
      total_targeted: Number(stats.total_targeted) || 0,
      total_acknowledged: Number(stats.total_acknowledged) || 0,
      total_pending: Number(stats.total_pending) || 0,
      completion_pct: Number(stats.completion_pct) || 0,
    },
  };
}

export async function fetchCompaniesForSystemUpdates(): Promise<
  Array<{ id: string; company_name: string }>
> {
  const SYSTEM_ADMIN_COMPANY_ID = '6a3da573-af53-4def-a665-0f1782c70097';
  const { data, error } = await supabase
    .from('companies')
    .select('id, company_name')
    .neq('id', SYSTEM_ADMIN_COMPANY_ID)
    .order('company_name', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: String(row.id),
    company_name: String(row.company_name || 'Untitled'),
  }));
}
