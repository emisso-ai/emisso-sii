import { describe, it, expect } from "vitest";
import { buildDteXml } from "../src/dte";
import type { DteDocument } from "../src/types";

const sampleDte: DteDocument = {
  tipoDte: "33",
  folio: 1,
  fechaEmision: "2026-03-11",
  emisor: {
    rut: "76123456-7",
    razonSocial: "Empresa Test SpA",
    giro: "Desarrollo de Software",
    actividadEconomica: 620200,
    direccion: "Av. Providencia 1234",
    comuna: "Providencia",
  },
  receptor: {
    rut: "12345678-9",
    razonSocial: "Cliente Test",
  },
  items: [
    {
      nombre: "Servicio de Consultoría",
      cantidad: 1,
      precioUnitario: 100000,
      montoItem: 100000,
    },
  ],
  montoNeto: 100000,
  iva: 19000,
  montoTotal: 119000,
};

describe("dte", () => {
  it("buildDteXml throws not implemented", async () => {
    await expect(buildDteXml(sampleDte)).rejects.toThrow("Not implemented");
  });
});
