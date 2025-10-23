#!/usr/bin/env node

// src/cli.ts
import * as path2 from "node:path";
import * as url2 from "node:url";

// src/bin.ts
import * as fs from "node:fs";
import { register } from "node:module";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as url from "node:url";
var __filename = url.fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var loaderPath = path.join(__dirname, "loader.js");
var loaderUrl = url.pathToFileURL(loaderPath).href;
var require2 = createRequire(import.meta.url);
function stripJsonComments(input) {
  let output = "";
  let insideString = false;
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (insideString) {
      output += char;
      if (char === '"' && input[i - 1] !== "\\") insideString = false;
      i++;
      continue;
    }
    if (char === '"') {
      insideString = true;
      output += char;
      i++;
      continue;
    }
    if (char === "/" && input[i + 1] === "/") {
      i += 2;
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (char === "/" && input[i + 1] === "*") {
      i += 2;
      while (i < input.length && !(input[i - 1] === "*" && input[i] === "/")) i++;
      if (i < input.length) i++;
      continue;
    }
    output += char;
    i++;
  }
  return output;
}
function loadConfig(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const stripped = stripJsonComments(content);
  const config = JSON.parse(stripped);
  if (!config.extends) {
    return config;
  }
  const extendsVal = config.extends;
  const tsconfigDir = path.dirname(filePath);
  let extendsPath;
  if (extendsVal.startsWith("./") || extendsVal.startsWith("../")) {
    extendsPath = path.resolve(tsconfigDir, extendsVal);
    if (!extendsPath.endsWith(".json")) {
      extendsPath += ".json";
    }
  } else {
    try {
      extendsPath = require2.resolve(extendsVal);
    } catch {
      extendsPath = require2.resolve(extendsVal + "/tsconfig.json");
    }
  }
  const baseConfig = loadConfig(extendsPath);
  const merged = { ...baseConfig, ...config };
  merged.compilerOptions = { ...baseConfig.compilerOptions || {}, ...config.compilerOptions || {} };
  return merged;
}
function findTsConfig(dir) {
  let current = dir;
  while (current !== path.parse(current).root) {
    const tsconfigPath = path.join(current, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) {
      return tsconfigPath;
    }
    current = path.dirname(current);
  }
  return null;
}
var tsArcConfig = { baseUrl: null, paths: {}, tsconfigDir: null };
async function registerLoader() {
  register("./loader.js", import.meta.url, { data: tsArcConfig });
}
async function setArcTsConfig(directory) {
  const tsconfigPath = findTsConfig(directory);
  if (tsconfigPath) {
    const mergedConfig = loadConfig(tsconfigPath);
    const compilerOptions = mergedConfig.compilerOptions || {};
    const tsconfigDir = path.dirname(tsconfigPath);
    const baseUrlStr = compilerOptions.baseUrl;
    tsArcConfig.baseUrl = baseUrlStr ? path.resolve(tsconfigDir, baseUrlStr) : null;
    tsArcConfig.paths = compilerOptions.paths || {};
    tsArcConfig.tsconfigDir = tsconfigDir;
  }
}
async function loadModule(scriptUrl2) {
  const scriptPath2 = url.fileURLToPath(scriptUrl2);
  setArcTsConfig(path.dirname(scriptPath2));
  await registerLoader();
  import(scriptUrl2).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// src/cli.ts
var script = process.argv[2];
if (!script) {
  console.error("Usage: ts-arc <script.ts> [args...]");
  process.exit(1);
}
var scriptPath = path2.resolve(script);
var scriptUrl = url2.pathToFileURL(scriptPath).href;
process.argv = [process.argv[0], script, ...process.argv.slice(3)];
(async () => {
  await loadModule(scriptUrl);
})();
