import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const index = await readFile('dist/index.html');
const workerPath = 'dist/sw.js';
const worker = await readFile(workerPath, 'utf8');
const version = createHash('sha256').update(index).digest('hex').slice(0, 16);
if (!worker.includes('__APP_VERSION__')) throw new Error('Service-worker version placeholder is missing.');
await writeFile(workerPath, worker.replaceAll('__APP_VERSION__', version));
console.log(`service worker shell version: ${version}`);
