import path from 'node:path';
import url from 'node:url';
import { register } from 'node:module';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loaderPath = path.join(__dirname, 'loader.js');
const loaderUrl = url.pathToFileURL(loaderPath).href;
const parentUrl = url.pathToFileURL(__filename).href;

register(loaderUrl, parentUrl);