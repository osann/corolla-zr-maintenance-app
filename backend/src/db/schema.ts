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
  retailer:  text('retailer', { enum: ['bowdens', 'supercheap', 'repco', 'autopro'] }).notNull(),
  url:       text('url').notNull(),
}, (t) => [
  uniqueIndex('idx_product_retailer_unique').on(t.productId, t.retailer),
]);

export const priceHistory = sqliteTable('price_history', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  productId:  integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  retailer:   text('retailer', { enum: ['bowdens', 'supercheap', 'repco', 'autopro'] }).notNull(),
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
