/**
 * Basic example: Authenticate with SII and issue a Factura Electronica (type 33).
 *
 * Prerequisites:
 * - A valid .p12 digital certificate from SII
 * - CAF (folio authorization) file for the DTE type
 * - Environment variables configured (see .env.example)
 */

import {
  authenticate,
  buildDteXml,
  signDte,
  uploadDte,
  queryUploadStatus,
  loadConfigFromEnv,
  type DteDocument,
} from "@emisso/sii";

async function main() {
  // 1. Load configuration from environment
  const config = loadConfigFromEnv();

  // 2. Authenticate with SII
  const token = await authenticate(config);
  console.log("Authenticated with SII, token expires:", token.expiresAt);

  // 3. Build the DTE document
  const document: DteDocument = {
    tipoDte: "33", // Factura Electronica
    folio: 1,
    fechaEmision: new Date().toISOString().split("T")[0],
    emisor: {
      rut: "76123456-7",
      razonSocial: "Mi Empresa SpA",
      giro: "Desarrollo de Software",
      actividadEconomica: 620200,
      direccion: "Av. Providencia 1234, Of. 56",
      comuna: "Providencia",
    },
    receptor: {
      rut: "12345678-9",
      razonSocial: "Cliente Ejemplo Ltda.",
      giro: "Comercio",
      direccion: "Calle Ejemplo 789",
      comuna: "Santiago",
    },
    items: [
      {
        nombre: "Servicio de Consultoría en Software",
        cantidad: 10,
        precioUnitario: 50000,
        montoItem: 500000,
      },
    ],
    montoNeto: 500000,
    iva: 95000,
    montoTotal: 595000,
  };

  // 4. Build XML
  const xml = await buildDteXml(document);
  console.log("DTE XML built successfully");

  // 5. Sign the DTE
  const signedXml = await signDte(xml, config.certPath, config.certPassword);
  console.log("DTE signed successfully");

  // 6. Upload to SII
  const uploadResponse = await uploadDte(signedXml, token, config);
  console.log("DTE uploaded, trackId:", uploadResponse.trackId);

  // 7. Check status (poll after a few seconds in real usage)
  const status = await queryUploadStatus(uploadResponse.trackId, token, config);
  console.log("DTE status:", status.status, "-", status.glosa);
}

main().catch(console.error);
