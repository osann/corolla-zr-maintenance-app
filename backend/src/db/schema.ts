import { integer, text, sqliteTable, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const products = sqliteTable('products', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  name:      text('name').notNull().unique(),
  slug:      text('slug').notNull().unique(),
  phase:     integer('phase').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
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

export type Product     = typeof products.$inferSelect;
export type RetailerUrl = typeof retailerUrls.$inferSelect;
export type PriceRecord = typeof priceHistory.$inferSelect;

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
