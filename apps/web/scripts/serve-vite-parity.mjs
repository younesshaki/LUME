import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const base = process.env.VITE_PARITY_BUILD_ROOT;
if (!base)
  throw new Error(
    "Set VITE_PARITY_BUILD_ROOT to the two frozen production builds",
  );
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
};
for (const [name, port] of [
  ["before", 5174],
  ["after", 5175],
]) {
  const root = path.resolve(base, "vite-" + name);
  http
    .createServer((req, res) => {
      const u = new URL(req.url, "http://local");
      let file = path.resolve(root, "." + decodeURIComponent(u.pathname));
      if (!file.startsWith(root + "/")) file = path.join(root, "index.html");
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (path.extname(u.pathname)) {
          res.writeHead(404).end("Asset not found");
          return;
        }
        file = path.join(root, "index.html");
      }
      res.setHeader(
        "Content-Type",
        mime[path.extname(file)] ?? "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-store");
      fs.createReadStream(file).pipe(res);
    })
    .listen(port, "127.0.0.1", () =>
      console.log(name + " frozen Vite production build: " + port),
    );
}
