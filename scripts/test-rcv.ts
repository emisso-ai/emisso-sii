/**
 * Quick RCV integration test.
 * Usage: npx tsx scripts/test-rcv.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  portalLogin,
  listInvoices,
  fetchRcvResumen,
  fetchRcvDetalle,
  downloadRcvCsv,
  type PortalConfig,
  type SiiEnv,
} from "../packages/engine/src/index";

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
  console.log(`\n${c.bold}${c.magenta}═══ RCV Integration Test ═══${c.reset}\n`);

  const env = loadEnv();
  const siiEnv: SiiEnv = (env.SII_ENV as SiiEnv) || "production";
  const portalRut = env.SII_PORTAL_RUT;
  const portalPassword = env.SII_PORTAL_PASSWORD;

  if (!portalRut || !portalPassword) {
    console.log(`${c.red}Missing SII_PORTAL_RUT or SII_PORTAL_PASSWORD in .env${c.reset}`);
    process.exit(1);
  }

  const outputDir = ensureOutputDir();

  // Step 1: Login
  log(`Logging in as ${c.bold}${portalRut}${c.reset} (env: ${siiEnv})...`);
  const portalConfig: PortalConfig = {
    rut: portalRut,
    claveTributaria: portalPassword,
    env: siiEnv,
  };

  const session = await portalLogin(portalConfig, { headless: true });
  log(`${c.green}Login OK${c.reset} — ${session.httpClient.cookieJar.toJSON().cookies.length} cookies`);

  // Step 2: Try fetching resumen for a few recent months
  const now = new Date();
  const periods = [
    { year: now.getFullYear(), month: now.getMonth() + 1 }, // current month
    { year: now.getFullYear(), month: now.getMonth() || 12 }, // previous month
    { year: 2025, month: 12 },
    { year: 2025, month: 6 },
  ];

  for (const period of periods) {
    const periodStr = `${period.year}-${String(period.month).padStart(2, "0")}`;

    // Try Compras resumen
    log(`\n${c.cyan}Fetching COMPRA resumen for ${periodStr}...${c.reset}`);
    try {
      const resumen = await fetchRcvResumen(session, {
        rut: portalRut,
        issueType: "received",
        period,
      });
      const resumenFile = path.join(outputDir, `rcv-resumen-compra-${periodStr}.json`);
      fs.writeFileSync(resumenFile, JSON.stringify(resumen, null, 2), "utf-8");
      log(`${c.green}Resumen saved:${c.reset} ${resumenFile}`);
      log(`${c.dim}${JSON.stringify(resumen).slice(0, 300)}${c.reset}`);
    } catch (err: any) {
      log(`${c.red}Resumen failed:${c.reset} ${err.message}`);
      if (err.response) {
        log(`  Status: ${err.response.status}`);
        const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
        log(`  ${c.dim}${body.slice(0, 300)}${c.reset}`);
        fs.writeFileSync(path.join(outputDir, `rcv-error-${periodStr}.json`), body, "utf-8");
      }
    }

    // Try Ventas resumen
    log(`${c.cyan}Fetching VENTA resumen for ${periodStr}...${c.reset}`);
    try {
      const resumen = await fetchRcvResumen(session, {
        rut: portalRut,
        issueType: "issued",
        period,
      });
      const resumenFile = path.join(outputDir, `rcv-resumen-venta-${periodStr}.json`);
      fs.writeFileSync(resumenFile, JSON.stringify(resumen, null, 2), "utf-8");
      log(`${c.green}Resumen saved:${c.reset} ${resumenFile}`);
      log(`${c.dim}${JSON.stringify(resumen).slice(0, 300)}${c.reset}`);
    } catch (err: any) {
      log(`${c.red}Resumen failed:${c.reset} ${err.message}`);
      if (err.response) {
        log(`  Status: ${err.response.status}`);
        const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
        log(`  ${c.dim}${body.slice(0, 300)}${c.reset}`);
      }
    }
  }

  // Step 3: Try full listInvoices for the first period that has data
  for (const period of periods) {
    const periodStr = `${period.year}-${String(period.month).padStart(2, "0")}`;

    log(`\n${c.cyan}Fetching COMPRA detail for ${periodStr}...${c.reset}`);
    try {
      const detalle = await fetchRcvDetalle(session, {
        rut: portalRut,
        issueType: "received",
        period,
      });
      const detalleFile = path.join(outputDir, `rcv-detalle-compra-${periodStr}.json`);
      fs.writeFileSync(detalleFile, JSON.stringify(detalle, null, 2), "utf-8");
      log(`${c.green}Detalle saved:${c.reset} ${detalleFile}`);
      log(`${c.dim}${JSON.stringify(detalle).slice(0, 500)}${c.reset}`);

      // Try parsing with listInvoices
      const invoices = await listInvoices(session, {
        rut: portalRut,
        issueType: "received",
        period,
      });
      log(`${c.green}Parsed ${invoices.length} invoices${c.reset}`);
      for (const inv of invoices.slice(0, 5)) {
        log(`  ${inv.documentType} #${inv.number} | ${inv.issuer.rut} ${inv.issuer.name} | $${inv.totalAmount.toLocaleString()}`);
      }
      if (invoices.length > 5) log(`  ... and ${invoices.length - 5} more`);

      if (invoices.length > 0) break; // Found data, stop searching
    } catch (err: any) {
      log(`${c.red}Detalle failed:${c.reset} ${err.message}`);
      if (err.response) {
        log(`  Status: ${err.response.status}`);
        const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
        log(`  ${c.dim}${body.slice(0, 500)}${c.reset}`);
        fs.writeFileSync(path.join(outputDir, `rcv-detalle-error-${periodStr}.json`), body, "utf-8");
      }
    }
  }

  // Step 4: Try CSV export
  log(`\n${c.cyan}Trying CSV export...${c.reset}`);
  try {
    const csv = await downloadRcvCsv(session, {
      rut: portalRut,
      issueType: "received",
      period: periods[0],
    });
    if (csv) {
      const csvFile = path.join(outputDir, `rcv-export-compra.csv`);
      fs.writeFileSync(csvFile, csv, "utf-8");
      log(`${c.green}CSV saved:${c.reset} ${csvFile} (${csv.length} bytes)`);
      log(`${c.dim}${csv.slice(0, 300)}${c.reset}`);
    } else {
      log(`${c.yellow}CSV export returned empty${c.reset}`);
    }
  } catch (err: any) {
    log(`${c.red}CSV export failed:${c.reset} ${err.message}`);
    if (err.response) {
      log(`  Status: ${err.response.status}`);
      const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
      log(`  ${c.dim}${body.slice(0, 300)}${c.reset}`);
    }
  }

  console.log(`\n${c.bold}${c.magenta}═══ Done ═══${c.reset}\n`);
}

main().catch((err) => {
  console.error(`\n${c.red}Unhandled error:${c.reset}`, err);
  process.exit(1);
});
