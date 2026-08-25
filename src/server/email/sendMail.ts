/**
 * Shared server-side Gmail send (Nodemailer).
 * Used by cron + immediate KA payment reminders so we don't HTTP-loop to /api/send-email.
 */
export async function sendMail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const to = params.to?.trim();
  const subject = params.subject?.trim();
  const html = params.html;

  if (!to || !subject || !html) {
    return { ok: false, error: 'Missing required fields: to, subject, or html' };
  }

  const GMAIL_USERNAME = process.env.GMAIL_USERNAME;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

  if (!GMAIL_USERNAME || !GMAIL_APP_PASSWORD) {
    console.error('❌ Missing Gmail credentials in environment variables');
    return { ok: false, error: 'Email service not configured. Missing Gmail credentials.' };
  }

  try {
    // Dynamic import keeps vite/browser bundles from pulling nodemailer when unused.
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USERNAME,
        pass: GMAIL_APP_PASSWORD,
      },
      connectionTimeout: 20000,
      socketTimeout: 20000,
      tls: {
        servername: 'smtp.gmail.com',
      },
    });

    console.log(`📧 Attempting to send email to: ${to}`);
    const info = await transporter.sendMail({
      from: `NoReply <${GMAIL_USERNAME}>`,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent successfully: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send email';
    console.error('❌ Error sending email:', error);
    return { ok: false, error: message };
  }
}

/** Public app origin for email deep links (PO view URLs). */
export function resolveAppBaseUrl(fallbackHost?: {
  host?: string;
  proto?: string;
}): string {
  const explicit =
    process.env.APP_URL?.trim() ||
    process.env.VITE_APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, '');
    return `https://${host}`;
  }

  const host = fallbackHost?.host?.trim();
  const proto = (fallbackHost?.proto || 'http').trim();
  if (host) return `${proto}://${host}`.replace(/\/$/, '');

  return 'http://localhost:8080';
}
