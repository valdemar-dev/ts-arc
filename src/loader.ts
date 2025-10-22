#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { transformSync } from 'esbuild';

export async function resolve(
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (specifier: string, context: { parentURL?: string }) => Promise<{ url: string; format?: string; shortCircuit?: boolean }>
): Promise<{ url: string; format?: string; shortCircuit?: boolean }> {
    const isRelative = specifier.startsWith('.') || specifier.startsWith('/');

    if (!isRelative) {
        const config = (global as any).__tsArcConfig;
        if (config) {
            const { baseUrl, paths, tsconfigDir } = config;

            for (const key of Object.keys(paths)) {
                let capture: string | null = null;
                
                if (key.endsWith('/*')) {
                    const prefix = key.slice(0, -2);
                    
                    if (specifier.startsWith(prefix)) {
                        capture = specifier.slice(prefix.length);
                    }
                } else if (specifier === key) {
                    capture = '';
                }

                if (capture !== null) {
                    for (const target of paths[key]) {
                        const newSpecifier = target.replace(/\*/g, capture);
                        const effectiveBase = baseUrl ?? tsconfigDir;
                        
                        if (effectiveBase) {
                            const fakeParent = url.pathToFileURL(path.join(effectiveBase, 'dummy.ts')).href;
                            
                            try {
                                const resolved = await nextResolve(`./${newSpecifier}`, { parentURL: fakeParent });
                                
                                return { ...resolved, shortCircuit: true };
                            } catch (error: any) {
                                if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                                    throw error;
                                }
                            }
                        }
                    }
                }
            }

            if (baseUrl) {
                const fakeParent = url.pathToFileURL(path.join(baseUrl, 'dummy.ts')).href;
                
                try {
                    const resolved = await nextResolve(`./${specifier}`, { parentURL: fakeParent });
                    
                    return { ...resolved, shortCircuit: true };
                } catch (error: any) {
                    if (error.code !== 'ERR_MODULE_NOT_FOUND') {
                        throw error;
                    }
                }
            }
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

    try {
        const resolved = await nextResolve(specifier + '.ts', context);
        
        return { ...resolved, shortCircuit: true };
    } catch (error: any) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') {
            throw error;
        }
    }

    try {
        const resolved = await nextResolve(specifier + '.tsx', context);
        
        return { ...resolved, shortCircuit: true };
    } catch (error: any) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') {
            throw error;
        }
    }

    try {
        const resolved = await nextResolve(specifier + '/index.ts', context);
        
        return { ...resolved, shortCircuit: true };
    } catch (error: any) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') {
            throw error;
        }
    }

    try {
        const resolved = await nextResolve(specifier + '/index.tsx', context);
        
        return { ...resolved, shortCircuit: true };
    } catch (error: any) {
        throw error;
    }
}

export async function load(
    urlStr: string,
    context: { format?: string },
    nextLoad: (url: string, context: { format?: string }) => Promise<{ format: string; source?: string | Buffer; shortCircuit?: boolean }>
): Promise<{ format: string; source?: string | Buffer; shortCircuit?: boolean }> {
    if (!urlStr.endsWith('.ts') && !urlStr.endsWith('.tsx')) {
        return nextLoad(urlStr, context);
    }

    const esbuildLoader = urlStr.endsWith('.tsx') ? 'tsx' : 'ts';

    const filePath = url.fileURLToPath(urlStr);
    const rawSource = fs.readFileSync(filePath, 'utf8');
    
    const { code } = transformSync(rawSource, {
        loader: esbuildLoader,
        format: 'esm',
        target: `node${process.versions.node}`,
        sourcemap: 'inline',
        sourcefile: filePath,
    });
    
    return {
        format: 'module',
        source: code,
        shortCircuit: true,
    };
}