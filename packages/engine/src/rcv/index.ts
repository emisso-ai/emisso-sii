import { randomUUID } from "node:crypto";
import type { PortalSession } from "../portal";
import type { DteType, Invoice, IssueType, SiiEnv } from "../types";
import { splitRut, getPortalAuthUrl } from "../utils";
import { parseRcvCsv } from "./csv-parser";

/**
 * RCV (Registro de Compras y Ventas) base URL per environment.
 * Production: www4.sii.cl, Certification: www4c.sii.cl
 */
function getRcvBaseUrl(env: SiiEnv): string {
  return env === "production"
    ? "https://www4.sii.cl"
    : "https://www4c.sii.cl";
}

/**
 * RCV REST API base path.
 * Discovered from the Angular SPA at /consdcvinternetui/#/index.
 * The backend is a Java FacadeService with JSON POST endpoints.
 */
const FACADE_BASE = "/consdcvinternetui/services/data/facadeService";

/** Endpoints discovered from the SPA JavaScript bundle. */
const ENDPOINTS = {
  /** Initialize session and get available periods/empresas */
  getDatosInicio: `${FACADE_BASE}/getDatosInicio`,
  /** Get summary by document type */
  getResumen: `${FACADE_BASE}/getResumen`,
  /** Export summary as CSV */
  getResumenExport: `${FACADE_BASE}/getResumenExport`,
  /** Get Compras (received) detail rows */
  getDetalleCompra: `${FACADE_BASE}/getDetalleCompra`,
  /** Export Compras detail as CSV */
  getDetalleCompraExport: `${FACADE_BASE}/getDetalleCompraExport`,
  /** Get Ventas (issued) detail rows */
  getDetalleVenta: `${FACADE_BASE}/getDetalleVenta`,
  /** Export Ventas detail as CSV */
  getDetalleVentaExport: `${FACADE_BASE}/getDetalleVentaExport`,
  /** SII common session service — initializes server-side auth */
  aaSessionLoad: "/common-1.0/services/aaSessionService/load",
} as const;

/** SII estadoContab values for the different sections. */
const ESTADO_CONTAB = {
  REGISTRO: "REGISTRO",
  PENDIENTE: "PENDIENTE",
  NO_INCLUIR: "NO_INCLUIR",
  RECLAMADO: "RECLAMADO",
} as const;

type EstadoContab = (typeof ESTADO_CONTAB)[keyof typeof ESTADO_CONTAB];

/**
 * The SII Angular SPA uses a common auth framework:
 *
 * 1. `SdiSession` reads `TOKEN` cookie (set during portal login)
 * 2. `GET /common-1.0/services/aaSessionService/load` initializes server-side session
 * 3. All API calls wrap payload in: `{ metaData: { conversationId, transactionId, namespace }, data: {...} }`
 *
 * The conversationId is the TOKEN cookie value.
 * The namespace identifies the Java service class.
 */

const NAMESPACE_FACADE =
  "cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService";

/**
 * Get the TOKEN cookie from the session's cookie jar.
 */
function getTokenFromSession(session: PortalSession): string {
  const jar = session.httpClient.cookieJar.toJSON();
  if (!jar) return "";
  const tokenCookie = jar.cookies.find((c) => c.key === "TOKEN");
  return tokenCookie?.value ?? "";
}

/**
 * Wrap API data in the SII metaData envelope.
 */
function wrapRequest(
  token: string,
  namespace: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    metaData: {
      namespace,
      conversationId: token,
      transactionId: randomUUID(),
    },
    data,
  };
}

/**
 * Standard request headers for RCV API calls.
 */
function rcvHeaders(baseUrl: string): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Referer: `${baseUrl}/consdcvinternetui/`,
  };
}

/**
 * Initialize the RCV server-side session.
 *
 * Replicates the exact browser flow discovered via network trace:
 * 1. GET /consdcvinternetui/ — load the Angular SPA
 * 2. POST /common-1.0/services/autConfDataService/obtieneConf — auth config
 * 3. GET /common-1.0/services/aaSessionService/load — session bootstrap
 * 4. GET zeusr.sii.cl/cgi_AUT2000/AutTknData.cgi — JSONP token validation (key step!)
 * 5. POST settingsService/consultarParametros — app settings
 * 6. POST facadeService/getDatosInicio — initialize RCV app state
 *
 * Step 4 is critical: the AutTknData.cgi JSONP call validates the TOKEN cookie
 * against the SII auth infrastructure and establishes the server-side session
 * that the JBoss backend requires for subsequent FacadeService calls.
 */
async function initRcvSession(session: PortalSession): Promise<{
  token: string;
  rut: string;
  dv: string;
  baseUrl: string;
}> {
  const baseUrl = getRcvBaseUrl(session.env);
  const authUrl = getPortalAuthUrl();
  const token = getTokenFromSession(session);

  // Step 1: Visit the RCV page to establish cookie context
  await session.httpClient.get(`${baseUrl}/consdcvinternetui/`, {
    headers: { Accept: "text/html" },
  });

  // Step 2: Auth config + session load (parallel, like the browser)
  const [, aaResp] = await Promise.all([
    session.httpClient.post(
      `${baseUrl}/common-1.0/services/autConfDataService/obtieneConf`,
      {},
      { headers: rcvHeaders(baseUrl), validateStatus: () => true },
    ),
    session.httpClient.get(
      `${baseUrl}${ENDPOINTS.aaSessionLoad}`,
      { headers: rcvHeaders(baseUrl) },
    ),
  ]);

  // Step 3: JSONP token validation — this is what establishes the JBoss session
  const rnd = Math.random();
  const ts = Date.now();
  await session.httpClient.get(
    `${authUrl}/cgi_AUT2000/AutTknData.cgi?rnd=${rnd}&callback=jQuery_${ts}&_=${ts + 1}`,
    {
      headers: {
        Accept: "*/*",
        Referer: `${baseUrl}/consdcvinternetui/`,
      },
      validateStatus: () => true,
    },
  );

  // Step 4: App settings
  await session.httpClient.post(
    `${baseUrl}/consdcvinternetui/services/data/settingsService/consultarParametros`,
    wrapRequest(token, `${NAMESPACE_FACADE}/consultarParametros`, {}),
    { headers: rcvHeaders(baseUrl), validateStatus: () => true },
  );

  // Step 5: Initialize RCV app state
  const initBody = wrapRequest(token, `${NAMESPACE_FACADE}/getDatosInicio`, {});
  await session.httpClient.post(
    `${baseUrl}${ENDPOINTS.getDatosInicio}`,
    initBody,
    { headers: rcvHeaders(baseUrl) },
  );

  const aaData = aaResp.data?.data ?? aaResp.data;
  const rut = String(aaData?.rut ?? "");
  const dv = String(aaData?.dv ?? "");

  return { token, rut, dv, baseUrl };
}

// --- Public API ---

export interface ListInvoicesParams {
  /** The authenticated company's RUT (e.g. "76123456-7") */
  rut: string;
  /** Ventas (issued) or Compras (received) */
  issueType: IssueType;
  /** Tax period */
  period: { year: number; month: number };
  /** Optional: filter by document type code */
  documentType?: DteType;
  /** Optional: which section to query. Default: REGISTRO */
  estadoContab?: EstadoContab;
}

/**
 * Build the data payload for getResumen / getDetalle* endpoints.
 */
function buildDataPayload(
  rut: string,
  period: { year: number; month: number },
  operacion: string,
  estadoContab: EstadoContab,
  codTipoDoc?: string,
  opts?: { busquedaInicial?: boolean; recaptcha?: boolean },
): Record<string, string | boolean> {
  const { rutBody, dv } = splitRut(rut);
  const ptributario = `${period.year}${String(period.month).padStart(2, "0")}`;

  const body: Record<string, string | boolean> = {
    rutEmisor: rutBody,
    dvEmisor: dv,
    ptributario,
    operacion,
    estadoContab,
  };

  if (codTipoDoc) {
    body.codTipoDoc = codTipoDoc;
  }

  if (opts?.busquedaInicial) {
    body.busquedaInicial = true;
  }

  // Detail + export endpoints require recaptcha fields.
  // The Angular SPA sends the literal string "t-o-k-e-n-web" as a browser bypass.
  // The accionRecaptcha value identifies the operation (RCV_DETC = compra, RCV_DETV = venta).
  if (opts?.recaptcha) {
    body.tokenRecaptcha = "t-o-k-e-n-web";
    body.accionRecaptcha = operacion === "COMPRA" ? "RCV_DETC" : "RCV_DETV";
  }

  return body;
}

/**
 * Fetch the invoice detail summary from the RCV JSON API.
 */
export async function fetchRcvResumen(
  session: PortalSession,
  params: ListInvoicesParams,
): Promise<unknown> {
  const { token, baseUrl } = await initRcvSession(session);
  const operacion = params.issueType === "received" ? "COMPRA" : "VENTA";
  const data = buildDataPayload(
    params.rut,
    params.period,
    operacion,
    params.estadoContab ?? ESTADO_CONTAB.REGISTRO,
    undefined,
    { busquedaInicial: true },
  );

  const body = wrapRequest(token, `${NAMESPACE_FACADE}/getResumen`, data);
  const url = `${baseUrl}${ENDPOINTS.getResumen}`;
  const response = await session.httpClient.post(url, body, {
    headers: rcvHeaders(baseUrl),
  });

  return response.data;
}

/**
 * Fetch the detailed invoice rows from the RCV JSON API.
 */
export async function fetchRcvDetalle(
  session: PortalSession,
  params: ListInvoicesParams,
): Promise<unknown> {
  const { token, baseUrl } = await initRcvSession(session);
  const operacion = params.issueType === "received" ? "COMPRA" : "VENTA";
  const isCompra = params.issueType === "received";
  const endpoint = isCompra
    ? ENDPOINTS.getDetalleCompra
    : ENDPOINTS.getDetalleVenta;
  const method = isCompra ? "getDetalleCompra" : "getDetalleVenta";

  const data = buildDataPayload(
    params.rut,
    params.period,
    operacion,
    params.estadoContab ?? ESTADO_CONTAB.REGISTRO,
    params.documentType,
    { recaptcha: true },
  );

  const body = wrapRequest(token, `${NAMESPACE_FACADE}/${method}`, data);
  const url = `${baseUrl}${endpoint}`;
  const response = await session.httpClient.post(url, body, {
    headers: rcvHeaders(baseUrl),
  });

  return response.data;
}

/**
 * Download the RCV detail export as CSV.
 */
export async function downloadRcvCsv(
  session: PortalSession,
  params: ListInvoicesParams,
): Promise<string> {
  const { token, baseUrl } = await initRcvSession(session);
  const operacion = params.issueType === "received" ? "COMPRA" : "VENTA";
  const endpoint =
    params.issueType === "received"
      ? ENDPOINTS.getDetalleCompraExport
      : ENDPOINTS.getDetalleVentaExport;

  const isCompra = params.issueType === "received";
  const data = buildDataPayload(
    params.rut,
    params.period,
    operacion,
    params.estadoContab ?? ESTADO_CONTAB.REGISTRO,
    params.documentType,
    { recaptcha: true },
  );

  const method = isCompra ? "getDetalleCompraExport" : "getDetalleVentaExport";
  const body = wrapRequest(token, `${NAMESPACE_FACADE}/${method}`, data);
  const url = `${baseUrl}${endpoint}`;
  const response = await session.httpClient.post(url, body, {
    headers: {
      ...rcvHeaders(baseUrl),
      Accept: "text/csv, application/octet-stream, */*",
    },
    responseType: "text",
  });

  return typeof response.data === "string" ? response.data : "";
}

/**
 * Map a raw JSON detail row from the RCV API into an Invoice object.
 */
function mapJsonRowToInvoice(
  row: Record<string, unknown>,
  issueType: IssueType,
  period: { year: number; month: number },
): Invoice {
  const tipoDte = String(row.detTipoDoc ?? row.detTpoDoc ?? "33");
  const folio = Number(row.detNroDoc ?? 0);
  const rutDoc = String(row.detRutDoc ?? "");
  const dvDoc = String(row.detDvDoc ?? "");
  const rzSoc = String(row.detRznSoc ?? "");
  const counterpartRut = dvDoc ? `${rutDoc}-${dvDoc}` : rutDoc;

  const documentType = mapDocType(tipoDte);

  const issuer =
    issueType === "issued"
      ? { rut: "", name: "" }
      : { rut: counterpartRut, name: rzSoc };

  const receiver =
    issueType === "issued"
      ? { rut: counterpartRut, name: rzSoc }
      : { rut: "", name: "" };

  return {
    id: `${documentType}-${folio}-${counterpartRut}`,
    number: folio,
    issuer,
    receiver,
    date: String(row.detFchDoc ?? ""),
    netAmount: Number(row.detMntNeto ?? 0),
    exemptAmount: Number(row.detMntExe ?? 0),
    vatAmount: Number(row.detMntIVA ?? row.detMntIva ?? 0),
    totalAmount: Number(row.detMntTotal ?? 0),
    currency: "CLP",
    taxPeriod: period,
    documentType,
    confirmationStatus: "REGISTRO",
    raw: Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, String(v ?? "")]),
    ),
  };
}

function mapDocType(raw: string): DteType {
  const trimmed = raw.trim();
  const valid = ["33", "34", "39", "41", "43", "46", "52", "56", "61", "110", "112"];
  return valid.includes(trimmed) ? (trimmed as DteType) : "33";
}

/**
 * List invoices from SII's Registro de Compras y Ventas.
 *
 * Uses the RCV JSON API (discovered from the Angular SPA at consdcvinternetui).
 * Initializes the SII server-side session, then fetches detail rows.
 *
 * @example
 * ```typescript
 * const session = await portalLogin({ rut: "76123456-7", claveTributaria: "pass", env: "production" });
 * const invoices = await listInvoices(session, {
 *   rut: "76123456-7",
 *   issueType: "received",
 *   period: { year: 2024, month: 3 },
 * });
 * ```
 */
/**
 * Extract document type codes from the resumen response.
 * The resumen returns an array of summary rows, each with a rsmnTipoDocInteger field.
 */
function extractDocTypesFromResumen(resumen: unknown): string[] {
  if (!resumen || typeof resumen !== "object" || !("data" in resumen)) return [];
  const rows = (resumen as { data: unknown }).data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: Record<string, unknown>) => String(row.rsmnTipoDocInteger ?? ""))
    .filter((t) => t !== "" && t !== "undefined");
}

export async function listInvoices(
  session: PortalSession,
  params: ListInvoicesParams,
): Promise<Invoice[]> {
  // If a specific document type is provided, fetch it directly
  if (params.documentType) {
    return fetchDetalleAndParse(session, params, params.documentType);
  }

  // Otherwise, get the resumen first to discover which document types have data
  const resumen = await fetchRcvResumen(session, params);
  const docTypes = extractDocTypesFromResumen(resumen);

  if (docTypes.length === 0) return [];

  // Fetch detail for each document type
  const allInvoices: Invoice[] = [];
  for (const docType of docTypes) {
    const invoices = await fetchDetalleAndParse(session, { ...params, documentType: docType as DteType }, docType);
    allInvoices.push(...invoices);
  }

  return allInvoices;
}

async function fetchDetalleAndParse(
  session: PortalSession,
  params: ListInvoicesParams,
  codTipoDoc: string,
): Promise<Invoice[]> {
  const data = await fetchRcvDetalle(session, { ...params, documentType: codTipoDoc as DteType });

  // The API returns { respEstado: { codRespuesta: 0 }, data: [...] }
  if (data && typeof data === "object" && "data" in data) {
    const rows = (data as { data: Record<string, unknown>[] }).data;
    if (Array.isArray(rows)) {
      return rows.map((row) =>
        mapJsonRowToInvoice(row, params.issueType, params.period),
      );
    }
  }

  return [];
}

export { parseRcvCsv } from "./csv-parser";
export { ENDPOINTS as RCV_ENDPOINTS, ESTADO_CONTAB };
