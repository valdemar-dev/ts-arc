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
  tsconfigDir: null,
  emitDecoratorMetadata: false,
  experimentalDecorators: false
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
function getRuntimeType(typeStr) {
  typeStr = typeStr.replace(/\s+/g, "");
  if (typeStr.includes("|") || typeStr.includes("&") || typeStr === "any" || typeStr === "unknown" || typeStr === "never") {
    return "Object";
  }
  if (typeStr === "void") {
    return "undefined";
  }
  if (typeStr.endsWith("[]")) {
    return 'typeof Array === "undefined" ? Object : Array';
  }
  const genericMatch = typeStr.match(/^(\w+)<.*>$/);
  if (genericMatch) {
    const base = genericMatch[1];
    return `typeof ${base} === "undefined" ? Object : ${base}`;
  }
  const mapped = {
    "string": "String",
    "number": "Number",
    "boolean": "Boolean",
    "bigint": "BigInt",
    "symbol": "Symbol",
    "undefined": "undefined",
    "object": "Object",
    "function": "Function"
  };
  const lower = typeStr.toLowerCase();
  if (mapped[lower]) {
    const val = mapped[lower];
    if (val !== "undefined") {
      return `typeof ${val} === "undefined" ? Object : ${val}`;
    }
    return val;
  }
  return `typeof ${typeStr} === "undefined" ? Object : ${typeStr}`;
}
function addMetadataDecorators(code) {
  const lines = code.split("\n");
  const newLines = [...lines];
  const insertions = [];
  let inClass = false;
  let classDecoratorEnd = -1;
  let classIndent = "";
  let constructorParamTypes = [];
  let currentDecorators = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.trim();
    if (trimLine.startsWith("@")) {
      currentDecorators.push(i);
      continue;
    }
    if (trimLine.startsWith("class ") || trimLine.startsWith("export class ")) {
      inClass = true;
      constructorParamTypes = [];
      classIndent = line.match(/^\s*/)?.[0] || "";
      classDecoratorEnd = currentDecorators.length > 0 ? currentDecorators[currentDecorators.length - 1] + 1 : i;
      currentDecorators = [];
      continue;
    }
    if (inClass && trimLine.startsWith("}")) {
      const metas = [];
      if (constructorParamTypes.length > 0 || true) {
        metas.push(`${classIndent}@__metadata("design:paramtypes", [${constructorParamTypes.join(", ")}])`);
      }
      if (metas.length > 0) {
        insertions.push({ line: classDecoratorEnd, content: metas });
      }
      inClass = false;
      currentDecorators = [];
      continue;
    }
    if (inClass) {
      const propMatch = trimLine.match(/^((?:public|private|protected|static|readonly)\s+)*(\w+)\s*:\s*([^;]+);$/);
      if (propMatch && !trimLine.includes("(")) {
        const typeStr = propMatch[3];
        const runtimeType = getRuntimeType(typeStr);
        const indent = line.match(/^\s*/)?.[0] || "";
        const metadataLine = `${indent}@__metadata("design:type", ${runtimeType})`;
        const insertLine = currentDecorators.length > 0 ? currentDecorators[currentDecorators.length - 1] + 1 : i;
        insertions.push({ line: insertLine, content: [metadataLine] });
        currentDecorators = [];
        continue;
      }
      const methodMatch = trimLine.match(/^((?:public|private|protected|static|async)\s+)*(\w+)\s*\(([^)]*)\)\s*:\s*([^ {;]+)(;| \{)?$/);
      if (methodMatch) {
        const paramsStr = methodMatch[3];
        const returnStr = methodMatch[4];
        const paramTypes = [];
        if (paramsStr) {
          const params = paramsStr.split(",");
          params.forEach((p) => {
            const ptMatch = p.trim().match(/:\s*([^,]+)/);
            const pt = ptMatch ? ptMatch[1].trim() : "Object";
            paramTypes.push(getRuntimeType(pt));
          });
        }
        const runtimeReturn = getRuntimeType(returnStr);
        const indent = line.match(/^\s*/)?.[0] || "";
        const metas = [
          `${indent}@__metadata("design:type", Function)`,
          `${indent}@__metadata("design:paramtypes", [${paramTypes.join(", ")}])`,
          `${indent}@__metadata("design:returntype", ${runtimeReturn})`
        ];
        const insertLine = currentDecorators.length > 0 ? currentDecorators[currentDecorators.length - 1] + 1 : i;
        insertions.push({ line: insertLine, content: metas });
        currentDecorators = [];
        continue;
      }
      const ctorMatch = trimLine.match(/^(?:(public|private|protected)\s+)?constructor\s*\(\s*(.*)\s*\)/);
      if (ctorMatch) {
        const paramsStr = ctorMatch[2];
        constructorParamTypes = [];
        if (paramsStr) {
          const params = paramsStr.split(",");
          params.forEach((p) => {
            const paramMatch = p.trim().match(/^.*?:\s*([^,]+)/);
            const paramType = paramMatch ? paramMatch[1].trim() : "Object";
            constructorParamTypes.push(getRuntimeType(paramType));
          });
        }
        currentDecorators = [];
        continue;
      }
    }
    currentDecorators = [];
  }
  insertions.sort((a, b) => b.line - a.line);
  for (const ins of insertions) {
    newLines.splice(ins.line, 0, ...ins.content);
  }
  return newLines.join("\n");
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
    let rawSource = fs.readFileSync(filePath, "utf8");
    if (config.emitDecoratorMetadata) {
      rawSource = addMetadataDecorators(rawSource);
    }
    let banner = `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`;
    if (config.emitDecoratorMetadata) {
      banner += `
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
`;
    }
    const transformOptions = {
      loader: esbuildLoader,
      format: "esm",
      target: `node${process.versions.node}`,
      sourcemap: "inline",
      sourcefile: filePath,
      banner,
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: config.experimentalDecorators
        }
      }
    };
    const { code } = transformSync(rawSource, transformOptions);
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
