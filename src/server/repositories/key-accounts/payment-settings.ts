import { HttpError } from '../../http/errors';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

export type UserContext = {
  userId: string;
  companyId: string;
  role: string;
};

export type KAPaymentSettingsWritePayload = {
  bank_accounts: Array<{
    name: string;
    account_number: string;
    enabled: boolean;
    qr_code_url?: string;
  }>;
  gcash_number: string | null;
  gcash_name: string | null;
  gcash_qr_url: string | null;
  cash_enabled: boolean;
  cheque_enabled: boolean;
  gcash_enabled: boolean;
  bank_transfer_enabled: boolean;
};

export type KAPaymentSettingsUpdatePayload = KAPaymentSettingsWritePayload & {
  id: string;
};

function validatePaymentSettingsPayload(input: KAPaymentSettingsWritePayload) {
  if (
    !input.cash_enabled &&
    !input.cheque_enabled &&
    !input.gcash_enabled &&
    !input.bank_transfer_enabled
  ) {
    throw new HttpError(400, 'At least one payment method must be enabled');
  }
  if (input.bank_transfer_enabled && input.bank_accounts.length === 0) {
    throw new HttpError(400, 'Bank accounts are required when bank transfer is enabled');
  }
  if (input.gcash_enabled && !input.gcash_number?.trim()) {
    throw new HttpError(400, 'GCash number is required when GCash is enabled');
  }
}

function buildSettingsPayload(ctx: UserContext, input: KAPaymentSettingsWritePayload) {
  return {
    company_id: ctx.companyId,
    bank_accounts: input.bank_accounts,
    gcash_number: input.gcash_number?.trim() || null,
    gcash_name: input.gcash_name?.trim() || null,
    gcash_qr_url: input.gcash_qr_url || null,
    cash_enabled: input.cash_enabled,
    cheque_enabled: input.cheque_enabled,
    gcash_enabled: input.gcash_enabled,
    bank_transfer_enabled: input.bank_transfer_enabled,
  };
}

function assertSalesHead(ctx: UserContext) {
  if (ctx.role !== 'sales_head') {
    throw new HttpError(403, 'Only Sales Head can update payment settings');
  }
}

export async function getKAPaymentSettings(ctx: UserContext) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_payment_settings')
    .select('*')
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (error) throw error;

  let createdByName: string | null = null;
  if (data?.created_by) {
    const { data: creator, error: creatorError } = await sb
      .from('profiles')
      .select('full_name, email')
      .eq('id', data.created_by)
      .maybeSingle();
    if (creatorError) throw creatorError;
    createdByName = creator?.full_name?.trim() || creator?.email || null;
  }

  return { settings: data ?? null, createdByName };
}

export async function createKAPaymentSettings(
  ctx: UserContext,
  input: KAPaymentSettingsWritePayload
) {
  assertSalesHead(ctx);
  validatePaymentSettingsPayload(input);

  const sb = getSupabaseAdmin();
  const { data: existingRow, error: existingError } = await sb
    .from('key_account_payment_settings')
    .select('id')
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existingRow) {
    throw new HttpError(409, 'Payment settings already exist for this company');
  }

  const payload = buildSettingsPayload(ctx, input);
  const { data, error } = await sb
    .from('key_account_payment_settings')
    .insert({ ...payload, created_by: ctx.userId })
    .select('*')
    .single();
  if (error) throw error;
  return { settings: data };
}

export async function updateKAPaymentSettings(
  ctx: UserContext,
  input: KAPaymentSettingsUpdatePayload
) {
  assertSalesHead(ctx);
  validatePaymentSettingsPayload(input);

  const sb = getSupabaseAdmin();
  const { data: existing, error: findError } = await sb
    .from('key_account_payment_settings')
    .select('id')
    .eq('id', input.id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (findError) throw findError;
  if (!existing) throw new HttpError(404, 'Payment settings not found');

  const payload = buildSettingsPayload(ctx, input);
  const { data, error } = await sb
    .from('key_account_payment_settings')
    .update(payload)
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw error;
  return { settings: data };
}
