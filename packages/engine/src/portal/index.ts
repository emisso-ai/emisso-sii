import { CookieJar, Cookie } from "tough-cookie";
import { PlaywrightCrawler } from "crawlee";
import type { SiiConfig, PortalConfig, SiiEnv } from "../types";
import { createSiiHttpClient, AUTH_EXPIRED_SENTINEL, type SiiHttpClient } from "../http";
import { getPortalBaseUrl, getPortalAuthUrl, getPortalReferencia, splitRut } from "../utils";
import { authenticate, type SiiToken } from "../auth";

export interface PortalSession {
  httpClient: SiiHttpClient;
  env: SiiEnv;
  isAuthenticated: boolean;
  refresh(): Promise<void>;
}

export interface SiiSession {
  token: SiiToken;
  portal: PortalSession;
}

/**
 * Converts Playwright cookies to a tough-cookie CookieJar.
 */
function playwrightCookiesToJar(
  pwCookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
  }>,
): CookieJar {
  const jar = new CookieJar();
  for (const c of pwCookies) {
    const cookie = new Cookie({
      key: c.name,
      value: c.value,
      domain: c.domain.replace(/^\./, ""),
      path: c.path,
      expires: c.expires > 0 ? new Date(c.expires * 1000) : "Infinity",
      httpOnly: c.httpOnly,
      secure: c.secure,
    });
    const url = `http${c.secure ? "s" : ""}://${c.domain.replace(/^\./, "")}${c.path}`;
    jar.setCookieSync(cookie, url);
  }
  return jar;
}

/**
 * Logs into SII portal using a browser (Playwright via Crawlee).
 *
 * SII's production portal uses Queue-it waiting rooms and JavaScript challenges
 * that block raw HTTP login. The browser handles these automatically, then we
 * extract session cookies for subsequent plain HTTP requests.
 */
export async function portalLogin(
  config: PortalConfig,
  options?: { headless?: boolean },
): Promise<PortalSession> {
  const { rutBody, dv } = splitRut(config.rut);
  const authUrl = getPortalAuthUrl();
  const referencia = getPortalReferencia(config.env);
  const loginUrl = `${authUrl}/AUT2000/InicioAutenticacion/IngresoRutClave.html?${referencia}`;

  let extractedCookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
  }> = [];

  const crawler = new PlaywrightCrawler({
    headless: options?.headless ?? true,
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 60,
    browserPoolOptions: {
      useFingerprints: false,
    },
    async requestHandler({ page, log }) {
      log.info("Waiting for login form...");
      await page.waitForSelector("#rutcntr", { timeout: 30_000 });

      log.info(`Filling RUT: ${rutBody}-${dv}`);
      await page.fill("#rutcntr", `${rutBody}-${dv}`);
      await page.fill("#clave", config.claveTributaria);

      log.info("Clicking login...");
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 30_000 }),
        page.click("#bt_ingresar"),
      ]);

      log.info(`Landed on: ${page.url()}`);

      // Extract all cookies from the browser context
      extractedCookies = await page.context().cookies();
      log.info(`Extracted ${extractedCookies.length} cookies`);
    },
  });

  await crawler.run([loginUrl]);

  if (extractedCookies.length === 0) {
    throw new Error("Browser login failed: no cookies captured");
  }

  // Convert browser cookies to tough-cookie jar and create HTTP client
  const cookieJar = playwrightCookiesToJar(extractedCookies);
  const client = createSiiHttpClient({ cookieJar, rateLimitMs: 0 });

  const session: PortalSession = {
    httpClient: client,
    env: config.env,
    isAuthenticated: true,
    refresh: async () => {
      const refreshed = await portalLogin(config, options);
      session.httpClient = refreshed.httpClient;
      session.isAuthenticated = refreshed.isAuthenticated;
    },
  };

  return session;
}

export async function verifyPortalSession(
  httpClient: SiiHttpClient,
  env: SiiEnv,
): Promise<boolean> {
  try {
    const portalUrl = getPortalBaseUrl(env);
    const response = await httpClient.get(`${portalUrl}/cgi_dte/UPL/DTEUpload`);
    const data = typeof response.data === "string" ? response.data : "";
    return !data.includes(AUTH_EXPIRED_SENTINEL) && !data.includes("Ingresar");
  } catch {
    return false;
  }
}

export async function createSiiSession(
  siiConfig: SiiConfig,
  portalConfig: PortalConfig,
): Promise<SiiSession> {
  const [token, portal] = await Promise.all([
    authenticate(siiConfig),
    portalLogin(portalConfig),
  ]);

  return { token, portal };
}

// Re-export from utils for backwards compatibility
export { getPortalBaseUrl, getPortalAuthUrl, getPortalReferencia, splitRut } from "../utils";
