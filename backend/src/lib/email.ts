import { Resend } from 'resend';
import { db } from '../db/connection.js';
import { users, userData } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface NotificationSettings {
  ticktickEmail: string | null;
  ticktickAlerts: boolean;
  ticktickMetadata: string;
  emailAlerts: boolean;
  washReminders: boolean;
  emailWashReminders: boolean;
  emailDigest: boolean;
}

const NOTIF_DEFAULTS: NotificationSettings = {
  ticktickEmail: null,
  ticktickAlerts: true,
  ticktickMetadata: '^Car #Corolla today',
  emailAlerts: false,
  washReminders: true,
  emailWashReminders: false,
  emailDigest: false,
};

export interface DigestSaleItem {
  name: string;
  retailer: string;
  priceCents: number;
}

export interface DigestThresholdItem {
  name: string;
  retailer: string;
  priceCents: number;
  thresholdCents: number;
}

const RETAILER_DISPLAY: Record<string, string> = {
  bowdens: "Bowden's Own",
  autobarn: 'Auto Barn',
  repco: 'Repco',
  supercheap: 'Supercheap Auto',
  autopro: 'Autopro',
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
      ticktickEmail:    typeof n.ticktickEmail === 'string' && n.ticktickEmail ? n.ticktickEmail : null,
      ticktickAlerts:   typeof n.ticktickAlerts  === 'boolean' ? n.ticktickAlerts  : true,
      ticktickMetadata:    typeof n.ticktickMetadata    === 'string'  ? n.ticktickMetadata    : '^Car #Corolla today',
      emailAlerts:         typeof n.emailAlerts         === 'boolean' ? n.emailAlerts         : false,
      washReminders:       typeof n.washReminders       === 'boolean' ? n.washReminders       : true,
      emailWashReminders:  typeof n.emailWashReminders  === 'boolean' ? n.emailWashReminders  : false,
      emailDigest:         typeof n.emailDigest         === 'boolean' ? n.emailDigest         : false,
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

export async function sendDigestEmail(
  to: string,
  saleItems: DigestSaleItem[],
  thresholdItems: DigestThresholdItem[],
): Promise<void> {
  if (!to || (saleItems.length === 0 && thresholdItems.length === 0)) return;

  const appUrl = process.env.APP_URL ?? 'https://corolla.jhosan.top';
  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney',
  });

  const sectionHead = (title: string) =>
    `<p style="font-size:11px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:#2d7d5a;margin:28px 0 0;padding-bottom:6px;border-bottom:2px solid #2d7d5a;">${title}</p>`;

  const rowStyle = 'padding:10px 0;border-bottom:1px solid #f0ece4;overflow:hidden;';

  const saleRow = (item: DigestSaleItem) =>
    `<div style="${rowStyle}">
      <span style="float:right;font-size:14px;font-weight:600;color:#2d7d5a;">$${(item.priceCents / 100).toFixed(2)}</span>
      <span style="font-size:14px;font-weight:500;color:#1a1a1a;">${item.name}</span>
      <span style="font-size:12px;color:#999;"> · ${RETAILER_DISPLAY[item.retailer] ?? item.retailer}</span>
    </div>`;

  const thresholdRow = (item: DigestThresholdItem) =>
    `<div style="${rowStyle}">
      <span style="float:right;text-align:right;font-size:14px;font-weight:600;color:#2d7d5a;">$${(item.priceCents / 100).toFixed(2)}<br>
        <span style="font-size:11px;font-weight:400;color:#aaa;">threshold $${(item.thresholdCents / 100).toFixed(2)}</span>
      </span>
      <span style="font-size:14px;font-weight:500;color:#1a1a1a;">${item.name}</span>
      <span style="font-size:12px;color:#999;"> · ${RETAILER_DISPLAY[item.retailer] ?? item.retailer}</span>
    </div>`;

  let sectionsHtml = '';
  if (saleItems.length > 0) sectionsHtml += sectionHead('On sale now') + saleItems.map(saleRow).join('');
  if (thresholdItems.length > 0) sectionsHtml += sectionHead('Below your thresholds') + thresholdItems.map(thresholdRow).join('');

  const total = saleItems.length + thresholdItems.length;
  const subject = `🏷️ ${total} price alert${total === 1 ? '' : 's'} — ${today}`;

  const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#ffffff;">
  <p style="font-size:13px;color:#999;margin:0 0 24px;letter-spacing:0.02em;">Corolla Detailing</p>
  <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:400;margin:0 0 4px;color:#1a1a1a;">Daily price digest</h2>
  <p style="font-size:13px;color:#999;margin:0 0 4px;">${today}</p>
  ${sectionsHtml}
  <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #f0ece4;">
    <a href="${appUrl}" style="font-size:13px;color:#2d7d5a;text-decoration:none;">Open app →</a>
  </p>
</div>`;

  const textLines = [
    'Corolla Detailing — Daily price digest',
    today,
    '',
    ...(saleItems.length > 0 ? [
      'ON SALE NOW',
      ...saleItems.map(i => `${i.name} (${RETAILER_DISPLAY[i.retailer] ?? i.retailer}): $${(i.priceCents / 100).toFixed(2)}`),
      '',
    ] : []),
    ...(thresholdItems.length > 0 ? [
      'BELOW YOUR THRESHOLDS',
      ...thresholdItems.map(i => `${i.name} (${RETAILER_DISPLAY[i.retailer] ?? i.retailer}): $${(i.priceCents / 100).toFixed(2)} (threshold $${(i.thresholdCents / 100).toFixed(2)})`),
      '',
    ] : []),
    appUrl,
  ];

  await resend.emails.send({
    from: process.env.RESEND_FROM ?? 'Corolla Detailing <sync@corolla.jhosan.top>',
    to,
    subject,
    html,
    text: textLines.join('\n'),
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
