const VERSION = '__APP_VERSION__';
const CACHE_PREFIX = 'no-bot-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${VERSION}`;
const MODEL_CACHE = `${CACHE_PREFIX}model-runtime-r1`;
const SHELL = [
  '/',
  '/audio-worklet.js',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/fonts/atkinson-hyperlegible-next.woff2',
  '/fonts/departure-mono.woff2',
  '/assets/private-signal-console.webp',
  '/assets/private-signal-console-720.webp',
];

async function installShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(SHELL);
  const html = await (await cache.match('/')).text();
  const builtAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map((match) => match[1]);
  await cache.addAll(builtAssets);
  await self.skipWaiting();
}

self.addEventListener('install', (event) => {
  event.waitUntil(installShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== RUNTIME_CACHE && key !== MODEL_CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function freshNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('/', response.clone());
    return response;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(freshNavigation(event.request));
    return;
  }
  const isModelRuntime = url.pathname.startsWith('/models/') || url.pathname.startsWith('/wasm/');
  const isShellRuntime = url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/fonts/');
  if (isModelRuntime) event.respondWith(cacheFirst(event.request, MODEL_CACHE));
  else if (isShellRuntime) event.respondWith(cacheFirst(event.request, RUNTIME_CACHE));
});
