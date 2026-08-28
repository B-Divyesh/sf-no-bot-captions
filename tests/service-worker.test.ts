import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type WorkerEvent = { request: { url: string; method: string; mode?: string }; respondWith(value: Promise<Response>): void };

class MemoryCache {
  entries = new Map<string, Response>();
  constructor(private readonly server: Map<string, string>) {}
  private key(request: string | { url: string }): string {
    return typeof request === 'string' ? request : new URL(request.url).pathname;
  }
  async addAll(paths: string[]): Promise<void> {
    for (const path of paths) this.entries.set(path, new Response(this.server.get(path) ?? path));
  }
  async match(request: string | { url: string }): Promise<Response | undefined> {
    return this.entries.get(this.key(request))?.clone();
  }
  async put(request: string | { url: string }, response: Response): Promise<void> {
    this.entries.set(this.key(request), response.clone());
  }
}

async function workerHarness() {
  const source = await readFile(resolve(import.meta.dirname, '../public/sw.js'), 'utf8');
  const listeners = new Map<string, (event: unknown) => void>();
  const server = new Map<string, string>([['/', 'ORIGINAL']]);
  const stores = new Map<string, MemoryCache>();
  let online = true;
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new MemoryCache(server));
      return stores.get(name)!;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const self = {
    location: { origin: 'https://example.test' },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
  };
  const networkFetch = async (request: { url: string }) => {
    if (!online) throw new TypeError('offline');
    const path = new URL(request.url).pathname;
    return new Response(server.get(path) ?? `NETWORK:${path}`, { status: 200 });
  };
  Function('self', 'caches', 'fetch', 'URL', 'Response', source)(self, caches, networkFetch, URL, Response);
  const dispatchFetch = async (path: string, mode?: string) => {
    let response: Promise<Response> | undefined;
    const event: WorkerEvent = {
      request: { url: `https://example.test${path}`, method: 'GET', mode },
      respondWith: (value) => { response = value; },
    };
    listeners.get('fetch')?.(event);
    if (!response) throw new Error(`Worker did not handle ${path}`);
    return response;
  };
  return { server, stores, setOnline(value: boolean) { online = value; }, dispatchFetch };
}

describe('service worker release regressions', () => {
  it('uses the latest network shell and saves it for the next offline navigation', async () => {
    const worker = await workerHarness();
    worker.server.set('/', 'UPDATED');
    expect(await (await worker.dispatchFetch('/', 'navigate')).text()).toBe('UPDATED');
    worker.setOnline(false);
    expect(await (await worker.dispatchFetch('/privacy', 'navigate')).text()).toBe('UPDATED');
  });

  it('caches model and WASM runtime responses for offline reuse', async () => {
    const worker = await workerHarness();
    for (const path of ['/models/whisper/model_quantized.onnx', '/wasm/ort-wasm-simd-threaded.jsep.wasm']) {
      expect(await (await worker.dispatchFetch(path)).text()).toBe(`NETWORK:${path}`);
    }
    worker.setOnline(false);
    for (const path of ['/models/whisper/model_quantized.onnx', '/wasm/ort-wasm-simd-threaded.jsep.wasm']) {
      expect(await (await worker.dispatchFetch(path)).text()).toBe(`NETWORK:${path}`);
    }
  });
});
