// 武汉职业技术大学，作者：池行强。
// 独立运行或由 Electron 主进程启动；只公开白名单资源及登录 API。
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

function createAppServer(options = {}) {
const host = options.host || process.env.HOST || "0.0.0.0";
let port = Number(options.port ?? process.env.PORT ?? 8080);
const pagePath = path.join(__dirname, "fiber-rayleigh-simulator.html");
const scanPagePath = path.join(__dirname, "scan-login.html");
const qrLibraryPath = path.join(__dirname, "qrcode-generator.js");
const SESSION_COOKIE = "fiber_session";
const TICKET_TTL_MS = options.ticketTtlMs || 2 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_USER = process.env.APP_LOGIN_USER || "admin";
const LOGIN_PASSWORD = process.env.APP_LOGIN_PASSWORD || "admin";
const tickets = new Map();
const sessions = new Map();
const startRates = new Map();

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers
  });
  res.end(body);
}

function sendJson(res, status, value, headers = {}) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(value), headers);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 8192) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest();
}

function matchesSecret(candidate, expectedHash) {
  return crypto.timingSafeEqual(digest(candidate), expectedHash);
}

function getCookie(req, name) {
  const prefix = `${name}=`;
  for (const part of (req.headers.cookie || "").split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) {
      try { return decodeURIComponent(value.slice(prefix.length)); }
      catch { return ""; }
    }
  }
  return "";
}

function newSession() {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(digest(token).toString("hex"), Date.now() + SESSION_TTL_MS);
  return token;
}

function cookieHeader(token, maxAge = SESSION_TTL_MS / 1000) {
  const secure = (options.publicUrl || process.env.PUBLIC_URL || "").startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict; Path=/${secure}`;
}

function authenticated(req) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return false;
  const key = digest(token).toString("hex");
  const expiresAt = sessions.get(key);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(key);
    return false;
  }
  return true;
}

function getLanIPv4() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)) {
        return address.address;
      }
    }
  }
  return "127.0.0.1";
}

function scanUrl(req, id, mobileKey) {
  const query = new URLSearchParams({ ticket: id, key: mobileKey });
  // 部署到 HTTPS 反向代理时显式设置 PUBLIC_URL，避免猜测代理请求头。
  const publicUrl = options.publicUrl || process.env.PUBLIC_URL;
  if (publicUrl) return new URL(`/scan?${query}`, publicUrl).href;
  let requestHost = "localhost";
  try { requestHost = new URL(`http://${req.headers.host || "localhost"}`).host; }
  catch { /* Use local fallback for an invalid Host header. */ }
  const parsed = new URL(`http://${requestHost}`);
  const hostname = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ? getLanIPv4() : parsed.hostname;
  return `http://${hostname}:${parsed.port || port}/scan?${query}`;
}

function rateAllowed(ip) {
  const now = Date.now();
  const entry = startRates.get(ip);
  if (!entry || entry.until <= now) {
    startRates.set(ip, { count: 1, until: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

function ticketFor(id, keyName, candidate) {
  const ticket = tickets.get(String(id || ""));
  if (!ticket || ticket.expiresAt <= Date.now() || !matchesSecret(candidate, ticket[keyName])) return null;
  return ticket;
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || "localhost"}`); }
  catch {
    sendJson(res, 400, { error: "bad request" });
    return;
  }
  const pathname = url.pathname;

  const configuredOrigin = options.publicUrl || process.env.PUBLIC_URL;
  const allowedOrigin = configuredOrigin ? new URL(configuredOrigin).origin : url.origin;
  if (req.method === "POST" && req.headers.origin && req.headers.origin !== allowedOrigin) {
    sendJson(res, 403, { error: "不允许跨站点请求" });
    return;
  }

  const staticScripts = { "/project.js": "project.js", "/app-controls.js": "app-controls.js", "/lucide.min.js": "lucide.min.js" };
  if (req.method === "GET" && Object.hasOwn(staticScripts, pathname)) {
    fs.readFile(path.join(__dirname, staticScripts[pathname]), (error, data) => error
      ? sendJson(res, 404, { error: "resource unavailable" })
      : send(res, 200, "text/javascript; charset=utf-8", data));
    return;
  }

  if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    fs.readFile(pagePath, (error, data) => error
      ? send(res, 500, "text/plain; charset=utf-8", "无法读取仿真页面")
      : send(res, 200, "text/html; charset=utf-8", data));
    return;
  }
  if (req.method === "GET" && pathname === "/scan") {
    fs.readFile(scanPagePath, (error, data) => error
      ? send(res, 500, "text/plain; charset=utf-8", "无法读取扫码确认页")
      : send(res, 200, "text/html; charset=utf-8", data));
    return;
  }
  if (req.method === "GET" && pathname === "/qrcode-generator.js") {
    fs.readFile(qrLibraryPath, (error, data) => error
      ? send(res, 500, "text/plain; charset=utf-8", "二维码组件不可用")
      : send(res, 200, "text/javascript; charset=utf-8", data));
    return;
  }

  if (req.method === "GET" && pathname === "/api/session") {
    sendJson(res, 200, { authenticated: authenticated(req) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    try {
      const body = await readJson(req);
      if (body.username !== LOGIN_USER || body.password !== LOGIN_PASSWORD) {
        sendJson(res, 401, { error: "登录名或密码不正确" });
        return;
      }
      const sessionToken = newSession();
      sendJson(res, 200, { authenticated: true }, { "Set-Cookie": cookieHeader(sessionToken) });
    } catch {
      sendJson(res, 400, { error: "登录请求无效" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const current = getCookie(req, SESSION_COOKIE);
    if (current) sessions.delete(digest(current).toString("hex"));
    sendJson(res, 200, { authenticated: false }, { "Set-Cookie": cookieHeader("", 0) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/qr/start") {
    const ip = req.socket.remoteAddress || "unknown";
    if (!rateAllowed(ip)) {
      sendJson(res, 429, { error: "二维码请求过于频繁，请稍后再试" });
      return;
    }
    const id = crypto.randomBytes(16).toString("hex");
    const mobileKey = crypto.randomBytes(32).toString("base64url");
    const pollKey = crypto.randomBytes(32).toString("base64url");
    const ticket = {
      mobileKey: digest(mobileKey),
      pollKey: digest(pollKey),
      expiresAt: Date.now() + TICKET_TTL_MS,
      state: "pending",
      sessionToken: null
    };
    tickets.set(id, ticket);
    sendJson(res, 200, { id, pollKey, expiresAt: ticket.expiresAt, scanUrl: scanUrl(req, id, mobileKey) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/qr/status") {
    const ticket = ticketFor(url.searchParams.get("ticket"), "pollKey", url.searchParams.get("key"));
    if (!ticket) {
      sendJson(res, 410, { state: "expired" });
      return;
    }
    const state = ticket.state;
    const headers = state === "approved" ? { "Set-Cookie": cookieHeader(ticket.sessionToken) } : {};
    // 已领取票据不能在退出后重新签发原会话。
    if (state === "approved") { ticket.state = "consumed"; ticket.sessionToken = null; }
    sendJson(res, 200, { state, expiresAt: ticket.expiresAt }, headers);
    return;
  }

  if (req.method === "POST" && pathname === "/api/qr/approve") {
    try {
      const body = await readJson(req);
      const ticket = ticketFor(body.ticket, "mobileKey", body.key);
      if (!ticket || ticket.state !== "pending") {
        sendJson(res, 410, { error: "二维码已过期或已使用，请在电脑上刷新二维码" });
        return;
      }
      ticket.state = "approved";
      ticket.sessionToken = newSession();
      sendJson(res, 200, { approved: true });
    } catch {
      sendJson(res, 400, { error: "扫码确认请求无效" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/qr/cancel") {
    try {
      const body = await readJson(req);
      const ticket = ticketFor(body.ticket, "pollKey", body.key);
      if (ticket && ticket.state === "pending") ticket.state = "cancelled";
      sendJson(res, 200, { cancelled: true });
    } catch {
      sendJson(res, 400, { error: "取消请求无效" });
    }
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

// 自动清理过期一次性票据和服务器端会话。
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, ticket] of tickets) if (ticket.expiresAt <= now) tickets.delete(id);
  for (const [token, expiresAt] of sessions) if (expiresAt <= now) sessions.delete(token);
  for (const [ip, entry] of startRates) if (entry.until <= now) startRates.delete(ip);
}, 60_000);
cleanup.unref();
server.once("close", () => clearInterval(cleanup));

return {
  server,
  start: () => new Promise((resolve, reject) => {
    function onError(error) {
      if (error.code === "EADDRINUSE" && options.fallbackOnBusy && port !== 0) {
        port = 0;
        server.listen(port, host);
      } else { clearInterval(cleanup); reject(error); }
    }
    server.on("error", onError);
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}`, lanUrl: `http://${getLanIPv4()}:${port}` });
    });
  }),
  stop: () => new Promise(resolve => { clearInterval(cleanup); server.close(resolve); })
};
}

module.exports = { createAppServer };

if (require.main === module) {
  const app = createAppServer();
  app.start().then(({ url, lanUrl }) => {
    console.log(`光纤仿真平台已启动: ${url}`);
    console.log(`局域网扫码地址: ${lanUrl}`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
  process.on("SIGINT", () => app.stop().then(() => process.exit(0)));
}
