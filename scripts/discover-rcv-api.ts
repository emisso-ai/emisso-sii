/**
 * One-time discovery script for RCV (Registro de Compras y Ventas) endpoints.
 *
 * Logs into SII portal via browser, navigates to RCV, intercepts all network
 * requests to capture the CSV download endpoint contracts.
 *
 * Usage:
 *   npx tsx scripts/discover-rcv-api.ts
 *
 * Runs NON-HEADLESS so you can watch the browser and interact if needed.
 * Outputs captured requests and sample CSVs to scripts/debug-output/.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PlaywrightCrawler } from "crawlee";
import { splitRut, getPortalAuthUrl, getPortalReferencia } from "../packages/engine/src/utils";
import type { SiiEnv, PortalConfig } from "../packages/engine/src/types";

const RCV_URL = "https://www4.sii.cl/consdcvinternetui/#/index";

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

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType: string;
}

interface CapturedResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  contentType: string;
  bodyPreview?: string;
  bodyLength?: number;
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
    vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return vars;
}

function ensureOutputDir(): string {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const dir = path.join(scriptDir, "debug-output");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function main() {
  console.log(`\n${c.bold}${c.magenta}═══ RCV API Discovery Script ═══${c.reset}\n`);

  const env = loadEnv();
  const siiEnv: SiiEnv = (env.SII_ENV as SiiEnv) || "production";
  const portalRut = env.SII_PORTAL_RUT;
  const portalPassword = env.SII_PORTAL_PASSWORD;

  if (!portalRut || !portalPassword) {
    console.log(`${c.red}Missing SII_PORTAL_RUT or SII_PORTAL_PASSWORD in .env${c.reset}`);
    process.exit(1);
  }

  const outputDir = ensureOutputDir();
  const capturedRequests: CapturedRequest[] = [];
  const capturedResponses: CapturedResponse[] = [];
  const savedFiles: string[] = [];

  const { rutBody, dv } = splitRut(portalRut);
  const authUrl = getPortalAuthUrl();
  const referencia = getPortalReferencia(siiEnv);
  const loginUrl = `${authUrl}/AUT2000/InicioAutenticacion/IngresoRutClave.html?${referencia}`;

  const crawler = new PlaywrightCrawler({
    headless: false, // Visible browser for manual observation
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 300, // 5 min timeout for manual interaction
    browserPoolOptions: {
      useFingerprints: false,
    },
    async requestHandler({ page, log: crawlerLog }) {
      // --- Step 1: Login ---
      crawlerLog.info("Waiting for login form...");
      await page.waitForSelector("#rutcntr", { timeout: 30_000 });

      crawlerLog.info(`Filling RUT: ${rutBody}-${dv}`);
      await page.fill("#rutcntr", `${rutBody}-${dv}`);
      await page.fill("#clave", portalPassword);

      crawlerLog.info("Clicking login...");
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 30_000 }),
        page.click("#bt_ingresar"),
      ]);

      log(`${c.green}Logged in.${c.reset} Landing page: ${page.url()}`);

      // --- Step 2: Set up request/response interception ---
      page.on("request", (req) => {
        const url = req.url();
        // Only capture SII-related requests
        if (!url.includes("sii.cl")) return;

        capturedRequests.push({
          url,
          method: req.method(),
          headers: req.headers(),
          postData: req.postData() ?? undefined,
          resourceType: req.resourceType(),
        });

        // Log interesting requests
        if (
          req.resourceType() === "xhr" ||
          req.resourceType() === "fetch" ||
          url.includes("csv") ||
          url.includes("download") ||
          url.includes("Descargar") ||
          url.includes("detalle") ||
          url.includes("rcv") ||
          url.includes("consdcv") ||
          url.includes("dcv")
        ) {
          log(`${c.cyan}→ ${req.method()} ${url}${c.reset}`);
          if (req.postData()) {
            log(`  ${c.dim}Body: ${req.postData()?.slice(0, 200)}${c.reset}`);
          }
        }
      });

      page.on("response", async (resp) => {
        const url = resp.url();
        if (!url.includes("sii.cl")) return;

        const contentType = resp.headers()["content-type"] ?? "";
        const captured: CapturedResponse = {
          url,
          status: resp.status(),
          headers: resp.headers(),
          contentType,
        };

        // Capture CSV or interesting responses
        if (
          contentType.includes("csv") ||
          contentType.includes("text/plain") ||
          contentType.includes("octet-stream") ||
          contentType.includes("json") ||
          url.includes("csv") ||
          url.includes("download") ||
          url.includes("Descargar") ||
          url.includes("detalle") ||
          url.includes("consdcv") ||
          url.includes("dcv")
        ) {
          try {
            const body = await resp.text();
            captured.bodyPreview = body.slice(0, 500);
            captured.bodyLength = body.length;

            // Save CSV files
            if (
              contentType.includes("csv") ||
              contentType.includes("octet-stream") ||
              body.includes(";")
            ) {
              const filename = `rcv-sample-${Date.now()}.csv`;
              const filepath = path.join(outputDir, filename);
              fs.writeFileSync(filepath, body, "utf-8");
              savedFiles.push(filepath);
              log(`${c.green}Saved CSV:${c.reset} ${filepath} (${body.length} bytes)`);
            }
          } catch {
            // Response body may not be available
          }
        }

        capturedResponses.push(captured);
      });

      // --- Step 3: Navigate to RCV ---
      log(`Navigating to RCV: ${RCV_URL}`);
      await page.goto(RCV_URL, { waitUntil: "networkidle", timeout: 30_000 });
      log(`RCV page loaded: ${page.url()}`);

      // Wait for Angular SPA to initialize
      await page.waitForTimeout(3000);

      // --- Step 4: Manual interaction phase ---
      console.log(`\n${c.bold}${c.yellow}═══ Manual Interaction Phase ═══${c.reset}`);
      console.log(`${c.yellow}The browser is open at the RCV consulta page. Please:${c.reset}`);
      console.log(`  1. Select a period that has data and click "Consultar"`);
      console.log(`  2. Navigate the Compras/Ventas tabs`);
      console.log(`  3. Click "Descargar Detalles" (CSV) on both tabs`);
      console.log(`  4. Explore any other download buttons`);
      console.log(`  5. Press Enter in this terminal when done\n`);
      console.log(`${c.dim}All XHR/fetch requests to sii.cl are being captured.${c.reset}\n`);

      // Wait for user to press Enter
      await new Promise<void>((resolve) => {
        process.stdin.resume();
        process.stdin.once("data", () => {
          process.stdin.pause();
          resolve();
        });
      });

      log("Capturing final state...");
    },
  });

  await crawler.run([loginUrl]);

  // --- Save discovery results ---
  const discoveryData = {
    timestamp: new Date().toISOString(),
    environment: siiEnv,
    rut: portalRut,
    requests: capturedRequests.filter(
      (r) =>
        r.resourceType === "xhr" ||
        r.resourceType === "fetch" ||
        r.url.includes("rcv") ||
        r.url.includes("csv") ||
        r.url.includes("download") ||
        r.url.includes("Descargar") ||
        r.url.includes("detalle") ||
        r.url.includes("consdcv") ||
        r.url.includes("dcv"),
    ),
    responses: capturedResponses.filter(
      (r) =>
        r.url.includes("rcv") ||
        r.url.includes("csv") ||
        r.url.includes("download") ||
        r.url.includes("Descargar") ||
        r.url.includes("detalle") ||
        r.url.includes("consdcv") ||
        r.url.includes("dcv"),
    ),
    allRequestUrls: capturedRequests.map((r) => `${r.method} ${r.url}`),
    savedFiles,
  };

  const discoveryPath = path.join(outputDir, "rcv-discovery.json");
  fs.writeFileSync(discoveryPath, JSON.stringify(discoveryData, null, 2), "utf-8");

  console.log(`\n${c.bold}${c.magenta}═══ Discovery Results ═══${c.reset}\n`);
  log(`Total requests captured: ${capturedRequests.length}`);
  log(`RCV-related requests: ${discoveryData.requests.length}`);
  log(`RCV-related responses: ${discoveryData.responses.length}`);
  log(`CSV files saved: ${savedFiles.length}`);
  log(`Discovery data: ${discoveryPath}`);

  if (discoveryData.requests.length > 0) {
    console.log(`\n${c.cyan}Key RCV requests:${c.reset}`);
    for (const req of discoveryData.requests) {
      console.log(`  ${req.method} ${req.url}`);
      if (req.postData) {
        console.log(`    ${c.dim}Body: ${req.postData.slice(0, 200)}${c.reset}`);
      }
    }
  }

  console.log();
}

main().catch((err) => {
  console.error(`\n${c.red}Unhandled error:${c.reset}`, err);
  process.exit(1);
});
