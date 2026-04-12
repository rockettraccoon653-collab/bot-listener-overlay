const fs = require("fs");
const path = require("path");

const bridgeRoot = path.resolve(__dirname, "..");
const envPath = path.join(bridgeRoot, ".env");

if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}

const allowMissing = process.argv.includes("--allow-missing");
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readValue(key) {
  return String(process.env[key] || "").trim();
}

function isPlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return [
    "value",
    "your-value",
    "your_secret_here",
    "replace-me",
    "changeme",
    "todo",
    "example"
  ].includes(normalized);
}

function requireKey(key) {
  const value = readValue(key);
  if (!value) {
    if (allowMissing) {
      warn(`Missing ${key} (allowed by --allow-missing)`);
      return "";
    }
    fail(`Missing required env var ${key}`);
    return "";
  }

  if (isPlaceholder(value)) {
    fail(`Env var ${key} still uses placeholder value '${value}'`);
  }

  return value;
}

function parseOrigins(rawOrigins) {
  return String(rawOrigins || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toOrigin(raw) {
  try {
    return new URL(raw).origin;
  } catch (_error) {
    return String(raw || "").replace(/\/+$/, "");
  }
}

function isHttpUrl(raw) {
  try {
    const value = new URL(raw);
    return value.protocol === "http:" || value.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function checkRequiredRuntimeEnv() {
  const required = [
    "TWITCH_BOT_USERNAME",
    "TWITCH_BOT_OAUTH_TOKEN",
    "TWITCH_CHANNEL",
    "TWITCH_EXTENSION_CLIENT_ID",
    "TWITCH_EXTENSION_OWNER_USER_ID",
    "TWITCH_EXTENSION_SECRET_BASE64",
    "TWITCH_BROADCASTER_ID"
  ];

  const values = Object.fromEntries(required.map((key) => [key, requireKey(key)]));

  if (values.TWITCH_BOT_OAUTH_TOKEN && !values.TWITCH_BOT_OAUTH_TOKEN.startsWith("oauth:")) {
    fail("TWITCH_BOT_OAUTH_TOKEN must start with 'oauth:'");
  }

  if (values.TWITCH_EXTENSION_OWNER_USER_ID && !/^\d+$/.test(values.TWITCH_EXTENSION_OWNER_USER_ID)) {
    fail("TWITCH_EXTENSION_OWNER_USER_ID must be numeric");
  }

  if (values.TWITCH_BROADCASTER_ID && !/^\d+$/.test(values.TWITCH_BROADCASTER_ID)) {
    fail("TWITCH_BROADCASTER_ID must be numeric");
  }

  if (values.TWITCH_EXTENSION_SECRET_BASE64) {
    try {
      const decoded = Buffer.from(values.TWITCH_EXTENSION_SECRET_BASE64, "base64");
      if (!decoded.length || decoded.toString("base64") !== values.TWITCH_EXTENSION_SECRET_BASE64.replace(/\s+/g, "")) {
        fail("TWITCH_EXTENSION_SECRET_BASE64 is not valid base64");
      }
    } catch (_error) {
      fail("TWITCH_EXTENSION_SECRET_BASE64 is not valid base64");
    }
  }
}

function checkGuildHallRuntimeEnv() {
  const signingSecret = readValue("GUILD_HALL_SIGNING_SECRET");
  if (signingSecret && signingSecret.length < 24) {
    fail("GUILD_HALL_SIGNING_SECRET should be at least 24 characters");
  }

  const allowedOrigins = parseOrigins(readValue("GUILD_HALL_ALLOWED_ORIGINS"));
  for (const origin of allowedOrigins) {
    if (!isHttpUrl(origin)) {
      fail(`GUILD_HALL_ALLOWED_ORIGINS contains invalid URL '${origin}'`);
      continue;
    }

    if (origin !== toOrigin(origin)) {
      warn(`GUILD_HALL_ALLOWED_ORIGINS entry '${origin}' contains a path or trailing slash; prefer '${toOrigin(origin)}'`);
    }
  }

  const publicOrigin = readValue("GUILD_HALL_PUBLIC_WEB_ORIGIN");
  if (publicOrigin && !isHttpUrl(publicOrigin)) {
    fail("GUILD_HALL_PUBLIC_WEB_ORIGIN must be a valid http/https URL");
  }

  if (publicOrigin && publicOrigin !== toOrigin(publicOrigin)) {
    warn(`GUILD_HALL_PUBLIC_WEB_ORIGIN contains a path or trailing slash; prefer '${toOrigin(publicOrigin)}'`);
  }

  const normalizedAllowedOrigins = new Set(allowedOrigins.map((entry) => toOrigin(entry)));
  const normalizedPublicOrigin = toOrigin(publicOrigin);
  if (normalizedPublicOrigin && normalizedAllowedOrigins.size && !normalizedAllowedOrigins.has(normalizedPublicOrigin)) {
    warn("GUILD_HALL_PUBLIC_WEB_ORIGIN is not listed in GUILD_HALL_ALLOWED_ORIGINS");
  }
}

function checkCloudBindingSafety() {
  const runningOnRender = Boolean(readValue("RENDER"));
  if (!runningOnRender) {
    return;
  }

  const localSiteEnabled = readValue("LOCAL_SITE_ENABLED");
  if (localSiteEnabled && localSiteEnabled.toLowerCase() !== "false") {
    const host = readValue("LOCAL_SITE_HOST") || "127.0.0.1";
    if (host === "127.0.0.1" || host === "localhost") {
      fail("LOCAL_SITE_HOST must be 0.0.0.0 (or equivalent) on Render");
    }
  }

  const provider = (readValue("SCENE_RELAY_PROVIDER") || "streamlabs").toLowerCase();
  if (provider === "streamlabs" && String(readValue("STREAMLABS_API_URL")).includes("127.0.0.1")) {
    warn("SCENE_RELAY_PROVIDER=streamlabs with localhost STREAMLABS_API_URL will fail on Render");
  }

  if (provider === "obs" && String(readValue("OBS_WS_URL")).includes("127.0.0.1")) {
    warn("SCENE_RELAY_PROVIDER=obs with localhost OBS_WS_URL will fail on Render");
  }
}

function printResult() {
  if (warnings.length) {
    console.log("Warnings:");
    for (const message of warnings) {
      console.log(`- ${message}`);
    }
    console.log("");
  }

  if (failures.length) {
    console.error("Runtime preflight failed:");
    for (const message of failures) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log("Runtime preflight passed.");
}

checkRequiredRuntimeEnv();
checkGuildHallRuntimeEnv();
checkCloudBindingSafety();
printResult();