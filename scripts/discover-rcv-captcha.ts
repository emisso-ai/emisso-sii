/**
 * Discover how the RCV Angular SPA handles reCAPTCHA for detail requests.
 * Runs non-headless, intercepts all network traffic.
 * Usage: npx tsx scripts/discover-rcv-captcha.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { purgeDefaultStorages, PlaywrightCrawler } from "crawlee";
import { splitRut, getPortalAuthUrl, getPortalReferencia } from "../packages/engine/src/utils";
import { createSiiHttpClient } from "../packages/engine/src/http";
import { CookieJar, Cookie } from "tough-cookie";


async function main() {

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
      vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return vars;
  }


  await purgeDefaultStorages();

  const env = loadEnv();

  const { rutBody, dv } = splitRut(env.SII_RUT);
  const authUrl = getPortalAuthUrl();
  const referencia = getPortalReferencia("production");
  const loginUrl = `${authUrl}/AUT2000/InicioAutenticacion/IngresoRutClave.html?${referencia}`;

  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const outputDir = path.join(scriptDir, "debug-output");
  fs.mkdirSync(outputDir, { recursive: true });

  const captured: Array<{
    method: string;
    url: string;
    postData?: string;
    responseStatus?: number;
    responseBody?: string;
  }> = [];

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
    headless: false,
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 300,
    browserPoolOptions: { useFingerprints: false },
    async requestHandler({ page, log }) {
      // Login
      await page.waitForSelector("#rutcntr", { timeout: 30000 });
      await page.fill("#rutcntr", `${rutBody}-${dv}`);
      await page.fill("#clave", env.SII_PASSWORD);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }),
        page.click("#bt_ingresar"),
      ]);
      log.info("Logged in: " + page.url());

      // Capture cookies for logout later
      extractedCookies = await page.context().cookies();

      // Intercept ALL requests
      page.on("request", (req) => {
        const url = req.url();
        if (
          url.includes("facadeService") ||
          url.includes("recaptcha") ||
          url.includes("google.com/recaptcha") ||
          url.includes("gstatic") ||
          url.includes("settingsService") ||
          url.includes("aaSession")
        ) {
          captured.push({
            method: req.method(),
            url,
            postData: req.postData() ?? undefined,
          });
        }
      });

      page.on("response", async (resp) => {
        const url = resp.url();
        if (
          url.includes("facadeService") ||
          url.includes("recaptcha") ||
          url.includes("settingsService")
        ) {
          try {
            const body = await resp.text();
            const entry = captured.find(
              (c) => c.url === url && !c.responseBody,
            );
            if (entry) {
              entry.responseStatus = resp.status();
              entry.responseBody = body.slice(0, 3000);
            }
          } catch { }
        }
      });

      // Navigate to RCV
      await page.goto("https://www4.sii.cl/consdcvinternetui/#/index", {
        waitUntil: "networkidle",
      });
      log.info("RCV page loaded");

      // Wait for user to interact — navigate to March 2026 COMPRA and click detail
      log.info(
        "Browser open for 120s — navigate to a period with data and click on a doc type row...",
      );
      await page.waitForTimeout(120000);

      // Save captured requests
      const outFile = path.join(outputDir, "rcv-captcha-trace.json");
      fs.writeFileSync(outFile, JSON.stringify(captured, null, 2));
      log.info(`Saved ${captured.length} captured requests to ${outFile}`);
    },
  });

  await crawler.run([loginUrl]);

  // Logout to release the session
  console.log("Logging out...");
  const jar = new CookieJar();
  for (const c of extractedCookies) {
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
  const client = createSiiHttpClient({ cookieJar: jar, rateLimitMs: 0 });
  await client.get(`${authUrl}/cgi_AUT2000/CAutInwor498.cgi?https://www.sii.cl`, {
    validateStatus: () => true,
  });
  console.log("Logged out.");
}

main().catch(console.error);
