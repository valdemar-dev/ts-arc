import * as fs from 'node:fs';
import { register } from 'node:module';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loaderPath = path.join(__dirname, "loader.js");
const loaderUrl = url.pathToFileURL(loaderPath).href;

const require2 = createRequire(import.meta.url);

function stripJsonComments(input: string): string {
    let output = '';
    let insideString = false;
    let i = 0;

    while (i < input.length) {
        const char = input[i];

        if (insideString) {
            output += char;
            if (char === '"' && input[i - 1] !== '\\') insideString = false;
            i++;
            continue;
        }

        if (char === '"') {
            insideString = true;
            output += char;
            i++;
            continue;
        }

        if (char === '/' && input[i + 1] === '/') {
            i += 2;
            while (i < input.length && input[i] !== '\n') i++;
            continue;
        }

        if (char === '/' && input[i + 1] === '*') {
            i += 2;
            while (i < input.length) {
                if (input[i - 1] === '*' && input[i] === '/') {
                    i++;
                    break;
                }
                i++;
            }
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

    if (!config.extends) return config;

    const extendsVal = config.extends;
    const tsconfigDir = path.dirname(filePath);
    let extendsPath: string;

    if (extendsVal.startsWith('./') || extendsVal.startsWith('../')) {
        extendsPath = path.resolve(tsconfigDir, extendsVal);
        if (!extendsPath.endsWith('.json')) extendsPath += '.json';
    } else {
        try { extendsPath = require2.resolve(extendsVal); }
        catch { extendsPath = require2.resolve(extendsVal + '/tsconfig.json'); }
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
        if (fs.existsSync(tsconfigPath)) return tsconfigPath;
        current = path.dirname(current);
    }
    return null;
}

let tsArcConfig: { baseUrl: string | null; paths: Record<string, string[]>; tsconfigDir: string | null; emitDecoratorMetadata: boolean; experimentalDecorators: boolean } = {
    baseUrl: null,
    paths: {},
    tsconfigDir: null,
    emitDecoratorMetadata: false,
    experimentalDecorators: false
};

const tsconfigPath = findTsConfig(process.cwd());

if (tsconfigPath) {
    const mergedConfig = loadConfig(tsconfigPath);
    const compilerOptions = mergedConfig.compilerOptions || {};
    const tsconfigDir = path.dirname(tsconfigPath);
    const baseUrlStr = compilerOptions.baseUrl;

    tsArcConfig.baseUrl = baseUrlStr ? path.resolve(tsconfigDir, baseUrlStr) : null;
    tsArcConfig.paths = compilerOptions.paths || {};
    tsArcConfig.tsconfigDir = tsconfigDir;
    tsArcConfig.emitDecoratorMetadata = compilerOptions.emitDecoratorMetadata || false;
    tsArcConfig.experimentalDecorators = compilerOptions.experimentalDecorators || false;
}

export function registerLoader() {
    register(loaderPath, import.meta.url, { data: tsArcConfig });
}

export async function setArcTsConfig(directory: string) {
    const tsconfigPath = findTsConfig(directory);
    if (tsconfigPath) {
        const mergedConfig = loadConfig(tsconfigPath);
        const compilerOptions = mergedConfig.compilerOptions || {};
        const tsconfigDir = path.dirname(tsconfigPath);
        const baseUrlStr = compilerOptions.baseUrl;
        tsArcConfig.baseUrl = baseUrlStr ? path.resolve(tsconfigDir, baseUrlStr) : null;
        tsArcConfig.paths = compilerOptions.paths || {};
        tsArcConfig.tsconfigDir = tsconfigDir;
        tsArcConfig.emitDecoratorMetadata = compilerOptions.emitDecoratorMetadata || false;
        tsArcConfig.experimentalDecorators = compilerOptions.experimentalDecorators || false;
    }
}

export async function loadModule(scriptUrl: string) {
    const scriptPath = url.fileURLToPath(scriptUrl);
    setArcTsConfig(path.dirname(scriptPath));
    registerLoader();
    import(scriptUrl).catch(err => { console.error(err); process.exit(1); });
}