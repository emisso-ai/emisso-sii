import {
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { SiiEnv } from "@emisso/sii";
import { siiSchema } from "./index.js";

export const credentials = siiSchema.table(
  "credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    env: text("env").notNull().$type<SiiEnv>(),
    certBase64: text("cert_base64"),
    certPassword: text("cert_password"),
    portalRut: text("portal_rut"),
    portalPassword: text("portal_password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("uq_credentials_tenant_env").on(table.tenantId, table.env)],
);

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
