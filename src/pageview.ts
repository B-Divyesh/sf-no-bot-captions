type PageviewOptions = {
  online?: boolean;
  send?: typeof fetch;
};

/**
 * Record the product's aggregate-only page count when a network request can
 * succeed. The caption tool must remain completely quiet on an offline reload.
 */
export function recordPageview(path: string, options: PageviewOptions = {}): void {
  const online = options.online ?? navigator.onLine;
  if (!online) return;

  const send = options.send ?? fetch;
  void send('/api/pageview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
    keepalive: true,
  }).catch(() => undefined);
}
