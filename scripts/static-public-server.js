#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.cwd(), process.env.STATIC_ROOT || "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4178);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".glb", "model/gltf-binary"],
  [".gltf", "model/gltf+json"],
  [".mp4", "video/mp4"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ico", "image/x-icon"]
]);

function resolveRequestPath(url) {
  const parsed = new URL(url, `http://${host}:${port}`);
  const decoded = decodeURIComponent(parsed.pathname);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, normalized);
  if (!filePath.startsWith(root)) {
    return null;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  return filePath;
}

const server = createServer((req, res) => {
  const filePath = resolveRequestPath(req.url || "/");
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "cache-control": "no-store",
    "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream"
  });
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Static server ready at http://${host}:${port}`);
  console.log(`Serving ${root}`);
});
