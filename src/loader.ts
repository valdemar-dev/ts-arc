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
    try {
        const resolved = await nextResolve(specifier, context);
        return resolved;
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
        const resolved = await nextResolve(specifier + '/index.ts', context);
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
    if (urlStr.endsWith('.ts')) {
        const filePath = url.fileURLToPath(urlStr);
        const rawSource = fs.readFileSync(filePath, 'utf8');
        const { code } = transformSync(rawSource, {
            loader: 'ts',
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
    return nextLoad(urlStr, context);
}
