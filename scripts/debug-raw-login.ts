import { PlaywrightCrawler, log } from "crawlee";
import * as fs from "node:fs";
import * as path from "node:path";


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


const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "debug-output");
fs.mkdirSync(DIR, { recursive: true });

const env = loadEnv();

const RUT = env.SII_RUT;
const CLAVE = env.SII_PASSWORD;
const REFERENCIA = "https://misiir.sii.cl/cgi_misii/siihome.cgi";
const LOGIN_URL = `https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${REFERENCIA}`;

log.setLevel(log.LEVELS.INFO);

const crawler = new PlaywrightCrawler({
  headless: false, // Show browser so we can see what happens
  maxRequestsPerCrawl: 1,
  requestHandlerTimeoutSecs: 60,
  launchContext: {
    launchOptions: {
      slowMo: 500, // Slow down for visibility
    },
  },
  async requestHandler({ page, request }) {
    console.log(`\n=== Page loaded: ${request.loadedUrl} ===`);
    console.log(`Title: ${await page.title()}`);

    // Screenshot before login
    await page.screenshot({ path: path.join(DIR, "01-login-page.png") });
    console.log("Screenshot: 01-login-page.png");

    // Fill the login form
    console.log("\nFilling form...");
    await page.fill("#rutcntr", RUT);
    // Trigger the blur event (formatoRut) by clicking elsewhere
    await page.click("#clave");
    await page.fill("#clave", CLAVE);

    // Check what the JS set in hidden fields
    const hiddenRut = await page.inputValue("#rut");
    const hiddenDv = await page.inputValue("#dv");
    const hiddenRef = await page.inputValue("#referencia");
    console.log(`Hidden rut: "${hiddenRut}"`);
    console.log(`Hidden dv: "${hiddenDv}"`);
    console.log(`Hidden referencia: "${hiddenRef}"`);

    // Screenshot with form filled
    await page.screenshot({ path: path.join(DIR, "02-form-filled.png") });
    console.log("Screenshot: 02-form-filled.png");

    // Submit the form
    console.log("\nSubmitting form...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => { }),
      page.click("#bt_ingresar"),
    ]);

    // Wait a moment for any redirects
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    const finalTitle = await page.title();
    console.log(`\n=== After login ===`);
    console.log(`URL: ${finalUrl}`);
    console.log(`Title: ${finalTitle}`);

    // Screenshot after login
    await page.screenshot({ path: path.join(DIR, "03-after-login.png") });
    console.log("Screenshot: 03-after-login.png");

    // Dump page content
    const html = await page.content();
    fs.writeFileSync(path.join(DIR, "after-login.html"), html);
    console.log(`Page HTML saved (${html.length} chars)`);

    // Check for success/failure indicators
    if (html.includes("requerimiento no ha sido bien")) {
      console.log(">>> FAILED — Same server error <<<");
    } else if (html.includes("Transaccion Rechazada")) {
      console.log(">>> FAILED — Auth rejected <<<");
    } else if (finalUrl.includes("misiir") || finalUrl.includes("misii")) {
      console.log(">>> SUCCESS — Redirected to Mi SII! <<<");
    } else {
      console.log(`>>> Unknown result — check screenshots <<<`);
    }

    // Get cookies
    const cookies = await page.context().cookies();
    console.log(`\nCookies: ${cookies.length}`);
    for (const c of cookies) {
      console.log(`  ${c.name}=${c.value.slice(0, 50)}... domain=${c.domain} path=${c.path}`);
    }

    // Save cookies to file
    fs.writeFileSync(path.join(DIR, "cookies.json"), JSON.stringify(cookies, null, 2));
    console.log("Cookies saved to cookies.json");

    // Get page text for quick check
    const bodyText = await page.innerText("body").catch(() => "");
    console.log(`\nPage text preview: ${bodyText.slice(0, 500)}`);
  },
});

async function main() {
  await crawler.run([LOGIN_URL]);
  console.log("\nDone. Check scripts/debug-output/ for screenshots and HTML.");
}

main().catch(console.error);
