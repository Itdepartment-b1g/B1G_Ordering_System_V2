// @ts-nocheck
import nodemailer from 'nodemailer';

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { to, subject, html } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, or html',
      });
    }

    // Get Gmail credentials from environment variables
    const GMAIL_USERNAME = process.env.GMAIL_USERNAME;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

    if (!GMAIL_USERNAME || !GMAIL_APP_PASSWORD) {
      console.error('❌ Missing Gmail credentials in environment variables');
      return res.status(500).json({
        success: false,
        error: 'Email service not configured. Missing Gmail credentials.',
      });
    }

    // Create transporter with SMTPS (port 465) for better reliability
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user: GMAIL_USERNAME,
        pass: GMAIL_APP_PASSWORD,
      },
      connectionTimeout: 20000, // 20 seconds
      socketTimeout: 20000, // 20 seconds
      tls: {
        servername: 'smtp.gmail.com',
      },
    });

    console.log(`📧 Attempting to send email to: ${to}`);

    // Send email
    const info = await transporter.sendMail({
      from: `B1G Corporation <${GMAIL_USERNAME}>`,
      to,
      subject,
      html,
    });

    console.log(`✅ Email sent successfully: ${info.messageId}`);

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error('❌ Error sending email:', error);
    
    // Return detailed error for debugging
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to send email',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    });
  }
}

