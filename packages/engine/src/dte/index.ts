import * as forge from "node-forge";
import type { DteDocument, FolioRange, SiiConfig, SiiUploadResponse } from "../types";
import { DteDocumentSchema } from "../types";
import type { SiiToken } from "../auth";
import { loadCertFromFile, rsaSha1Sign, sha1Digest } from "../cert";
import { formatRut } from "../utils";

const SII_DTE_NS = "http://www.sii.cl/SiiDte";
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
const C14N_ALG = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

/** Chilean VAT rate as a percentage (TasaIVA). */
const IVA_RATE = 19;
/** Multiplier to convert a net amount into a gross (IVA-included) amount. */
const IVA_FACTOR = 1 + IVA_RATE / 100;

/** DTE types currently supported by buildDteXml. */
const SUPPORTED_DTE_TYPES = ["33", "39"];

// --- XML string helpers (same manual-construction pattern as auth/xml-dsig.ts) ---

/** Escapes XML special characters to prevent injection. */
function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Reverses escapeXml (entities produced by our own serializer). */
function unescapeXml(str: string): string {
  return str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Serializes an amount as the integer CLP string SII expects. */
function fmtInt(n: number): string {
  return String(Math.round(n));
}

/** Renders `<name>value</name>`, or an empty string when value is undefined/empty. */
function tagIf(name: string, value: string | number | undefined): string {
  if (value === undefined || value === "") return "";
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

/** Extracts the text content of the first occurrence of a simple tag. */
function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : undefined;
}

/**
 * Current timestamp in Chile's timezone (America/Santiago), formatted
 * YYYY-MM-DDTHH:mm:ss as SII expects. Using the wall clock in Chile (not UTC)
 * matters: a DTE stamped at night with a UTC clock would carry tomorrow's
 * date and desynchronize the tax period.
 */
function chileTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

// --- Totals and line-amount resolution ---

interface ResolvedTotals {
  montoNeto: number;
  montoExento: number;
  iva: number;
  montoTotal: number;
}

/**
 * Resolves header totals. When montoNeto/iva are omitted they are derived from
 * montoTotal so that `montoNeto + iva === (montoTotal - montoExento)` EXACTLY:
 * the IVA is computed as the remainder (never as a separate `neto * 0.19`
 * rounding, which can drift by ±1 and make the SII reject the document).
 * When the caller provides them, they are used as-is but must add up to
 * montoTotal within ±1.
 */
function resolveTotals(doc: DteDocument): ResolvedTotals {
  const montoTotal = Math.round(doc.montoTotal);
  const montoExento = Math.round(doc.montoExento ?? 0);
  const afecto = montoTotal - montoExento;
  if (afecto < 0) {
    throw new Error(
      `DTE totals are inconsistent: MntExe (${montoExento}) exceeds MntTotal (${montoTotal})`
    );
  }

  let montoNeto = doc.montoNeto !== undefined ? Math.round(doc.montoNeto) : undefined;
  let iva = doc.iva !== undefined ? Math.round(doc.iva) : undefined;

  if (montoNeto === undefined && iva === undefined) {
    montoNeto = Math.round(afecto / IVA_FACTOR);
    iva = afecto - montoNeto;
  } else if (montoNeto === undefined) {
    montoNeto = afecto - (iva as number);
  } else if (iva === undefined) {
    iva = afecto - montoNeto;
  }

  const sum = montoNeto + (iva as number) + montoExento;
  if (Math.abs(sum - montoTotal) > 1) {
    throw new Error(
      `DTE totals do not add up: MntNeto (${montoNeto}) + IVA (${iva}) + MntExe (${montoExento}) ` +
        `= ${sum}, but MntTotal is ${montoTotal} (tolerance ±1)`
    );
  }
  if (montoNeto < 0 || (iva as number) < 0) {
    throw new Error(
      `DTE totals are inconsistent: resolved MntNeto (${montoNeto}) / IVA (${iva}) is negative`
    );
  }

  return { montoNeto, montoExento, iva: iva as number, montoTotal };
}

interface ResolvedLine {
  prcItem: number;
  montoItem: number;
}

/**
 * Resolves per-line amounts for the Detalle section.
 *
 * DESIGN DECISION — items are always treated as GROSS (IVA-included) amounts:
 * `DteItemSchema` has no gross/net flag, and boletas (39) must carry gross
 * line amounts by definition, so the only convention consistent with a single
 * item schema serving both types is "montoItem is gross" for facturas too.
 *
 * - Type 39 (boleta): lines are serialized as-is (gross). The SII expects the
 *   sum of affected MontoItem to equal MntTotal's affected portion.
 * - Type 33 (factura): the SII validates that header MntNeto ≈ sum of affected
 *   MontoItem, so gross lines must be converted to NET before serialization
 *   (`round(montoItem / 1.19)`). Because each line is rounded independently,
 *   the net lines can drift from the header MntNeto by a few pesos; the
 *   difference is absorbed into the LAST affected line so the sum matches
 *   MntNeto EXACTLY. A type-33 DTE whose detail does not add up is rejected by
 *   the SII with an opaque "amounts don't match" error, which is why this
 *   adjustment exists.
 * - Exempt lines (`exento: true`) are never converted: they carry no IVA.
 */
function resolveLineAmounts(doc: DteDocument, totals: ResolvedTotals): ResolvedLine[] {
  const isFactura = doc.tipoDte === "33";

  const lines: ResolvedLine[] = doc.items.map((item) => {
    if (isFactura && !item.exento) {
      return {
        prcItem: Math.round(item.precioUnitario / IVA_FACTOR),
        montoItem: Math.round(item.montoItem / IVA_FACTOR),
      };
    }
    return {
      prcItem: Math.round(item.precioUnitario),
      montoItem: Math.round(item.montoItem),
    };
  });

  const afectaIndexes = doc.items
    .map((item, i) => (item.exento ? -1 : i))
    .filter((i) => i >= 0);

  if (isFactura) {
    if (afectaIndexes.length === 0) {
      if (totals.montoNeto !== 0) {
        throw new Error(
          `DTE type 33 has MntNeto ${totals.montoNeto} but every line is exempt; ` +
            `use type 34 for fully exempt facturas`
        );
      }
      return lines;
    }
    const sumNet = afectaIndexes.reduce((sum, i) => sum + lines[i].montoItem, 0);
    const diff = totals.montoNeto - sumNet;
    // Per-line rounding can only drift by <1 peso per line. A larger gap means
    // the input is inconsistent with the documented gross-items convention.
    if (Math.abs(diff) > afectaIndexes.length) {
      throw new Error(
        `DTE type 33 detail does not match header: net line sum ${sumNet} vs MntNeto ` +
          `${totals.montoNeto} (diff ${diff}). Line montoItem values must be GROSS ` +
          `(IVA-included) amounts consistent with montoTotal`
      );
    }
    const last = afectaIndexes[afectaIndexes.length - 1];
    lines[last] = { ...lines[last], montoItem: lines[last].montoItem + diff };
    if (lines[last].montoItem < 0) {
      throw new Error("DTE type 33 rounding adjustment produced a negative line amount");
    }
  } else {
    // Boleta: gross lines must add up to the gross total.
    const sumGross = lines.reduce((sum, line) => sum + line.montoItem, 0);
    const tolerance = Math.max(1, doc.items.length);
    if (Math.abs(sumGross - totals.montoTotal) > tolerance) {
      throw new Error(
        `DTE type 39 detail does not match header: line sum ${sumGross} vs MntTotal ` +
          `${totals.montoTotal}. Boleta line amounts must be GROSS (IVA-included)`
      );
    }
  }

  return lines;
}

// --- Section builders ---

function buildIdDocXml(doc: DteDocument): string {
  return (
    `<IdDoc>` +
    `<TipoDTE>${doc.tipoDte}</TipoDTE>` +
    `<Folio>${doc.folio}</Folio>` +
    `<FchEmis>${escapeXml(doc.fechaEmision)}</FchEmis>` +
    // IndServicio only exists for boletas and only when explicitly provided.
    (doc.tipoDte === "39" ? tagIf("IndServicio", doc.indServicio) : "") +
    `</IdDoc>`
  );
}

function buildEmisorXml(doc: DteDocument): string {
  const emisor = doc.emisor;
  if (doc.tipoDte === "39") {
    // Boletas use different element names than facturas (RznSocEmisor /
    // GiroEmisor) and carry no Acteco.
    return (
      `<Emisor>` +
      `<RUTEmisor>${escapeXml(formatRut(emisor.rut))}</RUTEmisor>` +
      `<RznSocEmisor>${escapeXml(emisor.razonSocial)}</RznSocEmisor>` +
      `<GiroEmisor>${escapeXml(emisor.giro)}</GiroEmisor>` +
      `<DirOrigen>${escapeXml(emisor.direccion)}</DirOrigen>` +
      `<CmnaOrigen>${escapeXml(emisor.comuna)}</CmnaOrigen>` +
      tagIf("CiudadOrigen", emisor.ciudad) +
      `</Emisor>`
    );
  }
  return (
    `<Emisor>` +
    `<RUTEmisor>${escapeXml(formatRut(emisor.rut))}</RUTEmisor>` +
    `<RznSoc>${escapeXml(emisor.razonSocial)}</RznSoc>` +
    `<GiroEmis>${escapeXml(emisor.giro)}</GiroEmis>` +
    `<Acteco>${emisor.actividadEconomica}</Acteco>` +
    `<DirOrigen>${escapeXml(emisor.direccion)}</DirOrigen>` +
    `<CmnaOrigen>${escapeXml(emisor.comuna)}</CmnaOrigen>` +
    tagIf("CiudadOrigen", emisor.ciudad) +
    `</Emisor>`
  );
}

function buildReceptorXml(doc: DteDocument): string {
  const receptor = doc.receptor;
  if (doc.tipoDte === "33") {
    // Facturas require full receiver identification; missing fields make the
    // SII reject the document, so fail fast with a descriptive error.
    const missing: string[] = [];
    if (!receptor.giro) missing.push("giro");
    if (!receptor.direccion) missing.push("direccion");
    if (!receptor.comuna) missing.push("comuna");
    if (missing.length > 0) {
      throw new Error(
        `DTE type 33 requires receptor.${missing.join(", receptor.")} (mandatory for facturas)`
      );
    }
    return (
      `<Receptor>` +
      `<RUTRecep>${escapeXml(formatRut(receptor.rut))}</RUTRecep>` +
      `<RznSocRecep>${escapeXml(receptor.razonSocial)}</RznSocRecep>` +
      `<GiroRecep>${escapeXml(receptor.giro as string)}</GiroRecep>` +
      `<DirRecep>${escapeXml(receptor.direccion as string)}</DirRecep>` +
      `<CmnaRecep>${escapeXml(receptor.comuna as string)}</CmnaRecep>` +
      `</Receptor>`
    );
  }
  // Boleta: only RUT and razon social are mandatory.
  return (
    `<Receptor>` +
    `<RUTRecep>${escapeXml(formatRut(receptor.rut))}</RUTRecep>` +
    `<RznSocRecep>${escapeXml(receptor.razonSocial)}</RznSocRecep>` +
    tagIf("DirRecep", receptor.direccion) +
    tagIf("CmnaRecep", receptor.comuna) +
    `</Receptor>`
  );
}

function buildTotalesXml(totals: ResolvedTotals): string {
  return (
    `<Totales>` +
    `<MntNeto>${fmtInt(totals.montoNeto)}</MntNeto>` +
    (totals.montoExento > 0 ? `<MntExe>${fmtInt(totals.montoExento)}</MntExe>` : "") +
    `<TasaIVA>${IVA_RATE}</TasaIVA>` +
    `<IVA>${fmtInt(totals.iva)}</IVA>` +
    `<MntTotal>${fmtInt(totals.montoTotal)}</MntTotal>` +
    `</Totales>`
  );
}

function buildDetalleXml(doc: DteDocument, lines: ResolvedLine[]): string {
  return doc.items
    .map((item, i) => {
      const line = lines[i];
      return (
        `<Detalle>` +
        `<NroLinDet>${i + 1}</NroLinDet>` +
        (item.exento ? `<IndExe>1</IndExe>` : "") +
        `<NmbItem>${escapeXml(item.nombre)}</NmbItem>` +
        `<QtyItem>${item.cantidad}</QtyItem>` +
        `<PrcItem>${fmtInt(line.prcItem)}</PrcItem>` +
        `<MontoItem>${fmtInt(line.montoItem)}</MontoItem>` +
        `</Detalle>`
      );
    })
    .join("");
}

function buildReferenciasXml(doc: DteDocument): string {
  if (!doc.referencias || doc.referencias.length === 0) return "";
  return doc.referencias
    .map(
      (ref, i) =>
        `<Referencia>` +
        `<NroLinRef>${i + 1}</NroLinRef>` +
        `<TpoDocRef>${ref.tipoDteRef}</TpoDocRef>` +
        `<FolioRef>${ref.folioRef}</FolioRef>` +
        `<FchRef>${escapeXml(ref.fechaRef)}</FchRef>` +
        tagIf("CodRef", ref.codigoRef) +
        tagIf("RazonRef", ref.razonRef) +
        `</Referencia>`
    )
    .join("");
}

/**
 * Builds the DTE XML document from structured data.
 *
 * Produces a single `<DTE>` element (namespace http://www.sii.cl/SiiDte) with
 * its `<Documento ID="F{folio}T{tipoDte}">`. The EnvioDTE/SetDTE envelope is a
 * shipping concern and is NOT built here (see uploadDte).
 *
 * Supported types: 33 (Factura Electronica) and 39 (Boleta Electronica).
 *
 * Conventions (see resolveLineAmounts / resolveTotals for details):
 * - `items[].montoItem` is always interpreted as a GROSS (IVA-included)
 *   amount for both types. For type 33 lines are converted to net so the
 *   detail matches the header MntNeto exactly.
 * - When `montoNeto`/`iva` are omitted they are derived from `montoTotal`.
 * - Emitted with an UTF-8 prolog so the declared encoding matches the bytes
 *   actually transmitted (accented characters survive signature validation).
 *
 * Expected pipeline: buildDteXml → applyTimbre → signDte.
 */
export async function buildDteXml(document: DteDocument): Promise<string> {
  const doc = DteDocumentSchema.parse(document);

  if (!SUPPORTED_DTE_TYPES.includes(doc.tipoDte)) {
    throw new Error(
      `buildDteXml currently supports DTE types ${SUPPORTED_DTE_TYPES.join(", ")}; got ${doc.tipoDte}`
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.fechaEmision)) {
    throw new Error(`fechaEmision must be YYYY-MM-DD, got "${doc.fechaEmision}"`);
  }

  const totals = resolveTotals(doc);
  const lines = resolveLineAmounts(doc, totals);
  const documentId = `F${doc.folio}T${doc.tipoDte}`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<DTE version="1.0" xmlns="${SII_DTE_NS}">` +
    `<Documento ID="${documentId}">` +
    `<Encabezado>` +
    buildIdDocXml(doc) +
    buildEmisorXml(doc) +
    buildReceptorXml(doc) +
    buildTotalesXml(totals) +
    `</Encabezado>` +
    buildDetalleXml(doc, lines) +
    buildReferenciasXml(doc) +
    `</Documento>` +
    `</DTE>`
  );
}

/**
 * Signs a DTE XML document with the company's digital certificate (XMLDSig).
 *
 * Unlike the auth seed signature (URI="" + enveloped transform), the SII
 * expects the DTE signature to reference the `<Documento>` element by ID
 * (`Reference URI="#F{folio}T{tipoDte}"`) with a C14N transform, and the
 * `<Signature>` element is inserted as a SIBLING of `<Documento>`, inside
 * `<DTE>`.
 *
 * MUST be called AFTER applyTimbre: the Reference digest covers the whole
 * `<Documento>` content, TED included. Signing first and stamping later would
 * invalidate the signature. Expected pipeline: buildDteXml → applyTimbre → signDte.
 *
 * Canonicalization note: the XML is generated deterministically with no
 * whitespace variation, so C14N reduces to rendering in-scope namespace
 * declarations. The digest/signature are computed over the canonical form
 * (`<Documento xmlns="...">` / `<SignedInfo xmlns="...">`) while the
 * serialized output keeps the namespaces declared on the ancestors, exactly
 * as C14N-aware validators reconstruct them.
 */
export async function signDte(
  xml: string,
  certPath: string,
  certPassword: string
): Promise<string> {
  const match = xml.match(/<Documento ID="([^"]+)">[\s\S]*?<\/Documento>/);
  if (!match) {
    throw new Error("signDte: no <Documento ID=\"...\"> element found in XML");
  }
  const documentoBlock = match[0];
  const documentId = match[1];

  const certData = loadCertFromFile(certPath, certPassword);

  // 1. Digest of the canonicalized <Documento> (inherits the SiiDte namespace
  // from <DTE>, which C14N renders on the element itself).
  const canonicalDocumento = documentoBlock.replace(
    `<Documento ID="${documentId}">`,
    `<Documento xmlns="${SII_DTE_NS}" ID="${documentId}">`
  );
  const digestValue = sha1Digest(canonicalDocumento);

  // 2. SignedInfo referencing the Documento by ID.
  const signedInfo =
    `<SignedInfo>` +
    `<CanonicalizationMethod Algorithm="${C14N_ALG}"/>` +
    `<SignatureMethod Algorithm="${DSIG_NS}rsa-sha1"/>` +
    `<Reference URI="#${documentId}">` +
    `<Transforms>` +
    `<Transform Algorithm="${C14N_ALG}"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="${DSIG_NS}sha1"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  // 3. Sign the canonical SignedInfo (inherits the dsig namespace from
  // <Signature>).
  const canonicalSignedInfo = signedInfo.replace(
    "<SignedInfo>",
    `<SignedInfo xmlns="${DSIG_NS}">`
  );
  const signatureValue = rsaSha1Sign(canonicalSignedInfo, certData.privateKey);

  // 4. KeyInfo: RSAKeyValue + X509Data, same format as the auth signature.
  const keyInfo =
    `<KeyInfo>` +
    `<KeyValue>` +
    `<RSAKeyValue>` +
    `<Modulus>${certData.modulusB64}</Modulus>` +
    `<Exponent>${certData.exponentB64}</Exponent>` +
    `</RSAKeyValue>` +
    `</KeyValue>` +
    `<X509Data>` +
    `<X509Certificate>${certData.certDerB64}</X509Certificate>` +
    `</X509Data>` +
    `</KeyInfo>`;

  const signature =
    `<Signature xmlns="${DSIG_NS}">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    keyInfo +
    `</Signature>`;

  // 5. Insert the Signature as sibling of Documento, before </DTE>.
  const closeTag = "</DTE>";
  const closeIndex = xml.lastIndexOf(closeTag);
  if (closeIndex === -1) {
    throw new Error("signDte: no closing </DTE> tag found in XML");
  }
  return xml.slice(0, closeIndex) + signature + xml.slice(closeIndex);
}

/**
 * Sends a signed DTE to SII for processing.
 * Returns a tracking ID for status queries.
 */
export async function uploadDte(
  _signedXml: string,
  _token: SiiToken,
  _config: SiiConfig
): Promise<SiiUploadResponse> {
  // TODO: POST signed XML to SII upload endpoint
  throw new Error("Not implemented");
}

/** Truncates a value extracted from XML to `max` chars, entity-safely. */
function truncateXmlValue(value: string, max: number): string {
  return escapeXml(unescapeXml(value).slice(0, max));
}

/**
 * Stamps a DTE with the CAF timbre (TED — Timbre Electronico DTE).
 *
 * The TED is NOT an XMLDSig signature: it is the SII's own format, signed
 * RSA-SHA1 with the CAF's private key (not the company certificate) over the
 * compact-serialized `<DD>` block. It is inserted inside `<Documento>`
 * (together with `<TmstFirma>`) BEFORE the document is signed:
 * buildDteXml → applyTimbre → signDte.
 *
 * DESIGN DECISION — the signature changed from `(xml, cafPrivateKey: string)`
 * to `(xml, caf: FolioRange)`: a valid TED must embed the ORIGINAL `<CAF>`
 * block exactly as issued by the SII (its inner `<FRMA>` is the SII's own
 * signature over the authorization data and cannot be reconstructed from
 * parsed fields). The bare private key was not enough to build a real TED, so
 * `FolioRangeSchema` gained an optional `cafXml` field carrying the raw CAF
 * XML, and applyTimbre now takes the whole FolioRange (privateKey + cafXml +
 * range metadata, which also lets it validate the folio against the
 * authorized range).
 */
export async function applyTimbre(xml: string, caf: FolioRange): Promise<string> {
  if (xml.includes("<TED")) {
    throw new Error("applyTimbre: XML already contains a TED block");
  }
  if (!caf.privateKey) {
    throw new Error("applyTimbre: caf.privateKey (RSASK from the CAF file) is required");
  }
  if (!caf.cafXml) {
    throw new Error(
      "applyTimbre: caf.cafXml (raw CAF XML as issued by SII) is required — the original " +
        "<CAF> block, including SII's <FRMA> signature, must be embedded verbatim in the TED"
    );
  }

  const cafBlockMatch = caf.cafXml.match(/<CAF[^>]*>[\s\S]*?<\/CAF>/);
  if (!cafBlockMatch) {
    throw new Error("applyTimbre: no <CAF> block found in caf.cafXml");
  }
  const cafBlock = cafBlockMatch[0];

  // Pull the TED fields out of the already-built document.
  const tipoDte = extractTag(xml, "TipoDTE");
  const folio = extractTag(xml, "Folio");
  const fchEmis = extractTag(xml, "FchEmis");
  const rutEmisor = extractTag(xml, "RUTEmisor");
  const rutRecep = extractTag(xml, "RUTRecep");
  const rznSocRecep = extractTag(xml, "RznSocRecep");
  const mntTotal = extractTag(xml, "MntTotal");
  const firstItem = extractTag(xml, "NmbItem");
  if (!tipoDte || !folio || !fchEmis || !rutEmisor || !rutRecep || !rznSocRecep || !mntTotal || !firstItem) {
    throw new Error(
      "applyTimbre: XML is missing required fields (TipoDTE, Folio, FchEmis, RUTEmisor, " +
        "RUTRecep, RznSocRecep, MntTotal, NmbItem) — was it built with buildDteXml?"
    );
  }

  // Validate the folio against the CAF authorization.
  if (caf.tipoDte !== tipoDte) {
    throw new Error(
      `applyTimbre: CAF authorizes DTE type ${caf.tipoDte} but document is type ${tipoDte}`
    );
  }
  const folioNum = Number(folio);
  if (folioNum < caf.rangoDesde || folioNum > caf.rangoHasta) {
    throw new Error(
      `applyTimbre: folio ${folioNum} is outside the CAF range ${caf.rangoDesde}-${caf.rangoHasta}`
    );
  }

  // DD block, compact-serialized: FRMT signs this exact string, so no
  // whitespace or line breaks between tags.
  const dd =
    `<DD>` +
    `<RE>${escapeXml(formatRut(unescapeXml(rutEmisor)))}</RE>` +
    `<TD>${tipoDte}</TD>` +
    `<F>${folio}</F>` +
    `<FE>${fchEmis}</FE>` +
    `<RR>${rutRecep}</RR>` +
    `<RSR>${truncateXmlValue(rznSocRecep, 40)}</RSR>` +
    `<MNT>${fmtInt(Number(mntTotal))}</MNT>` +
    `<IT1>${truncateXmlValue(firstItem, 40)}</IT1>` +
    cafBlock +
    `<TSTED>${chileTimestamp()}</TSTED>` +
    `</DD>`;

  const cafPrivateKey = forge.pki.privateKeyFromPem(caf.privateKey) as forge.pki.rsa.PrivateKey;
  const frmt = rsaSha1Sign(dd, cafPrivateKey);

  const ted =
    `<TED version="1.0">` +
    dd +
    `<FRMT algoritmo="SHA1withRSA">${frmt}</FRMT>` +
    `</TED>`;

  // Insert TED + TmstFirma at the end of <Documento>, before it is signed.
  const closeTag = "</Documento>";
  const closeIndex = xml.indexOf(closeTag);
  if (closeIndex === -1) {
    throw new Error("applyTimbre: no closing </Documento> tag found in XML");
  }
  return (
    xml.slice(0, closeIndex) +
    ted +
    `<TmstFirma>${chileTimestamp()}</TmstFirma>` +
    xml.slice(closeIndex)
  );
}

/**
 * Generates the PDF representation of a DTE (thermal or letter format).
 */
export async function generateDtePdf(
  _document: DteDocument,
  _options?: { format?: "thermal" | "letter" }
): Promise<Buffer> {
  // TODO: Generate PDF with barcode (PDF417 for timbre)
  throw new Error("Not implemented");
}
