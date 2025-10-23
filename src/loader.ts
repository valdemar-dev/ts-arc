import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { transformSync } from 'esbuild';

let config: { baseUrl: string | null; paths: Record<string, string[]>; tsconfigDir: string | null };

export function initialize(initContext: any) {
    config = initContext;
}

export async function resolve(
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (specifier: string, context: { parentURL?: string }) => Promise<{ url: string; format?: string; shortCircuit?: boolean }>
): Promise<{ url: string; format?: string; shortCircuit?: boolean }> {
    const isRelativeOrAbsolute = specifier.startsWith('.') || specifier.startsWith('/');

    if (!isRelativeOrAbsolute) {
        if (config) {
            const { baseUrl, paths, tsconfigDir } = config;
            const effectiveBaseDir = baseUrl ? path.resolve(tsconfigDir ?? '', baseUrl) : tsconfigDir;

            for (const key of Object.keys(paths)) {
                let capture: string | null = null;
                let isWildcard = key.endsWith('/*');
                const prefix = isWildcard ? key.slice(0, -2) : key;

                if (isWildcard) {
                    if (specifier.startsWith(prefix + '/')) {
                        capture = specifier.slice(prefix.length + 1);
                    }
                } else if (specifier === key) {
                    capture = '';
                }

                if (capture !== null) {
                    for (const target of paths[key]) {
                        const mapped = isWildcard ? target.replace(/\*/g, capture) : target;
                        const mappedSpecifier = `./${mapped}`;
                        const fakeParentDir = effectiveBaseDir ?? process.cwd();
                        const fakeParentURL = url.pathToFileURL(path.join(fakeParentDir, 'dummy.ts')).href;

                        try {
                            const resolved = await resolve(mappedSpecifier, { parentURL: fakeParentURL }, nextResolve);
                            return { ...resolved, shortCircuit: true };
                        } catch (error: any) {
                            console.error(`TS-ARC: Failed to resolve mapped specifier "${mappedSpecifier}" from base "${fakeParentDir}":`, error.message);
                            if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                                throw error;
                            }
                        }
                    }
                }
            }

            if (baseUrl) {
                const baseDir = path.resolve(tsconfigDir ?? '', baseUrl);
                const mappedSpecifier = `./${specifier}`;
                const fakeParentURL = url.pathToFileURL(path.join(baseDir, 'dummy.ts')).href;

                try {
                    const resolved = await resolve(mappedSpecifier, { parentURL: fakeParentURL }, nextResolve);
                    return { ...resolved, shortCircuit: true };
                } catch (error: any) {
                    console.error(`TS-ARC: Failed to resolve specifier "${specifier}" from baseUrl "${baseDir}":`, error.message);
                    if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                        throw error;
                    }
                }
            }
        }

        try {
            const resolved = await nextResolve(specifier, context);
            return { ...resolved, shortCircuit: true };
        } catch (error: any) {
            if (error.code === 'ERR_MODULE_NOT_FOUND') {
                throw error;
            }
            throw error;
        }
    }

    try {
        const resolved = await nextResolve(specifier, context);
        return { ...resolved, shortCircuit: true };
    } catch (error: any) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') {
            throw error;
        }
    }

    const ext = path.extname(specifier);
    if (ext !== '') {
        throw new Error(`Module not found: ${specifier}`);
    }

    for (const suffix of ['.ts', '.tsx']) {
        try {
            const resolved = await nextResolve(specifier + suffix, context);
            return { ...resolved, shortCircuit: true };
        } catch (error: any) {
            if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                throw error;
            }
        }
    }

    for (const suffix of ['/index.ts', '/index.tsx']) {
        try {
            const resolved = await nextResolve(specifier + suffix, context);
            return { ...resolved, shortCircuit: true };
        } catch (error: any) {
            if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                throw error;
            }
        }
    }

    throw new Error(`Module not found: ${specifier}`);
}

export async function load(
    urlStr: string,
    context: { format?: string },
    nextLoad: (url: string, context: { format?: string }) => Promise<{ format: string; source?: string | Buffer; shortCircuit?: boolean }>
): Promise<{ format: string; source?: string | Buffer; shortCircuit?: boolean }> {
    if (!urlStr.endsWith('.ts') && !urlStr.endsWith('.tsx')) {
        return nextLoad(urlStr, context);
    }

    const esbuildLoader: 'ts' | 'tsx' = urlStr.endsWith('.tsx') ? 'tsx' : 'ts';

    const filePath = url.fileURLToPath(urlStr);
    const rawSource = fs.readFileSync(filePath, 'utf8');
    
    const { code } = transformSync(rawSource, {
        loader: esbuildLoader,
        format: 'esm',
        target: `node${process.versions.node}`,
        sourcemap: 'inline',
        sourcefile: filePath,
        banner: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);`,
    });
    
    return {
        format: 'module',
        source: code,
        shortCircuit: true,
    };
}