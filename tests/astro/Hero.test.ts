import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import Hero from '../../src/components/hud/Hero.astro';
import { DOCUMENTS, SITE } from '../../src/config';
import { awardSchema } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { heroCopy, mainMenuCopy, splitTagline } from '../../src/data/copy/hero';
import { figureCopy, overallAuc } from '../../src/data/research/cog-2026';
import { t } from '../../src/i18n/utils';
import { resolveDeep } from '../../src/lib/facts';
import type { StageCharacter } from '../../src/islands/CharacterStage';
import { pageHref } from '../../src/lib/links';
import { isKnownInternalHref } from '../../src/lib/routes';
import { loadFactSource } from '../helpers/fact-source';
import { readSource, renderAstro } from './helpers';

const facts = loadFactSource();

const KO_TAGLINE = '플레이어를 예측하는 데서 멈추지 않고, 이해하는 데이터를 만듭니다.';
const EN_TAGLINE = 'Beyond predicting players: building data that explains them.';
const STATUS = '2027년 2월 석사 졸업 예정 · 게임 데이터 분석가 채용과 박사과정 진학을 함께 준비하고 있습니다.';
/** P1-7a: the class line is the version headline (HomeView passes it; en in upper case). */
const CLASS_LINE = { ko: '게임 데이터 분석가 · 연구자', en: 'GAME DATA ANALYST · RESEARCHER' } as const;

const REMIELLE: StageCharacter = {
  id: 'remielle',
  label: '레미엘 · ZZZ',
  image: {
    src: '/_astro/remielle.webp',
    srcSet: '/_astro/remielle-480.webp 480w, /_astro/remielle-1600.webp 1600w',
    sizes: '(min-width: 1068px) 780px, (min-width: 734px) 58vw, 100vw',
    width: 1600,
    height: 854,
  },
  objectPosition: '58% 14%',
};

/** Hero receives built hrefs (HomeView: pageHref over the base-form copy, P1-11); these are the game ones. */
const built = (href: string, lang: 'ko' | 'en' = 'ko'): string => pageHref(href, { lang, variant: 'game' });

function props(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const copy = resolveDeep(heroCopy.ko, 'ko', loadFactSource());
  const classLine = CLASS_LINE[overrides.lang === 'en' ? 'en' : 'ko'];
  return {
    lang: 'ko',
    chars: [],
    name: '백성은',
    roman: copy.roman,
    label: copy.label,
    slogan: splitTagline(KO_TAGLINE),
    meta: copy.meta,
    status: STATUS,
    ctas: { primary: { ...copy.ctas.primary, href: built(copy.ctas.primary.href) } },
    contact: {
      email: SITE.email,
      github: SITE.githubUrl,
      cvHref: DOCUMENTS['resume-ko'],
      cvLabel: copy.contact.cvLabel,
      cvDocLabel: t('ko', 'nav.cvResume'),
      jobFitHref: built(copy.contact.jobFitHref),
      jobFitLabel: copy.contact.jobFitLabel,
    },
    artifact: { ...copy.artifact, href: built(copy.artifact.href) },
    credit: null,
    swap: copy.swap,
    playerCard: { ...copy.playerCard, classLine },
    ...overrides,
  };
}

/** Text content of the first element with the given class (tags stripped, whitespace collapsed). */
function textOf(html: string, cls: string): string {
  const re = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`);
  return (re.exec(html)?.[2] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Body of one `@media (min-width: Npx) { … }` block of the Hero stylesheet. */
function mediaBlock(source: string, min: number): string {
  return new RegExp(`@media \\(min-width: ${min}px\\) \\{([\\s\\S]*?)\\n  \\}\\n`).exec(source)?.[1] ?? '';
}

describe('Hero.astro', () => {
  it('one h1 with the name, the [ PLAYER PROFILE ] label above it, and the status line as label | value', async () => {
    const html = await renderAstro(Hero, { props: props() });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 id="hero-name"[^>]*>백성은<\/h1>/);
    expect(html).toMatch(/<section class="hero hud-grid hero--no-art" aria-labelledby="hero-name"/);
    expect(html).toMatch(/<p class="hero__label" lang="en"[^>]*>\[ PLAYER PROFILE \]<\/p>/);
    expect(html.indexOf('hero__label')).toBeLessThan(html.indexOf('<h1'));
    // P2-16: label and value are two grid cells, so a wrapped value never runs under "STATUS"
    expect(html).toMatch(
      /<p class="hero__status"[^>]*><span class="hero__status-label" lang="en"[^>]*>STATUS<\/span><span class="hero__status-value"[^>]*>2027년 2월 석사 졸업 예정/,
    );
    expect(html).toContain('플레이어를 예측하는 데서 멈추지 않고,');
    expect(html).toContain('이해하는 데이터를 만듭니다.');
    // F-029: meta is middot nowrap units; visible text stays the same.
    expect(textOf(html, 'hero__meta').replace(/\s+/g, ' ').trim()).toBe(
      '부산대학교 데이터사이언스 석사과정 · 게임 텔레메트리 · 그래프 ML',
    );
    expect(html).toMatch(/hero__meta-part/);
    expect(html).toMatch(/hero__slogan-lead/);
  });

  it('final fix 2 item 11: the English hero has no title card repeating the name above the H1', async () => {
    const en = await renderAstro(Hero, { props: props({ lang: 'en', name: 'Seongeun Baek', roman: resolveDeep(heroCopy.en, 'en', facts).roman }), url: '/en/game/' });
    expect(en).not.toContain('hero__titlecard');
    expect(en.match(/Seongeun Baek/gi)).toHaveLength(1);
  });

  it('P2-16: the title card shows the name only (no bare "2026"), and the role is said once (on the player card)', async () => {
    const html = await renderAstro(Hero, { props: props() });
    expect(textOf(html, 'hero__titlecard')).toBe('SEONGEUN BAEK');
    expect(html).not.toContain('hero__year');
    expect(html.match(/게임 데이터 분석가 · 연구자/g)).toHaveLength(1);
    expect(html).toMatch(/<p class="player-card__class" lang="ko"[^>]*>게임 데이터 분석가 · 연구자<\/p>/);
    for (const lang of ['ko', 'en'] as const) {
      expect(heroCopy[lang].meta, lang).not.toMatch(/analyst|researcher|분석가|연구자/i);
      expect(heroCopy[lang].meta, lang).toMatch(/(게임 텔레메트리 · 그래프 ML|Game telemetry · Graph ML)$/);
    }
  });

  it('P2-16 buttons: research (fill) + a real "CV (PDF) ↓" button (line); job-fit text link first, then e-mail and GitHub chips', async () => {
    const ko = await renderAstro(Hero, { props: props() });
    const ctas = /<div class="hero__ctas"[^>]*>([\s\S]*?)<\/div>/.exec(ko)?.[1] ?? '';
    const buttons = ctas.match(/<a\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatch(/class="btn btn--fill cut" href="\/game\/research\/"/);
    // D-7: the CV button names its document (tooltip + accessible name) and stays a plain link to the PDF with ↓
    expect(buttons[1]).toMatch(/class="btn btn--line cut cut--line hero__cv" href="\/cv\/seongeun-baek-resume-ko\.pdf" title="이력서 \(PDF\)"/);
    expect(ctas).toMatch(/CV \(PDF\) <span aria-hidden="true"[^>]*>↓<\/span><span class="sr-only"[^>]*> — 이력서 \(PDF\)<\/span>/);
    expect(ko).not.toContain('href="/game/projects/"'); // the MAIN MENU right below leads to the projects

    const links = /<ul class="hero__links"[^>]*>([\s\S]*?)<\/ul>/.exec(ko)?.[1] ?? '';
    const hrefs = [...links.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['/game/records/#job-fit', `mailto:${SITE.email}`, 'https://github.com/Lunecid']);
    expect(links).toMatch(/<a class="hero__jobfit" href="\/game\/records\/#job-fit"[^>]*>지원 요건 대응 보기 <span aria-hidden="true"[^>]*>→<\/span><\/a>/);
    expect(links.match(/class="hero__chip"/g)).toHaveLength(2);
    expect(links.match(/class="hero__chip-face cut cut--line"/g)).toHaveLength(2);

    const en = await renderAstro(Hero, {
      props: props({
        lang: 'en',
        ctas: { primary: { label: 'See research', href: '/en/game/research/' } },
        contact: {
          email: SITE.email,
          github: SITE.githubUrl,
          cvHref: DOCUMENTS['resume-en'],
          cvLabel: 'CV (PDF)',
          cvDocLabel: t('en', 'nav.cvResume'),
          jobFitHref: '/en/game/records/#job-fit',
          jobFitLabel: 'See job requirements fit',
        },
        artifact: { ...resolveDeep(heroCopy.en, 'en', facts).artifact, href: '/en/game/research/cog-2026-engagement/' },
      }),
      url: '/en/game/',
    });
    expect(en).toContain('href="/en/game/records/#job-fit"'); // already localized by the caller; not prefixed twice
    expect(en).not.toContain('/en/en/');
    expect(en).toMatch(/href="\/cv\/seongeun-baek-resume-en\.pdf" title="Résumé \(PDF\)"/);
    expect(en).toContain('href="/en/game/research/cog-2026-engagement/"');
  });

  it('D-1 no art: the right slot is the CoG AUC chart in a HUD bracket frame (figureCopy caption/alt), with a paper link', async () => {
    for (const lang of ['ko', 'en'] as const) {
      const html = await renderAstro(Hero, { props: props({ lang, artifact: { ...resolveDeep(heroCopy[lang], lang, facts).artifact, href: built(heroCopy[lang].artifact.href, lang) } }), url: lang === 'en' ? '/en/game/' : '/game/' });
      expect(html).not.toContain('<astro-island');
      expect(html).not.toContain('char-stage');
      expect(html).not.toContain('hero__credit');
      expect(html).toMatch(/<div class="hero__artifact bracket"/);
      expect(html).toMatch(/<p class="hero__artifact-label" lang="en"[^>]*>FIG · CoG 2026 · AUC BY MODEL<\/p>/);
      expect(html).toMatch(/<figure class="chart chart--overall chart--hud"/);
      expect(html).toContain(figureCopy.aucOverall.caption[lang]);
      expect(html).toContain(figureCopy.aucOverall.alt[lang]);
      for (const row of overallAuc) expect(html).toContain(`data-model="${row.id}"`);
      expect(html).toMatch(new RegExp(`<a class="sec-more" href="${lang === 'en' ? '/en' : ''}/game/research/cog-2026-engagement/"[^>]*>${heroCopy[lang].artifact.linkLabel} `));
      // The raw Match-V5 excerpt is not used here, so the page needs no Riot notice.
      expect(html).not.toContain('class="telemetry');
      expect(html).not.toContain('participantFrames');
      // The artifact sits between the copy and the player card (mobile/tablet reading order).
      expect(html.indexOf('hero__artifact')).toBeGreaterThan(html.indexOf('hero__copy'));
      expect(html.indexOf('hero__artifact')).toBeLessThan(html.indexOf('hero__pcard'));
    }
  });

  it('with art: the character stage (and its credit) replaces the artifact', async () => {
    const credit = '캐릭터 이미지 © COGNOSPHERE · 팬 콘텐츠, 공식 제휴 아님 · © miHoYo (Zenless Zone Zero)';
    const staged = await renderAstro(Hero, { props: props({ chars: [REMIELLE], credit }) });
    expect(staged).toMatch(/<section class="hero hud-grid hero--art"/);
    expect(staged).toMatch(/<astro-island[^>]*client="visible"/);
    expect(staged).toContain('class="char-stage char-stage--hero"');
    expect(staged).toContain('data-phase="entering"');
    expect(staged).not.toContain('char-stage__controls'); // swap/replay buttons mount only after hydration (Task 15)
    expect(staged).toContain('dataset.loading'); // load gate runs before hydration
    // final fix 2 item 9: right after the stage (under the art on phones), in pieces that break only between them,
    // "©" glued to its owner
    expect(textOf(staged, 'hero__credit').replace(/\u00a0/g, ' ')).toBe(credit);
    const parts = [...staged.matchAll(/<span class="hero__credit-part"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(parts).toEqual(['캐릭터 이미지 ©\u00a0COGNOSPHERE ·', '팬 콘텐츠, 공식 제휴 아님 ·', '©\u00a0miHoYo (Zenless Zone Zero)']);
    expect(staged.indexOf('hero__credit')).toBeGreaterThan(staged.indexOf('char-stage--hero'));
    expect(staged.indexOf('hero__credit')).toBeLessThan(staged.indexOf('hero__pcard'));
    expect(staged).not.toContain('hero__artifact');
    expect(staged).not.toContain('chart--overall');
  });

  it('player card lists the badges', async () => {
    const html = await renderAstro(Hero, { props: props() });
    expect(html).toMatch(/role="group" aria-label="플레이어 카드"/);
    expect(html.match(/<li class="badge badge--tier"/g)).toHaveLength(2);
    expect(html).toContain('IEEE CoG 2026 ORAL');
    expect(html).toContain('최우수상 ×2');
  });

  it('desktop: min-height 640px and a min(640px, 55%) copy column; the XL steps widen it; tablet splits only with a stage', () => {
    const source = readSource('src/components/hud/Hero.astro');
    expect(mediaBlock(source, 1068)).toMatch(/\.hero\s*\{[^}]*min-height:\s*640px/);
    expect(mediaBlock(source, 1068)).toMatch(/\n {4}\.hero__copy\s*\{[^}]*width:\s*min\(640px, 55%\)/);
    // no art: the same copy width, written against the grid's content box (the inner padding holds the gutters)
    expect(mediaBlock(source, 1068)).toMatch(
      /\.hero--no-art \.hero__inner\s*\{[^}]*grid-template-columns:\s*min\(640px, calc\(\(100% \+ 2 \* var\(--gutter\)\) \* \.55\)\) minmax\(0, 1fr\)/,
    );
    expect(mediaBlock(source, 1600)).toMatch(/\.hero__copy\s*\{[^}]*width:\s*min\(700px, 52%\)/);
    expect(mediaBlock(source, 1800)).toMatch(/\.hero__copy\s*\{[^}]*width:\s*min\(760px, 52%\)/);
    // Tablet only (a range query, so none of it leaks into the desktop flex column): two columns only with a stage.
    const tablet = /@media \(min-width: 734px\) and \(max-width: 1067\.98px\) \{([\s\S]*?)\n {2}\}\n/.exec(source)?.[1] ?? '';
    expect(tablet).toMatch(/\.hero--art \.hero__inner\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, \.9fr\)/);
    expect(tablet).toMatch(/\.hero--art \.hero__titlecard\s*\{[^}]*grid-column:\s*1 \/ -1/);
    expect(source).not.toMatch(/\n {4}\.hero__inner\s*\{[^}]*display:\s*grid/);
    expect(mediaBlock(source, 734)).not.toMatch(/\.hero--art/);
  });

  it('P1-1: at >=1068px the player card sits under the copy (align-self flex-start), not pushed to align-self: end', () => {
    const source = readSource('src/components/hud/Hero.astro');
    const pcardRule = /\n {4}\.hero__pcard\s*\{([^}]*)\}/.exec(mediaBlock(source, 1068))?.[1] ?? '';
    expect(pcardRule, 'no .hero__pcard rule inside the 1068px block').toBeTruthy();
    expect(pcardRule).toMatch(/align-self:\s*flex-start/);
    expect(pcardRule).not.toMatch(/align-self:\s*end\b/);
  });

  it('splitTagline splits ko and en taglines (after ", ", "; " or ": ")', () => {
    expect(splitTagline(KO_TAGLINE)).toEqual(['플레이어를 예측하는 데서 멈추지 않고,', '이해하는 데이터를 만듭니다.']);
    expect(splitTagline(EN_TAGLINE)).toEqual(['Beyond predicting players:', 'building data that explains them.']);
    expect(splitTagline("I don't stop here; I go on.")).toEqual(["I don't stop here;", 'I go on.']);
    expect(splitTagline('No separator here.')).toEqual(['No separator here.', '']);
  });

  it('hero and main-menu copy use Korean-form known routes and ui labels in both languages', () => {
    for (const lang of ['ko', 'en'] as const) {
      const copy = heroCopy[lang];
      const hrefs = [copy.ctas.primary.href, copy.contact.jobFitHref, copy.artifact.href, ...mainMenuCopy[lang].items.map((i) => i.href)];
      for (const href of hrefs) {
        expect(href.startsWith('/en/'), href).toBe(false);
        expect(isKnownInternalHref(href, 'game'), href).toBe(true);
      }
      expect(mainMenuCopy[lang].items.map((i) => i.num)).toEqual(['01', '02', '03', '04']);
      expect(mainMenuCopy[lang].items.map((i) => i.href)).toEqual(['/research/', '/projects/', '/records/', '/player-log/']);
      expect(copy.contact.jobFitLabel).toBe(t(lang, 'action.viewJobFit'));
      expect(copy.contact.cvLabel).toBe('CV (PDF)');
      expect(copy.playerCard.photoAlt).toBe(t(lang, 'card.photoAlt'));
      // final fix 2 item 11: the romanized title card only on Korean pages (on /en/ it repeated the H1)
      expect(copy.roman).toBe(lang === 'ko' ? 'SEONGEUN BAEK' : null);
      expect(copy.label).toBe('[ PLAYER PROFILE ]');
      expect(copy.contact.jobFitHref).toBe('/records/#job-fit');
    }
    expect(resolveDeep(heroCopy.ko, 'ko', facts).playerCard.badges).toEqual(['IEEE CoG 2026 ORAL', '최우수상 ×2']);
    // P2-16: the badge never truncates the award name
    expect(resolveDeep(heroCopy.en, 'en', facts).playerCard.badges).toEqual(['IEEE CoG 2026 ORAL', 'Top Excellence Award ×2']);
  });

  it('final review fix 1 item 15: the MAIN MENU projects caption matches the award records', () => {
    const awards = parseYamlList(readFileSync(join(process.cwd(), 'src/data/awards.yaml'), 'utf8')).map((a) => awardSchema.parse(a));
    const top = awards.filter((a) => a.name.ko.startsWith('최우수상'));
    expect(top).toHaveLength(2);
    // One of the two is a bootcamp project evaluation (Multicampus), not a competition: no "경진대회 최우수상 2회".
    expect(top.some((a) => !/대회/.test(a.contest.ko))).toBe(true);
    const ko = resolveDeep(mainMenuCopy.ko, 'ko', facts).items.find((i) => i.href === '/projects/')?.caption ?? '';
    const en = resolveDeep(mainMenuCopy.en, 'en', facts).items.find((i) => i.href === '/projects/')?.caption ?? '';
    expect(ko).not.toMatch(/대회/);
    expect(ko).toContain(`최우수상 ×${top.length}`);
    expect(en).toContain(`Top Excellence Award ×${top.length}`);
    // Only one of the projects is a web service (KickKick Park).
    expect(en).not.toMatch(/web services/);
    expect(en).toMatch(/web service\b/);
  });
});
