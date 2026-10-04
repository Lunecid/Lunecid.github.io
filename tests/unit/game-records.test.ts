import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageMetadata } from 'astro';
import { describe, expect, it, vi } from 'vitest';

const { getImage } = vi.hoisted(() => ({
  getImage: vi.fn(async (opts: { src: ImageMetadata; width: number; format: string; quality?: number }) => {
    const base = (opts.src.src.split('/').pop() ?? '').replace(/\.\w+$/, '');
    return {
      src: `/_astro/${base}.${opts.width}w.${opts.format}`,
      attributes: { width: opts.width, height: Math.round((opts.width * opts.src.height) / opts.src.width) },
    };
  }),
}));
vi.mock('astro:assets', () => ({ getImage }));

import { favoriteGameSchema, gameRecordSchema } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { GAME_RECORD_NOTICES, recordViews } from '../../src/lib/game-records';
import { FULL_SIZES, THUMB_SIZES, createEvidenceLookup } from '../../src/lib/game-records.server';
import { containsTrademark } from '../../src/lib/seo';

const ROOT = process.cwd();
const EVIDENCE_DIR = join(ROOT, 'src/assets/game-records');
const LANGS = ['ko', 'en'] as const;
const raw = parseYamlList(readFileSync(join(ROOT, 'src/data/game-records.yaml'), 'utf8'), 'records');
const records = raw.map((r) => gameRecordSchema.parse(r));
const games = parseYamlList(readFileSync(join(ROOT, 'src/data/favorites.yaml'), 'utf8'), 'games').map((g) => favoriteGameSchema.parse(g));

/** sha256 of the owner's three screenshots as received on 2026-10-04 (here, so the test never reads the notes). */
const OWNER_SHA256: Readonly<Record<string, string>> = {
  'gm-2026.webp': 'ec51c6e5a9694dea8ba7614a9247da486b30ac1bce50519fdf91610c4a74ade7',
  'gm-2025.png': '8ad190eee38bff411d1fe0b5fba93a2b180949fafe1d73ae6a582533dbe12218',
  'rank-2018.webp': 'c7e09cd6768d9b291dc86405b6206563be9a7af5d5a4d1b0f0d8052a24abcfe1',
};

/** Test templates (the page's own words arrive with the section); the rank one uses all three placeholders. */
const TEMPLATES = {
  ko: { tier: '{tier} · {queue}', rank: '{queue} {tier} · 최고 {rank}위' },
  en: { tier: '{tier} · {queue}', rank: '{queue} {tier} · best rank {rank}' },
};

describe('game records (src/data/game-records.yaml)', () => {
  it("three records in the owner's order with the owner's dates, accounts and sources", () => {
    expect(records.map((r) => r.id)).toEqual(['gm-2026', 'gm-2025', 'rank-2018']);
    const [main, alt, legend] = records;
    expect(main).toMatchObject({ game: 'tft', kind: 'tier', tier: { ko: '그랜드마스터', en: 'Grandmaster' }, account: '루네시드#Lune', alt: false, date: '2026-05-15', dateSource: 'capture' });
    expect(alt).toMatchObject({ game: 'tft', kind: 'tier', tier: { ko: '그랜드마스터', en: 'Grandmaster' }, account: '하트눈#KR1', alt: true, date: '2025-01-02', dateSource: 'saved' });
    // the best rank was held in Legend: the pre-2020 ladder showed a number only there (owner, 2026-10-04)
    expect(legend).toMatchObject({ game: 'hearthstone', kind: 'rank', rank: 293, tier: { ko: '전설', en: 'Legend' }, account: 'SEK#31221', alt: false, date: '2018-12-11', dateSource: 'saved' });
  });

  it('ids, image names and alt texts name no trademark in ids or file names; every alt names what the image shows', () => {
    for (const r of records) {
      expect(containsTrademark(r.id), r.id).toBe(false);
      expect(containsTrademark(r.image), r.image).toBe(false);
    }
    const [main, alt, legend] = records;
    for (const lang of LANGS) {
      expect(main.imageAlt[lang]).toContain('루네시드#Lune');
      expect(alt.imageAlt[lang]).toContain('하트눈#KR1');
      expect(legend.imageAlt[lang]).toContain('293');
      // the Hearthstone screenshot shows no BattleTag, so its alt does not claim one
      expect(legend.imageAlt[lang]).not.toContain('SEK#31221');
    }
  });

  it("the evidence files are the owner's files byte for byte", () => {
    expect(readdirSync(EVIDENCE_DIR).sort()).toEqual(Object.keys(OWNER_SHA256).sort());
    expect(records.map((r) => r.image).sort()).toEqual(Object.keys(OWNER_SHA256).sort());
    for (const [name, sha256] of Object.entries(OWNER_SHA256)) {
      expect(createHash('sha256').update(readFileSync(join(EVIDENCE_DIR, name))).digest('hex'), name).toBe(sha256);
    }
  });

  it('recordViews: game names from favorites.yaml, titles from the templates, dates in the site format, ko and en', () => {
    const ko = recordViews(records, games, 'ko', TEMPLATES.ko);
    expect(ko.map((v) => v.id)).toEqual(['gm-2026', 'gm-2025', 'rank-2018']);
    expect(ko.map((v) => v.gameName)).toEqual(['전략적 팀 전투', '전략적 팀 전투', '하스스톤']);
    expect(ko.map((v) => v.title)).toEqual(['그랜드마스터 · 랭크 게임', '그랜드마스터 · 랭크 게임', '정규전 전설 · 최고 293위']);
    expect(ko.map((v) => v.dateText)).toEqual(['2026.05.15', '2025.01.02', '2018.12.11']);
    expect(ko.map((v) => v.alt)).toEqual([false, true, false]);
    expect(ko[2]).toEqual({
      id: 'rank-2018', game: 'hearthstone', gameName: '하스스톤', title: '정규전 전설 · 최고 293위', account: 'SEK#31221', alt: false,
      dateIso: '2018-12-11', dateText: '2018.12.11', dateSource: 'saved', notices: ['blizzard'],
    });
    const en = recordViews(records, games, 'en', TEMPLATES.en);
    expect(en.map((v) => v.gameName)).toEqual(['Teamfight Tactics', 'Teamfight Tactics', 'Hearthstone']);
    expect(en.map((v) => v.title)).toEqual(['Grandmaster · Ranked', 'Grandmaster · Ranked', 'Standard Legend · best rank 293']);
    expect(en.map((v) => v.dateText)).toEqual(['May 15, 2026', 'Jan 2, 2025', 'Dec 11, 2018']);
    expect(en.map((v) => [v.account, v.dateIso, v.dateSource])).toEqual([
      ['루네시드#Lune', '2026-05-15', 'capture'],
      ['하트눈#KR1', '2025-01-02', 'saved'],
      ['SEK#31221', '2018-12-11', 'saved'],
    ]);
  });

  it('recordViews fails the build on a placeholder without a value and on a game missing from favorites.yaml', () => {
    const untiered = gameRecordSchema.parse({ ...raw[2], tier: undefined });
    expect(recordViews([untiered], games, 'en', { tier: '', rank: '{queue} · best rank {rank}' })[0].title).toBe('Standard · best rank 293');
    expect(() => recordViews([untiered], games, 'ko', TEMPLATES.ko)).toThrow(/rank-2018.*\{tier\}/);
    expect(() => recordViews(records, games, 'en', { ...TEMPLATES.en, tier: '{tier} · {rank}' })).toThrow(/gm-2026.*\{rank\}/);
    expect(() => recordViews(records, games, 'en', { ...TEMPLATES.en, tier: '{tier} · {season}' })).toThrow(/\{season\}/);
    expect(() => recordViews(records, games.filter((g) => g.id !== 'hearthstone'), 'ko', TEMPLATES.ko)).toThrow(/rank-2018.*hearthstone/);
  });

  it('notices: TFT records carry riot-assets, the Hearthstone record carries blizzard', () => {
    expect(GAME_RECORD_NOTICES).toEqual(['riot-assets', 'blizzard']);
    expect(Object.fromEntries(records.map((r) => [r.id, r.notices]))).toEqual({ 'gm-2026': ['riot-assets'], 'gm-2025': ['riot-assets'], 'rank-2018': ['blizzard'] });
    expect(records.filter((r) => r.game === 'tft').map((r) => r.id)).toEqual(['gm-2026', 'gm-2025']);
    for (const lang of LANGS) {
      expect(recordViews(records, games, lang, TEMPLATES[lang]).map((v) => v.notices)).toEqual([['riot-assets'], ['riot-assets'], ['blizzard']]);
    }
  });
});

describe('evidence images (src/lib/game-records.server.ts)', () => {
  const meta = (name: string, width: number, height: number): ImageMetadata =>
    ({ src: `/src/assets/game-records/${name}`, width, height, format: name.endsWith('.png') ? 'png' : 'webp' }) as ImageMetadata;
  // the owner's files' sizes: 1909×1074, 1268×706, 964×609
  const lookup = createEvidenceLookup({
    '../assets/game-records/gm-2026.webp': meta('gm-2026.webp', 1909, 1074),
    '../assets/game-records/gm-2025.png': meta('gm-2025.png', 1268, 706),
    '../assets/game-records/rank-2018.webp': meta('rank-2018.webp', 964, 609),
  });

  it('createEvidenceLookup: thumbnails at 240w and 480w for a 240px slot; full 640/960/1280w, never upscaled, the widest is the no-JS href', async () => {
    const [main, alt, legend] = records;
    getImage.mockClear();
    const wide = await lookup.build(main);
    expect(wide.thumb).toEqual({
      src: '/_astro/gm-2026.240w.webp', srcSet: '/_astro/gm-2026.240w.webp 240w, /_astro/gm-2026.480w.webp 480w', sizes: '240px', width: 240, height: 135,
    });
    expect(THUMB_SIZES).toBe('240px');
    expect(wide.full).toEqual({
      src: '/_astro/gm-2026.1280w.webp',
      srcSet: '/_astro/gm-2026.640w.webp 640w, /_astro/gm-2026.960w.webp 960w, /_astro/gm-2026.1280w.webp 1280w',
      sizes: FULL_SIZES,
      width: 1280,
      height: 720,
    });
    // a source between two steps keeps its own width as the top step, so the viewer never stretches the 960w copy
    const between = await lookup.build(alt);
    expect(between.full.srcSet).toBe('/_astro/gm-2025.640w.webp 640w, /_astro/gm-2025.960w.webp 960w, /_astro/gm-2025.1268w.webp 1268w');
    expect(between.full).toMatchObject({ src: '/_astro/gm-2025.1268w.webp', width: 1268, height: 706 });
    expect(between.thumb.src).toBe('/_astro/gm-2025.240w.webp');
    expect((await lookup.build(legend)).full).toMatchObject({ src: '/_astro/rank-2018.964w.webp', width: 964, height: 609 });
    expect(getImage).toHaveBeenCalled();
    for (const [opts] of getImage.mock.calls) {
      expect(opts.format).toBe('webp');
      expect(opts.width).toBeLessThanOrEqual(opts.src.width);
    }
  });

  it('createEvidenceLookup fails the build when a record names a file that is not there', async () => {
    const [main] = records;
    await expect(createEvidenceLookup({}).build(main)).rejects.toThrow(/gm-2026.*gm-2026\.webp/);
  });
});
