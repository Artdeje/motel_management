import nodemailer from 'nodemailer';
import { getCmsSetting } from '../db/database';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user: string;
  pass: string;
}

function getSmtpConfig(): SmtpConfig {
  // Support both SMTP_* and MAIL_* naming conventions
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '587', 10);
  const user = process.env.SMTP_USER || process.env.MAIL_USERNAME || process.env.MAIL_USER || '';
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.MAIL_PASSWORD || process.env.MAIL_PASS || '';

  if (!user || !pass) {
    throw new Error('SMTP credentials not configured (SMTP_USER/SMTP_PASS or MAIL_USERNAME/MAIL_PASSWORD)');
  }

  // Provider-specific defaults for reliable deployed delivery
  const isResend = host.includes('resend.com');
  const isSendGrid = host.includes('sendgrid.net') || host.includes('sendgrid.com');
  const isBrevo = host.includes('brevo.com') || host.includes('sendinblue.com');

  return {
    host,
    port,
    secure: isResend || isSendGrid || isBrevo ? false : port === 465,
    requireTLS: port === 587,
    user,
    pass,
  };
}

function getTransporter() {
  const cfg = getSmtpConfig();

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: cfg.requireTLS,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: process.env.SMTP_DEBUG === 'true',
    debug: process.env.SMTP_DEBUG === 'true',
    // Some providers (Resend/SendGrid) need a slightly longer timeout on cloud hosts
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}

function getFromAddress(siteTitle: string): string {
  const user = process.env.SMTP_USER || process.env.MAIL_USERNAME || process.env.MAIL_USER;
  const from = process.env.SMTP_FROM || process.env.MAIL_FROM;
  const fromName = process.env.SMTP_FROM_NAME || process.env.MAIL_FROM_NAME;

  if (from) return from;
  if (fromName && user) return `"${fromName}" <${user}>`;
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

  const text = `${siteTitle}\n\n${actionText}\n\nVerification Code: ${otpCode}\n\nThis code expires in 5 minutes.`;

  try {
    const transporter = getTransporter();
    const from = getFromAddress(siteTitle);

    const host = process.env.SMTP_HOST || process.env.MAIL_HOST || 'smtp.gmail.com';
    console.log(`[SMTP] Sending ${purpose} OTP to ${to} via ${host} from ${from}`);

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    console.log(`[SMTP] OTP email sent successfully to ${to} — messageId: ${info.messageId}`);
    return true;
  } catch (err: any) {
    console.error(`[SMTP] FAILED to send OTP to ${to}:`, err.message || err);
    if (err.code) console.error('[SMTP] Error code:', err.code);
    if (err.command) console.error('[SMTP] Failed command:', err.command);
    if (err.response) console.error('[SMTP] Server response:', err.response);
    return false;
  }
}

export async function verifySmtpConnection(): Promise<{ ok: boolean; message: string; provider: string }> {
  try {
    const cfg = getSmtpConfig();
    const transporter = getTransporter();
    await transporter.verify();
    return {
      ok: true,
      message: `Connected to ${cfg.host}:${cfg.port} as ${cfg.user}`,
      provider: cfg.host,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err.message || 'Unknown SMTP error',
      provider: process.env.SMTP_HOST || 'unknown',
    };
  }
}
