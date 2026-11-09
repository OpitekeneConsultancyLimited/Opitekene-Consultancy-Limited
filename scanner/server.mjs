// TaxComp document malware scanner: a minimal HTTP front for ClamAV (clamd).
//
//   POST /scan    Authorization: Bearer <SCANNER_TOKEN>, body = raw file bytes
//                 -> 200 {"clean": true}  or  {"clean": false, "signature": "..."}
//                 -> 4xx/5xx on auth, size or scanner errors (the Worker treats
//                    any non-200 as "not clean", so failures block uploads)
//   GET  /health  -> 200 when clamd answers PING
//
// No dependencies. File contents are streamed to clamd's INSTREAM command and
// are never written to disk or logged; logs hold only outcome, size and timing.
import { createServer } from "node:http";
import { connect } from "node:net";
import { timingSafeEqual, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

export const MAX_SCAN_BYTES = 16 * 1024 * 1024;
const CHUNK = 64 * 1024;

function clamdCommand({ host, port, timeoutMs }, write) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const chunks = [];
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error("clamd timed out")));
    socket.on("data", (data) => chunks.push(data));
    socket.on("error", reject);
    socket.on("close", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim()));
    socket.on("connect", () => write(socket));
  });
}

/** Streams bytes to clamd INSTREAM. Returns { clean, signature }. */
export async function scanWithClamd(bytes, { host = "127.0.0.1", port = 3310, timeoutMs = 60_000 } = {}) {
  const reply = await clamdCommand({ host, port, timeoutMs }, (socket) => {
    socket.write("zINSTREAM\0");
    for (let offset = 0; offset < bytes.length; offset += CHUNK) {
      const piece = bytes.subarray(offset, offset + CHUNK);
      const size = Buffer.alloc(4);
      size.writeUInt32BE(piece.length);
      socket.write(size);
      socket.write(piece);
    }
    socket.end(Buffer.alloc(4)); // zero-length chunk terminates the stream
  });
  if (/^stream: OK$/.test(reply)) return { clean: true };
  const found = reply.match(/^stream: (.+) FOUND$/);
  if (found) return { clean: false, signature: found[1] };
  throw new Error(`Unexpected clamd reply: ${reply.slice(0, 120)}`);
}

export async function clamdHealthy(options = {}) {
  try {
    return (await clamdCommand({ host: "127.0.0.1", port: 3310, timeoutMs: 5_000, ...options }, (s) => s.end("zPING\0"))) === "PONG";
  } catch {
    return false;
  }
}

function tokenMatches(expected, header) {
  const supplied = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(a, b) && supplied.length > 0;
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}

export function createScannerServer({ token, clamd = {}, log = (entry) => console.log(JSON.stringify(entry)) } = {}) {
  if (typeof token !== "string" || token.length < 32) throw new Error("SCANNER_TOKEN must be at least 32 characters.");
  return createServer(async (req, res) => {
    const started = Date.now();
    if (req.method === "GET" && req.url === "/health") {
      return send(res, (await clamdHealthy(clamd)) ? 200 : 503, { ok: true });
    }
    if (req.method !== "POST" || req.url !== "/scan") return send(res, 404, { error: "Not found." });
    if (!tokenMatches(token, req.headers.authorization)) {
      req.resume();
      return send(res, 401, { error: "Unauthorized." });
    }
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > MAX_SCAN_BYTES) {
      req.resume();
      return send(res, 413, { error: "File too large to scan." });
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_SCAN_BYTES) return send(res, 413, { error: "File too large to scan." });
        chunks.push(chunk);
      }
      const result = await scanWithClamd(Buffer.concat(chunks), clamd);
      log({ event: "scan", clean: result.clean, signature: result.signature || null, bytes: size, ms: Date.now() - started });
      return send(res, 200, result);
    } catch (error) {
      log({ event: "scan-error", bytes: size, ms: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
      return send(res, 502, { error: "Scanner unavailable." });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8080);
  createScannerServer({ token: process.env.SCANNER_TOKEN }).listen(port, "0.0.0.0", () => {
    console.log(JSON.stringify({ event: "listening", port }));
  });
}
