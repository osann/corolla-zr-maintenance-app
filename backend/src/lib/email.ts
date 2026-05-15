import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMagicLink(to: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? 'https://corolla.jhosan.top';
  const link   = `${appUrl}?token=${token}`;
  await resend.emails.send({
    from:    process.env.RESEND_FROM ?? 'Corolla Detailing <sync@corolla.jhosan.top>',
    to,
    subject: 'Sign in to Corolla Detailing',
    html:    `<p>Your sign-in link (expires in 15 minutes, one-time use):</p><p><a href="${link}">Sign in →</a></p><p style="color:#888;font-size:13px">If you didn't request this, ignore it.</p>`,
    text:    `Sign in: ${link}\n\nExpires in 15 minutes. If you didn't request this, ignore it.`,
  });
}
