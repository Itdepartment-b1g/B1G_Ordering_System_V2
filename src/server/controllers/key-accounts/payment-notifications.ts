import { HttpError, toErrorResult } from '../../http/errors';
import { respond } from '../../http/respond';
import type { ApiResult } from '../executive/executiveController';
import {
  getKAPoPaymentReminderById,
  getKAPoReminderPaymentTotals,
  listDueKAPoPaymentReminders,
  markKAPoPaymentReminderSent,
  type KAPoPaymentReminderDueRow,
} from '../../repositories/key-accounts/purchase-order';
import { sendKeyAccountPoPaymentReminderEmail } from '../../email/keyAccountPaymentReminderEmail';
import { resolveAppBaseUrl } from '../../email/sendMail';

export function getTodayISODateManila(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  return `${map.year}-${map.month}-${map.day}`;
}

async function sendOneReminder(
  row: KAPoPaymentReminderDueRow,
  baseUrl: string
): Promise<'sent' | 'skipped' | 'failed'> {
  const kamEmail = row.kam?.email?.trim() || '';
  if (!kamEmail) return 'skipped';

  const { paid, discount } = await getKAPoReminderPaymentTotals(row.id);
  const poTotal = Number(row.total_amount) || 0;
  const remaining = Math.max(0, Math.round((poTotal - paid - discount) * 100) / 100);
  if (remaining <= 0.001) return 'skipped';

  const poNumber = String(row.po_number || row.id);
  const poViewUrl = `${baseUrl}/key-accounts/purchase-orders?search=${encodeURIComponent(poNumber)}&tab=all`;

  const ok = await sendKeyAccountPoPaymentReminderEmail({
    to: kamEmail,
    poNumber,
    greetingName: row.kam?.full_name || null,
    clientName: row.client?.client_name || null,
    paymentTerms: row.key_account_payment_terms || null,
    notificationDate: row.key_account_notification_date || null,
    poViewUrl,
    totalAmount: row.total_amount ?? null,
    paidAmount: paid,
    discountAmount: discount,
    remainingAmount: remaining,
    items: row.items || [],
  });

  if (!ok) return 'failed';
  await markKAPoPaymentReminderSent(row.id);
  return 'sent';
}

/**
 * Daily cron: email KAMs for all due, unsent reminders.
 */
export async function sendDueKAPoPaymentRemindersHandler(params: {
  baseUrl?: string;
  asOfDate?: string;
  host?: string;
  proto?: string;
}): Promise<ApiResult<unknown>> {
  try {
    const baseUrl =
      (params.baseUrl || '').trim().replace(/\/$/, '') ||
      resolveAppBaseUrl({ host: params.host, proto: params.proto });

    const asOfDate = params.asOfDate || getTodayISODateManila();
    const dueRows = await listDueKAPoPaymentReminders(asOfDate);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of dueRows) {
      const status = await sendOneReminder(row, baseUrl);
      if (status === 'sent') sent += 1;
      else if (status === 'skipped') skipped += 1;
      else failed += 1;
    }

    return {
      status: 200,
      body: {
        asOfDate,
        dueCount: dueRows.length,
        sent,
        skipped,
        failed,
        baseUrl,
      },
    };
  } catch (error) {
    return toErrorResult(error);
  }
}

/**
 * After create/update: if notify date is today (or past) and not yet sent, email now.
 * Fail-soft — never fails the PO write.
 */
export async function maybeSendKAPoPaymentReminderNow(params: {
  poId: string;
  baseUrl?: string;
  host?: string;
  proto?: string;
}): Promise<void> {
  try {
    const today = getTodayISODateManila();
    const row = await getKAPoPaymentReminderById(params.poId);
    if (!row) return;
    if (!row.key_account_notification_date) return;
    if (String(row.key_account_notification_date) > today) return;
    if (row.key_account_notification_sent_at) return;

    const baseUrl =
      (params.baseUrl || '').trim().replace(/\/$/, '') ||
      resolveAppBaseUrl({ host: params.host, proto: params.proto });

    await sendOneReminder(row, baseUrl);
  } catch (error) {
    console.error('⚠️ Immediate KA payment reminder failed (non-blocking):', error);
  }
}

function requestHostParts(req: any): { host?: string; proto?: string } {
  const headers = req?.headers || {};
  const host = String(headers['x-forwarded-host'] || headers.host || '').trim();
  const proto = String(headers['x-forwarded-proto'] || 'https').trim();
  return { host: host || undefined, proto: proto || undefined };
}

export async function getKAPaymentNotificationsHandler(req: any, res: any) {
  return respond(res, async () => {
    assertCronAuthorized({
      headers: req?.headers || {},
      query: req?.query || {},
    });
    const { host, proto } = requestHostParts(req);
    return sendDueKAPoPaymentRemindersHandler({ host, proto });
  });
}

export function assertCronAuthorized(req: {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}): void {
  const header = req.headers || {};
  const query = req.query || {};

  const bearer = String(header.authorization || header.Authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  const xCron = String(header['x-cron-secret'] || '').trim();
  const qSecret = String(
    Array.isArray(query.secret) ? query.secret[0] : query.secret || ''
  ).trim();

  const provided = xCron || qSecret || bearer;
  const expected =
    process.env.KA_PAYMENT_REMINDER_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    '';

  if (!expected || !provided || provided !== expected) {
    throw new HttpError(401, 'Unauthorized');
  }
}
