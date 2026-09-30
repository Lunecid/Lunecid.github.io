import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { STUB_MARKER, stubCsp, stubHtml, writeStubs } from '../../scripts/redirects/build.mjs';

const input = {
  from: '/records/', to: '/game/records/', lang: 'ko' as const, title: '기록·이력서 · 백성은', description: '학력 & "수상"',
  ogImage: 'https://lunecid.github.io/og/game/records.png', siteUrl: 'https://lunecid.github.io',
};

describe('stubHtml (R-6, contract §2.4)', () => {
  it('AL-1 (C0): the stub carries its own CSP meta right after charset, allowing only its one script by hash', () => {
    const script = 'location.replace("/game/records/" + location.hash)';
    const hash = createHash('sha256').update(script).digest('base64');
    expect(stubCsp(script)).toBe(`default-src 'none'; script-src 'sha256-${hash}'; img-src 'self'; base-uri 'none'; form-action 'none'`);
    expect(stubHtml(input)).toContain(`<meta charset="utf-8">\n<meta http-equiv="content-security-policy" content="${stubCsp(script)}">\n<script>${script}</script>`);
  });

  it('head order: charset → CSP meta → location.replace(to + hash) → meta refresh → canonical, then meta, OG and icons; body in the page language', () => {
    const html = stubHtml(input);
    expect(html.startsWith(`<!doctype html><html lang="ko" ${STUB_MARKER}><head>`)).toBe(true);
    const at = (needle: string) => html.indexOf(needle);
    expect(at('<meta charset="utf-8">')).toBeGreaterThan(0);
    expect(at('<script>location.replace("/game/records/" + location.hash)</script>')).toBeGreaterThan(at('<meta charset="utf-8">'));
    expect(at('<meta http-equiv="refresh" content="0; url=/game/records/">')).toBeGreaterThan(at('location.replace'));
    expect(at('<link rel="canonical" href="https://lunecid.github.io/game/records/">')).toBeGreaterThan(at('http-equiv="refresh"'));
    expect(html).not.toContain('noindex');
    expect(html).toContain('<title>기록·이력서 · 백성은</title>');
    expect(html).toContain('<meta name="description" content="학력 &amp; &quot;수상&quot;">');
    expect(html).toContain('<meta property="og:url" content="https://lunecid.github.io/game/records/">');
    expect(html).toContain('<meta property="og:image" content="https://lunecid.github.io/og/game/records.png">');
    for (const icon of ['<link rel="icon" href="/favicon.ico" sizes="32x32"', '<link rel="icon" type="image/svg+xml" href="/favicon.svg"', '<link rel="apple-touch-icon" href="/apple-touch-icon.png"']) expect(html).toContain(icon);
    expect(html).toContain('<p>이 페이지는 새 주소로 옮겼습니다. <a href="/game/records/">새 주소로 가기</a></p>');
    for (const absent of ['goatcounter', '@font-face', '<style', 'stylesheet']) expect(html).not.toContain(absent);
    expect(stubHtml({ ...input, lang: 'en', to: '/en/game/records/' })).toContain('<p>This page has moved. <a href="/en/game/records/">Go to the new address</a></p>');
  });
});

describe('writeStubs', () => {
  function fixture(): string {
    const dir = mkdtempSync(join(tmpdir(), 'stubs-'));
    mkdirSync(join(dir, 'game', 'records'), { recursive: true });
    writeFileSync(
      join(dir, 'game', 'records', 'index.html'),
      '<html><head><title>기록 &amp; 이력서</title><meta name="description" content="학력"><meta property="og:image" content="https://lunecid.github.io/og/game/records.png"></head></html>',
    );
    return dir;
  }
  const one = [{ from: '/records/', to: '/game/records/', lang: 'ko' as const }];

  it('writes dist/<from>/index.html with the built target page title, description and og:image', async () => {
    const dir = fixture();
    const written = await writeStubs(dir, { warn: () => undefined, redirects: one });
    expect(written).toEqual(one);
    const html = readFileSync(join(dir, 'records', 'index.html'), 'utf8');
    expect(html).toContain('<title>기록 &amp; 이력서</title>');
    expect(html).toContain('<meta property="og:image" content="https://lunecid.github.io/og/game/records.png">');
  });

  it('throws on a missing target and never overwrites an existing page', async () => {
    const dir = fixture();
    await expect(writeStubs(dir, { warn: () => undefined, redirects: [{ from: '/x/', to: '/game/x/', lang: 'ko' }] })).rejects.toThrow(/target \/game\/x\/ was not built/);
    mkdirSync(join(dir, 'records'), { recursive: true });
    writeFileSync(join(dir, 'records', 'index.html'), '<p>real page</p>');
    await expect(writeStubs(dir, { warn: () => undefined, redirects: one })).rejects.toThrow(/already exists/);
    expect(readFileSync(join(dir, 'records', 'index.html'), 'utf8')).toBe('<p>real page</p>');
    expect(existsSync(join(dir, 'records', 'index.html'))).toBe(true);
  });
});
