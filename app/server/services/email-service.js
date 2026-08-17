import nodemailer from "nodemailer";
import { config } from "../config.js";

let transporter;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function transport() {
  if (transporter) return transporter;
  if (!config.smtp.host) {
    const error = new Error("SMTP is not configured.");
    error.code = "SMTP_NOT_CONFIGURED";
    throw error;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth:
      config.smtp.user && config.smtp.password
        ? { user: config.smtp.user, pass: config.smtp.password }
        : undefined,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    tls: { rejectUnauthorized: true },
  });
  return transporter;
}

function layout(title, greeting, body, buttonLabel, url, footer) {
  const safeUrl = escapeHtml(url);
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#09090b;color:#f4f4f5;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#09090b;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px">
        <tr><td style="color:#f59e0b;font-weight:700;font-size:14px;letter-spacing:.12em;text-transform:uppercase">CineAssemble</td></tr>
        <tr><td><h1 style="font-size:28px;line-height:1.2;margin:18px 0;color:#ffffff">${escapeHtml(title)}</h1></td></tr>
        <tr><td><p style="font-size:16px;line-height:1.7;color:#d4d4d8">${escapeHtml(greeting)}</p></td></tr>
        <tr><td><p style="font-size:16px;line-height:1.7;color:#d4d4d8">${escapeHtml(body)}</p></td></tr>
        <tr><td style="padding:18px 0"><a href="${safeUrl}" style="display:inline-block;background:#f59e0b;color:#18181b;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">${escapeHtml(buttonLabel)}</a></td></tr>
        <tr><td><p style="font-size:13px;line-height:1.6;color:#a1a1aa;word-break:break-all">If the button does not work, copy this address:<br>${safeUrl}</p></td></tr>
        <tr><td><p style="font-size:13px;line-height:1.6;color:#71717a;margin-top:24px">${escapeHtml(footer)}</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return html;
}

function render(email) {
  const name = String(email.payload.displayName || "there");
  if (email.template === "verify_email") {
    const url = email.payload.verificationUrl;
    return {
      text: `Hello ${name},\n\nVerify your CineAssemble account: ${url}\n\nThis link expires in ${email.payload.expiresHours} hours. If you did not create this account, ignore this email.`,
      html: layout(
        "Verify your account",
        `Hello ${name},`,
        "Verify your email to activate your secure film workspace.",
        "Verify email",
        url,
        `This single-use link expires in ${email.payload.expiresHours} hours. If you did not create this account, ignore this message.`,
      ),
    };
  }
  if (email.template === "reset_password") {
    const url = email.payload.resetUrl;
    return {
      text: `Hello ${name},\n\nReset your CineAssemble password: ${url}\n\nThis link expires in ${email.payload.expiresMinutes} minutes. If you did not request a reset, ignore this email.`,
      html: layout(
        "Reset your password",
        `Hello ${name},`,
        "Use this secure single-use link to choose a new password.",
        "Reset password",
        url,
        `This link expires in ${email.payload.expiresMinutes} minutes. If you did not request a reset, ignore this message.`,
      ),
    };
  }
  throw new Error(`Unknown email template: ${email.template}`);
}

export async function sendOutboxEmail(email) {
  const message = render(email);
  await transport().sendMail({
    from: config.smtp.from,
    to: email.recipient,
    subject: email.subject,
    text: message.text,
    html: message.html,
  });
}

export function emailDeliveryConfigured() {
  return Boolean(config.smtp.host);
}
