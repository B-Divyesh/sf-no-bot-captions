import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('container build and runtime contract', () => {
  it('uses Vitest’s config helper so the production Vite build type-checks', async () => {
    const config = await readFile(resolve(root, 'vite.config.ts'), 'utf8');
    expect(config).toContain("from 'vitest/config'");
  });

  it('bakes ACR build identity into a non-root runtime image', async () => {
    const dockerfile = await readFile(resolve(root, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/^ARG BUILD_SHA=dev$/m);
    expect(dockerfile).toContain('FROM rust:1-slim AS backend');
    expect(dockerfile).not.toMatch(/^FROM rust:\d+\.\d+/m);
    expect(dockerfile).toMatch(/^ENV BUILD_SHA=\$\{BUILD_SHA\}$/m);
    expect(dockerfile).toContain('USER nonroot:nonroot');
    expect(dockerfile).toContain('EXPOSE 8080');
  });
});
