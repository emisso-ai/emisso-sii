import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from "axios";
import { CookieJar } from "tough-cookie";
import axiosRetry from "axios-retry";

export const SII_USER_AGENT =
  "Mozilla/5.0 (compatible; EmissoSII/1.0; +https://emisso.ai)";

export const AUTH_EXPIRED_SENTINEL = "NO ESTA AUTENTICADO";

export class SiiAuthExpiredError extends Error {
  constructor(message = `SII session expired (${AUTH_EXPIRED_SENTINEL})`) {
    super(message);
    this.name = "SiiAuthExpiredError";
  }
}

export interface SiiHttpClientOptions {
  cookieJar?: CookieJar;
  /** Minimum ms between requests. Default 2000. */
  rateLimitMs?: number;
  /** Number of retries for 5xx / network errors. Default 3. */
  retries?: number;
  userAgent?: string;
  baseURL?: string;
}

export type SiiHttpClient = AxiosInstance & { cookieJar: CookieJar };

export function createSiiHttpClient(
  options?: SiiHttpClientOptions,
): SiiHttpClient {
  const {
    cookieJar = new CookieJar(),
    rateLimitMs = 2000,
    retries = 3,
    userAgent = SII_USER_AGENT,
    baseURL,
  } = options ?? {};

  const instance = axios.create({
    baseURL,
    timeout: 30_000,
    headers: { "User-Agent": userAgent },
  });

  // --- Rate limiting ---
  let lastRequestTime = 0;

  // --- Cookie jar + rate limit request interceptor ---
  instance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      // Rate limit: wait if needed
      if (rateLimitMs > 0) {
        const now = Date.now();
        const elapsed = now - lastRequestTime;
        if (lastRequestTime > 0 && elapsed < rateLimitMs) {
          await new Promise((resolve) =>
            setTimeout(resolve, rateLimitMs - elapsed),
          );
        }
        lastRequestTime = Date.now();
      }

      // Inject cookies from jar
      const url = buildUrl(config);
      if (url) {
        const cookieString = cookieJar.getCookieStringSync(url);
        if (cookieString) {
          config.headers.set("Cookie", cookieString);
        }
      }

      return config;
    },
  );

  // --- Response interceptor: store cookies + detect auth expired ---
  instance.interceptors.response.use((response: AxiosResponse) => {
    // Store cookies from response
    const url = buildUrl(response.config);
    const setCookieHeaders = response.headers["set-cookie"];
    if (url && setCookieHeaders) {
      for (const cookie of setCookieHeaders) {
        try {
          cookieJar.setCookieSync(cookie, url);
        } catch {
          // Ignore malformed cookies
        }
      }
    }

    // Detect auth expiry
    if (
      typeof response.data === "string" &&
      response.data.includes(AUTH_EXPIRED_SENTINEL)
    ) {
      throw new SiiAuthExpiredError();
    }

    return response;
  });

  // --- Retry on 5xx and network errors ---
  axiosRetry(instance, {
    retries,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response?.status !== undefined && error.response.status >= 500),
  });

  // Attach cookie jar to the instance
  const client = instance as SiiHttpClient;
  client.cookieJar = cookieJar;

  return client;
}

/** Build a full URL from an axios request config. */
function buildUrl(config: InternalAxiosRequestConfig): string | undefined {
  if (!config.url) return undefined;
  if (config.url.startsWith("http")) return config.url;
  if (config.baseURL) return `${config.baseURL.replace(/\/$/, "")}/${config.url.replace(/^\//, "")}`;
  return config.url;
}
