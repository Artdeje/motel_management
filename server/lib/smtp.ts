import nodemailer from 'nodemailer';
import { getCmsSetting } from '../db/database';

function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP credentials not configured in .env (SMTP_USER / SMTP_PASS)');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    requireTLS: true,
    auth: { user, pass },
    logger: true,
    debug: false,
  });
}

function getFromAddress(siteTitle: string): string {
  const user = process.env.SMTP_USER;
  return `"${siteTitle}" <${user}>`;
}

export async function sendOtpEmail(to: string, otpCode: string, purpose: 'login' | 'password_reset'): Promise<boolean> {
  const siteTitle = await getCmsSetting('site_title', 'Grand Horizon Motel & Bistro');
  const logoText = await getCmsSetting('logo_text', 'GH');
  const shortName = siteTitle.split(' ').slice(0, -2).join(' ') || siteTitle;

  const subject = purpose === 'login'
    ? `${shortName} - Your Login Verification Code`
    : `${shortName} - Password Reset Code`;

  const actionText = purpose === 'login'
    ? 'Use the code below to complete your login'
    : 'Use the code below to reset your password';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f172a; border-radius: 16px; color: #e2e8f0;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 56px; height: 56px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 14px; line-height: 56px; font-size: 24px; font-weight: bold; color: #0f172a;">${logoText}</div>
      </div>
      <h2 style="text-align: center; color: #f8fafc; margin: 0 0 8px;">${siteTitle}</h2>
      <p style="text-align: center; color: #94a3b8; margin: 0 0 32px; font-size: 14px;">
        ${actionText}
      </p>
      <div style="background: #1e293b; border-radius: 12px; padding: 24px; text-align: center; border: 1px solid #334155;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 2px;">Verification Code</p>
        <p style="font-size: 36px; font-weight: bold; color: #f59e0b; margin: 0; letter-spacing: 8px; font-family: monospace;">${otpCode}</p>
      </div>
      <p style="text-align: center; color: #64748b; font-size: 12px; margin: 24px 0 0;">
        This code expires in 5 minutes. If you didn't request this, please ignore this email.
      </p>
    </div>
  `;

  try {
    const transporter = getTransporter();
    const from = getFromAddress(siteTitle);

    console.log(`[SMTP] Sending ${purpose} OTP to ${to} from ${from}`);

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    console.log(`[SMTP] OTP email sent successfully to ${to} — messageId: ${info.messageId}`);
    return true;
  } catch (err: any) {
    console.error(`[SMTP] FAILED to send OTP to ${to}:`, err.message || err);
    if (err.code) console.error('[SMTP] Error code:', err.code);
    if (err.command) console.error('[SMTP] Failed command:', err.command);
    return false;
  }
}
