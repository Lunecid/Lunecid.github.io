import type { APIContext } from 'astro';
import { describe, expect, it } from 'vitest';
import { GET } from '../../src/pages/robots.txt';

async function robots(site: URL | undefined): Promise<Response> {
  return GET({ site } as unknown as APIContext);
}

describe('robots.txt', () => {
  it('robots allows /, disallows /print/ and points to sitemap-index.xml', async () => {
    const res = await robots(new URL('https://lunecid.github.io/'));
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    const text = await res.text();
    expect(text).toMatch(/^User-agent: \*$/m);
    expect(text).toMatch(/^Allow: \/$/m);
    expect(text).toMatch(/^Disallow: \/print\/$/m);
    expect(text).toMatch(/^Sitemap: https:\/\/lunecid\.github\.io\/sitemap-index\.xml$/m);
  });

  it('falls back to SITE.url when Astro passes no site', async () => {
    const text = await (await robots(undefined)).text();
    expect(text).toContain('Sitemap: https://lunecid.github.io/sitemap-index.xml');
  });
});
