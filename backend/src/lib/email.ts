import { Resend } from 'resend';
import { db } from '../db/connection.js';
import { users, userData } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface NotificationSettings {
  ticktickEmail: string | null;
  priceAlerts: boolean;
  priceAlertChannel: 'ticktick' | 'email';
  washReminders: boolean;
}

const NOTIF_DEFAULTS: NotificationSettings = {
  ticktickEmail: null,
  priceAlerts: true,
  priceAlertChannel: 'ticktick',
  washReminders: true,
};

export interface AlertThreshold {
  thresholdCents: number;
  channel: 'global' | 'ticktick' | 'email';
}

export async function getOwnerNotificationSettings(
  ownerEmail: string
): Promise<NotificationSettings> {
  try {
    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ownerEmail))
      .limit(1);
    if (userRows.length === 0) return { ...NOTIF_DEFAULTS };

    const dataRows = await db
      .select({ valueJson: userData.valueJson })
      .from(userData)
      .where(and(
        eq(userData.userId, userRows[0].id),
        eq(userData.key, 'corolla-settings-v1'),
      ))
      .limit(1);
    if (dataRows.length === 0) return { ...NOTIF_DEFAULTS };

    const parsed = JSON.parse(dataRows[0].valueJson);
    const n = parsed?.notifications;
    if (!n || typeof n !== 'object') return { ...NOTIF_DEFAULTS };

    return {
      ticktickEmail:     typeof n.ticktickEmail === 'string' && n.ticktickEmail ? n.ticktickEmail : null,
      priceAlerts:       typeof n.priceAlerts   === 'boolean' ? n.priceAlerts   : true,
      priceAlertChannel: n.priceAlertChannel === 'email' ? 'email' : 'ticktick',
      washReminders:     typeof n.washReminders === 'boolean' ? n.washReminders : true,
    };
  } catch {
    return { ...NOTIF_DEFAULTS };
  }
}

export async function getOwnerAlertThresholds(
  ownerEmail: string
): Promise<Record<string, AlertThreshold>> {
  try {
    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ownerEmail))
      .limit(1);
    if (userRows.length === 0) return {};

    const dataRows = await db
      .select({ valueJson: userData.valueJson })
      .from(userData)
      .where(and(
        eq(userData.userId, userRows[0].id),
        eq(userData.key, 'corolla-price-alerts-v1'),
      ))
      .limit(1);
    if (dataRows.length === 0) return {};

    const parsed = JSON.parse(dataRows[0].valueJson);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, AlertThreshold>;
  } catch {
    return {};
  }
}

export async function sendTickTickTask(to: string, subject: string, body: string): Promise<void> {
  if (!to) return;

  await resend.emails.send({
    from:    process.env.RESEND_FROM ?? 'Corolla Detailing <sync@corolla.jhosan.top>',
    to,
    subject,
    text: body,
  });
}

export async function sendDirectEmail(to: string, subject: string, bodyText: string): Promise<void> {
  if (!to) return;

  const appUrl = process.env.APP_URL ?? 'https://corolla.jhosan.top';
  const html = `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
  <p style="font-size:14px;color:#666;margin:0 0 24px;">Corolla Detailing</p>
  <h2 style="font-size:18px;font-weight:600;margin:0 0 16px;">${subject}</h2>
  <p style="font-size:15px;color:#444;white-space:pre-line;margin:0 0 24px;">${bodyText}</p>
  <a href="${appUrl}" style="font-size:13px;color:#2d7d5a;">Open app →</a>
</div>`;

  await resend.emails.send({
    from:    process.env.RESEND_FROM ?? 'Corolla Detailing <sync@corolla.jhosan.top>',
    to,
    subject,
    html,
    text: bodyText,
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
