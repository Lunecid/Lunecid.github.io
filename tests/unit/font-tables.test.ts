import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCmap4, buildName, cmapCodePoints, cmapGlyphs, parseName, sfntTables, woff2Tables } from '../../scripts/fonts/sfnt.mjs';
import { buildFonts, renameSansRecord, subsetSans, subsetSerifKo } from '../../scripts/fonts/build.mjs';
import { FONT_URL, fontFaceCss } from '../../src/lib/fonts';
import { htmlText, isIgnorable, paperSheetHtml, serifHeadHtml, shownText } from '../../scripts/fonts/glyphs.mjs';

type NameRecord = { platformID: number; encodingID: number; languageID: number; nameID: number; value: string };
const table = (buf: Buffer, tag: string): Buffer => woff2Tables(buf).get(tag)!;
const names = (buf: Buffer): NameRecord[] => parseName(table(buf, 'name'));
const cp = (ch: string): number => ch.codePointAt(0)!;

describe('sfnt helpers', () => {
  it('a format 4 cmap round-trips', () => {
    const mapping = new Map([[0x41, 1], [0x42, 2], [0x43, 3], [0xac00, 7], [0xd55c, 4]]);
    expect(cmapGlyphs(buildCmap4(mapping))).toEqual(mapping);
    expect([...cmapCodePoints(buildCmap4(mapping))].sort()).toEqual([...mapping.keys()].sort());
  });

  it('a name table round-trips (UTF-16 and Mac Roman records)', () => {
    const records: NameRecord[] = [
      { platformID: 1, encodingID: 0, languageID: 0, nameID: 1, value: 'SB Sans' },
      { platformID: 3, encodingID: 1, languageID: 0x409, nameID: 1, value: 'SB Sans' },
      { platformID: 3, encodingID: 1, languageID: 0x412, nameID: 0, value: 'Copyright © 2023 길형진' },
    ];
    expect(parseName(buildName(records))).toEqual(records);
  });

  it('renames every Pretendard name record the OFL Reserved Font Name covers', () => {
    const r = (nameID: number, value: string): NameRecord => ({ platformID: 3, encodingID: 1, languageID: 0x409, nameID, value });
    expect(renameSansRecord(r(1, 'Pretendard Variable'))).toBe('SB Sans');
    expect(renameSansRecord(r(3, '1.309;CTUS;PretendardVariable'))).toBe('1.309;SBSans-Regular;lunecid.github.io');
    expect(renameSansRecord(r(4, 'Pretendard Variable'))).toBe('SB Sans');
    expect(renameSansRecord(r(6, 'PretendardVariable-Regular'))).toBe('SBSans-Regular');
    expect(renameSansRecord(r(16, 'Pretendard Variable'))).toBe('SB Sans');
    expect(renameSansRecord(r(25, 'PretendardVariable'))).toBe('SBSans');
    expect(renameSansRecord(r(268, 'PretendardVariable-Bold'))).toBe('SBSans-Bold');
    expect(renameSansRecord(r(0, 'Copyright © 2023 Kil Hyung-jin'))).toBe('Copyright © 2023 Kil Hyung-jin');
    expect(renameSansRecord(r(13, 'This Font Software is licensed under the SIL Open Font License, Version 1.1.'))).toMatch(/Open Font License/);
  });
});

describe('subsets from the real font packages', () => {
  it('sans: the requested characters, renamed, with the OFL notice inside', async () => {
    const font: Buffer = await subsetSans('Ag가한→');
    expect(font.subarray(0, 4).toString('latin1')).toBe('wOF2');
    const cps = cmapCodePoints(table(font, 'cmap'));
    for (const ch of 'Ag가한→') expect(cps.has(cp(ch))).toBe(true);
    expect(cps.has(cp('똠'))).toBe(false);
    const records = names(font);
    expect(records.filter((n) => [1, 3, 4, 6, 16, 17, 25].includes(n.nameID) && /pretendard/i.test(n.value))).toEqual([]);
    expect(records.find((n) => n.nameID === 13)?.value).toMatch(/SIL Open Font License/);
    expect(records.find((n) => n.nameID === 10)?.value).toMatch(/Subset of Pretendard Variable/);
  });

  it('serif: Hangul from several fontsource slices merged into one file', async () => {
    const text = '국문초록가나다라마바사아자차카타파하'; // spread over many unicode-range slices
    const { data, missing } = await subsetSerifKo(text);
    expect(missing).toEqual([]);
    const tables = woff2Tables(data!);
    const cps = cmapCodePoints(tables.get('cmap')!);
    expect([...text].every((ch) => cps.has(cp(ch)))).toBe(true);
    expect(tables.has('fvar')).toBe(true); // stays variable (weights 200–900)
    expect(tables.has('GSUB')).toBe(false);
  });

  it('serif: characters Noto Serif KR lacks are reported, not fatal; the rest is still subset', async () => {
    // U+1100 (archaic-capable conjoining jamo) and U+D7B0 (Jamo Extended-B) are Hangul but not in Noto Serif KR.
    const { data, missing } = await subsetSerifKo('국문ᄀힰ');
    expect(missing).toEqual(['ᄀ', 'ힰ']);
    const cps = cmapCodePoints(table(data!, 'cmap'));
    expect(cps.has(cp('국'))).toBe(true);
    expect(cps.has(cp('문'))).toBe(true);
    const none = await subsetSerifKo('ᄀ');
    expect(none).toEqual({ data: null, missing: ['ᄀ'] });
  });

  it('serif heading instance (P2-3): a static wght-700 WOFF2 (no fvar/gvar) with the Hangul only', async () => {
    const { data, missing } = await subsetSerifKo('데이터 분석가 Data', { wght: 700 });
    expect(missing).toEqual([]);
    const tables = woff2Tables(data!);
    expect(tables.has('fvar')).toBe(false);
    expect(tables.has('gvar')).toBe(false);
    const cps = cmapCodePoints(tables.get('cmap')!);
    for (const ch of '데이터분석가') expect(cps.has(cp(ch))).toBe(true);
    expect(cps.has(cp('D'))).toBe(false);
  });

  it('serif OG instance (P2-12 input): an SFNT, static, with Hangul and Latin', async () => {
    const { data, missing } = await subsetSerifKo('데이터 분석가 · Data Analyst', { format: 'sfnt', wght: 700, latin: true });
    expect(missing).toEqual([]);
    expect(data!.readUInt32BE(0)).toBe(0x00010000);
    const tables = sfntTables(data!);
    expect(tables.has('fvar')).toBe(false);
    const cps = cmapCodePoints(tables.get('cmap')!);
    for (const ch of '데이터분석가·DataAnlys') expect(cps.has(cp(ch))).toBe(true);
  });
});

describe('buildFonts on a built page with characters the source fonts lack', () => {
  it('warns with the page path and still writes every subset', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'font-subsets-'));
    mkdirSync(join(dist, '_astro'));
    mkdirSync(join(dist, 'research', 'x'), { recursive: true });
    const head = `<style>${fontFaceCss(['sans', 'mono'])}</style><link rel="preload" href="${FONT_URL.sans}" as="font" type="font/woff2" crossorigin>`;
    writeFileSync(join(dist, 'index.html'), `<html lang="ko"><head>${head}</head><body><p>한글 漢字 Latin</p></body></html>`);
    writeFileSync(
      join(dist, 'research', 'x', 'index.html'),
      `<html lang="ko"><head>${head}<style>${fontFaceCss(['serifKo'])}</style></head><body><article class="paper"><p>국문 ᄀ</p></article></body></html>`,
    );
    const warnings: string[] = [];
    try {
      const results = await buildFonts(dist, { warn: (m: string) => warnings.push(m) });
      expect(results.map((r: { face: string }) => r.face).sort()).toEqual(['mono', 'sans', 'sans', 'serifKo']);
      expect(warnings.some((w) => /^font-subsets: \/: Pretendard Variable has no glyph for 漢 \(U\+6F22\) 字 \(U\+5B57\)/.test(w))).toBe(true);
      expect(warnings.some((w) => /^font-subsets: \/research\/x\/: Noto Serif KR has no glyph for ᄀ \(U\+1100\)/.test(w))).toBe(true);
      const page = readFileSync(join(dist, 'research', 'x', 'index.html'), 'utf8');
      expect(page).not.toContain('/_fonts/');
      expect(page).toMatch(/src:url\(\/_astro\/sb-serif-kr\.\w+\.woff2\)/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('names the step and the cause when the build step itself fails', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'font-subsets-'));
    mkdirSync(join(dist, '_astro'));
    // A page whose font markup no longer matches src/lib/fonts.ts leaves a placeholder behind.
    writeFileSync(join(dist, 'index.html'), `<html lang="ko"><head><style>@font-face{src:url(${FONT_URL.sans})}</style></head><body>가</body></html>`);
    try {
      await expect(buildFonts(dist, { warn: () => {} })).rejects.toThrow(/^font-subsets: rewriting \/: the page still references \/_fonts\/sb-sans\.woff2/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('builds the heading face from the Hangul inside [data-serif] of the pages that declare it, and never preloads it', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'font-subsets-'));
    mkdirSync(join(dist, '_astro'));
    mkdirSync(join(dist, 'data'), { recursive: true });
    const sansHead = `<style>${fontFaceCss(['sans'])}</style><link rel="preload" href="${FONT_URL.sans}" as="font" type="font/woff2" crossorigin>`;
    writeFileSync(join(dist, 'index.html'), `<html lang="ko"><head>${sansHead}</head><body><p>선택 화면</p></body></html>`);
    writeFileSync(
      join(dist, 'data', 'index.html'),
      `<html lang="ko"><head>${sansHead}<style>${fontFaceCss(['serifKoHead'])}</style></head><body><h1 id="hero-name" data-serif>백성은</h1><h2 class="t" data-serif="">연구</h2><p>본문 뷁</p></body></html>`,
    );
    try {
      const results = await buildFonts(dist, { warn: () => {} });
      expect(results.find((r: { face: string }) => r.face === 'serifKoHead')?.chars).toBe(5);
      const page = readFileSync(join(dist, 'data', 'index.html'), 'utf8');
      const url = /src:url\((\/_astro\/sb-serif-kr-head\.[\w-]+\.woff2)\)/.exec(page)?.[1];
      expect(url).toBeDefined();
      expect(page).not.toMatch(/<link rel="preload"[^>]*sb-serif-kr-head/);
      const cps = cmapCodePoints(woff2Tables(readFileSync(join(dist, ...url!.split('/').filter(Boolean)))).get('cmap')!);
      for (const ch of '백성은연구') expect(cps.has(cp(ch))).toBe(true);
      expect(cps.has(cp('뷁'))).toBe(false);
      expect(readFileSync(join(dist, 'index.html'), 'utf8')).not.toContain('sb-serif-kr-head');
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe('glyph collection', () => {
  it('reads text, attributes, island props and stylesheet strings, but not JSON-LD', () => {
    const html =
      '<html><head><style>.a::after{content:"\\2192"}</style><script type="application/ld+json">{"name":"똠"}</script></head>' +
      '<body><p title="툴팁">본문 &amp; &#x2014;</p><astro-island props="{&quot;x&quot;:[0,&quot;토스트&quot;]}"></astro-island></body></html>';
    const text: string = htmlText(html);
    for (const ch of '→툴팁본문&—토스트') expect(text).toContain(ch);
    expect(text).not.toContain('똠');
    const shown: string = shownText(html);
    expect(shown).toContain('본문');
    expect(shown).not.toContain('토스트');
    expect(shown).not.toContain('툴팁');
  });

  it('finds the paper sheet and leaves emoji and invisible characters to other fonts', () => {
    expect(paperSheetHtml('<main><article class="paper" data-x>국문</article><p>밖</p></main>')).toContain('국문');
    expect(paperSheetHtml('<main><article class="paper" data-x>국문</article><p>밖</p></main>')).not.toContain('밖');
    expect(isIgnorable('🔒')).toBe(true);
    expect(isIgnorable('\u200b')).toBe(true);
    expect(isIgnorable('©')).toBe(false);
    expect(isIgnorable('★')).toBe(false);
  });

  it('serifHeadHtml: the content of every element that carries data-serif, nothing else', () => {
    const html = '<h1 id="a" data-serif>제목</h1><p>본문</p><h2 class="x" data-serif="">연구 <span>관심</span></h2><span data-serifx>아님</span>';
    const out = serifHeadHtml(html);
    for (const text of ['제목', '연구', '관심']) expect(out).toContain(text);
    for (const text of ['본문', '아님']) expect(out).not.toContain(text);
  });
});
