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

/** We want to remove naughty little JSON comments that people sometimes put in their tsconfig. They shouldn't, I think; but they do. */
function stripJsonComments(input: string): string {
    let output = '';
    let insideString = false;
    let i = 0;

    while (i < input.length) {
        const char = input[i];

        if (insideString) {
            output += char;
            if (char === '"' && input[i - 1] !== '\\') insideString = false; // end of string unless escaped
            i++;
            continue;
        }

        if (char === '"') {
            insideString = true; // entering string literal
            output += char;
            i++;
            continue;
        }

        if (char === '/' && input[i + 1] === '/') {
            i += 2;
            while (i < input.length && input[i] !== '\n') i++; // skip single-line comment
            continue;
        }

        if (char === '/' && input[i + 1] === '*') {
            i += 2;
            while (
                i < input.length &&
                !(input[i - 1] === '*' && input[i] === '/')
            ) i++; // skip multi-line comment until closing */
            if (i < input.length) i++; // move past closing '/'
            continue;
        }

        output += char;
        i++;
    }

    return output;
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