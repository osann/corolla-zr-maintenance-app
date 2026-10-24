import { Resend } from 'resend';
import { db } from '../db/connection.js';
import { users, userData } from '../db/schema.js';
import { and, eq, isNotNull } from 'drizzle-orm';
import { isTickTickConnected } from './ticktick.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface NotificationSettings {
  ticktickConnected: boolean;
  saleAlerts: boolean;
  thresholdAlerts: boolean;
  ticktickAlerts: boolean;
  ticktickProjectId: string | null;
  ticktickTags: string[];
  ticktickPriority: 0 | 1 | 3 | 5;
  emailAlerts: boolean;
  washReminders: boolean;
  emailWashReminders: boolean;
  emailDigest: boolean;
}

const NOTIF_DEFAULTS: NotificationSettings = {
  ticktickConnected: false,
  saleAlerts: true,
  thresholdAlerts: true,
  ticktickAlerts: true,
  ticktickProjectId: null,
  ticktickTags: [],
  ticktickPriority: 0,
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
  autobarn: 'Auto Barn',
  supercheap: 'Supercheap Auto',
};

export interface AlertThreshold {
  thresholdCents: number;
  channel: 'global' | 'ticktick' | 'email';
}

// Someone who can receive notifications: any user who has signed in at least once (an invite that
// hasn't been accepted yet gets nothing).
export interface NotificationRecipient {
  userId: number;
  email: string;
  settings: NotificationSettings;
  thresholds: Record<string, AlertThreshold>;
}

export async function getNotificationRecipients(): Promise<NotificationRecipient[]> {
  const joined = await db.select({ id: users.id, email: users.email }).from(users).where(isNotNull(users.joinedAt));
  return Promise.all(
    joined.map(async ({ id, email }) => ({
      userId: id,
      email,
      settings: await getNotificationSettings(id),
      thresholds: await getAlertThresholds(id),
    })),
  );
}

export async function getNotificationSettings(userId: number): Promise<NotificationSettings> {
  try {
    const dataRows = await db
      .select({ valueJson: userData.valueJson })
      .from(userData)
      .where(and(eq(userData.userId, userId), eq(userData.key, 'corolla-settings-v1')))
      .limit(1);
    if (dataRows.length === 0) return { ...NOTIF_DEFAULTS };

    const parsed = JSON.parse(dataRows[0].valueJson);
    const n = parsed?.notifications;
    const connected = await isTickTickConnected(userId);

    if (!n || typeof n !== 'object') return { ...NOTIF_DEFAULTS, ticktickConnected: connected };

    return {
      ticktickConnected: connected,
      saleAlerts: typeof n.saleAlerts === 'boolean' ? n.saleAlerts : true,
      thresholdAlerts: typeof n.thresholdAlerts === 'boolean' ? n.thresholdAlerts : true,
      ticktickAlerts: typeof n.ticktickAlerts === 'boolean' ? n.ticktickAlerts : true,
      ticktickProjectId: typeof n.ticktickProjectId === 'string' ? n.ticktickProjectId : null,
      ticktickTags: Array.isArray(n.ticktickTags) ? n.ticktickTags : [],
      ticktickPriority: [0, 1, 3, 5].includes(n.ticktickPriority) ? n.ticktickPriority : 0,
      emailAlerts: typeof n.emailAlerts === 'boolean' ? n.emailAlerts : false,
      washReminders: typeof n.washReminders === 'boolean' ? n.washReminders : true,
      emailWashReminders: typeof n.emailWashReminders === 'boolean' ? n.emailWashReminders : false,
      emailDigest: typeof n.emailDigest === 'boolean' ? n.emailDigest : false,
    };
  } catch {
    return { ...NOTIF_DEFAULTS };
  }
}

export async function getAlertThresholds(userId: number): Promise<Record<string, AlertThreshold>> {
  try {
    const dataRows = await db
      .select({ valueJson: userData.valueJson })
      .from(userData)
      .where(and(eq(userData.userId, userId), eq(userData.key, 'corolla-price-alerts-v1')))
      .limit(1);
    if (dataRows.length === 0) return {};

    const parsed = JSON.parse(dataRows[0].valueJson);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, AlertThreshold>;
  } catch {
    return {};
  }
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
    from: process.env.RESEND_FROM ?? 'Corolla Detailing <sync@corolla.jhosan.top>',
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
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Australia/Sydney',
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
  if (thresholdItems.length > 0)
    sectionsHtml += sectionHead('Below your thresholds') + thresholdItems.map(thresholdRow).join('');

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
    ...(saleItems.length > 0
      ? [
          'ON SALE NOW',
          ...saleItems.map(
            (i) => `${i.name} (${RETAILER_DISPLAY[i.retailer] ?? i.retailer}): $${(i.priceCents / 100).toFixed(2)}`,
          ),
          '',
        ]
      : []),
    ...(thresholdItems.length > 0
      ? [
          'BELOW YOUR THRESHOLDS',
          ...thresholdItems.map(
            (i) =>
              `${i.name} (${RETAILER_DISPLAY[i.retailer] ?? i.retailer}): $${(i.priceCents / 100).toFixed(2)} (threshold $${(i.thresholdCents / 100).toFixed(2)})`,
          ),
          '',
        ]
      : []),
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

// The app URL that signs someone in with a magic-link or invite token (checkAuthAndSync() picks
// up ?token=).
export function signInLink(token: string): string {
  const appUrl = process.env.APP_URL ?? 'https://corolla.jhosan.top';
  return `${appUrl}?token=${token}`;
}

// Sign-in and invite emails share this layout: a heading, one paragraph and a button.
function sendLinkEmail(
  to: string,
  email: {
    subject: string;
    heading: string;
    body: string;
    button: string;
    footnote: string;
    link: string;
    text: string;
  },
) {
  return resend.emails.send({
    from: process.env.RESEND_FROM ?? 'Corolla Detailing <sync@corolla.jhosan.top>',
    to,
    subject: email.subject,
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
  <p style="font-size:14px;color:#666;margin:0 0 24px;">Corolla Detailing</p>
  <h2 style="font-size:20px;font-weight:600;margin:0 0 12px;">${email.heading}</h2>
  <p style="font-size:15px;color:#444;margin:0 0 24px;">${email.body}</p>
  <a href="${email.link}" style="display:inline-block;background:#2d7d5a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:500;">${email.button} →</a>
  <p style="font-size:13px;color:#999;margin:32px 0 0;">${email.footnote}<br>Link: ${email.link}</p>
</div>`,
    text: email.text,
  });
}

export async function sendMagicLink(to: string, token: string): Promise<void> {
  const link = signInLink(token);
  await sendLinkEmail(to, {
    subject: 'Sign in to Corolla Detailing',
    heading: 'Sign in',
    body: 'Click the button below to sign in. This link expires in 15 minutes and can only be used once.',
    button: 'Sign in',
    footnote: "If you didn't request this, you can safely ignore it.",
    link,
    text: `Sign in to Corolla Detailing\n\n${link}\n\nExpires in 15 minutes, one-time use. If you didn't request this, ignore it.`,
  });
}

export const INVITE_DAYS = 7;

// Throws if Resend rejects the email (it reports errors in its result instead of throwing), so the
// admin can be told to share the link another way.
export async function sendInvite(to: string, token: string): Promise<void> {
  const link = signInLink(token);
  const { error } = await sendLinkEmail(to, {
    subject: "You're invited to Corolla Detailing",
    heading: "You're invited",
    body: `You've been invited to Corolla Detailing, a car-care log and kit guide. Click the button below to set up your account. The link expires in ${INVITE_DAYS} days and can only be used once. After that, sign in from the app with this email address.`,
    button: 'Accept invite',
    footnote: "If you weren't expecting this, you can ignore it.",
    link,
    text: `You're invited to Corolla Detailing\n\nSet up your account: ${link}\n\nExpires in ${INVITE_DAYS} days, one-time use. After that, sign in from the app with this email address.`,
  });
  if (error) throw new Error(`Resend rejected the invite: ${error.message}`);
}
