const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "portable");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

function resolveFile(urlPath) {
  const cleanPath = (urlPath || "/").split("?")[0];
  const relativePath = cleanPath === "/" ? "/index.html" : cleanPath;
  const fullPath = path.normalize(path.join(root, relativePath));
  if (!fullPath.startsWith(root)) return null;
  return fullPath;
}

const server = http.createServer((req, res) => {
  const filePath = resolveFile(req.url);
  if (!filePath) {
    send(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, contentTypes[ext] || "application/octet-stream");
  });
});

server.listen(port, () => {
  console.log(`Portable server running at http://localhost:${port}`);
});
