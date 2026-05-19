import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = join(rootDir, "dist");
const envPath = join(rootDir, ".env.local");
const port = Number(process.env.PORT || 8003);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function loadLocalEnv() {
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function enhanceResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (payload) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  };
}

function isFile(filePath) {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function sendStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  const pathname = decodeURIComponent(url.pathname);
  const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(distDir, normalizedPath);

  if (pathname === "/" || !isFile(filePath)) {
    filePath = join(distDir, "index.html");
  }

  if (!filePath.startsWith(distDir) || !isFile(filePath)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  res.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
  createReadStream(filePath).pipe(res);
}

async function handleApi(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  const apiModules = {
    "/api/create-base-usdc-order": "../api/create-base-usdc-order.js",
    "/api/create-points-checkout": "../api/create-points-checkout.js",
    "/api/stripe-webhook": "../api/stripe-webhook.js",
    "/api/verify-base-usdc-payment": "../api/verify-base-usdc-payment.js"
  };
  const modulePath = apiModules[url.pathname];

  if (!modulePath) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  enhanceResponse(res);
  const resolvedModulePath = new URL(modulePath, import.meta.url);
  const mod = await import(`${pathToFileURL(fileURLToPath(resolvedModulePath)).href}?t=${Date.now()}`);
  await mod.default(req, res);
}

loadLocalEnv();

createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res).catch((error) => {
      console.error("Local API failed", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Local API failed." }));
    });
    return;
  }

  sendStatic(req, res);
}).listen(port, host, () => {
  console.log(`Local Stripe test server ready at http://${host}:${port}`);
});
