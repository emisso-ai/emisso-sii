import { describe, it, expect } from "vitest";
import { EmisorSchema, ReceptorSchema, DteDocumentSchema, DteItemSchema } from "../src/types";

describe("EmisorSchema", () => {
  it("validates a correct emisor", () => {
    const result = EmisorSchema.safeParse({
      rut: "76123456-7",
      razonSocial: "Empresa Test SpA",
      giro: "Desarrollo de Software",
      actividadEconomica: 620200,
      direccion: "Av. Providencia 1234",
      comuna: "Providencia",
    });
    expect(result.success).toBe(true);
  });

  it("rejects emisor without required fields", () => {
    const result = EmisorSchema.safeParse({ rut: "76123456-7" });
    expect(result.success).toBe(false);
  });
});

describe("ReceptorSchema", () => {
  it("validates a minimal receptor", () => {
    const result = ReceptorSchema.safeParse({
      rut: "12345678-9",
      razonSocial: "Cliente Test",
    });
    expect(result.success).toBe(true);
  });
});

describe("DteItemSchema", () => {
  it("validates a line item", () => {
    const result = DteItemSchema.safeParse({
      nombre: "Servicio de Consultoría",
      cantidad: 1,
      precioUnitario: 100000,
      montoItem: 100000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative quantity", () => {
    const result = DteItemSchema.safeParse({
      nombre: "Test",
      cantidad: -1,
      precioUnitario: 100,
      montoItem: 100,
    });
    expect(result.success).toBe(false);
  });
});

describe("DteDocumentSchema", () => {
  it("validates a complete DTE document", () => {
    const result = DteDocumentSchema.safeParse({
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
          nombre: "Servicio",
          cantidad: 1,
          precioUnitario: 100000,
          montoItem: 100000,
        },
      ],
      montoNeto: 100000,
      iva: 19000,
      montoTotal: 119000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects DTE without items", () => {
    const result = DteDocumentSchema.safeParse({
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
      items: [],
      montoTotal: 0,
    });
    expect(result.success).toBe(false);
  });
});
