import { integer, text, sqliteTable, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const products = sqliteTable('products', {
  id:                    integer('id').primaryKey({ autoIncrement: true }),
  name:                  text('name').notNull().unique(),
  slug:                  text('slug').notNull().unique(),
  phase:                 integer('phase').notNull(),
  isPack:                integer('is_pack', { mode: 'boolean' }).notNull().default(false),
  // Nullable overrides for the frontend's hardcoded INVENTORY_DEFAULTS fallback — null means
  // "use the hardcoded default for this slug, if any". defaultVolumeMl sizes a fresh bottle
  // when checked off; defaultUsagePerWashMl is a fallback for the "sessions remaining" estimate
  // when no routine step references this product (the primary source is routine step ml values).
  defaultVolumeMl:       integer('default_volume_ml'),
  defaultUsagePerWashMl: integer('default_usage_per_wash_ml'),
  createdAt:             text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const retailerUrls = sqliteTable('retailer_urls', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  retailer:  text('retailer', { enum: ['bowdens', 'supercheap', 'repco', 'autopro', 'autobarn'] }).notNull(),
  url:       text('url').notNull(),
}, (t) => [
  uniqueIndex('idx_product_retailer_unique').on(t.productId, t.retailer),
]);

export const priceHistory = sqliteTable('price_history', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  productId:  integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  retailer:   text('retailer', { enum: ['bowdens', 'supercheap', 'repco', 'autopro', 'autobarn'] }).notNull(),
  priceCents: integer('price_cents').notNull(),
  onSale:     integer('on_sale', { mode: 'boolean' }).notNull().default(false),
  observedAt: text('observed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('idx_price_product_time').on(t.productId, t.observedAt),
  index('idx_price_retailer_time').on(t.retailer, t.observedAt),
]);

// componentProductId null = inline/free-text component with no product identity of its own.
// sectionCategory/sectionLabel place inline components in the Inventory category grid (mirrors
// the old BUNDLE_COMPONENTS `sectionPath` field) — slug-referenced components are placed
// wherever that product's own category assignment already puts them, so those two columns are
// only ever set for inline components.
export const packComponents = sqliteTable('pack_components', {
  id:                 integer('id').primaryKey({ autoIncrement: true }),
  packProductId:      integer('pack_product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  componentProductId: integer('component_product_id').references(() => products.id, { onDelete: 'cascade' }),
  name:               text('name').notNull(),
  volumeMl:           integer('volume_ml'),
  isEquipment:        integer('is_equipment', { mode: 'boolean' }).notNull().default(false),
  sectionCategory:    text('section_category'),
  sectionLabel:       text('section_label'),
  sortOrder:          integer('sort_order').notNull().default(0),
}, (t) => [
  index('idx_pack_components_pack').on(t.packProductId),
]);

export type Product       = typeof products.$inferSelect;
export type RetailerUrl   = typeof retailerUrls.$inferSelect;
export type PriceRecord   = typeof priceHistory.$inferSelect;
export type PackComponent = typeof packComponents.$inferSelect;

export const users = sqliteTable('users', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  email:     text('email').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const magicTokens = sqliteTable('magic_tokens', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  tokenHash: text('token_hash').notNull().unique(),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  usedAt:    text('used_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('idx_magic_token_hash').on(t.tokenHash),
]);

export const sessions = sqliteTable('sessions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().unique(),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('idx_session_id').on(t.sessionId),
]);

export const userData = sqliteTable('user_data', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key:       text('key').notNull(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex('idx_user_data_key').on(t.userId, t.key),
]);

export type User     = typeof users.$inferSelect;
export type Session  = typeof sessions.$inferSelect;
export type UserData = typeof userData.$inferSelect;

export const photos = sqliteTable('photos', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  userId:      integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  logEntryId:  integer('log_entry_id').notNull(),
  r2Key:       text('r2_key').notNull(),
  thumbKey:    text('thumb_key').notNull(),
  mimeType:    text('mime_type').notNull(),
  sizeBytes:   integer('size_bytes').notNull(),
  createdAt:   text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('idx_photos_user_entry').on(t.userId, t.logEntryId),
]);

export type Photo = typeof photos.$inferSelect;
