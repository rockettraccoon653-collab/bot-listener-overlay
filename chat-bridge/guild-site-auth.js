const crypto = require("crypto");

const DEFAULT_AUTH_TTL_MS = 1000 * 60 * 60 * 12;
const runtimeSigningSecret = crypto.randomBytes(32).toString("hex");

function normalizeViewerIdentity(input) {
  return String(input || "").trim().toLowerCase();
}

function getSigningSecret() {
  return String(process.env.GUILD_HALL_SIGNING_SECRET || process.env.LOCAL_SITE_SIGNING_SECRET || runtimeSigningSecret);
}

function buildGuildHallUrl({ baseUrl = "", host = "127.0.0.1", port = 8788, player = "", authToken = "" } = {}) {
  const params = new URLSearchParams();
  const safePlayer = normalizeViewerIdentity(player);
  const safeToken = String(authToken || "").trim();

  if (safePlayer) {
    params.set("player", safePlayer);
  }

  if (safeToken) {
    params.set("auth", safeToken);
  }

  const suffix = params.toString();
  const explicitBaseUrl = String(baseUrl || "").trim();
  if (explicitBaseUrl) {
    const resolvedUrl = new URL(explicitBaseUrl.endsWith("/") ? explicitBaseUrl : `${explicitBaseUrl}/`);
    resolvedUrl.search = suffix;
    return resolvedUrl.toString();
  }

  return `http://${host}:${port}/guild-shop/${suffix ? `?${suffix}` : ""}`;
}

function createGuildHallAuthToken(username, options = {}) {
  const player = normalizeViewerIdentity(username);
  if (!player) {
    return "";
  }

  const ttlMs = Number(options.ttlMs || DEFAULT_AUTH_TTL_MS);
  const expiresAt = Number(options.expiresAt || (Date.now() + Math.max(1000, ttlMs)));
  const payload = `${player}.${expiresAt}`;
  const signature = crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
  return `${expiresAt}.${signature}`;
}

function verifyGuildHallAuthToken(username, token) {
  const player = normalizeViewerIdentity(username);
  const rawToken = String(token || "").trim();
  if (!player || !rawToken) {
    return false;
  }

  const separatorIndex = rawToken.indexOf(".");
  if (separatorIndex <= 0) {
    return false;
  }

  const expiresAt = Number(rawToken.slice(0, separatorIndex));
  const signature = rawToken.slice(separatorIndex + 1);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !signature) {
    return false;
  }

  const expectedSignature = crypto.createHmac("sha256", getSigningSecret()).update(`${player}.${expiresAt}`).digest("hex");
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (!providedBuffer.length || providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

module.exports = {
  buildGuildHallUrl,
  createGuildHallAuthToken,
  normalizeViewerIdentity,
  verifyGuildHallAuthToken
};