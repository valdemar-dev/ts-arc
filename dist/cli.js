#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/bin.ts
var bin_exports = {};
__export(bin_exports, {
  loadModule: () => loadModule,
  registerLoader: () => registerLoader,
  setArcTsConfig: () => setArcTsConfig
});
import * as fs from "node:fs";
import { register } from "node:module";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as url from "node:url";
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
      while (i < input.length) {
        if (input[i - 1] === "*" && input[i] === "/") {
          i++;
          break;
        }
        i++;
      }
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
  if (!config.extends) return config;
  const extendsVal = config.extends;
  const tsconfigDir = path.dirname(filePath);
  let extendsPath;
  if (extendsVal.startsWith("./") || extendsVal.startsWith("../")) {
    extendsPath = path.resolve(tsconfigDir, extendsVal);
    if (!extendsPath.endsWith(".json")) extendsPath += ".json";
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
    const tsconfigPath2 = path.join(current, "tsconfig.json");
    if (fs.existsSync(tsconfigPath2)) return tsconfigPath2;
    current = path.dirname(current);
  }
  return null;
}
function registerLoader() {
  register(loaderPath, import.meta.url, { data: tsArcConfig });
}
async function setArcTsConfig(directory) {
  const tsconfigPath2 = findTsConfig(directory);
  if (tsconfigPath2) {
    const mergedConfig = loadConfig(tsconfigPath2);
    const compilerOptions = mergedConfig.compilerOptions || {};
    const tsconfigDir = path.dirname(tsconfigPath2);
    const baseUrlStr = compilerOptions.baseUrl;
    tsArcConfig.baseUrl = baseUrlStr ? path.resolve(tsconfigDir, baseUrlStr) : null;
    tsArcConfig.paths = compilerOptions.paths || {};
    tsArcConfig.tsconfigDir = tsconfigDir;
    tsArcConfig.emitDecoratorMetadata = compilerOptions.emitDecoratorMetadata || false;
    tsArcConfig.experimentalDecorators = compilerOptions.experimentalDecorators || false;
  }
}
async function loadModule(scriptUrl) {
  const scriptPath = url.fileURLToPath(scriptUrl);
  setArcTsConfig(path.dirname(scriptPath));
  registerLoader();
  await import(scriptUrl).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
var __filename, __dirname, loaderPath, loaderUrl, require2, tsArcConfig, tsconfigPath;
var init_bin = __esm({
  "src/bin.ts"() {
    __filename = url.fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
    loaderPath = path.join(__dirname, "loader.js");
    loaderUrl = url.pathToFileURL(loaderPath).href;
    require2 = createRequire(import.meta.url);
    tsArcConfig = {
      baseUrl: null,
      paths: {},
      tsconfigDir: null,
      emitDecoratorMetadata: false,
      experimentalDecorators: false
    };
    tsconfigPath = findTsConfig(process.cwd());
    if (tsconfigPath) {
      const mergedConfig = loadConfig(tsconfigPath);
      const compilerOptions = mergedConfig.compilerOptions || {};
      const tsconfigDir = path.dirname(tsconfigPath);
      const baseUrlStr = compilerOptions.baseUrl;
      tsArcConfig.baseUrl = baseUrlStr ? path.resolve(tsconfigDir, baseUrlStr) : null;
      tsArcConfig.paths = compilerOptions.paths || {};
      tsArcConfig.tsconfigDir = tsconfigDir;
      tsArcConfig.emitDecoratorMetadata = compilerOptions.emitDecoratorMetadata || false;
      tsArcConfig.experimentalDecorators = compilerOptions.experimentalDecorators || false;
    }
  }
});

// src/cli.ts
import * as path2 from "node:path";
import * as url2 from "node:url";
import * as child_process from "node:child_process";
var __filename2 = url2.fileURLToPath(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
var CHILD_ENV_VAR = "TS_ARC_IS_CHILD";
if (process.env[CHILD_ENV_VAR] !== "1") {
  const script = process.argv[2];
  if (!script) {
    console.error("Usage: ts-arc <script.ts> [args...]");
    process.exit(1);
  }
  const loaderPath2 = path2.join(__dirname2, "loader.js");
  const loaderUrl2 = url2.pathToFileURL(loaderPath2).href;
  let childExecArgv = [...process.execArgv];
  const enableSourceMapsFlag = "--enable-source-maps";
  if (!childExecArgv.includes(enableSourceMapsFlag)) {
    childExecArgv.unshift(enableSourceMapsFlag);
  }
  const childEnv = {
    ...process.env,
    [CHILD_ENV_VAR]: "1"
  };
  const spawnArgs = [
    ...childExecArgv,
    __filename2,
    script,
    ...process.argv.slice(3)
  ];
  const result = child_process.spawnSync(
    process.execPath,
    spawnArgs,
    {
      stdio: "inherit",
      env: childEnv
    }
  );
  if (result.signal) {
    process.kill(process.pid, result.signal);
  }
  process.exit(result.status ?? 0);
}
(async () => {
  const script = process.argv[2];
  if (!script) {
    console.error("Usage: ts-arc <script.ts> [args...]");
    process.exit(1);
  }
  const scriptPath = path2.resolve(script);
  const scriptUrl = url2.pathToFileURL(scriptPath).href;
  process.argv = [process.argv[0], script, ...process.argv.slice(3)];
  const { loadModule: loadModule2 } = await Promise.resolve().then(() => (init_bin(), bin_exports));
  await loadModule2(scriptUrl);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
