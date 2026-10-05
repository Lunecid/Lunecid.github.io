import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import GameAchievements from '../../src/components/player-log/GameAchievements.astro';
import { favoriteGameSchema, gameRecordSchema } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { ui, type Lang } from '../../src/i18n/ui';
import { recordViews } from '../../src/lib/game-records';
import { containsTrademark } from '../../src/lib/seo';
import { readSource, renderAstro } from './helpers';

const ROOT = process.cwd();
const records = parseYamlList(readFileSync(join(ROOT, 'src/data/game-records.yaml'), 'utf8'), 'records').map((r) => gameRecordSchema.parse(r));
const games = parseYamlList(readFileSync(join(ROOT, 'src/data/favorites.yaml'), 'utf8'), 'games').map((g) => favoriteGameSchema.parse(g));

/** The records as PlayerLogView passes them: the views plus evidence images shaped like createEvidenceLookup's. */
function props(lang: Lang) {
  const views = recordViews(records, games, lang, { tier: ui[lang]['gameRecords.tier'], rank: ui[lang]['gameRecords.rank'] });
  return {
    lang,
    records: views.map((view, i) => {
      const stem = records[i].image.replace(/\.\w+$/, '');
      return {
        ...view,
        evidence: {
          thumb: { src: `/_astro/${stem}.240w.webp`, srcSet: `/_astro/${stem}.240w.webp 240w, /_astro/${stem}.480w.webp 480w`, sizes: '240px', width: 240, height: 135 },
          full: { src: `/_astro/${stem}.1280w.webp`, srcSet: `/_astro/${stem}.640w.webp 640w, /_astro/${stem}.1280w.webp 1280w`, sizes: '92vw', width: 1280, height: 720 },
        },
      };
    }),
  };
}
const render = (lang: Lang) => renderAstro(GameAchievements, { props: props(lang) });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const triggers = (html: string) => html.match(/<a\b[^>]*data-viewer="[^"]*"[^>]*>/g) ?? [];
const attr = (tag: string | undefined, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag ?? '')?.[1];

describe('GameAchievements (PL-4: 내 게임 업적)', () => {
  it('PL-4: always renders section#game-achievements with the three records in data order (no account feed needed)', async () => {
    const html = await render('ko');
    expect(html).toMatch(/<section[^>]*id="game-achievements"[^>]*aria-labelledby="game-ach-title"/);
    expect(html).toMatch(/<h2[^>]*id="game-ach-title"[^>]*>내 게임 업적<\/h2>/);
    expect(html).toMatch(/<ol[^>]*class="game-ach__list[^"]*"[^>]*role="list"/);
    // two showcases: the TFT ceremony card holds both TFT records, the plaque the Hearthstone one
    expect([...html.matchAll(/data-records="([^"]*)"/g)].map((m) => m[1])).toEqual(['gm-2026 gm-2025', 'rank-2018']);
    expect(triggers(html).map((tag) => attr(tag, 'data-viewer-id'))).toEqual(['gm-2026', 'gm-2025', 'rank-2018']);
    expect([...html.matchAll(/class="plate"[^>]*data-record="([^"]*)"/g)].map((m) => m[1])).toEqual(['gm-2026', 'gm-2025']);
  });

  it('PL-4: each record shows its game, title, account (alt marked) and labelled date; one gold 달성 badge', async () => {
    const html = await render('ko');
    const body = text(html);
    expect(html).toMatch(/<h3[^>]*class="gm__title"[^>]*>그랜드마스터 달성<span class="gm__badge"[^>]*>달성<\/span><\/h3>/);
    expect(body).toContain('전략적 팀 전투 · 랭크 게임');
    expect(body).toContain('본계정 · 스크린샷 날짜 2026.05.15');
    expect(body).toContain('부계정 · 스크린샷 저장일 2025.01.02');
    expect(html).toMatch(/<h3[^>]*class="hsq__ribbon"[^>]*><span class="sr-only"[^>]*>하스스톤 <\/span>정규전 전설 · 최고 293위<\/h3>/);
    expect(body).toContain('SEK#31221 · 스크린샷 저장일 2018.12.11');
    expect(html).toMatch(/<span class="hsq__acct"[^>]*lang="en"[^>]*>SEK#31221<\/span>/);
    // Hangul account names carry no lang="en"
    expect(html).toMatch(/<span class="plate__name"(?![^>]*lang=)[^>]*>루네시드<span[^>]*>#Lune<\/span>/);
    expect(html.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/g)).toHaveLength(3);
    // the drawn medal carries the record's rank on its light face; the drawings are decorative
    expect(html).toMatch(/<text class="hsq__num"[^>]*>293<\/text>/);
    expect(html.match(/<svg class="(gm__emblem|hsq__medal)"[^>]*aria-hidden="true"/g)).toHaveLength(2);
  });

  it('PL-4: the trigger: data-viewer="game-records", data-viewer-id = the record id, no data-cert-id; no-JS href = a /_astro/ WebP', async () => {
    const html = await render('ko');
    const tags = triggers(html);
    expect(tags).toHaveLength(3);
    for (const tag of tags) {
      expect(attr(tag, 'data-viewer')).toBe('game-records');
      expect(attr(tag, 'href')).toMatch(/^\/_astro\/[a-z0-9-]+\.1280w\.webp$/);
      expect(tag).not.toMatch(/data-cert-id/);
      expect(attr(tag, 'aria-haspopup')).toBe('dialog');
      expect(attr(tag, 'data-viewer-label')).toBe('기록 증빙');
      expect(Number(attr(tag, 'data-viewer-w'))).toBeGreaterThan(0);
      expect(Number(attr(tag, 'data-viewer-h'))).toBeGreaterThan(0);
      expect(attr(tag, 'data-viewer-srcset')).toMatch(/ 640w, /);
      expect(attr(tag, 'data-viewer-alt')).toBeTruthy();
    }
    expect(attr(tags[0], 'data-viewer-caption')).toBe('그랜드마스터 달성 · 루네시드#Lune · 2026.05.15');
    expect(attr(tags[2], 'data-viewer-caption')).toBe('정규전 전설 · 최고 293위 · SEK#31221 · 2018.12.11');
    // only the thumbnails are links: no other anchor or button in the section
    expect(html.match(/<a\b/g)).toHaveLength(3);
    expect(html).not.toMatch(/<button\b/);
  });

  it('PL-4: thumbnails are lazy with width and height, inside the trigger, alt = what the screenshot shows', async () => {
    const html = await render('ko');
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(3);
    imgs.forEach((img, i) => {
      expect(attr(img, 'loading')).toBe('lazy');
      expect(attr(img, 'decoding')).toBe('async');
      expect(Number(attr(img, 'width'))).toBeGreaterThan(0);
      expect(Number(attr(img, 'height'))).toBeGreaterThan(0);
      expect(attr(img, 'alt')).toBe(records[i].imageAlt.ko.replace(/'/g, '&#39;'));
    });
    // each thumbnail sits inside its own trigger, inside a <figure> (the viewer's FLIP origin)
    expect(html.match(/<figure class="ev"[^>]*>\s*<a\b[^>]*data-viewer="game-records"[^>]*>\s*<span class="ev__thumb"[^>]*>\s*<img\b/g)).toHaveLength(3);
  });

  it('PL-4: no trademark in ids, data-viewer-ids or image URLs; game names only as text', async () => {
    for (const lang of ['ko', 'en'] as const) {
      const html = await render(lang);
      const names = [
        ...[...html.matchAll(/\s(?:id|data-viewer-id|data-records|data-record|class)="([^"]*)"/g)].map((m) => m[1]),
        ...[...html.matchAll(/\s(?:href|src|srcset|data-viewer-srcset)="([^"]*)"/g)].map((m) => m[1]),
      ];
      expect(names.length).toBeGreaterThan(20);
      for (const name of names) expect(containsTrademark(name), name).toBe(false);
      expect(text(html)).toContain(lang === 'ko' ? '전략적 팀 전투' : 'Teamfight Tactics');
    }
  });

  it('PL-4: en renders English titles and labels, the same accounts', async () => {
    const html = await render('en');
    const body = text(html);
    expect(html).toMatch(/<h2[^>]*id="game-ach-title"[^>]*>My game achievements<\/h2>/);
    expect(html).toMatch(/class="gm__title"[^>]*>Reached Grandmaster<span class="gm__badge"[^>]*>Achieved<\/span>/);
    expect(body).toContain('Teamfight Tactics · Ranked');
    expect(body).toContain('main account · Screenshot date May 15, 2026');
    expect(body).toContain('alt account · Screenshot saved Jan 2, 2025');
    expect(body).toContain('Standard Legend · best rank 293');
    expect(body).toContain('SEK#31221 · Screenshot saved Dec 11, 2018');
    for (const account of ['루네시드', '#Lune', '하트눈', '#KR1']) expect(body).toContain(account);
    expect(body.match(/View screenshot/g)).toHaveLength(3);
    expect(body).not.toMatch(/스크린샷|달성|본계정|부계정|정규전|전설|그랜드마스터/);
    // the Korean tier line shows only on the Korean page
    expect(html).not.toMatch(/gm__tier-ko/);
    expect(await render('ko')).toMatch(/<span class="gm__tier-ko"[^>]*>그랜드마스터<\/span>/);
  });

  it('PL-4: colours are tokens only; --gold only on the badge; motion only transform/opacity, once, with both reduce paths', () => {
    const src = readSource('src/components/player-log/GameAchievements.astro');
    const css = src.slice(src.indexOf('<style>'));
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    expect(css.match(/var\(--gold\)/g)).toHaveLength(1);
    expect(css).toMatch(/\.gm__badge \{[^}]*background: var\(--gold\)/);
    expect(css).toMatch(/animation: game-ach-glint var\(--dur-glint\) ease-in-out 1;/);
    expect(css).not.toMatch(/infinite/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.glint \{ animation: none !important; \}/);
    expect(css).toMatch(/:root\[data-motion="reduce"\] \.glint \{ animation: none !important; \}/);
    const tokens = readSource('src/styles/tokens.css');
    expect(tokens).toMatch(/--dur-glint: \.6s;/);
    expect(tokens).toMatch(/game-material colours[\s\S]*not the achievement gold/);
  });
});
