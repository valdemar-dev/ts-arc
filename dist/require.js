// src/require.ts
import path from "node:path";
import url from "node:url";
import { register } from "node:module";
var __filename = url.fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var loaderPath = path.join(__dirname, "loader.js");
var loaderUrl = url.pathToFileURL(loaderPath).href;
var parentUrl = url.pathToFileURL(__filename).href;
register(loaderUrl, parentUrl);
