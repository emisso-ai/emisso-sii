import { CookieJar, Cookie } from "tough-cookie";
import type { Browser } from "playwright-core";
import type { SiiConfig, PortalConfig, SiiEnv } from "../types";
import { createSiiHttpClient, AUTH_EXPIRED_SENTINEL, type SiiHttpClient } from "../http";
import { getPortalBaseUrl, getPortalAuthUrl, getPortalReferencia, splitRut } from "../utils";
import { authenticate, type SiiToken } from "../auth";

export interface PortalLoginOptions {
  headless?: boolean;
  connectBrowser?: () => Promise<Browser>;
}

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
 * Logs into SII portal using a browser (Playwright).
 *
 * SII's production portal uses Queue-it waiting rooms and JavaScript challenges
 * that block raw HTTP login. The browser handles these automatically, then we
 * extract session cookies for subsequent plain HTTP requests.
 */
export async function portalLogin(
  config: PortalConfig,
  options?: PortalLoginOptions,
): Promise<PortalSession> {
  const { rutBody, dv } = splitRut(config.rut);
  const authUrl = getPortalAuthUrl();
  const referencia = getPortalReferencia(config.env);
  // SII's login page expects the referencia URL as a bare query string (not a named parameter).
  // This is SII's actual format — the raw URL IS the query string intentionally.
  const loginUrl = `${authUrl}/AUT2000/InicioAutenticacion/IngresoRutClave.html?${referencia}`;

  const browser = options?.connectBrowser
    ? await options.connectBrowser()
    : await (await import("playwright")).chromium.launch({ headless: options?.headless ?? true });

  try {
    // Reuse pre-existing context/page (Browserbase creates these) or create new ones
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = context.pages()[0] ?? await context.newPage();

    await page.goto(loginUrl);
    await page.waitForSelector("#rutcntr", { timeout: 30_000 });

    await page.fill("#rutcntr", `${rutBody}-${dv}`);
    await page.fill("#clave", config.claveTributaria);

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 30_000 }),
      page.click("#bt_ingresar"),
    ]);

    const finalPageUrl = page.url();
    const extractedCookies = await context.cookies();

    if (extractedCookies.length === 0) {
      throw new Error("Browser login failed: no cookies captured");
    }

    if (finalPageUrl.includes("IngresoRutClave")) {
      throw new Error("SII portal login failed: invalid credentials or CAPTCHA");
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
  } finally {
    await browser.close();
  }
}

/**
 * Logs out of the SII portal, releasing the server-side session.
 * SII limits concurrent sessions per RUT — always call this when done.
 */
export async function portalLogout(session: PortalSession): Promise<void> {
  const authUrl = getPortalAuthUrl();
  try {
    await session.httpClient.get(
      `${authUrl}/cgi_AUT2000/CAutInwor498.cgi?https://www.sii.cl`,
      { validateStatus: () => true },
    );
  } catch {
    // Best-effort logout — ignore network errors
  }
  session.isAuthenticated = false;
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
