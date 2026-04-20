#!/usr/bin/env node
import * as path from 'node:path';
import * as url from 'node:url';
import * as child_process from 'node:child_process';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHILD_ENV_VAR = 'TS_ARC_IS_CHILD';

if (process.env[CHILD_ENV_VAR] !== '1') {
    const script = process.argv[2];
    if (!script) {
        console.error('Usage: ts-arc <script.ts> [args...]');
        process.exit(1);
    }

    const loaderPath = path.join(__dirname, 'loader.js');
    const loaderUrl = url.pathToFileURL(loaderPath).href;

    let childExecArgv = [...process.execArgv];

    const enableSourceMapsFlag = '--enable-source-maps';
    if (!childExecArgv.includes(enableSourceMapsFlag)) {
        childExecArgv.unshift(enableSourceMapsFlag);
    }

    const childEnv = {
        ...process.env,
        [CHILD_ENV_VAR]: '1',
    };

    const spawnArgs = [
        ...childExecArgv,
        __filename,
        script,
        ...process.argv.slice(3),
    ];

    const result = child_process.spawnSync(
        process.execPath,
        spawnArgs,
        {
            stdio: 'inherit',
            env: childEnv,
        }
    );

    if (result.signal) {
        process.kill(process.pid, result.signal);
    }

    process.exit(result.status ?? 0);
}

// only executes in the child
(async () => {
    const script = process.argv[2];
    if (!script) {
        console.error('Usage: ts-arc <script.ts> [args...]');
        process.exit(1);
    }

    const scriptPath = path.resolve(script);
    const scriptUrl = url.pathToFileURL(scriptPath).href;

    process.argv = [process.argv[0], script, ...process.argv.slice(3)];

    const { loadModule } = await import('./bin');

    await loadModule(scriptUrl);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});