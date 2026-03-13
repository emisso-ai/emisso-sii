import { describe, it, expect } from "vitest";
import { sendAcuseRecibo } from "../src/recepcion";
import type { DteDocument } from "../src/types";

const sampleDte: DteDocument = {
  tipoDte: "33",
  folio: 1,
  fechaEmision: "2026-03-11",
  emisor: {
    rut: "76123456-7",
    razonSocial: "Test",
    giro: "Test",
    actividadEconomica: 620200,
    direccion: "Test",
    comuna: "Test",
  },
  receptor: { rut: "12345678-9", razonSocial: "Test" },
  items: [{ nombre: "Test", cantidad: 1, precioUnitario: 1000, montoItem: 1000 }],
  montoTotal: 1190,
};

describe("recepcion", () => {
  it("sendAcuseRecibo throws not implemented", async () => {
    await expect(
      sendAcuseRecibo(sampleDte, { token: "test", expiresAt: new Date() }, {
        certPath: "./test.p12",
        certPassword: "test",
        env: "certification",
      })
    ).rejects.toThrow("Not implemented");
  });
});
