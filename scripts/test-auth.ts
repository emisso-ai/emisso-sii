/**
 * Interactive debug script for testing SII authentication flows.
 *
 * Usage:
 *   npm run test:integration
 *
 * Reads credentials from .env file. Supports:
 *   - SOAP certificate auth (SII_CERT_PATH + SII_CERT_PASSWORD)
 *   - Portal auth (SII_PORTAL_RUT + SII_PORTAL_PASSWORD)
 *   - Unified session (both sets of credentials)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  getSeed,
  signSeed,
  getToken,
  portalLogin,
  verifyPortalSession,
  createSiiSession,
  listInvoices,
  type SiiConfig,
  type PortalConfig,
  type SiiEnv,
} from "../packages/engine/src/index";

// --- ANSI colors ---
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`${c.dim}[${ts}]${c.reset} ${msg}`);
}

function logStep(step: string) {
  console.log(`\n${c.cyan}${c.bold}▸ ${step}${c.reset}`);
}

function logSuccess(msg: string) {
  log(`${c.green}✓${c.reset} ${msg}`);
}

function logError(msg: string) {
  log(`${c.red}✗${c.reset} ${msg}`);
}

function logWarn(msg: string) {
  log(`${c.yellow}⚠${c.reset} ${msg}`);
}

function truncate(str: string, maxLen = 500): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `... (${str.length - maxLen} more chars)`;
}

function durationMs(start: number): string {
  return `${(Date.now() - start).toLocaleString()}ms`;
}

function dumpHtml(html: string, prefix: string): string | undefined {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const dir = path.join(scriptDir, "debug-output");
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${prefix}-${Date.now()}.html`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, html, "utf-8");
  return filepath;
}

// --- Load .env ---
function loadEnv(): Record<string, string> {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const envPath = path.resolve(scriptDir, "..", ".env");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    vars[key] = value;
  }
  return vars;
}

// --- Main ---
async function main() {
  console.log(`\n${c.bold}${c.magenta}═══ SII Authentication Debug Script ═══${c.reset}\n`);

  const env = loadEnv();

  const siiEnv: SiiEnv = (env.SII_ENV as SiiEnv) || "certification";
  const certPath = env.SII_CERT_PATH;
  const certPassword = env.SII_CERT_PASSWORD;
  const portalRut = env.SII_PORTAL_RUT;
  const portalPassword = env.SII_PORTAL_PASSWORD;

  const hasCert = !!(certPath && certPassword !== undefined);
  const hasPortal = !!(portalRut && portalPassword);

  log(`Environment: ${c.bold}${siiEnv}${c.reset}`);
  log(`Certificate auth: ${hasCert ? c.green + "configured" : c.yellow + "not configured"}${c.reset}`);
  log(`Portal auth: ${hasPortal ? c.green + "configured" : c.yellow + "not configured"}${c.reset}`);

  if (!hasCert && !hasPortal) {
    console.log(`\n${c.yellow}No credentials configured.${c.reset}`);
    console.log(`Copy .env.example to .env and fill in your credentials.\n`);
    process.exit(0);
  }

  const results: { test: string; status: string; duration: string }[] = [];

  // --- SOAP Certificate Auth ---
  if (hasCert) {
    logStep("SOAP Certificate Authentication");

    const siiConfig: SiiConfig = {
      certPath: certPath!,
      certPassword: certPassword ?? "",
      env: siiEnv,
    };

    let soapOk = false;
    const soapStart = Date.now();

    try {
      // Step 1: Get seed
      log("Requesting seed from SII...");
      const seedStart = Date.now();
      const seed = await getSeed(siiConfig);
      logSuccess(`Seed received: ${c.bold}${seed}${c.reset} (${durationMs(seedStart)})`);

      // Step 2: Sign seed
      log("Signing seed with certificate...");
      const signStart = Date.now();
      const signedXml = signSeed(seed, siiConfig.certPath, siiConfig.certPassword);
      logSuccess(`Signed XML (${signedXml.length} chars) (${durationMs(signStart)})`);
      console.log(`${c.dim}${truncate(signedXml)}${c.reset}`);

      // Step 3: Get token
      log("Exchanging signed seed for token...");
      const tokenStart = Date.now();
      const token = await getToken(signedXml, siiConfig);
      logSuccess(`Token: ${c.bold}${token.token}${c.reset} (${durationMs(tokenStart)})`);
      logSuccess(`Expires: ${token.expiresAt.toISOString()}`);

      soapOk = true;
      results.push({ test: "SOAP Auth", status: `${c.green}PASS${c.reset}`, duration: durationMs(soapStart) });
    } catch (err: any) {
      logError(`SOAP auth failed: ${err.message}`);
      if (err.response) {
        logError(`Status: ${err.response.status}`);
        const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
        console.log(`${c.dim}${truncate(body)}${c.reset}`);
        const dumped = dumpHtml(body, "soap-error");
        if (dumped) logWarn(`Response dumped to: ${dumped}`);
      }
      results.push({ test: "SOAP Auth", status: `${c.red}FAIL${c.reset}`, duration: durationMs(soapStart) });
    }
  }

  // --- Portal Auth ---
  if (hasPortal) {
    logStep("Portal Authentication");

    const portalConfig: PortalConfig = {
      rut: portalRut!,
      claveTributaria: portalPassword!,
      env: siiEnv,
    };

    const portalStart = Date.now();

    try {
      // Step 1: Browser-based login
      log(`Launching browser login as ${c.bold}${portalRut}${c.reset}...`);
      log(`${c.dim}(Playwright will handle Queue-it + JS challenges)${c.reset}`);
      const loginStart = Date.now();
      const session = await portalLogin(portalConfig, { headless: true });
      logSuccess(`Browser login completed (${durationMs(loginStart)})`);
      logSuccess(`isAuthenticated: ${session.isAuthenticated}`);

      // Step 2: Verify
      log("Verifying portal session...");
      const verifyStart = Date.now();
      const verified = await verifyPortalSession(session.httpClient, siiEnv);
      if (verified) {
        logSuccess(`Session verified (${durationMs(verifyStart)})`);
      } else {
        logWarn(`Session verification returned false (${durationMs(verifyStart)})`);
        // Dump the verification response for debugging
        try {
          const { getPortalBaseUrl } = await import("../packages/engine/src/utils");
          const portalUrl = getPortalBaseUrl(siiEnv);
          const resp = await session.httpClient.get(`${portalUrl}/cgi_dte/UPL/DTEUpload`);
          const html = typeof resp.data === "string" ? resp.data : "";
          if (html) {
            console.log(`${c.dim}${truncate(html)}${c.reset}`);
            const dumped = dumpHtml(html, "portal-verify");
            if (dumped) logWarn(`Response dumped to: ${dumped}`);
          }
        } catch {
          // ignore — we already logged the warning
        }
      }

      // Log cookie count
      const cookies = session.httpClient.cookieJar.toJSON().cookies;
      logSuccess(`Cookies stored: ${cookies.length}`);
      for (const cookie of cookies) {
        log(`  ${c.dim}${cookie.key}=${truncate(cookie.value ?? "", 40)} (${cookie.domain})${c.reset}`);
      }

      results.push({
        test: "Portal Auth",
        status: verified ? `${c.green}PASS${c.reset}` : `${c.yellow}PARTIAL${c.reset}`,
        duration: durationMs(portalStart),
      });
    } catch (err: any) {
      logError(`Portal auth failed: ${err.message}`);
      if (err.response) {
        logError(`Status: ${err.response.status} ${err.response.config?.url ?? ""}`);
        const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
        console.log(`${c.dim}${truncate(body)}${c.reset}`);
        const dumped = dumpHtml(body, "portal-error");
        if (dumped) logWarn(`Response dumped to: ${dumped}`);
      }
      results.push({ test: "Portal Auth", status: `${c.red}FAIL${c.reset}`, duration: durationMs(portalStart) });
    }
  }

  // --- RCV Fetch ---
  if (hasPortal) {
    logStep("RCV Invoice Fetch");

    const rcvStart = Date.now();

    try {
      // Reuse the portal session from above if available, otherwise create new
      const portalConfig: PortalConfig = {
        rut: portalRut!,
        claveTributaria: portalPassword!,
        env: siiEnv,
      };

      log("Logging in for RCV fetch...");
      const rcvSession = await portalLogin(portalConfig, { headless: true });

      const now = new Date();
      const period = { year: now.getFullYear(), month: now.getMonth() + 1 };

      log(`Fetching received invoices for ${period.year}-${String(period.month).padStart(2, "0")}...`);
      const received = await listInvoices(rcvSession, {
        rut: portalRut!,
        issueType: "received",
        period,
      });
      logSuccess(`Received (compras): ${received.length} invoices`);

      if (received.length > 0) {
        const first = received[0];
        log(`  First: ${first.documentType} #${first.number} from ${first.issuer.rut} — $${first.totalAmount.toLocaleString()}`);
      }

      log(`Fetching issued invoices for ${period.year}-${String(period.month).padStart(2, "0")}...`);
      const issued = await listInvoices(rcvSession, {
        rut: portalRut!,
        issueType: "issued",
        period,
      });
      logSuccess(`Issued (ventas): ${issued.length} invoices`);

      if (issued.length > 0) {
        const first = issued[0];
        log(`  First: ${first.documentType} #${first.number} to ${first.receiver.rut} — $${first.totalAmount.toLocaleString()}`);
      }

      results.push({
        test: "RCV Fetch",
        status: `${c.green}PASS${c.reset}`,
        duration: durationMs(rcvStart),
      });
    } catch (err: any) {
      logError(`RCV fetch failed: ${err.message}`);
      if (err.response) {
        logError(`Status: ${err.response.status} ${err.response.config?.url ?? ""}`);
        const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
        console.log(`${c.dim}${truncate(body)}${c.reset}`);
        const dumped = dumpHtml(body, "rcv-error");
        if (dumped) logWarn(`Response dumped to: ${dumped}`);
      }
      results.push({ test: "RCV Fetch", status: `${c.red}FAIL${c.reset}`, duration: durationMs(rcvStart) });
    }
  }

  // --- Unified Session ---
  if (hasCert && hasPortal) {
    logStep("Unified Session (createSiiSession)");

    const siiConfig: SiiConfig = {
      certPath: certPath!,
      certPassword: certPassword ?? "",
      env: siiEnv,
    };
    const portalConfig: PortalConfig = {
      rut: portalRut!,
      claveTributaria: portalPassword!,
      env: siiEnv,
    };

    const unifiedStart = Date.now();

    try {
      log("Creating unified session...");
      const session = await createSiiSession(siiConfig, portalConfig);
      logSuccess(`Token: ${c.bold}${session.token.token}${c.reset}`);
      logSuccess(`Portal authenticated: ${session.portal.isAuthenticated}`);
      const unifiedCookies = session.portal.httpClient.cookieJar.toJSON().cookies;
      logSuccess(`Portal cookies: ${unifiedCookies.length}`);
      results.push({ test: "Unified Session", status: `${c.green}PASS${c.reset}`, duration: durationMs(unifiedStart) });
    } catch (err: any) {
      logError(`Unified session failed: ${err.message}`);
      results.push({ test: "Unified Session", status: `${c.red}FAIL${c.reset}`, duration: durationMs(unifiedStart) });
    }
  }

  // --- Summary ---
  console.log(`\n${c.bold}${c.magenta}═══ Summary ═══${c.reset}\n`);
  console.log(`  ${"Test".padEnd(20)} ${"Status".padEnd(20)} Duration`);
  console.log(`  ${"─".repeat(20)} ${"─".repeat(20)} ${"─".repeat(12)}`);
  for (const r of results) {
    console.log(`  ${r.test.padEnd(20)} ${r.status.padEnd(20)} ${r.duration}`);
  }
  console.log();
}

main().catch((err) => {
  console.error(`\n${c.red}Unhandled error:${c.reset}`, err);
  process.exit(1);
});
