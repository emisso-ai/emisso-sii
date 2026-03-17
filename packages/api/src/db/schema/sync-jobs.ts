import {
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { IssueType } from "@emisso/sii";
import { siiSchema } from "./sii-schema.js";

export type SyncJobStatus = "pending" | "running" | "completed" | "failed";

export const syncJobs = siiSchema.table("sync_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  operation: text("operation").notNull().$type<"rcv_sync">(),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(),
  issueType: text("issue_type").notNull().$type<IssueType>(),
  status: text("status").notNull().default("pending").$type<SyncJobStatus>(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  recordsFetched: integer("records_fetched"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SyncJob = typeof syncJobs.$inferSelect;
export type NewSyncJob = typeof syncJobs.$inferInsert;
