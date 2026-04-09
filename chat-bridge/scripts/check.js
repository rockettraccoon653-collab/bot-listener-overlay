const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const bridgeRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(bridgeRoot, "..");

const jsFiles = [
  path.join(repoRoot, "config.js"),
  path.join(repoRoot, "script.js"),
  path.join(repoRoot, "guild-site", "app.js"),
  path.join(repoRoot, "extension", "panel.js"),
  path.join(bridgeRoot, "boss-engine.js"),
  path.join(bridgeRoot, "bridge.js"),
  path.join(bridgeRoot, "dice.js"),
  path.join(bridgeRoot, "local-site.js"),
  path.join(bridgeRoot, "player-progression.js"),
  path.join(bridgeRoot, "player-rules.js"),
  path.join(bridgeRoot, "shop-config.js"),
  path.join(bridgeRoot, "shop-handler.js"),
  path.join(bridgeRoot, "viewer-db.js")
];

let failureCount = 0;

function fail(message) {
  failureCount += 1;
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing file ${path.relative(repoRoot, filePath)}`);
    return false;
  }

  pass(`found ${path.relative(repoRoot, filePath)}`);
  return true;
}

function checkJavaScriptSyntax(filePath) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    fail(`syntax error in ${path.relative(repoRoot, filePath)}\n${(result.stderr || result.stdout || "").trim()}`);
    return;
  }

  pass(`syntax ok ${path.relative(repoRoot, filePath)}`);
}

function getHtmlIds(htmlText) {
  return new Set(Array.from(htmlText.matchAll(/\sid=["']([^"']+)["']/g), (match) => match[1]));
}

function getHtmlClasses(htmlText) {
  const classNames = new Set();

  for (const match of htmlText.matchAll(/\sclass=["']([^"']+)["']/g)) {
    for (const className of match[1].split(/\s+/).filter(Boolean)) {
      classNames.add(className);
    }
  }

  return classNames;
}

function getRequestedIds(scriptText) {
  return Array.from(scriptText.matchAll(/document\.getElementById\(["']([^"']+)["']\)/g), (match) => match[1]);
}

function getRequestedClasses(scriptText) {
  const classMatches = [
    ...scriptText.matchAll(/document\.querySelector\(["']\.([^"']+)["']\)/g),
    ...scriptText.matchAll(/document\.querySelectorAll\(["']\.([^"']+)["']\)/g)
  ];

  return classMatches.map((match) => match[1]);
}

function checkDomBindings(htmlPath, scriptPath) {
  const htmlText = readText(htmlPath);
  const scriptText = readText(scriptPath);
  const ids = getHtmlIds(htmlText);
  const classes = getHtmlClasses(htmlText);

  for (const id of getRequestedIds(scriptText)) {
    if (!ids.has(id)) {
      fail(`missing DOM id ${id} required by ${path.relative(repoRoot, scriptPath)} in ${path.relative(repoRoot, htmlPath)}`);
      continue;
    }

    pass(`DOM id ${id} present for ${path.relative(repoRoot, scriptPath)}`);
  }

  for (const className of getRequestedClasses(scriptText)) {
    if (!classes.has(className)) {
      fail(`missing DOM class ${className} required by ${path.relative(repoRoot, scriptPath)} in ${path.relative(repoRoot, htmlPath)}`);
      continue;
    }

    pass(`DOM class ${className} present for ${path.relative(repoRoot, scriptPath)}`);
  }
}

function checkScriptOrder(indexPath) {
  const htmlText = readText(indexPath);
  const configPos = htmlText.indexOf('<script src="config.js"></script>');
  const scriptPos = htmlText.indexOf('<script src="script.js"></script>');

  if (configPos === -1) {
    fail("index.html is missing config.js script include");
  } else {
    pass("index.html includes config.js");
  }

  if (scriptPos === -1) {
    fail("index.html is missing script.js script include");
  } else {
    pass("index.html includes script.js");
  }

  if (configPos !== -1 && scriptPos !== -1) {
    if (configPos > scriptPos) {
      fail("index.html loads config.js after script.js");
    } else {
      pass("index.html loads config.js before script.js");
    }
  }
}

function checkScriptInclude(htmlPath, scriptName) {
  const htmlText = readText(htmlPath);
  if (!htmlText.includes(`<script src="${scriptName}"></script>`)) {
    fail(`${path.relative(repoRoot, htmlPath)} is missing ${scriptName} script include`);
    return;
  }

  pass(`${path.relative(repoRoot, htmlPath)} includes ${scriptName}`);
}

function loadOverlayConfig(configPath) {
  const source = `${readText(configPath)}\n;globalThis.__overlayConfig = overlayConfig;`;
  const context = vm.createContext({ globalThis: {} });
  new vm.Script(source, { filename: configPath }).runInContext(context);
  return context.globalThis.__overlayConfig;
}

function checkOverlayConfig(configPath) {
  let overlayConfig;

  try {
    overlayConfig = loadOverlayConfig(configPath);
  } catch (error) {
    fail(`unable to evaluate config.js: ${error.message}`);
    return;
  }

  if (!overlayConfig || typeof overlayConfig !== "object") {
    fail("config.js does not define overlayConfig");
    return;
  }

  pass("config.js defines overlayConfig");

  const chatParticipation = overlayConfig.chatParticipation;
  if (!chatParticipation || typeof chatParticipation !== "object") {
    fail("overlayConfig.chatParticipation is missing");
  } else {
    pass("overlayConfig.chatParticipation exists");
  }

  const questline = overlayConfig.questline;
  if (!questline || !Array.isArray(questline.quests) || questline.quests.length === 0) {
    fail("overlayConfig.questline.quests must contain at least one quest");
  } else {
    pass("overlayConfig.questline.quests contains entries");
  }

  const sceneControl = overlayConfig.sceneControl;
  if (!sceneControl || typeof sceneControl !== "object") {
    fail("overlayConfig.sceneControl is missing");
  } else {
    pass("overlayConfig.sceneControl exists");
  }
}

function getRequiredEnvKeys(bridgePath) {
  const bridgeText = readText(bridgePath);
  const match = bridgeText.match(/const REQUIRED_ENV = \[(.*?)\];/s);
  if (!match) {
    fail("bridge.js does not expose REQUIRED_ENV in the expected format");
    return [];
  }

  return Array.from(match[1].matchAll(/["']([^"']+)["']/g), (entry) => entry[1]);
}

function getEnvExampleKeys(envExamplePath) {
  return readText(envExamplePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.split("=", 1)[0].trim());
}

function checkEnvCoverage(bridgePath, envExamplePath) {
  const requiredKeys = getRequiredEnvKeys(bridgePath);
  const exampleKeys = new Set(getEnvExampleKeys(envExamplePath));

  for (const key of requiredKeys) {
    if (!exampleKeys.has(key)) {
      fail(`.env.example is missing required key ${key}`);
      continue;
    }

    pass(`.env.example includes ${key}`);
  }
}

function checkViewerData(dataPath) {
  try {
    const parsed = JSON.parse(readText(dataPath));
    if (!parsed || typeof parsed !== "object" || typeof parsed.viewers !== "object") {
      fail("chat-bridge/data/viewers.json must contain a top-level viewers object");
      return;
    }
  } catch (error) {
    fail(`invalid JSON in chat-bridge/data/viewers.json: ${error.message}`);
    return;
  }

  pass("chat-bridge/data/viewers.json is valid JSON");
}

function main() {
  console.log("Running project checks...\n");

  const indexPath = path.join(repoRoot, "index.html");
  const configPath = path.join(repoRoot, "config.js");
  const scriptPath = path.join(repoRoot, "script.js");
  const guildSiteHtmlPath = path.join(repoRoot, "guild-site", "index.html");
  const guildSiteScriptPath = path.join(repoRoot, "guild-site", "app.js");
  const panelHtmlPath = path.join(repoRoot, "extension", "panel.html");
  const panelScriptPath = path.join(repoRoot, "extension", "panel.js");
  const bridgePath = path.join(bridgeRoot, "bridge.js");
  const envExamplePath = path.join(bridgeRoot, ".env.example");
  const viewerDataPath = path.join(bridgeRoot, "data", "viewers.json");

  for (const filePath of [indexPath, guildSiteHtmlPath, panelHtmlPath, envExamplePath, viewerDataPath, ...jsFiles]) {
    ensureFileExists(filePath);
  }

  for (const filePath of jsFiles.filter((candidate) => fs.existsSync(candidate))) {
    checkJavaScriptSyntax(filePath);
  }

  if (fs.existsSync(indexPath) && fs.existsSync(scriptPath)) {
    checkScriptOrder(indexPath);
    checkDomBindings(indexPath, scriptPath);
  }

  if (fs.existsSync(guildSiteHtmlPath) && fs.existsSync(guildSiteScriptPath)) {
    checkScriptInclude(guildSiteHtmlPath, "app.js");
    checkDomBindings(guildSiteHtmlPath, guildSiteScriptPath);
  }

  if (fs.existsSync(panelHtmlPath) && fs.existsSync(panelScriptPath)) {
    checkScriptInclude(panelHtmlPath, "panel.js");
    checkDomBindings(panelHtmlPath, panelScriptPath);
  }

  if (fs.existsSync(configPath)) {
    checkOverlayConfig(configPath);
  }

  if (fs.existsSync(bridgePath) && fs.existsSync(envExamplePath)) {
    checkEnvCoverage(bridgePath, envExamplePath);
  }

  if (fs.existsSync(viewerDataPath)) {
    checkViewerData(viewerDataPath);
  }

  if (failureCount > 0) {
    console.error(`\nChecks failed: ${failureCount}`);
    process.exit(1);
  }

  console.log("\nAll checks passed.");
}

main();