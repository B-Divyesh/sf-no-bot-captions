import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const target = join(root, 'public', 'wasm');
await mkdir(target, { recursive: true });
for (const file of await readdir(source)) {
  if (file === 'ort-wasm-simd-threaded.wasm') await cp(join(source, file), join(target, file));
}
