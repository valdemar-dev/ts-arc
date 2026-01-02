#!/usr/bin/env node

// src/loader.ts
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { transformSync } from "esbuild";
var config = {
  baseUrl: null,
  paths: {},
  tsconfigDir: null
};
function initialize(initContext) {
  config = initContext;
}
function getEffectiveBase() {
  const { baseUrl, tsconfigDir } = config;
  if (baseUrl) {
    return path.resolve(tsconfigDir ?? process.cwd(), baseUrl);
  }
  return null;
}
async function resolveLocal(baseDir, relativePath) {
  const fullPath = path.resolve(baseDir, relativePath);
  const candidates = [
    fullPath,
    fullPath + ".ts",
    fullPath + ".tsx",
    path.join(fullPath, "index.ts"),
    path.join(fullPath, "index.tsx"),
    path.join(fullPath, "page.ts"),
    path.join(fullPath, "page.tsx")
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { url: url.pathToFileURL(candidate).href };
      }
    } catch {
    }
  }
  throw Object.assign(new Error(`Cannot find module '${relativePath}'`), { code: "ERR_MODULE_NOT_FOUND" });
}
async function resolve2(specifier, context, nextResolve) {
  let parentPath = process.cwd();
  if (context.parentURL) {
    parentPath = path.dirname(url.fileURLToPath(context.parentURL));
  }
  if (specifier.startsWith("file://")) {
    const filePath = url.fileURLToPath(specifier);
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath);
    const relative = path.extname(baseName) ? baseName : baseName;
    const resolved = await resolveLocal(dir, relative);
    return { ...resolved, shortCircuit: true };
  }
  const isPathLike = specifier.startsWith(".") || specifier.startsWith("/");
  if (isPathLike) {
    const resolved = await resolveLocal(parentPath, specifier);
    return { ...resolved, shortCircuit: true };
  } else {
    const { paths } = config;
    const effectiveBase = getEffectiveBase();
    for (const key of Object.keys(paths)) {
      let capture = null;
      const isWildcard = key.endsWith("/*");
      const prefix = isWildcard ? key.slice(0, -2) : key;
      if (isWildcard && specifier.startsWith(prefix + "/")) {
        capture = specifier.slice(prefix.length + 1);
      } else if (!isWildcard && specifier === key) {
        capture = "";
      }
      if (capture !== null) {
        for (const target of paths[key]) {
          const mapped = isWildcard ? target.replace(/\*/g, capture) : target;
          if (effectiveBase) {
            try {
              const resolved2 = await resolveLocal(effectiveBase, mapped);
              return { ...resolved2, shortCircuit: true };
            } catch (error) {
              if (error.code !== "ERR_MODULE_NOT_FOUND") {
                throw error;
              }
            }
          }
        }
      }
    }
    if (effectiveBase) {
      try {
        const resolved2 = await resolveLocal(effectiveBase, specifier);
        return { ...resolved2, shortCircuit: true };
      } catch (error) {
        if (error.code !== "ERR_MODULE_NOT_FOUND") {
          throw error;
        }
      }
    }
    const resolved = await nextResolve(specifier, context);
    return { ...resolved, shortCircuit: true };
  }
}
async function load(urlStr, context, nextLoad) {
  if (!urlStr.endsWith(".ts") && !urlStr.endsWith(".tsx")) {
    return nextLoad(urlStr, context);
  }
  const esbuildLoader = urlStr.endsWith(".tsx") ? "tsx" : "ts";
  const filePath = url.fileURLToPath(urlStr);
  const rawSource = fs.readFileSync(filePath, "utf8");
  const { code } = transformSync(rawSource, {
    loader: esbuildLoader,
    format: "esm",
    target: `node${process.versions.node}`,
    sourcemap: "inline",
    sourcefile: filePath,
    banner: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);`
  });
  return {
    format: "module",
    source: code,
    shortCircuit: true
  };
}
function resolveSync(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}
export {
  initialize,
  load,
  resolve2 as resolve,
  resolveSync
};
