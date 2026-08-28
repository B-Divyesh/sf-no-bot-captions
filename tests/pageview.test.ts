import { describe, expect, it, vi } from 'vitest';
import { recordPageview } from '../src/pageview';

describe('privacy-respecting page counting', () => {
  it('does not send a page-count request while the browser is offline', () => {
    const send = vi.fn();
    recordPageview('/', { online: false, send });
    expect(send).not.toHaveBeenCalled();
  });

  it('records only when the browser reports an available network', () => {
    const send = vi.fn().mockResolvedValue(new Response());
    recordPageview('/privacy', { online: true, send });
    expect(send).toHaveBeenCalledWith('/api/pageview', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ path: '/privacy' }),
      keepalive: true,
    }));
  });
});
