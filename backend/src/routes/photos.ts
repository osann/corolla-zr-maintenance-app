import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db } from '../db/connection.js';
import { photos } from '../db/schema.js';
import { sessionMiddleware, type AppEnv } from '../lib/auth.js';
import { uploadToR2, deleteFromR2, getPublicUrl } from '../lib/r2.js';

const router = new Hono<AppEnv>();

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

function extForMime(mime: string): string {
  if (mime === 'image/png')  return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

// POST /photos/upload
router.post('/photos/upload', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const body = await c.req.parseBody();
  const file = body['file'] as File | undefined;
  const logEntryId = Number(body['logEntryId']);

  if (!file || !ALLOWED_TYPES.has(file.type)) {
    return c.json({ error: 'Invalid file type. JPEG, PNG, or WEBP only.' }, 400);
  }
  if (!Number.isFinite(logEntryId) || logEntryId <= 0) {
    return c.json({ error: 'Invalid logEntryId.' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: 'File exceeds 10 MB limit.' }, 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = extForMime(file.type);
  const uuid = randomUUID();
  const r2Key    = `photos/${userId}/${logEntryId}/${uuid}.${ext}`;
  const thumbKey = `photos/${userId}/${logEntryId}/thumb_${uuid}.${ext}`;

  // Sharp resizes and strips EXIF automatically on any transform
  const thumbBuf = await sharp(buf)
    .resize({ width: 400, withoutEnlargement: true })
    .toBuffer();

  await Promise.all([
    uploadToR2(r2Key, buf, file.type),
    uploadToR2(thumbKey, thumbBuf, file.type),
  ]);

  const [row] = await db.insert(photos).values({
    userId,
    logEntryId,
    r2Key,
    thumbKey,
    mimeType: file.type,
    sizeBytes: file.size,
  }).returning({ id: photos.id });

  return c.json({
    id: row.id,
    thumbUrl:    getPublicUrl(thumbKey),
    originalUrl: getPublicUrl(r2Key),
  });
});

// GET /photos?logEntryIds=1,2,3
router.get('/photos', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const raw = c.req.query('logEntryIds') ?? '';
  const ids = raw.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 100);
  if (!ids.length) return c.json({});

  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.userId, userId), inArray(photos.logEntryId, ids)));

  const result: Record<number, { id: number; logEntryId: number; thumbUrl: string; originalUrl: string }[]> = {};
  for (const row of rows) {
    if (!result[row.logEntryId]) result[row.logEntryId] = [];
    result[row.logEntryId].push({
      id: row.id,
      logEntryId: row.logEntryId,
      thumbUrl:    getPublicUrl(row.thumbKey),
      originalUrl: getPublicUrl(row.r2Key),
    });
  }
  return c.json(result);
});

// DELETE /photos/:id
router.delete('/photos/:id', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid id.' }, 400);

  const [row] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, id), eq(photos.userId, userId)));

  if (!row) return c.json({ error: 'Not found.' }, 404);

  await Promise.allSettled([deleteFromR2(row.r2Key), deleteFromR2(row.thumbKey)]);
  await db.delete(photos).where(eq(photos.id, id));

  return c.json({ ok: true });
});

export default router;
