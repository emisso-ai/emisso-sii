import type { SiiConfig, PortalConfig, SiiEnv } from "../types";
import { createSiiHttpClient, AUTH_EXPIRED_SENTINEL, type SiiHttpClient } from "../http";
import { getPortalBaseUrl, splitRut } from "../utils";
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

export async function portalLogin(
  config: PortalConfig,
  httpClient?: SiiHttpClient
): Promise<PortalSession> {
  const client = httpClient ?? createSiiHttpClient({ rateLimitMs: 0 });
  const portalUrl = getPortalBaseUrl(config.env);
  const { rutBody, dv } = splitRut(config.rut);

  const formData = new URLSearchParams({
    rut: rutBody,
    dv: dv,
    referencia: `${portalUrl}/cgi_dte/UPL/DTEUpload`,
    clave: config.claveTributaria,
  });

  await client.post(`${portalUrl}/cgi_dte/UPL/DTEauth`, formData.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    maxRedirects: 5,
  });

  const session: PortalSession = {
    httpClient: client,
    env: config.env,
    isAuthenticated: true,
    refresh: async () => {
      const refreshed = await portalLogin(config, client);
      session.isAuthenticated = refreshed.isAuthenticated;
    },
  };

  return session;
}

export async function verifyPortalSession(
  httpClient: SiiHttpClient,
  env: SiiEnv
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
  portalConfig: PortalConfig
): Promise<SiiSession> {
  const [token, portal] = await Promise.all([
    authenticate(siiConfig),
    portalLogin(portalConfig),
  ]);

  return { token, portal };
}

// Re-export from utils for backwards compatibility
export { getPortalBaseUrl, splitRut } from "../utils";
