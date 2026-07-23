import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as forge from "node-forge";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { buildDteXml, applyTimbre, signDte } from "../src/dte";
import { loadCertFromBase64, sha1Digest } from "../src/cert";
import type { DteDocument } from "../src/types";
import { generateTestP12 } from "./helpers/cert";
import { generateTestCaf } from "./helpers/caf";

const SII_DTE_NS = "http://www.sii.cl/SiiDte";
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

const emisor = {
  rut: "76123456-7",
  razonSocial: "Empresa Test SpA",
  giro: "Desarrollo de Software",
  actividadEconomica: 620200,
  direccion: "Av. Providencia 1234",
  comuna: "Providencia",
};

/**
 * Factura 33 with GROSS line amounts (the SDK convention): two lines of
 * $999 gross each. Hand-verified values:
 *   montoTotal = 1998
 *   MntNeto    = round(1998 / 1.19) = round(1678.99) = 1679
 *   IVA        = 1998 - 1679        = 319
 *   net lines  = round(999 / 1.19)  = round(839.49)  = 839 each → sum 1678
 *   → last line absorbs the 1-peso rounding gap: [839, 840], sum 1679 = MntNeto
 */
const factura33: DteDocument = {
  tipoDte: "33",
  folio: 42,
  fechaEmision: "2026-03-11",
  emisor,
  receptor: {
    rut: "12345678-9",
    razonSocial: "Cliente Test Ltda.",
    giro: "Comercio",
    direccion: "Calle Ejemplo 789",
    comuna: "Santiago",
  },
  items: [
    { nombre: "Producto A", cantidad: 1, precioUnitario: 999, montoItem: 999 },
    { nombre: "Producto B", cantidad: 1, precioUnitario: 999, montoItem: 999 },
  ],
  montoTotal: 1998,
};

/**
 * Boleta 39 with gross lines. Hand-verified values:
 *   montoTotal = 5990 + 3990 = 9980
 *   MntNeto    = round(9980 / 1.19) = round(8386.55) = 8387
 *   IVA        = 9980 - 8387 = 1593
 */
const boleta39: DteDocument = {
  tipoDte: "39",
  folio: 7,
  fechaEmision: "2026-03-11",
  emisor,
  receptor: {
    rut: "66666666-6",
    razonSocial: "Consumidor Final",
  },
  items: [
    { nombre: "Polera estampada", cantidad: 1, precioUnitario: 5990, montoItem: 5990 },
    { nombre: "Gorro lana", cantidad: 1, precioUnitario: 3990, montoItem: 3990 },
  ],
  montoTotal: 9980,
};

const parser = new XMLParser({ ignoreAttributes: false });
const toArray = <T>(x: T | T[]): T[] => (Array.isArray(x) ? x : [x]);

describe("buildDteXml", () => {
  it("factura 33: net detail matches header MntNeto exactly (rounding absorbed in last line)", async () => {
    const xml = await buildDteXml(factura33);
    const parsed = parser.parse(xml);
    const documento = parsed.DTE.Documento;
    const totales = documento.Encabezado.Totales;
    const detalle = toArray(documento.Detalle);

    expect(totales.MntNeto).toBe(1679);
    expect(totales.TasaIVA).toBe(19);
    expect(totales.IVA).toBe(319);
    expect(totales.MntTotal).toBe(1998);

    const montos = detalle.map((d: any) => d.MontoItem);
    expect(montos).toEqual([839, 840]);
    // The invariant the SII actually validates:
    expect(montos.reduce((a: number, b: number) => a + b, 0)).toBe(totales.MntNeto);
    expect(totales.MntNeto + totales.IVA).toBe(totales.MntTotal);
  });

  it("factura 33: uses factura element names and Documento ID", async () => {
    const xml = await buildDteXml(factura33);
    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(xml).toContain(`<DTE version="1.0" xmlns="${SII_DTE_NS}">`);
    expect(xml).toContain(`<Documento ID="F42T33">`);
    expect(xml).toContain("<RznSoc>Empresa Test SpA</RznSoc>");
    expect(xml).toContain("<GiroEmis>Desarrollo de Software</GiroEmis>");
    expect(xml).toContain("<Acteco>620200</Acteco>");
    expect(xml).toContain("<GiroRecep>Comercio</GiroRecep>");
    expect(xml).not.toContain("<IndServicio>");
  });

  it("factura 33: exempt lines are not net-converted and MntExe is emitted", async () => {
    const doc: DteDocument = {
      ...factura33,
      items: [
        { nombre: "Afecto", cantidad: 1, precioUnitario: 1190, montoItem: 1190 },
        { nombre: "Exento", cantidad: 1, precioUnitario: 500, montoItem: 500, exento: true },
      ],
      montoExento: 500,
      montoTotal: 1690,
    };
    const xml = await buildDteXml(doc);
    const parsed = parser.parse(xml);
    const totales = parsed.DTE.Documento.Encabezado.Totales;
    const detalle = toArray(parsed.DTE.Documento.Detalle);

    // round((1690 - 500) / 1.19) = 1000
    expect(totales.MntNeto).toBe(1000);
    expect(totales.MntExe).toBe(500);
    expect(totales.IVA).toBe(190);
    expect(detalle[0].MontoItem).toBe(1000);
    expect(detalle[0].IndExe).toBeUndefined();
    expect(detalle[1].MontoItem).toBe(500);
    expect(detalle[1].IndExe).toBe(1);
  });

  it("factura 33: rejects when receptor giro/direccion/comuna are missing", async () => {
    const doc: DteDocument = {
      ...factura33,
      receptor: { rut: "12345678-9", razonSocial: "Cliente Test" },
    };
    await expect(buildDteXml(doc)).rejects.toThrow(/receptor\.giro.*direccion.*comuna/);
  });

  it("factura 33: rejects inconsistent provided totals", async () => {
    const doc: DteDocument = {
      ...factura33,
      montoNeto: 1679,
      iva: 319,
      montoTotal: 5000,
    };
    await expect(buildDteXml(doc)).rejects.toThrow(/do not add up/);
  });

  it("factura 33: rejects lines that are not consistent with gross convention", async () => {
    // montoNeto === montoItem means the caller passed NET lines: the net line
    // sum would be off by far more than rounding allows.
    const doc: DteDocument = {
      ...factura33,
      items: [{ nombre: "Servicio", cantidad: 1, precioUnitario: 500000, montoItem: 500000 }],
      montoNeto: 500000,
      iva: 95000,
      montoTotal: 595000,
    };
    await expect(buildDteXml(doc)).rejects.toThrow(/GROSS/);
  });

  it("boleta 39: detail stays gross and matches MntTotal", async () => {
    const xml = await buildDteXml(boleta39);
    const parsed = parser.parse(xml);
    const documento = parsed.DTE.Documento;
    const totales = documento.Encabezado.Totales;
    const detalle = toArray(documento.Detalle);

    expect(detalle.map((d: any) => d.MontoItem)).toEqual([5990, 3990]);
    expect(totales.MntTotal).toBe(9980);
    // Derived so MntNeto + IVA === MntTotal exactly.
    expect(totales.MntNeto).toBe(8387);
    expect(totales.IVA).toBe(1593);
    expect(totales.MntNeto + totales.IVA).toBe(totales.MntTotal);
  });

  it("boleta 39: uses boleta element names, no Acteco, no IndServicio by default", async () => {
    const xml = await buildDteXml(boleta39);
    expect(xml).toContain(`<Documento ID="F7T39">`);
    expect(xml).toContain("<RznSocEmisor>Empresa Test SpA</RznSocEmisor>");
    expect(xml).toContain("<GiroEmisor>Desarrollo de Software</GiroEmisor>");
    expect(xml).not.toContain("<RznSoc>");
    expect(xml).not.toContain("<GiroEmis>");
    expect(xml).not.toContain("<Acteco>");
    expect(xml).not.toContain("<IndServicio>");
  });

  it("boleta 39: emits IndServicio only when explicitly provided", async () => {
    const xml = await buildDteXml({ ...boleta39, indServicio: 3 });
    expect(xml).toContain("<IndServicio>3</IndServicio>");
  });

  it("escapes XML special characters in text fields", async () => {
    const xml = await buildDteXml({
      ...boleta39,
      items: [
        { nombre: "Café & <té>", cantidad: 1, precioUnitario: 9980, montoItem: 9980 },
      ],
    });
    expect(xml).toContain("<NmbItem>Café &amp; &lt;té&gt;</NmbItem>");
  });

  it("serializes referencias when provided", async () => {
    const xml = await buildDteXml({
      ...factura33,
      referencias: [
        {
          tipoDteRef: "33",
          folioRef: 10,
          fechaRef: "2026-02-01",
          codigoRef: "2",
          razonRef: "Corrige glosa",
        },
      ],
    });
    const parsed = parser.parse(xml);
    const ref = parsed.DTE.Documento.Referencia;
    expect(ref.NroLinRef).toBe(1);
    expect(ref.TpoDocRef).toBe(33);
    expect(ref.FolioRef).toBe(10);
    expect(ref.CodRef).toBe(2);
    expect(ref.RazonRef).toBe("Corrige glosa");
  });

  it("rejects unsupported DTE types", async () => {
    await expect(buildDteXml({ ...factura33, tipoDte: "61" })).rejects.toThrow(/33, 39/);
  });
});

describe("applyTimbre", () => {
  const caf = generateTestCaf({ tipoDte: "39", rangoDesde: 1, rangoHasta: 100 });

  it("produces a TED whose FRMT verifies against the CAF public key", async () => {
    const xml = await buildDteXml(boleta39);
    const stamped = await applyTimbre(xml, caf.folioRange);

    const dd = stamped.match(/<DD>[\s\S]*?<\/DD>/)?.[0];
    const frmt = stamped.match(/<FRMT algoritmo="SHA1withRSA">([^<]+)<\/FRMT>/)?.[1];
    expect(dd).toBeTruthy();
    expect(frmt).toBeTruthy();

    // Cryptographic round-trip: the FRMT signature over the compact DD block
    // must verify with the CAF's RSA public key.
    const md = forge.md.sha1.create();
    md.update(dd as string, "utf8");
    const verified = caf.publicKey.verify(md.digest().bytes(), forge.util.decode64(frmt as string));
    expect(verified).toBe(true);
  });

  it("embeds the original CAF block (with SII's FRMA) verbatim and fills DD fields", async () => {
    const xml = await buildDteXml(boleta39);
    const stamped = await applyTimbre(xml, caf.folioRange);

    const originalCafBlock = caf.cafXml.match(/<CAF[^>]*>[\s\S]*?<\/CAF>/)?.[0];
    expect(stamped).toContain(originalCafBlock as string);

    const dd = stamped.match(/<DD>[\s\S]*?<\/DD>/)?.[0] as string;
    expect(dd).toContain("<RE>76123456-7</RE>");
    expect(dd).toContain("<TD>39</TD>");
    expect(dd).toContain("<F>7</F>");
    expect(dd).toContain("<FE>2026-03-11</FE>");
    expect(dd).toContain("<RR>66666666-6</RR>");
    expect(dd).toContain("<RSR>Consumidor Final</RSR>");
    expect(dd).toContain("<MNT>9980</MNT>");
    expect(dd).toContain("<IT1>Polera estampada</IT1>");
    expect(dd).toMatch(/<TSTED>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}<\/TSTED>/);
    // TED goes inside Documento, followed by TmstFirma.
    expect(stamped).toMatch(/<\/TED><TmstFirma>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}<\/TmstFirma><\/Documento>/);
  });

  it("rejects a folio outside the CAF range", async () => {
    const xml = await buildDteXml({ ...boleta39, folio: 500 });
    await expect(applyTimbre(xml, caf.folioRange)).rejects.toThrow(/outside the CAF range/);
  });

  it("rejects a CAF for a different DTE type", async () => {
    const xml = await buildDteXml(boleta39);
    const caf33 = generateTestCaf({ tipoDte: "33" });
    await expect(applyTimbre(xml, caf33.folioRange)).rejects.toThrow(/type 33/);
  });

  it("rejects a FolioRange without cafXml (raw CAF is required for the TED)", async () => {
    const xml = await buildDteXml(boleta39);
    await expect(
      applyTimbre(xml, { ...caf.folioRange, cafXml: undefined })
    ).rejects.toThrow(/cafXml/);
  });
});

describe("signDte", () => {
  const password = "testpassword";
  const p12Base64 = generateTestP12(password);
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  let tmpDir: string;
  let certPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(testsDir, "tmp-cert-"));
    certPath = path.join(tmpDir, "test.p12");
    fs.writeFileSync(certPath, Buffer.from(p12Base64, "base64"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces an XMLDSig signature verifiable with the certificate public key", async () => {
    const xml = await buildDteXml(factura33);
    const signed = await signDte(xml, certPath, password);

    const signedInfo = signed.match(/<SignedInfo>[\s\S]*?<\/SignedInfo>/)?.[0] as string;
    const signatureValue = signed.match(/<SignatureValue>([^<]+)<\/SignatureValue>/)?.[1] as string;
    expect(signedInfo).toBeTruthy();
    expect(signatureValue).toBeTruthy();

    // Verify against the canonical SignedInfo (dsig namespace rendered).
    const canonicalSignedInfo = signedInfo.replace(
      "<SignedInfo>",
      `<SignedInfo xmlns="${DSIG_NS}">`
    );
    const md = forge.md.sha1.create();
    md.update(canonicalSignedInfo, "utf8");
    const certData = loadCertFromBase64(p12Base64, password);
    const verified = (certData.certificate.publicKey as forge.pki.rsa.PublicKey).verify(
      md.digest().bytes(),
      forge.util.decode64(signatureValue)
    );
    expect(verified).toBe(true);
  });

  it("references the Documento by ID and digests its canonical form", async () => {
    const xml = await buildDteXml(factura33);
    const signed = await signDte(xml, certPath, password);

    expect(signed).toContain(`<Reference URI="#F42T33">`);
    const digestValue = signed.match(/<DigestValue>([^<]+)<\/DigestValue>/)?.[1];
    const documento = signed.match(/<Documento ID="F42T33">[\s\S]*?<\/Documento>/)?.[0] as string;
    const canonicalDocumento = documento.replace(
      `<Documento ID="F42T33">`,
      `<Documento xmlns="${SII_DTE_NS}" ID="F42T33">`
    );
    expect(digestValue).toBe(sha1Digest(canonicalDocumento));
  });

  it("inserts the Signature as sibling of Documento inside DTE", async () => {
    const xml = await buildDteXml(factura33);
    const signed = await signDte(xml, certPath, password);
    expect(signed).toMatch(/<\/Documento><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">[\s\S]*<\/Signature><\/DTE>$/);
    expect(signed).toContain("<Modulus>");
    expect(signed).toContain("<X509Certificate>");
  });

  it("full pipeline buildDteXml → applyTimbre → signDte yields well-formed XML", async () => {
    const caf33 = generateTestCaf({ tipoDte: "33", rangoDesde: 1, rangoHasta: 100 });
    const xml = await buildDteXml(factura33);
    const stamped = await applyTimbre(xml, caf33.folioRange);
    const signed = await signDte(stamped, certPath, password);

    const parsed = parser.parse(signed);
    expect(parsed.DTE.Documento.TED).toBeDefined();
    expect(parsed.DTE.Documento.TmstFirma).toBeDefined();
    expect(parsed.DTE.Signature).toBeDefined();
    // The signature digest must cover the TED (sign AFTER stamping).
    const documento = signed.match(/<Documento ID="F42T33">[\s\S]*?<\/Documento>/)?.[0] as string;
    expect(documento).toContain("<TED version=\"1.0\">");
  });

  it("rejects XML without a Documento ID", async () => {
    await expect(signDte("<DTE><foo/></DTE>", certPath, password)).rejects.toThrow(/Documento/);
  });
});
