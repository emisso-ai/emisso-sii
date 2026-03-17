import {
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { siiSchema } from "./sii-schema.js";
import { credentials } from "./credentials.js";

export const tokenCache = siiSchema.table(
  "token_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    credentialId: uuid("credential_id")
      .notNull()
      .references(() => credentials.id, { onDelete: "cascade" }),
    tokenType: text("token_type").notNull().$type<"soap" | "portal">(),
    tokenValue: text("token_value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [unique("uq_token_cache_cred_type").on(table.credentialId, table.tokenType)],
);

export type TokenCacheEntry = typeof tokenCache.$inferSelect;
export type NewTokenCacheEntry = typeof tokenCache.$inferInsert;
