/** Exercise the compiled backend as a real Bun process against disposable services. */
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const template = process.argv[2];
if (!["express", "fastify", "nestjs"].includes(template)) {
  throw new Error("Usage: node scripts/backend-bun-smoke.mjs <express|fastify|nestjs>");
}
const root = resolve(`templates/${template}`);
const require = createRequire(`${root}/package.json`);
const { io } = require("socket.io-client");
const secret = "bun-runtime-test-hmac-secret-32-characters";
const uri = process.env.BUN_SMOKE_MONGODB_URI;
const externalUrl = process.env.BUN_SMOKE_URL;
if (!externalUrl && !uri) throw new Error("BUN_SMOKE_MONGODB_URI must point to disposable MongoDB");

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolveListen),
  );
  const address = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  return address.port;
}
function signature(method, path, contentType = "") {
  const ctime = String(Date.now());
  const sig = createHmac("sha256", secret)
    .update([method, contentType, ctime, path, ""].join("\n"))
    .digest("base64");
  return { sig, ctime };
}
async function request(base, method, path, body, token) {
  const contentType = body === undefined ? "" : "application/json";
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      ...signature(method, path, contentType),
      ...(contentType && { "content-type": contentType }),
      ...(token && { authorization: `Bearer ${token}` }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  return { response, data };
}
async function waitForServer(base, child) {
  for (let i = 0; i < 150; i++) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`Bun exited early (${child.exitCode ?? child.signalCode})`);
    }
    try {
      const { response, data } = await request(base, "GET", "/health");
      if (response.status === 200 && (!process.env.BUN_SMOKE_REDIS_URL || data.redis === "up")) {
        return;
      }
    } catch {
      /* still starting */
    }
    await delay(200);
  }
  throw new Error("Bun server did not become ready");
}
async function connectSocket(base, token, transport) {
  const auth = { ...signature("GET", "/socket", "application/json"), token };
  const socket = io(base, { auth, transports: [transport], timeout: 5000, reconnection: false });
  try {
    await new Promise((resolveConnect, reject) => {
      const timer = setTimeout(() => reject(new Error(`Socket ${transport} timed out`)), 6000);
      socket.once("authenticated", () => {
        clearTimeout(timer);
        resolveConnect();
      });
      socket.once("connect_error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  } finally {
    socket.disconnect();
  }
}
let child;
let logs = "";
try {
  let base = externalUrl;
  if (!base) {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    const db = new URL(uri);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(db.hostname))
      throw new Error("MongoDB must be disposable and local");
    if (process.env.BUN_SMOKE_REDIS_URL) {
      const redis = new URL(process.env.BUN_SMOKE_REDIS_URL);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(redis.hostname)) {
        throw new Error("Redis must be disposable and local");
      }
    }
    db.pathname = `/bun_smoke_${template}_${randomUUID().replaceAll("-", "")}`;
    const entry = template === "nestjs" ? "dist/src/main.js" : "dist/server.js";
    child = spawn("bun", [entry], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        MONGODB_URI: db.toString(),
        HMAC_SECRET: secret,
        JWT_REFRESH_SECRET: "bun-runtime-test-refresh-secret-32-characters",
        REDIS_ENABLED: process.env.BUN_SMOKE_REDIS_URL ? "true" : "false",
        REDIS_URL: process.env.BUN_SMOKE_REDIS_URL || "redis://127.0.0.1:6379",
        JWT_PRIVATE_KEY_PATH: "/nonexistent/bun-smoke-private",
        JWT_PUBLIC_KEY_PATH: "/nonexistent/bun-smoke-public",
        AUTH_TOKENS_IN_BODY: "true",
        API_PREFIX: "/api/v1",
        CORS_ORIGINS: "http://localhost:5173",
        COOKIE_DOMAIN: "",
        DOCS_ENABLED: "true",
        ENABLE_CSRF: "false",
        TRUST_PROXY: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("error", (error) => {
      logs += error.message;
    });
    child.stdout.on("data", (data) => {
      logs = (logs + data).slice(-12000);
    });
    child.stderr.on("data", (data) => {
      logs = (logs + data).slice(-12000);
    });
  }
  await waitForServer(base, child);
  const unsigned = await fetch(`${base}/api/v1/health`);
  assert.equal(unsigned.status, 401, "unsigned request must be rejected");
  const invalidSignature = await fetch(`${base}/api/v1/health`, {
    headers: { ...signature("GET", "/wrong-path") },
  });
  assert.equal(invalidSignature.status, 401, "invalid signature must be rejected");
  const health = await request(base, "GET", "/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.data.database, "connected");
  if (process.env.BUN_SMOKE_REDIS_URL) assert.equal(health.data.redis, "up");
  else if (!externalUrl) assert.equal(health.data.redis, "disabled");
  if (!externalUrl) {
    const docs = await fetch(`${base}/docs/json`);
    assert.equal(docs.status, 200, "OpenAPI document");
    assert.ok((await docs.json()).openapi, "OpenAPI version");
  }
  const unauthenticated = await request(base, "GET", "/auth/me");
  assert.equal(unauthenticated.response.status, 401, "protected route requires a token");
  const email = `bun-${randomUUID()}@example.test`;
  const password = "Bun-runtime-password-42!";
  const registered = await request(base, "POST", "/auth/register", {
    email,
    password,
    name: "Bun Smoke",
  });
  assert.equal(registered.response.status, 201, "register");
  assert.ok(
    registered.response.headers.get("set-cookie")?.toLowerCase().includes("httponly"),
    "httpOnly auth cookies",
  );
  const tokens = registered.data.data.tokens;
  assert.ok(tokens.accessToken && tokens.refreshToken, "auth tokens");
  const login = await request(base, "POST", "/auth/login", { email, password });
  assert.equal(login.response.status, 200, "login");
  const invalidLogin = await request(base, "POST", "/auth/login", {
    email,
    password: "incorrect-password",
  });
  assert.equal(invalidLogin.response.status, 401, "incorrect password");
  const me = await request(base, "GET", "/auth/me", undefined, tokens.accessToken);
  assert.equal(me.response.status, 200, "access token");
  assert.equal(me.data.data.user.email, email);
  const forbidden = await request(base, "GET", "/users", undefined, tokens.accessToken);
  assert.equal(forbidden.response.status, 403, "user cannot access admin route");
  await connectSocket(base, tokens.accessToken, "polling");
  await connectSocket(base, tokens.accessToken, "websocket");
  const refreshed = await request(base, "POST", "/auth/refresh", {
    refreshToken: tokens.refreshToken,
  });
  assert.equal(refreshed.response.status, 200, "refresh");
  assert.notEqual(
    refreshed.data.data.tokens.refreshToken,
    tokens.refreshToken,
    "refresh rotates token",
  );
  const logout = await request(base, "POST", "/auth/logout", {
    refreshToken: refreshed.data.data.tokens.refreshToken,
  });
  assert.equal(logout.response.status, 200, "logout");
  const denied = await request(base, "POST", "/auth/refresh", {
    refreshToken: refreshed.data.data.tokens.refreshToken,
  });
  assert.equal(denied.response.status, 401, "logged-out refresh token");
  console.log(
    `${template}: Bun HTTP, HMAC, auth, refresh, MongoDB${process.env.BUN_SMOKE_REDIS_URL ? ", Redis" : ""} and Socket.IO polling/websocket passed`,
  );
} catch (error) {
  console.error(`${template}: ${error.message}`);
  if (child && (child.exitCode !== null || child.signalCode !== null)) console.error(logs);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolveExit) => {
      const timer = setTimeout(resolveExit, 12000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      process.exitCode = 1;
      console.error("Bun did not shut down");
    }
  }
}
