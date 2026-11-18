"use strict";

// 核对项目往返导入及登录状态，避免只测试界面是否能显示。
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppServer } = require("../outputs/server.js");
const project = require("../outputs/project.js");

test("project export/import preserves experimental values and notes", () => {
  const parameters = { ...project.defaults, current: 2.5, hydrogen: 0.7 };
  const original = project.create("实验 A", parameters, "1% 氢气标定前的对比实验");
  const imported = project.parse(JSON.stringify(original));
  assert.deepEqual(imported.parameters, parameters);
  assert.equal(imported.name, original.name);
  assert.equal(imported.notes, original.notes);
  assert.equal(imported.author, "池行强");
  assert.equal(imported.institution, "武汉职业技术大学");
  assert.deepEqual(project.parse("\uFEFF" + JSON.stringify(original)).parameters, parameters);
});

test("invalid projects cannot replace a valid experimental configuration", () => {
  for (const value of [0, -1, 10001, NaN, Infinity, "100", null]) {
    assert.throws(() => project.validateParameters({ ...project.defaults, length: value }));
  }
  assert.throws(() => project.validateParameters({}));
  assert.throws(() => project.parse(JSON.stringify({ parameters: project.defaults })));
  assert.throws(() => project.parse(JSON.stringify({ ...project.create("A", project.defaults), version: 2 })));
  assert.throws(() => project.parse("not JSON"));
});

async function startServer(t, options = {}) {
  const service = createAppServer({ host: "127.0.0.1", port: 0, ...options });
  const info = await service.start();
  t.after(() => service.stop());
  return info;
}

function post(base, route, value, headers = {}) {
  return fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value || {}) });
}

test("password login establishes a session and logout revokes it", async t => {
  const { url } = await startServer(t);
  const rejected = await post(url, "/api/login", { username: "admin", password: "wrong" });
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.get("set-cookie"), null);
  const accepted = await post(url, "/api/login", { username: "admin", password: "admin" });
  assert.equal(accepted.status, 200);
  const cookie = accepted.headers.get("set-cookie").split(";")[0];
  const session = await fetch(url + "/api/session", { headers: { cookie } });
  assert.equal((await session.json()).authenticated, true);
  assert.equal((await post(url, "/api/logout", {}, { cookie })).status, 200);
  const revoked = await fetch(url + "/api/session", { headers: { cookie } });
  assert.equal((await revoked.json()).authenticated, false);
});

test("QR approval belongs to one ticket and can only establish a session once", async t => {
  const { url } = await startServer(t);
  const ticket = await (await post(url, "/api/qr/start")).json();
  const mobileUrl = new URL(ticket.scanUrl);
  const poll = "/api/qr/status?" + new URLSearchParams({ ticket: ticket.id, key: ticket.pollKey });
  const unauthorized = await post(url, "/api/qr/approve", { ticket: ticket.id, key: "wrong" });
  assert.equal(unauthorized.status, 410);
  assert.equal((await (await fetch(url + poll)).json()).state, "pending");
  const approved = await post(url, "/api/qr/approve", { ticket: ticket.id, key: mobileUrl.searchParams.get("key") });
  assert.equal(approved.status, 200);
  const status = await fetch(url + poll);
  assert.equal((await status.json()).state, "approved");
  assert.ok(status.headers.get("set-cookie"));
  const cookie = status.headers.get("set-cookie").split(";")[0];
  assert.equal((await (await fetch(url + "/api/session", { headers: { cookie } })).json()).authenticated, true);
  const replay = await fetch(url + poll);
  assert.equal((await replay.json()).state, "consumed");
  assert.equal(replay.headers.get("set-cookie"), null);
  const secondApproval = await post(url, "/api/qr/approve", { ticket: ticket.id, key: mobileUrl.searchParams.get("key") });
  assert.equal(secondApproval.status, 410);
});

test("cancelled and expired QR tickets cannot be approved", async t => {
  const { url } = await startServer(t, { ticketTtlMs: 100 });
  const ticket = await (await post(url, "/api/qr/start")).json();
  const key = new URL(ticket.scanUrl).searchParams.get("key");
  assert.equal((await post(url, "/api/qr/cancel", { ticket: ticket.id, key: ticket.pollKey })).status, 200);
  assert.equal((await post(url, "/api/qr/approve", { ticket: ticket.id, key })).status, 410);
  const expiring = await (await post(url, "/api/qr/start")).json();
  await new Promise(resolve => setTimeout(resolve, 150));
  const expired = await post(url, "/api/qr/approve", { ticket: expiring.id, key: new URL(expiring.scanUrl).searchParams.get("key") });
  assert.equal(expired.status, 410);
});

test("desktop server falls back when preferred port is already occupied", async t => {
  const first = await startServer(t);
  const second = await startServer(t, { port: first.server.address().port, fallbackOnBusy: true });
  assert.notEqual(second.url, first.url);
  assert.equal((await fetch(second.url + "/api/session")).status, 200);
});

test("static scripts load locally and cross-site writes are rejected", async t => {
  const { url } = await startServer(t);
  for (const route of ["/", "/scan", "/project.js", "/app-controls.js", "/lucide.min.js", "/qrcode-generator.js"]) {
    assert.equal((await fetch(url + route)).status, 200, route);
  }
  assert.equal((await fetch(url + "/server.js")).status, 404);
  assert.equal((await post(url, "/api/login", { username: "admin", password: "admin" }, { Origin: "https://other.invalid" })).status, 403);
  const malformedCookie = await fetch(url + "/api/session", { headers: { Cookie: "fiber_session=%ZZ" } });
  assert.equal((await malformedCookie.json()).authenticated, false);
});

test("explicit HTTPS deployment origin is used for QR URLs and cookies", async t => {
  const { url } = await startServer(t, { publicUrl: "https://fiber.example.org" });
  const ticket = await (await post(url, "/api/qr/start", {}, { Origin: "https://fiber.example.org" })).json();
  assert.equal(new URL(ticket.scanUrl).origin, "https://fiber.example.org");
  const response = await post(url, "/api/login", { username: "admin", password: "admin" }, { Origin: "https://fiber.example.org" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /; Secure/);
});
