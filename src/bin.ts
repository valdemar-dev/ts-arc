#!/usr/bin/env node
import { register } from 'node:module';
import * as path from 'node:path';
import * as url from 'node:url';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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

function stripJsonComments(data: string): string {
    let index = 0;
    let out = '';
    let inString = false;
    while (index < data.length) {
        const ch = data[index];
        if (inString) {
            if (ch === '"' && data[index - 1] !== '\\') {
                inString = false;
            }
            out += ch;
            index++;
        } else {
            if (ch === '"') {
                inString = true;
                out += ch;
                index++;
            } else if (ch === '/' && data[index + 1] === '/') {
                index += 2;
                while (index < data.length && data[index] !== '\n') index++;
            } else if (ch === '/' && data[index + 1] === '*') {
                index += 2;
                while (index < data.length && !(data[index - 1] === '*' && data[index] === '/')) index++;
                if (index < data.length) index++;
            } else {
                out += ch;
                index++;
            }
        }
    }
    return out;
}

function loadConfig(filePath: string): any {
    const content = fs.readFileSync(filePath, 'utf8');
    const stripped = stripJsonComments(content);
    const config = JSON.parse(stripped);

    if (!config.extends) {
        return config;
    }

    const extendsVal = config.extends;
    const tsconfigDir = path.dirname(filePath);
    let extendsPath: string;

    if (extendsVal.startsWith('./') || extendsVal.startsWith('../')) {
        extendsPath = path.resolve(tsconfigDir, extendsVal);
        if (!extendsPath.endsWith('.json')) {
            extendsPath += '.json';
        }
    } else {
        try {
            extendsPath = require.resolve(extendsVal);
        } catch {
            extendsPath = require.resolve(extendsVal + '/tsconfig.json');
        }
    }

    const baseConfig = loadConfig(extendsPath);
    const merged = { ...baseConfig, ...config };
    merged.compilerOptions = { ...(baseConfig.compilerOptions || {}), ...(config.compilerOptions || {}) };
    return merged;
}

function findTsConfig(dir: string): string | null {
    let current = dir;
    while (current !== path.parse(current).root) {
        const tsconfigPath = path.join(current, 'tsconfig.json');
        if (fs.existsSync(tsconfigPath)) {
            return tsconfigPath;
        }
        current = path.dirname(current);
    }
    return null;
}

const tsconfigPath = findTsConfig(path.dirname(scriptPath));
let tsArcConfig: { baseUrl: string | null; paths: Record<string, string[]> } = { baseUrl: null, paths: {} };

if (tsconfigPath) {
    const mergedConfig = loadConfig(tsconfigPath);
    const compilerOptions = mergedConfig.compilerOptions || {};
    const tsconfigDir = path.dirname(tsconfigPath);
    const baseUrlStr = compilerOptions.baseUrl;
    tsArcConfig.baseUrl = baseUrlStr ? path.resolve(tsconfigDir, baseUrlStr) : null;
    tsArcConfig.paths = compilerOptions.paths || {};
}

global.__tsArcConfig = tsArcConfig;

import(scriptUrl).catch((err) => {
    console.error(err);
    process.exit(1);
});