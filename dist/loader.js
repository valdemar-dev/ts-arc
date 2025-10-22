#!/usr/bin/env node
import * as fs from "fs";
import * as url from "url";
import { transformSync } from "esbuild";
async function resolve(specifier, context, nextResolve) {
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
  if (urlStr.endsWith(".ts")) {
    const filePath = url.fileURLToPath(urlStr);
    const rawSource = fs.readFileSync(filePath, "utf8");
    const { code } = transformSync(rawSource, {
      loader: "ts",
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
  return nextLoad(urlStr, context);
}
export {
  load,
  resolve
};
