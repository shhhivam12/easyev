import { resolve } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname);
const LOGS_DIR = resolve(ROOT, 'data/emails');

if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

export function generateTestDriveEmailHtml({
  bookingId,
  customerName = 'Valued EV Buyer',
  vehicleName,
  location,
  formattedDate,
  formattedTime,
  customerPhone,
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your EasyEV Test Drive is Confirmed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1c14; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
    .header { background: linear-gradient(135deg, #0f291e 0%, #163b2a 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; }
    .logo span { color: #00d084; }
    .badge { display: inline-block; background: rgba(0, 208, 132, 0.2); color: #00d084; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; margin-top: 12px; }
    .content { padding: 32px 24px; }
    .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 8px; }
    .lead { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
    .booking-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .booking-id { font-size: 12px; font-weight: 700; color: #00d084; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 12px; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .detail-row:last-child { border-bottom: 0; }
    .label { color: #64748b; font-weight: 500; }
    .value { color: #0f172a; font-weight: 700; text-align: right; }
    .instructions { background: #f0fdf4; border-left: 4px solid #00d084; padding: 16px; border-radius: 4px; margin-bottom: 24px; }
    .instructions h4 { margin: 0 0 6px 0; font-size: 14px; color: #166534; }
    .instructions p { margin: 0; font-size: 13px; color: #15803d; line-height: 1.5; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; background: #fafafa; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">⚡ Easy<span>EV</span></div>
      <div class="badge">TEST DRIVE CONFIRMED</div>
      <h1 style="font-size: 22px; margin: 16px 0 0 0; color: #fff;">You're Ready to Experience the Drive!</h1>
    </div>
    <div class="content">
      <p class="greeting">Hello,</p>
      <p class="lead">Your test drive for the <strong>${vehicleName}</strong> has been successfully scheduled through EasyEV AI. Our dealer specialist is preparing your vehicle.</p>
      
      <div class="booking-box">
        <div class="booking-id">Booking Ref: ${bookingId}</div>
        <div class="detail-row">
          <span class="label">Vehicle</span>
          <span class="value">${vehicleName}</span>
        </div>
        <div class="detail-row">
          <span class="label">Date</span>
          <span class="value">${formattedDate}</span>
        </div>
        <div class="detail-row">
          <span class="label">Time</span>
          <span class="value">${formattedTime}</span>
        </div>
        <div class="detail-row">
          <span class="label">Location</span>
          <span class="value">${location}</span>
        </div>
        <div class="detail-row">
          <span class="label">Contact Phone</span>
          <span class="value">${customerPhone}</span>
        </div>
      </div>

      <div class="instructions">
        <h4>📋 What to Bring:</h4>
        <p>Please carry a valid Original Driver's License. Our team will verify your license before handing over the keys for the test drive.</p>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
        Need to reschedule or have questions? Simply visit our showroom or reply directly to this email.
      </p>
    </div>
    <div class="footer">
      EasyEV — India's Intelligent Electric Vehicle Assistant<br>
      © 2026 EasyEV Inc. All rights reserved.
    </div>
  </div>
</body>
</html>`;
}

export async function sendTestDriveConfirmationEmail({
  bookingId,
  customerEmail,
  customerPhone,
  vehicleName,
  location,
  formattedDate,
  formattedTime,
}) {
  const html = generateTestDriveEmailHtml({
    bookingId,
    vehicleName,
    location,
    formattedDate,
    formattedTime,
    customerPhone,
  });

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
  const smtpFrom = process.env.SMTP_FROM?.trim() || `EasyEV <${smtpUser}>`;

  if (smtpUser && smtpPass) {
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: smtpFrom,
        to: customerEmail,
        subject: `⚡ Test Drive Confirmed: ${vehicleName} [${bookingId}]`,
        html,
      });

      console.log(`[EmailService] SMTP email sent successfully: ${info.messageId}`);
      return { success: true, provider: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.error('[EmailService] SMTP send failed:', err?.message || err);
      // Fall through to other providers or local preview if SMTP fails
    }
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.EMAIL_FROM?.trim() || 'EasyEV <onboarding@resend.dev>';

  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [customerEmail],
          subject: `⚡ Test Drive Confirmed: ${vehicleName} [${bookingId}]`,
          html,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        console.error('[EmailService] Resend dispatch error:', body);
        return { success: false, provider: 'resend', error: body };
      }
      return { success: true, provider: 'resend', id: body.id };
    } catch (err) {
      console.error('[EmailService] Resend fetch failed:', err.message);
      return { success: false, provider: 'resend', error: err.message };
    }
  }

  // Fallback local logging simulation for development
  const localLogPath = resolve(LOGS_DIR, `${bookingId}.html`);
  writeFileSync(localLogPath, html, 'utf-8');
  console.log(`[EmailService] Local email preview written to: ${localLogPath}`);

  return {
    success: true,
    provider: 'local_preview',
    previewFile: localLogPath,
    message: 'Dispatched to local preview (Configure SMTP or RESEND_API_KEY for live sending)',
  };
}
