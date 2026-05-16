import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendTickTickTask(subject: string, body: string): Promise<void> {
  const to = process.env.TICKTICK_EMAIL;
  if (!to) return;

  await resend.emails.send({
    from:    process.env.RESEND_FROM ?? 'Corolla Detailing <sync@corolla.jhosan.top>',
    to,
    subject,
    text: body,
  });
}

export async function sendMagicLink(to: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? 'https://corolla.jhosan.top';
  const link   = `${appUrl}?token=${token}`;
  await resend.emails.send({
    from:    process.env.RESEND_FROM ?? 'Corolla Detailing <sync@corolla.jhosan.top>',
    to,
    subject: 'Sign in to Corolla Detailing',
    html:    `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
  <p style="font-size:14px;color:#666;margin:0 0 24px;">Corolla Detailing</p>
  <h2 style="font-size:20px;font-weight:600;margin:0 0 12px;">Sign in</h2>
  <p style="font-size:15px;color:#444;margin:0 0 24px;">Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
  <a href="${link}" style="display:inline-block;background:#2d7d5a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:500;">Sign in →</a>
  <p style="font-size:13px;color:#999;margin:32px 0 0;">If you didn't request this, you can safely ignore it.<br>Link: ${link}</p>
</div>`,
    text:    `Sign in to Corolla Detailing\n\n${link}\n\nExpires in 15 minutes, one-time use. If you didn't request this, ignore it.`,
  });
}
