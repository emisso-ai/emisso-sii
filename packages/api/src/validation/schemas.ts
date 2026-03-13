/**
 * Zod validation schemas for HTTP inputs.
 */

import { z } from "zod";
import { SiiEnvSchema, IssueTypeSchema, DteTypeSchema } from "@emisso/sii";

// ── Credentials ──

export const SaveCredentialsSchema = z.object({
  env: SiiEnvSchema.default("production"),
  certBase64: z.string().optional(),
  certPassword: z.string().optional(),
  portalRut: z.string().optional(),
  portalPassword: z.string().optional(),
});
export type SaveCredentialsInput = z.infer<typeof SaveCredentialsSchema>;

// ── Invoice sync ──

export const SyncInvoicesSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM format"),
  type: IssueTypeSchema.default("received"),
});
export type SyncInvoicesInput = z.infer<typeof SyncInvoicesSchema>;

// ── Invoice list query ──

export const ListInvoicesQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  type: IssueTypeSchema.optional(),
  documentType: DteTypeSchema.optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// ── Sync status query ──

export const SyncStatusQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  type: IssueTypeSchema.optional(),
});
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>;
