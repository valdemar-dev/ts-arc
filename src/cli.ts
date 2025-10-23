#!/usr/bin/env node
import * as path from 'node:path';
import * as url from 'node:url';
import { loadModule, registerLoader } from "./bin";

const script = process.argv[2];
if (!script) {
    console.error('Usage: ts-arc <script.ts> [args...]');
    process.exit(1);
}

const scriptPath = path.resolve(script);
const scriptUrl = url.pathToFileURL(scriptPath).href;

process.argv = [process.argv[0], script, ...process.argv.slice(3)];

(async () => {
    await loadModule(scriptUrl);
})()