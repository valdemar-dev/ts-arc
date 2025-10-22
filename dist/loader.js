#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { transformSync } from "esbuild";
async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return nextResolve(specifier, context);
  }
  const config = global.__tsArcConfig;
  if (config) {
    const { baseUrl, paths } = config;
    for (const key of Object.keys(paths)) {
      let capture = null;
      if (key.endsWith("/*")) {
        const prefix = key.slice(0, -2);
        if (specifier.startsWith(prefix)) {
          capture = specifier.slice(prefix.length);
        }
      } else if (specifier === key) {
        capture = "";
      }
      if (capture !== null) {
        for (const target of paths[key]) {
          const newSpecifier = target.replace(/\*/g, capture);
          if (baseUrl) {
            const fakeParent = url.pathToFileURL(path.join(baseUrl, "dummy.ts")).href;
            try {
              const resolved = await nextResolve(`./${newSpecifier}`, { parentURL: fakeParent });
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
    if (baseUrl) {
      const fakeParent = url.pathToFileURL(path.join(baseUrl, "dummy.ts")).href;
      try {
        const resolved = await nextResolve(`./${specifier}`, { parentURL: fakeParent });
        return { ...resolved, shortCircuit: true };
      } catch (error) {
        if (error.code !== "ERR_MODULE_NOT_FOUND") {
          throw error;
        }
      }
    }
  }
  try {
    const resolved = await nextResolve(specifier, context);
    return resolved;
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") {
      throw error;
    }
  }
  try {
    const resolved = await nextResolve(specifier + ".ts", context);
    return { ...resolved, shortCircuit: true };
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") {
      throw error;
    }
  }
  try {
    const resolved = await nextResolve(specifier + "/index.ts", context);
    return { ...resolved, shortCircuit: true };
  } catch (error) {
    throw error;
  }
}
async function load(urlStr, context, nextLoad) {
  let esbuildLoader = "ts";
  if (urlStr.endsWith(".ts")) {
  } else if (urlStr.endsWith(".tsx")) {
    esbuildLoader = "tsx";
  } else {
    return nextLoad(urlStr, context);
  }
  const filePath = url.fileURLToPath(urlStr);
  const rawSource = fs.readFileSync(filePath, "utf8");
  const { code } = transformSync(rawSource, {
    loader: esbuildLoader,
    format: "esm",
    target: `node${process.versions.node}`,
    sourcemap: "inline",
    sourcefile: filePath
  });
  return {
    format: "module",
    source: code,
    shortCircuit: true
  };
}
export {
  load,
  resolve
};
