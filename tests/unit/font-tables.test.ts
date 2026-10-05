import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCmap4, buildName, cmapCodePoints, cmapGlyphs, parseName, sfntTables, woff2Tables } from '../../scripts/fonts/sfnt.mjs';
import { SOURCES, buildFonts, renameSansRecord, subsetDisplay, subsetSans, subsetSerifKo } from '../../scripts/fonts/build.mjs';
import { FONT_URL, fontFaceCss } from '../../src/lib/fonts';
import { ALWAYS_SYMBOLS, DISPLAY_CHARACTERS, PRINTABLE_ASCII, htmlText, isIgnorable, paperSheetHtml, sansCharacters, shownText } from '../../scripts/fonts/glyphs.mjs';

type NameRecord = { platformID: number; encodingID: number; languageID: number; nameID: number; value: string };
const table = (buf: Buffer, tag: string): Buffer => woff2Tables(buf).get(tag)!;
const names = (buf: Buffer): NameRecord[] => parseName(table(buf, 'name'));
const cp = (ch: string): number => ch.codePointAt(0)!;
/** The fvar axes of a font: tag, min, default, max (16.16 fixed). */
const fvarAxes = (buf: Buffer): { tag: string; min: number; def: number; max: number }[] => {
  const fvar = woff2Tables(buf).get('fvar');
  if (!fvar) return [];
  const v = new DataView(fvar.buffer, fvar.byteOffset, fvar.byteLength);
  const [offset, count, size] = [v.getUint16(4), v.getUint16(8), v.getUint16(10)];
  return Array.from({ length: count }, (_, i) => {
    const at = offset + i * size;
    return { tag: fvar.subarray(at, at + 4).toString('latin1'), min: v.getInt32(at + 4) / 65536, def: v.getInt32(at + 8) / 65536, max: v.getInt32(at + 12) / 65536 };
  });
};

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

  it('display: a WOFF2 subset of Archivo with printable ASCII and the symbol list, wdth pinned (no wdth axis left), wght 700–900, licence records 0/14 kept (the source has no 13)', async () => {
    const font: Buffer = await subsetDisplay();
    expect(font.subarray(0, 4).toString('latin1')).toBe('wOF2');
    const source = readFileSync(SOURCES.display);
    const sourceCps = cmapCodePoints(table(source, 'cmap'));
    const cps = cmapCodePoints(table(font, 'cmap'));
    expect(DISPLAY_CHARACTERS).toBe(PRINTABLE_ASCII + ALWAYS_SYMBOLS);
    for (const ch of PRINTABLE_ASCII) expect(cps.has(cp(ch)), `ASCII ${ch}`).toBe(true);
    // every listed symbol the source draws is kept; Archivo's own gaps (e.g. ♪) fall to SB Sans through the stack
    const kept = [...ALWAYS_SYMBOLS].filter((ch) => sourceCps.has(cp(ch)));
    expect(kept.length).toBeGreaterThan(10);
    for (const ch of kept) expect(cps.has(cp(ch)), `symbol ${ch}`).toBe(true);
    expect(cps.has(cp('가')) || cps.has(cp('é'))).toBe(false);
    // the width axis is pinned at 112 % (no wdth axis left); the weight axis spans 700–900
    expect(fvarAxes(source).map((a) => a.tag).sort()).toEqual(['wdth', 'wght']);
    expect(fvarAxes(font)).toEqual([{ tag: 'wght', min: 700, def: expect.any(Number), max: 900 }]);
    expect(font.length).toBeLessThan(source.length / 2);
    const records = names(font);
    expect(records.find((n) => n.nameID === 0)?.value).toMatch(/Copyright 2020 The Archivo Project Authors/);
    expect(records.find((n) => n.nameID === 14)?.value).toMatch(/scripts\.sil\.org\/OFL|openfontlicense/);
    expect(records.some((n) => n.nameID === 13)).toBe(names(source).some((n) => n.nameID === 13));
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
    const os2 = tables.get('OS/2')!;
    expect(new DataView(os2.buffer, os2.byteOffset, os2.byteLength).getUint16(4)).toBe(700); // usWeightClass (P2-3 review)
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

});

describe('buildFonts: the general paper page preloads its Korean serif with font-display: optional', () => {
  // A late swap of the paper serif rewrapped the Korean title gloss at 375 px (CLS 0.037): preloaded and optional, it
  // is either there for the first render or not used on that view, never swapped in later.
  it('keeps font-display: optional on the rewritten rule and points the preload at the hashed subset', async () => {
    expect(fontFaceCss(['serifKo'], 'optional')).toBe(fontFaceCss(['serifKo']).replace('font-display:swap', 'font-display:optional'));
    expect(fontFaceCss(['sans', 'display'])).not.toContain('optional');
    const dist = mkdtempSync(join(tmpdir(), 'font-subsets-'));
    mkdirSync(join(dist, '_astro'));
    mkdirSync(join(dist, 'data', 'research', 'x'), { recursive: true });
    const sansHead = `<style>${fontFaceCss(['sans'])}</style><link rel="preload" href="${FONT_URL.sans}" as="font" type="font/woff2" crossorigin>`;
    writeFileSync(
      join(dist, 'data', 'research', 'x', 'index.html'),
      `<html lang="ko"><head>${sansHead}<style>${fontFaceCss(['serifKo'], 'optional')}</style><link rel="preload" href="${FONT_URL.serifKo}" as="font" type="font/woff2" crossorigin></head><body><article class="paper"><p>국문 초록</p></article></body></html>`,
    );
    try {
      await buildFonts(dist, { warn: () => {} });
      const page = readFileSync(join(dist, 'data', 'research', 'x', 'index.html'), 'utf8');
      const url = /font-display:optional;src:url\((\/_astro\/sb-serif-kr\.[\w-]+\.woff2)\)/.exec(page)?.[1];
      expect(url).toBeDefined();
      expect(page).toContain(`<link rel="preload" href="${url}" as="font" type="font/woff2" crossorigin>`);
      expect(page).not.toContain('/_fonts/');
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe('buildFonts: the display face (Archivo subset)', () => {
  it('writes the display subset only when a page declares it, and points its preload at the hashed file', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'font-subsets-'));
    mkdirSync(join(dist, '_astro'));
    mkdirSync(join(dist, 'data'), { recursive: true });
    const sansHead = `<style>${fontFaceCss(['sans'])}</style><link rel="preload" href="${FONT_URL.sans}" as="font" type="font/woff2" crossorigin>`;
    writeFileSync(join(dist, 'index.html'), `<html lang="ko"><head>${sansHead}</head><body><p>선택</p></body></html>`);
    try {
      expect((await buildFonts(dist, { warn: () => {} })).some((r: { face: string }) => r.face === 'display')).toBe(false);
      const displayHead = `<style>${fontFaceCss(['sans', 'display'])}</style><link rel="preload" href="${FONT_URL.sans}" as="font" type="font/woff2" crossorigin><link rel="preload" href="${FONT_URL.display}" as="font" type="font/woff2" crossorigin>`;
      writeFileSync(join(dist, 'data', 'index.html'), `<html lang="ko"><head>${displayHead}</head><body><p data-display>DATA ANALYST</p></body></html>`);
      const results = await buildFonts(dist, { warn: () => {} });
      const display = results.filter((r: { face: string }) => r.face === 'display');
      expect(display).toHaveLength(1);
      expect(display[0].url).toMatch(/^\/_astro\/sb-display\.[\w-]+\.woff2$/);
      expect(display[0].pages).toBe(1);
      const page = readFileSync(join(dist, 'data', 'index.html'), 'utf8');
      expect(page).toContain(`src:url(${display[0].url}) format("woff2")`);
      expect(page).toContain(`<link rel="preload" href="${display[0].url}" as="font" type="font/woff2" crossorigin>`);
      expect(page).not.toContain('/_fonts/');
      expect(readFileSync(join(dist, 'index.html'), 'utf8')).not.toContain('sb-display');
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

  it('the sans set also reads the strings of the linked stylesheets (dist/_astro/*.css: the data pages\' shared sheet)', () => {
    const dist = mkdtempSync(join(tmpdir(), 'font-glyphs-'));
    try {
      mkdirSync(join(dist, '_astro'));
      writeFileSync(join(dist, 'index.html'), '<html><head><link rel="stylesheet" href="/_astro/data-site.x.css"></head><body>본문</body></html>');
      writeFileSync(join(dist, '_astro', 'data-site.x.css'), '.a::before{content:"\\2605 똠"}');
      const set: Set<string> = sansCharacters(dist);
      for (const ch of ['본', '★', '똠']) expect(set.has(ch)).toBe(true);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('finds the paper sheet and leaves emoji and invisible characters to other fonts', () => {
    expect(paperSheetHtml('<main><article class="paper" data-x>국문</article><p>밖</p></main>')).toContain('국문');
    expect(paperSheetHtml('<main><article class="paper" data-x>국문</article><p>밖</p></main>')).not.toContain('밖');
    expect(isIgnorable('🔒')).toBe(true);
    expect(isIgnorable('\u200b')).toBe(true);
    expect(isIgnorable('©')).toBe(false);
    expect(isIgnorable('★')).toBe(false);
  });

});
