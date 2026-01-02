#!/usr/bin/env node

// src/loader.ts
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { createRequire } from "module";
import { builtinModules } from "node:module";
var require2 = createRequire(import.meta.url);
var { transformSync } = require2("esbuild");
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
function resolveLocalSync(baseDir, relativePath) {
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
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { url: url.pathToFileURL(candidate).href };
    }
  }
  throw Object.assign(new Error(`Cannot find module '${relativePath}'`), { code: "ERR_MODULE_NOT_FOUND" });
}
async function resolveLocal(baseDir, relativePath) {
  return resolveLocalSync(baseDir, relativePath);
}
function resolveBareSync(specifier, parentPath) {
  const requireFromParent = createRequire(path.join(parentPath, "index.js"));
  try {
    const resolved = requireFromParent.resolve(specifier);
    if (resolved === specifier && builtinModules.includes(specifier.replace(/^node:/, ""))) {
      return `node:${specifier.replace(/^node:/, "")}`;
    }
    return url.pathToFileURL(resolved).href;
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") {
      throw Object.assign(new Error(`Cannot find module '${specifier}'`), { code: "ERR_MODULE_NOT_FOUND" });
    }
    throw e;
  }
}
function getFormatSync(urlStr) {
  const urlObj = new URL(urlStr);
  if (urlObj.protocol === "node:") return "builtin";
  if (urlObj.protocol !== "file:") throw new Error(`Unsupported protocol: ${urlObj.protocol}`);
  const filePath = url.fileURLToPath(urlStr);
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wasm") return "wasm";
  if (ext === ".json") return "json";
  if (ext === ".node") return "addon";
  if (ext === ".mjs") return "module";
  if (ext === ".cjs") return "commonjs";
  if (ext !== ".js") throw new Error(`Unknown file extension: ${ext}`);
  let currentDir = path.dirname(filePath);
  while (currentDir !== path.parse(currentDir).root) {
    const pkgPath = path.join(currentDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkgContent = fs.readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(pkgContent);
      if (pkg.type === "module") return "module";
      return "commonjs";
    }
    currentDir = path.dirname(currentDir);
  }
  return "commonjs";
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
    const resolved = await resolveLocal(dir, baseName);
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
              const resolved = await resolveLocal(effectiveBase, mapped);
              return { ...resolved, shortCircuit: true };
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
        const resolved = await resolveLocal(effectiveBase, specifier);
        return { ...resolved, shortCircuit: true };
      } catch (error) {
        if (error.code !== "ERR_MODULE_NOT_FOUND") {
          throw error;
        }
      }
    }
    const resolvedUrl = resolveBareSync(specifier, parentPath);
    return { url: resolvedUrl, shortCircuit: true };
  }
}
async function load(urlStr, context, nextLoad) {
  return loadSync(urlStr, context, () => {
    throw new Error("Chaining not supported");
  });
}
function loadSync(urlStr, context, nextLoadSync) {
  if (urlStr.endsWith(".ts") || urlStr.endsWith(".tsx")) {
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
  } else {
    const format = getFormatSync(urlStr);
    let source;
    if (format !== "builtin") {
      const filePath = url.fileURLToPath(urlStr);
      source = fs.readFileSync(filePath);
    }
    return { format, source, shortCircuit: true };
  }
}
function resolveSync(specifier, context) {
  let parentPath = process.cwd();
  if (context.parentURL) {
    parentPath = path.dirname(url.fileURLToPath(context.parentURL));
  }
  if (specifier.startsWith("file://")) {
    const filePath = url.fileURLToPath(specifier);
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath);
    const resolved = resolveLocalSync(dir, baseName);
    return { ...resolved, shortCircuit: true };
  }
  const isPathLike = specifier.startsWith(".") || specifier.startsWith("/");
  if (isPathLike) {
    const resolved = resolveLocalSync(parentPath, specifier);
    return { ...resolved, shortCircuit: true };
  }
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
            const resolved = resolveLocalSync(effectiveBase, mapped);
            return { ...resolved, shortCircuit: true };
          } catch (e) {
            if (e.code !== "ERR_MODULE_NOT_FOUND") {
              throw e;
            }
          }
        }
      }
    }
  }
  if (effectiveBase) {
    try {
      const resolved = resolveLocalSync(effectiveBase, specifier);
      return { ...resolved, shortCircuit: true };
    } catch (e) {
      if (e.code !== "ERR_MODULE_NOT_FOUND") {
        throw e;
      }
    }
  }
  const resolvedUrl = resolveBareSync(specifier, parentPath);
  return { url: resolvedUrl, shortCircuit: true };
}
export {
  initialize,
  load,
  loadSync,
  resolve2 as resolve,
  resolveSync
};
