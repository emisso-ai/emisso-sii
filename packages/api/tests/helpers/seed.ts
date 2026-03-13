/**
 * Seed helpers for tests.
 */

import { randomUUID } from "node:crypto";

export const TEST_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export function makeCredential(overrides?: Record<string, unknown>) {
  return {
    id: randomUUID(),
    tenantId: TEST_TENANT_ID,
    env: "production",
    certBase64: "dGVzdA==",
    certPassword: "test123",
    portalRut: "76123456-7",
    portalPassword: "pass123",
    ...overrides,
  };
}

export function makeInvoiceRow(overrides?: Record<string, unknown>) {
  return {
    tenantId: TEST_TENANT_ID,
    documentType: "33",
    number: 1001,
    issuerRut: "76123456-7",
    issuerName: "Empresa Test",
    receiverRut: "12345678-9",
    receiverName: "Cliente Test",
    date: "2025-03-15",
    netAmount: "100000",
    exemptAmount: "0",
    vatAmount: "19000",
    totalAmount: "119000",
    taxPeriodYear: 2025,
    taxPeriodMonth: 3,
    issueType: "received",
    confirmationStatus: "REGISTRO",
    raw: { detTipoDoc: "33" },
    ...overrides,
  };
}

export function makeSyncJob(overrides?: Record<string, unknown>) {
  return {
    tenantId: TEST_TENANT_ID,
    operation: "rcv_sync",
    periodYear: 2025,
    periodMonth: 3,
    issueType: "received",
    status: "pending" as const,
    ...overrides,
  };
}
