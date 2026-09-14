import nodemailer from 'nodemailer';

/**
 * Sending email and SMS, from providers set in the server environment.
 *
 * Email: any SMTP account (Gmail, Zoho, the lab's host).
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * SMS: any HTTP gateway. SMS_API_URL may contain {to} and {message}, which are
 * filled in for a GET request; set SMS_API_METHOD=POST to send JSON
 * { to, message } instead. SMS_API_KEY, when set, is sent as a Bearer token.
 */
export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function smsConfigured() {
  return Boolean(process.env.SMS_API_URL);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}) {
  if (!emailConfigured()) throw new Error('Email is not set up. Add SMTP_HOST, SMTP_USER and SMTP_PASS to the server environment.');
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
  });
}

/** 03001234567 → 923001234567, which gateways in Pakistan expect. */
export function internationalMobile(mobile: string) {
  const d = mobile.replace(/\D/g, '');
  return d.startsWith('0') ? `92${d.slice(1)}` : d;
}

export async function sendSms(mobile: string, message: string) {
  const url = process.env.SMS_API_URL;
  if (!url) throw new Error('SMS is not set up. Add SMS_API_URL to the server environment.');
  const to = internationalMobile(mobile);
  const headers: Record<string, string> = {};
  if (process.env.SMS_API_KEY) headers.Authorization = `Bearer ${process.env.SMS_API_KEY}`;
  const post = (process.env.SMS_API_METHOD || 'GET').toUpperCase() === 'POST';
  const res = post
    ? await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ to, message }), signal: AbortSignal.timeout(10_000) })
    : await fetch(url.replace('{to}', encodeURIComponent(to)).replace('{message}', encodeURIComponent(message)), { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`The SMS gateway refused the message (${res.status}).`);
}
