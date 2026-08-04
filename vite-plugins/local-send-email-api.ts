import type { Plugin, Connect } from 'vite';
import { loadEnv } from 'vite';
import nodemailer from 'nodemailer';

function readJsonBody(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function logEmailDetails(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  messageId?: string;
  status?: 'sending' | 'sent' | 'failed';
  error?: string;
}) {
  const { to, subject, html, from, messageId, status = 'sending', error } = params;
  const title =
    status === 'sent' ? 'EMAIL SENT' : status === 'failed' ? 'EMAIL FAILED' : 'EMAIL DETAILS';

  console.log('');
  console.log('==========');
  console.log(title);
  console.log('==========');
  console.log(`To:        ${to}`);
  console.log(`Subject:   ${subject}`);
  if (from) console.log(`From:      ${from}`);
  if (messageId) console.log(`MessageId: ${messageId}`);
  if (error) console.log(`Error:     ${error}`);
  console.log('HTML:');
  console.log(html);
  console.log('==========');
  console.log('');
}

/**
 * Serves POST /api/send-email during `vite` / `npm run dev`.
 * Vercel production still uses api/send-email.ts; this only fills the local gap.
 */
export function localSendEmailApi(): Plugin {
  return {
    name: 'local-send-email-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (url !== '/api/send-email') {
          next();
          return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
          return;
        }

        let emailPayload: { to: string; subject: string; html: string; from?: string } | null = null;

        try {
          const body = (await readJsonBody(req)) as {
            to?: string;
            subject?: string;
            html?: string;
          };
          const { to, subject, html } = body;

          if (!to || !subject || !html) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: false,
                error: 'Missing required fields: to, subject, or html',
              })
            );
            return;
          }

          const GMAIL_USERNAME = process.env.GMAIL_USERNAME;
          const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

          if (!GMAIL_USERNAME || !GMAIL_APP_PASSWORD) {
            console.error('❌ Missing Gmail credentials in environment variables');
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: false,
                error: 'Email service not configured. Missing Gmail credentials.',
              })
            );
            return;
          }

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

          const fromAddress = `NoReply <${GMAIL_USERNAME}>`;
          emailPayload = { to, subject, html, from: fromAddress };

          const info = await transporter.sendMail({
            from: fromAddress,
            to,
            subject,
            html,
          });

          logEmailDetails({
            ...emailPayload,
            messageId: info.messageId,
            status: 'sent',
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: true,
              message: 'Email sent successfully',
              messageId: info.messageId,
            })
          );
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Failed to send email';
          if (emailPayload) {
            logEmailDetails({
              ...emailPayload,
              status: 'failed',
              error: message,
            });
          }
          console.error('❌ Error sending email:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: message }));
        }
      });
    },
  };
}
