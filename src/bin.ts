#!/usr/bin/env node
import { register } from 'node:module';
import * as path from 'node:path';
import * as url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loaderPath = path.join(__dirname, "loader.js");
register(loaderPath, url.pathToFileURL(__dirname).href);

const script = process.argv[2];
if (!script) {
    console.error('Usage: node bin.js <script.ts> [args...]');
    process.exit(1);
}

const scriptPath = path.resolve(script);
const scriptUrl = url.pathToFileURL(scriptPath).href;

process.argv = [process.argv[0], script, ...process.argv.slice(3)];

import(scriptUrl).catch((err) => {
    console.error(err);
    process.exit(1);
});
