import nodemailer from 'nodemailer';

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_TO);
}

export async function sendReport({ subject, html, attachments }) {
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const to = process.env.MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean);
  const cc = (process.env.MAIL_CC || '').split(',').map((s) => s.trim()).filter(Boolean);
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    cc: cc.length ? cc : undefined,
    subject,
    html,
    attachments,
  });
  return { messageId: info.messageId, to: [...to, ...cc] };
}
