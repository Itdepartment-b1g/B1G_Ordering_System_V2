import { HttpError } from '../../http/errors';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

export type UserContext = {
  userId: string;
  companyId: string;
  role: string;
};

export type KAPaymentTermOptionRow = {
  id: string;
  company_id: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
};

export type KAPaymentTermCreatePayload = {
  label: string;
};

export type KAPaymentTermUpdatePayload = {
  id: string;
  label?: string;
  is_active?: boolean;
};

const EDIT_ROLES = ['sales_head', 'sales_director'];

function assertCanEdit(ctx: UserContext) {
  if (!EDIT_ROLES.includes(ctx.role)) {
    throw new HttpError(403, 'Only Sales Head or Sales Director can manage payment terms');
  }
}

function mapUniqueViolation(error: { code?: string }) {
  if (error.code === '23505') {
    throw new HttpError(409, 'That payment term already exists for this company.');
  }
}

async function attachCreatorNames(
  sb: ReturnType<typeof getSupabaseAdmin>,
  rows: Array<Omit<KAPaymentTermOptionRow, 'created_by_name'>>
): Promise<KAPaymentTermOptionRow[]> {
  const creatorIds = [
    ...new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id))),
  ];

  const nameById = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: profiles, error } = await sb
      .from('profiles')
      .select('id, full_name, email')
      .in('id', creatorIds);
    if (error) throw error;

    for (const profile of profiles || []) {
      nameById.set(profile.id, profile.full_name?.trim() || profile.email || '—');
    }
  }

  return rows.map((row) => ({
    ...row,
    created_by_name: row.created_by ? nameById.get(row.created_by) ?? null : null,
  }));
}

async function assertTermInCompany(
  sb: ReturnType<typeof getSupabaseAdmin>,
  id: string,
  companyId: string
) {
  const { data, error } = await sb
    .from('key_account_payment_term_options')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Payment term not found');
}

export async function listKAPaymentTermOptions(ctx: UserContext, activeOnly = false) {
  const sb = getSupabaseAdmin();
  let query = sb
    .from('key_account_payment_term_options')
    .select('*')
    .eq('company_id', ctx.companyId)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  const options = await attachCreatorNames(sb, (data || []) as KAPaymentTermOptionRow[]);
  return { options };
}

export async function createKAPaymentTermOption(
  ctx: UserContext,
  input: KAPaymentTermCreatePayload
) {
  assertCanEdit(ctx);

  const label = input.label.trim();
  if (!label) throw new HttpError(400, 'Label is required');

  const sb = getSupabaseAdmin();
  const { data: existing, error: existingError } = await sb
    .from('key_account_payment_term_options')
    .select('sort_order')
    .eq('company_id', ctx.companyId);
  if (existingError) throw existingError;

  const nextSort =
    !existing || existing.length === 0
      ? 0
      : Math.max(...existing.map((row) => Number(row.sort_order) || 0)) + 1;

  const { data, error } = await sb
    .from('key_account_payment_term_options')
    .insert({
      company_id: ctx.companyId,
      label,
      is_active: true,
      sort_order: nextSort,
      created_by: ctx.userId,
    })
    .select('*')
    .single();

  if (error) {
    mapUniqueViolation(error);
    throw error;
  }

  const [option] = await attachCreatorNames(sb, [data as KAPaymentTermOptionRow]);
  return { option };
}

export async function updateKAPaymentTermOption(
  ctx: UserContext,
  input: KAPaymentTermUpdatePayload
) {
  assertCanEdit(ctx);

  if (!input.id) throw new HttpError(400, 'id is required');

  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new HttpError(400, 'Label is required');
    patch.label = label;
  }
  if (input.is_active !== undefined) {
    patch.is_active = input.is_active;
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, 'Nothing to update');
  }

  const sb = getSupabaseAdmin();
  await assertTermInCompany(sb, input.id, ctx.companyId);

  const { data, error } = await sb
    .from('key_account_payment_term_options')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) {
    mapUniqueViolation(error);
    throw error;
  }

  const [option] = await attachCreatorNames(sb, [data as KAPaymentTermOptionRow]);
  return { option };
}

export async function deleteKAPaymentTermOption(ctx: UserContext, id: string) {
  assertCanEdit(ctx);
  if (!id) throw new HttpError(400, 'id is required');

  const sb = getSupabaseAdmin();
  await assertTermInCompany(sb, id, ctx.companyId);

  const { error } = await sb.from('key_account_payment_term_options').delete().eq('id', id);
  if (error) throw error;

  return { ok: true as const, id };
}
