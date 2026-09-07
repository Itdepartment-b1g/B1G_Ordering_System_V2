import { sendMail } from './sendMail';
import {
  generateKeyAccountPoPaymentReminderHTML,
  type KeyAccountPoPaymentReminderEmailParams,
} from '../../lib/keyAccountPaymentReminderEmail.helpers';

export type {
  KeyAccountPoPaymentReminderEmailItem,
  KeyAccountPoPaymentReminderEmailParams,
} from '../../lib/keyAccountPaymentReminderEmail.helpers';

export { generateKeyAccountPoPaymentReminderHTML };

/** Internal KAM pay-reminder. Fail-soft: returns false on skip/error. */
export async function sendKeyAccountPoPaymentReminderEmail(
  params: KeyAccountPoPaymentReminderEmailParams
): Promise<boolean> {
  if (!params.to?.trim() || !params.poNumber?.trim()) {
    console.warn('⚠️ Skipping KA payment reminder email: missing to or poNumber');
    return false;
  }

  const result = await sendMail({
    to: params.to.trim(),
    subject: `PO ${params.poNumber} payment reminder`,
    html: generateKeyAccountPoPaymentReminderHTML(params),
  });

  if ('error' in result) {
    console.error('⚠️ Failed to send KA PO payment reminder email:', result.error);
    return false;
  }
  return true;
}
