import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// src/lib/characters.ts imports island-image.server → astro:assets; this test uses only its glob-based lookup.
vi.mock('astro:assets', () => ({ getImage: vi.fn() }));

import { ACCOUNT_ADMIN, GOATCOUNTER, RIOT_NOTICE_ON_PAGES, SITE } from '../../src/config';
import { legalSchema } from '../../src/content/schemas';
import { ACCOUNT_MAX_AGE_DAYS } from '../../src/lib/account-config';
import { ui } from '../../src/i18n/ui';
import { characters } from '../../src/lib/characters';
import { goatcounterSelfHosted, soundAvailability } from '../../src/lib/public-assets';
import { CHARACTER_IDS, type CharacterId } from '../../src/types';
import { readBody, readFrontmatter } from './helpers';

type L = 'ko' | 'en';
type Doc = 'privacy' | 'credits';
const root = process.cwd();
const LANGS: L[] = ['ko', 'en'];
const DOCS: Doc[] = ['privacy', 'credits'];
const file = (lang: L, doc: Doc) => join(root, 'src/content/legal', lang, `${doc}.md`);
const raw = (lang: L, doc: Doc) => readBody(file(lang, doc)).replace(/\r\n/g, '\n');
/** Body with Markdown links reduced to their text ("[GoatCounter](url)" → "GoatCounter"). */
const body = (lang: L, doc: Doc) => raw(lang, doc).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

// The implementation the text must describe (contract §5.17).
const sound = soundAvailability();
const selfHosted = goatcounterSelfHosted();
const collecting = GOATCOUNTER.code !== null;
const art = characters.available(CHARACTER_IDS); // the same lookup the pages use (Task 15)
const has = (id: CharacterId) => art.includes(id);
/** Ghost watermark asset (src/assets/ghost/miku-v6.webp); credit text follows file presence. */
const hasGhostMiku = existsSync(join(root, 'src/assets/ghost/miku-v6.webp'));
const GHOST_CREDIT = {
  ko: '이 사이트는 하츠네 미쿠의 변형물(흑백·투명도 처리)을 포함합니다. <span lang="en">Hatsune Miku, © Crypton Future Media, Inc. 2007, licensed under a CC BY-NC: https://creativecommons.org/licenses/by-nc/3.0/</span>',
  en: 'This site features an adaptation of Hatsune Miku, © Crypton Future Media, Inc. 2007, licensed under a CC BY-NC: https://creativecommons.org/licenses/by-nc/3.0/',
} as const;

/** Riot row status while the notice is not on the pages: outbound links, no API, assets credited in the paragraph above. */
const RIOT_STATUS = {
  ko: "외부 링크만 사용(API 미사용, 에셋은 위 '라이엇 게임즈 에셋')",
  en: 'Outbound links only (no API; assets: see Riot Games assets)',
} as const;

function listEn(items: string[]): string {
  return items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * First bullet of "외부 서비스와 링크" / "External services and links". While GOATCOUNTER.code is null nothing is
 * collected, so the visitor-count script clause is conditional ("통계를 켜면…", P2-33).
 */
function assetSentence(lang: L): string {
  if (lang === 'ko') {
    const items = ['글꼴', ...(sound.bgm ? ['배경음악'] : []), ...(sound.sfx ? ['효과음'] : []), '이미지'];
    if (!collecting) {
      const script = selfHosted
        ? '방문 통계 스크립트도 이 사이트에서 직접 제공하고'
        : '방문 통계 스크립트(count.js)는 GoatCounter 서버(gc.zgo.at)에서 불러오고';
      return `${items.join(', ')}는 모두 이 사이트에서 직접 제공합니다. 통계를 켜면 ${script}, 방문 기록은 GoatCounter 서버로만 전송됩니다.`;
    }
    return selfHosted
      ? `${[...items, '방문 통계 스크립트'].join(', ')}는 모두 이 사이트에서 직접 제공합니다. 방문 기록은 GoatCounter 서버로만 전송됩니다.`
      : `${items.join(', ')}는 모두 이 사이트에서 직접 제공하고, 방문 통계 스크립트(count.js)는 GoatCounter 서버(gc.zgo.at)에서 불러옵니다. 방문 기록은 GoatCounter 서버로만 전송됩니다.`;
  }
  const items = ['Fonts', ...(sound.bgm ? ['music'] : []), ...(sound.sfx ? ['sound effects'] : []), 'images'];
  if (!collecting) {
    const script = selfHosted
      ? 'the visitor-count script is served from this site too'
      : "the visitor-count script (count.js) is loaded from GoatCounter's server (gc.zgo.at)";
    return `${listEn(items)} are all served from this site. When statistics are turned on, ${script}, and visit data is sent only to GoatCounter's servers.`;
  }
  return selfHosted
    ? `${listEn([...items, 'the visitor-count script'])} are all served from this site. Visit data is sent only to GoatCounter's servers.`
    : `${listEn(items)} are all served from this site, and the visitor-count script (count.js) is loaded from GoatCounter's server (gc.zgo.at). Visit data is sent only to GoatCounter's servers.`;
}

/** First paragraph of the character-art section, naming only the characters whose PNG exists. */
function characterSentence(lang: L): string | null {
  if (art.length === 0) return null;
  const genshin = [has('eula') ? (lang === 'ko' ? '유라' : 'Eula') : null, has('mona') ? (lang === 'ko' ? '모나' : 'Mona') : null].filter(
    (x): x is string => x !== null,
  );
  if (lang === 'ko') {
    const parts = [has('remielle') ? '레미엘(젠레스 존 제로)' : null, genshin.length > 0 ? `${genshin.join('·')}(원신)` : null].filter(
      (x): x is string => x !== null,
    );
    return `${parts.join(', ')}의 공식 일러스트는 HoYoverse 공식 홈페이지에 공개된 원본을 비상업적 개인 용도로 이 사이트에 직접 올려 쓰고 있습니다. 이미지의 권리는 권리자에게 있습니다.`;
  }
  const parts = [has('remielle') ? 'Remielle (Zenless Zone Zero)' : null, genshin.length > 0 ? `${genshin.join(' and ')} (Genshin Impact)` : null].filter(
    (x): x is string => x !== null,
  );
  return `The official illustrations of ${parts.join(' and ')} are the originals published on HoYoverse's official websites. They are hosted on this site for non-commercial personal use. All rights to the images belong to their owners.`;
}

/** First sentence of the credits page: names music only with the BGM file, sound effects only when they are the only audio. */
function creditsIntro(lang: L): string {
  const audio = sound.bgm ? (lang === 'ko' ? ['음악'] : ['music']) : sound.sfx ? (lang === 'ko' ? ['효과음'] : ['sound effects']) : [];
  if (lang === 'ko') return `이 사이트에 쓴 ${['이미지', '데이터', ...audio, '글꼴'].join(', ')}의 출처와 권리 고지입니다.`;
  return `Sources and rights notices for the ${listEn(['images', 'data', ...audio, 'fonts'])} used on this site.`;
}

describe('legal content', () => {
  it('four files validate with matching lang folders', () => {
    for (const lang of LANGS) {
      for (const doc of DOCS) {
        const data = legalSchema.parse(readFrontmatter(file(lang, doc)));
        expect(data.lang, `${lang}/${doc}`).toBe(lang);
      }
    }
    expect(legalSchema.parse(readFrontmatter(file('ko', 'privacy'))).title).toBe('개인정보 처리방침');
    expect(legalSchema.parse(readFrontmatter(file('en', 'privacy'))).title).toBe('Privacy Policy');
    expect(legalSchema.parse(readFrontmatter(file('ko', 'credits'))).title).toBe('출처·고지');
    expect(legalSchema.parse(readFrontmatter(file('en', 'credits'))).title).toBe('Credits');
  });

  it('ko and en have the same H2 count', () => {
    for (const doc of DOCS) {
      const count = (lang: L) => (raw(lang, doc).match(/^## /gm) ?? []).length;
      expect(count('ko'), doc).toBe(count('en'));
      expect(count('ko'), doc).toBeGreaterThanOrEqual(7);
    }
  });

  it('credits carry the COGNOSPHERE and ZZZ notices verbatim when character art exists', () => {
    for (const lang of LANGS) {
      const text = raw(lang, 'credits');
      const sentence = characterSentence(lang);
      if (sentence === null) {
        expect(text).toContain(lang === 'ko' ? '이 사이트는 현재 게임 캐릭터 이미지를 쓰지 않습니다.' : 'This site currently shows no game character art.');
        expect(text).not.toContain('COGNOSPHERE');
        expect(text).not.toContain('miHoYo');
        continue;
      }
      expect(body(lang, 'credits')).toContain(sentence);
      expect(text).toContain(`> ${ui.en['notice.cognosphere']}`);
      expect(text).toContain('https://www.hoyolab.com/article/143107');
      if (has('remielle')) {
        expect(text).toContain(`> ${ui.en['notice.zzzCopyright']}`);
        expect(text).toContain(`> ${ui.en['notice.zzzLegalStatement']}`);
        expect(text).toContain('https://www.hoyolab.com/article/30075725');
      } else {
        expect(text).not.toContain('miHoYo');
        expect(text).not.toContain('30075725');
      }
    }
  });

  it('credits name the Hatsune Miku ghost adaptation only when the asset exists', () => {
    for (const lang of LANGS) {
      const text = raw(lang, 'credits');
      if (hasGhostMiku) {
        expect(text).toContain(GHOST_CREDIT[lang]);
      } else {
        expect(text).not.toContain('Hatsune Miku');
        expect(text).not.toContain('하츠네 미쿠');
        expect(text).not.toContain('Crypton Future Media');
      }
    }
  });

  it('credits Riot row matches RIOT_NOTICE_ON_PAGES (preflight Q19)', () => {
    const on = RIOT_NOTICE_ON_PAGES;
    const ko = raw('ko', 'credits').split('\n').find((l) => l.startsWith('| 라이엇 게임즈 |'));
    const en = raw('en', 'credits').split('\n').find((l) => l.startsWith('| Riot Games |'));
    // The off-page status names the card assets (the cards use Riot assets, so "no assets" no longer holds).
    expect(ko).toBe(`| 라이엇 게임즈 | <span lang="en">${ui.ko['notice.riot']}</span> | ${on ? 'CoG 논문 페이지에 표시' : RIOT_STATUS.ko} |`);
    expect(en).toBe(`| Riot Games | ${ui.en['notice.riot']} | ${on ? 'Shown on the CoG paper page' : RIOT_STATUS.en} |`);
    // The research-data paragraph always names the Riot Games API source.
    expect(raw('ko', 'credits')).toContain('Riot Games API</span>로 모은 공개 경기 데이터');
    expect(raw('en', 'credits')).toContain('public match data collected through the Riot Games API');
  });

  it('credits Valve row starts with "Powered by Steam." (spec §8, P2-33)', () => {
    const ko = raw('ko', 'credits').split('\n').find((l) => l.startsWith('| Valve(Steam) |'));
    const en = raw('en', 'credits').split('\n').find((l) => l.startsWith('| Valve (Steam) |'));
    expect(ko).toMatch(/^\| Valve\(Steam\) \| <span lang="en">Powered by Steam\.<\/span>/);
    expect(en).toMatch(/^\| Valve \(Steam\) \| Powered by Steam\. /);
  });

  it('DS-1: credits list Archivo with its OFL licence and the SB Display subset sentence (ko, en)', () => {
    const row = (lang: L) => raw(lang, 'credits').split('\n').find((l) => l.startsWith('| [Archivo](https://github.com/Omnibus-Type/Archivo) |')) ?? '';
    expect(row('ko')).toBe('| [Archivo](https://github.com/Omnibus-Type/Archivo) | <span lang="en">The Archivo Project Authors (Omnibus-Type)</span> | <span lang="en">SIL Open Font License 1.1</span> |');
    expect(row('en')).toBe('| [Archivo](https://github.com/Omnibus-Type/Archivo) | The Archivo Project Authors (Omnibus-Type) | SIL Open Font License 1.1 |');
    expect(raw('ko', 'credits')).toContain('“SB Display”는 이 사이트를 위해 Archivo(<span lang="en">SIL Open Font License 1.1</span>)에서 라틴 문자와 숫자만 추려 만든 서브셋이며, 원본의 저작권·라이선스 기록은 글꼴 파일 안에 그대로 두었습니다.');
    expect(raw('en', 'credits')).toContain('“SB Display”, the face of the general version\'s large English titles and numbers, is a subset of Archivo (SIL Open Font License 1.1) made for this site with Latin letters and numbers only; the original copyright and license records stay inside the font file.');
    // MO-29 (named): Noto Serif KR now serves the paper page only (DS-1: data pages left it; MO-23: the chooser did)
    expect(raw('ko', 'credits')).toContain('논문 페이지의 한글에 쓰는 Noto Serif KR');
    expect(raw('ko', 'credits')).not.toContain('선택 화면 제목의 한글');
    expect(raw('en', 'credits')).toContain('Noto Serif KR, used for the Korean text of the paper page, is subset');
    expect(raw('en', 'credits')).not.toContain('the page where you choose a portfolio');
    expect(raw('ko', 'credits')).not.toContain('일반 버전 제목의 한글');
    expect(raw('en', 'credits')).not.toContain('Korean headings of the general version');
    for (const lang of ['ko', 'en'] as const) expect(legalSchema.parse(readFrontmatter(file(lang, 'credits'))).updated >= '2026-10-05', lang).toBe(true);
  });

  it('privacy never mentions browser language collection', () => {
    expect(body('ko', 'privacy')).not.toContain('브라우저 언어');
    expect(body('en', 'privacy').toLowerCase()).not.toContain('browser language');
    expect(body('ko', 'privacy')).toContain('- IP 주소로 추정한 국가(미국·러시아·중국은 지역까지)');
    expect(body('en', 'privacy')).toContain('- Country, estimated from the IP address (region for the US, Russia and China)');
  });

  it('privacy statistics wording matches GOATCOUNTER.code (collecting vs not yet)', () => {
    const ko = { on: '방문 수를 세려고 GoatCounter를 씁니다.', off: '현재는 방문 통계를 수집하지 않습니다. 통계를 켜면 아래 내용대로 GoatCounter를 씁니다.' };
    const en = {
      on: 'The site uses GoatCounter to count visits.',
      off: 'The site does not collect visitor statistics yet. When statistics are turned on, it uses GoatCounter as described below.',
    };
    expect(body('ko', 'privacy')).toContain(collecting ? ko.on : ko.off);
    expect(body('ko', 'privacy')).not.toContain(collecting ? ko.off : ko.on);
    expect(body('en', 'privacy')).toContain(collecting ? en.on : en.off);
    expect(body('en', 'privacy')).not.toContain(collecting ? en.off : en.on);
  });

  it('privacy script clause matches self-hosted vs gc.zgo.at, and is conditional while statistics are off (P2-33)', () => {
    for (const lang of LANGS) expect(body(lang, 'privacy')).toContain(`- ${assetSentence(lang)}`);
    // The stats-page numbers bullet follows GOATCOUNTER.code the same way.
    const numbers = {
      ko: collecting
        ? '방문 통계 페이지의 수치는 사이트를 빌드할 때 GoatCounter API(읽기 전용 키)에서 받아 둔 합산값입니다. 누적 방문 수 하나만 방문자의 브라우저가 GoatCounter 공개 카운터에서 직접 불러옵니다.'
        : '통계를 켜면 방문 통계 페이지의 수치는 사이트를 빌드할 때 GoatCounter API(읽기 전용 키)에서 받아 둔 합산값이고, 누적 방문 수 하나만 방문자의 브라우저가 GoatCounter 공개 카운터에서 직접 불러옵니다.',
      en: collecting
        ? "The numbers on the Visitor stats page are aggregates fetched from the GoatCounter API (read-only key) when the site is built. Only the running total is loaded by your browser directly from GoatCounter's public counter."
        : "When statistics are turned on, the numbers on the Visitor stats page are aggregates fetched from the GoatCounter API (read-only key) when the site is built, and only the running total is loaded by your browser directly from GoatCounter's public counter.",
    };
    for (const lang of LANGS) expect(body(lang, 'privacy')).toContain(`- ${numbers[lang]}`);
    if (!collecting) {
      // nothing in the external-services list speaks of the count script as if it ran today
      expect(body('ko', 'privacy')).not.toContain('방문 통계 스크립트는 모두 이 사이트에서');
      expect(body('en', 'privacy')).not.toContain('and the visitor-count script are all served');
    }
    expect(body('ko', 'privacy')).not.toContain('공개 API에서 합산된 통계만 불러옵니다');
    expect(body('en', 'privacy')).not.toContain("loads only aggregated statistics from GoatCounter's public API");
  });

  it('music/sound-effect mentions match the files present', () => {
    expect(body('ko', 'privacy').includes('배경음악')).toBe(sound.bgm);
    expect(body('ko', 'privacy').includes('효과음')).toBe(sound.sfx);
    expect(body('en', 'privacy').includes('music')).toBe(sound.bgm);
    expect(body('en', 'privacy').includes('sound effects')).toBe(sound.sfx);
    for (const lang of LANGS) {
      const credits = raw(lang, 'credits');
      const intro = credits.trim().split('\n\n')[0];
      expect(intro, `${lang} credits intro`).toContain(creditsIntro(lang));
      expect(intro.includes(lang === 'ko' ? '음악' : 'music'), `${lang} credits intro names music`).toBe(sound.bgm);
      expect(credits.includes('Everything You Ever Dreamed.'), `${lang} BGM credit`).toBe(sound.bgm);
      expect(credits.includes('https://kenney.nl/assets/ui-audio'), `${lang} SFX credit`).toBe(sound.sfx);
      const none = lang === 'ko' ? '이 사이트는 현재 배경음악과 효과음을 쓰지 않습니다.' : 'This site currently uses no music or sound effects.';
      expect(credits.includes(none)).toBe(!sound.bgm && !sound.sfx);
    }
  });

  it('final review fix 1 item 14: the credits audio heading names only the audio that ships', () => {
    // Derived from the files present (soundAvailability): both → both; one → that one; none → both (the section then says none ship).
    const heading = (lang: L): string => {
      const parts = lang === 'ko' ? [sound.bgm ? '배경음악' : null, sound.sfx ? '효과음' : null] : [sound.bgm ? 'Music' : null, sound.sfx ? 'Sound effects' : null];
      const present = parts.filter((p): p is string => p !== null);
      if (present.length === 1) return present[0];
      return lang === 'ko' ? '배경음악·효과음' : 'Music and sound effects';
    };
    for (const lang of LANGS) {
      const h2 = raw(lang, 'credits').split('\n').filter((line) => line.startsWith('## '));
      const audio = h2.find((line) => (lang === 'ko' ? /배경음악|효과음/ : /Music|[Ss]ound effects/).test(line));
      expect(audio, `${lang} credits audio heading`).toBe(`## ${heading(lang)}`);
    }
  });

  it('privacy lists every localStorage/sessionStorage use (sound, motion, achievements, visited sections, intro)', () => {
    // sb:sound is written only by the BGM button (HudNav renders BgmToggle only when the BGM file exists).
    const ko = body('ko', 'privacy');
    for (const s of [
      sound.bgm ? '- 소리 켜기·끄기, 모션 끄기' : '- 모션 끄기',
      '- 사이트 업적 달성 기록',
      '- 업적을 위해 둘러본 메뉴(연구·프로젝트·기록·플레이 로그)와 언어',
      'CRT 인트로',
      '선택 화면의 문서 열람 연출', // MO-41: the chooser's opening shares sb:intro
      '첫 화면 문구 등장',
      '- 마지막으로 고른 포트폴리오 버전(게임·일반)',
      '- 배경음악을 이어 듣기 위한 재생 위치(sessionStorage, 창을 닫으면 사라지고 30분이 지나면 쓰지 않음)',
    ]) {
      expect(ko).toContain(s);
    }
    expect(ko.includes('소리 켜기'), 'ko sound setting listed').toBe(sound.bgm);
    const en = body('en', 'privacy');
    for (const s of [
      sound.bgm ? '- Sound on/off and reduced motion' : '- Reduced motion',
      '- Site achievements you have unlocked',
      '- Which of the four menu sections and which languages you have opened (for achievements)',
      'CRT intro',
      "the chooser's document-opening effect", // MO-41
      'home text entrance',
      '- The portfolio version you last chose (game or general)',
      '- The background-music position so it continues on the next page (sessionStorage; cleared when the tab closes, ignored after 30 minutes)',
    ]) {
      expect(en).toContain(s);
    }
    expect(en.includes('Sound on/off'), 'en sound setting listed').toBe(sound.bgm);
  });

  it('P1-14: the closing "last updated" line of every legal file states its frontmatter date', () => {
    for (const doc of DOCS) {
      for (const lang of LANGS) {
        const updated = (readFrontmatter(file(lang, doc)) as { updated: string }).updated; // 'YYYY-MM-DD'
        const [y, m, d] = updated.split('-').map(Number) as [number, number, number];
        const expected = lang === 'ko'
          ? `최종 수정일: ${y}년 ${m}월 ${d}일`
          : `Last updated: ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))}`;
        expect(raw(lang, doc).trim().split('\n').at(-1), `${lang}/${doc}`).toBe(expected);
      }
    }
  });

  it('bare URLs never touch the following word (a GFM autolink would swallow it)', () => {
    // "(https://enka.network)에서" autolinks to "https://enka.network)에서"; write "(<https://enka.network>)에서".
    for (const lang of LANGS) {
      for (const doc of DOCS) {
        const glued = raw(lang, doc).match(/(?<!\]\()https?:\/\/[^\s<>]*\)[^\s.,;:!?)]/g) ?? [];
        expect(glued, `${lang}/${doc}`).toEqual([]);
      }
    }
  });

  it('contact e-mail is the school address only', () => {
    for (const lang of LANGS) {
      for (const doc of DOCS) {
        const emails = raw(lang, doc).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
        expect(emails.length, `${lang}/${doc}`).toBeGreaterThan(0);
        expect(new Set(emails), `${lang}/${doc}`).toEqual(new Set([SITE.email]));
      }
    }
  });
});

/** deploy.yml facts the privacy text states: artifact retention by artifact name, and the daily cron. */
const workflow = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
function retentionDays(artifact: string): number {
  const m = new RegExp(`name: ${artifact}\\n(?:[^\\n]*\\n){0,3}?\\s*retention-days: (\\d+)`).exec(workflow);
  if (!m) throw new Error(`retention-days for ${artifact} not found`);
  return Number(m[1]);
}
function cronKst(): string {
  const m = /cron: '(\d+) (\d+) \* \* \*'/.exec(workflow);
  if (!m) throw new Error('daily cron not found');
  const minutes = (Number(m[2]) * 60 + Number(m[1]) + 9 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
/** Worker lifetimes (seconds) the relay paragraph states in minutes; read as text so no Worker module loads. */
const relaySrc = readFileSync(join(root, 'workers/account-relay/src/index.mjs'), 'utf8');
function workerConst(name: string): number {
  const m = new RegExp(`export const ${name} = (\\d+);`).exec(relaySrc);
  if (!m) throw new Error(`${name} not found`);
  return Number(m[1]);
}

// Owner ruling 2026-10-07: the relay (Cloudflare Worker + GitHub App) is not set up; the account cards come from Actions
// variables the owner sets by hand. While ACCOUNT_ADMIN.relay is null the privacy policy and credits say nothing about
// the relay or the management screen; the enable commit (AL-23) restores that text from git history (removed in the
// commit that added this note) together with the relay address.
const RELAY_WORDS = { ko: ['중계 서버', 'Cloudflare', '연동 관리'], en: ['relay server', 'Cloudflare', 'management screen'] } as const;

describe('account cards in privacy and credits; the owner-only relay only once it exists', () => {
  it('privacy ko carries the account-card sentences verbatim', () => {
    const ko = body('ko', 'privacy');
    for (const s of [
      '방문자가 이름이나 연락처를 입력하는 곳도 없습니다.',
      '방문자의 브라우저는 GitHub API를 호출하지 않습니다.',
      '던전앤파이터는 연동하지 않습니다.',
      '방문자의 게임 계정 정보는 어떤 경우에도 수집하지 않습니다.',
    ]) {
      expect(ko).toContain(s);
    }
    expect(ko).not.toContain('현재 버전은 게임 계정 데이터를 불러오지 않습니다');
    expect(ko).not.toContain('30일');
    expect(ko).not.toContain('방문자의 브라우저가 GitHub API를 직접 호출하지 않습니다.');
  });

  it('privacy en carries the same content', () => {
    const en = body('en', 'privacy');
    for (const s of [
      'there is nowhere for visitors to enter a name or contact details.',
      "Visitors' browsers do not call the GitHub API.",
      'Dungeon & Fighter is not linked.',
      "The site never collects visitors' game account information.",
      'send no referrer',
    ]) {
      expect(en).toContain(s);
    }
    expect(en).not.toContain('The current version does not load any game account data');
    expect(en).not.toContain('30 days');
  });

  it('privacy numbers equal the workflow, the Worker and the account config', () => {
    const feeds = retentionDays('account-feeds');
    const shots = retentionDays('screenshots');
    const report = retentionDays('playwright-report');
    expect([feeds, shots, report]).toEqual([1, 14, 7]);
    const time = cronKst();
    expect(time).toBe('03:30');
    const ko = body('ko', 'privacy');
    expect(ko).toContain(`계정 데이터 아티팩트는 ${feeds}일, 빌드 화면 사진 아티팩트는 최대 ${shots}일, 테스트 실패 보고서는 ${report}일 동안 남고`);
    expect(ko).toContain(`매일 ${time}(한국 시간)과 주인이 사이트를 다시 빌드할 때 갱신합니다. ${ACCOUNT_MAX_AGE_DAYS}일 동안 갱신되지 않으면 카드를 숨깁니다.`);
    const en = body('en', 'privacy');
    expect(en).toContain(`the account-data artifact is kept for ${feeds} day, the build screenshot artifact for up to ${shots} days, the failed-test report for ${report} days`);
    expect(en).toContain(`daily at ${time} KST and whenever the owner rebuilds the site. A card that has not been refreshed for ${ACCOUNT_MAX_AGE_DAYS} days is hidden.`);
  });

  it('privacy and credits describe the relay only while ACCOUNT_ADMIN.relay is set', () => {
    const relay: string | null = ACCOUNT_ADMIN.relay;
    for (const lang of LANGS) {
      const text = raw(lang, 'privacy') + raw(lang, 'credits');
      if (relay === null) {
        for (const w of RELAY_WORDS[lang]) expect(text, `${lang}: ${w}`).not.toContain(w);
        expect(text, lang).not.toContain('Sign in through Steam');
      } else {
        expect(raw(lang, 'privacy'), lang).toContain(new URL(relay).host);
        // the relay paragraph states the Worker's lifetimes in minutes
        const handle = workerConst('HANDLE_MAX') / 60;
        const cookie = workerConst('COOKIE_TTL') / 60;
        expect(raw(lang, 'privacy'), lang).toContain(lang === 'ko' ? `최대 ${handle}분 뒤 쓸 수 없으며` : `unusable after at most ${handle} minutes`);
        expect(raw(lang, 'privacy'), lang).toContain(lang === 'ko' ? `늦어도 ${cookie}분 뒤 만료됩니다` : `expires after at most ${cookie} minutes`);
      }
    }
  });

  it('privacy was updated with the account text (frontmatter date on or after it)', () => {
    for (const lang of LANGS) {
      const updated = (readFrontmatter(file(lang, 'privacy')) as { updated: string }).updated;
      expect(updated >= '2026-10-04', lang).toBe(true);
    }
  });

  it('credits game-data statuses and the Valve row', () => {
    const row = (lang: L, start: string) => raw(lang, 'credits').split('\n').find((l) => l.startsWith(start)) ?? '';
    expect(row('ko', '| 네오플 |')).toMatch(/\| 연동 시 표시 \|$/);
    expect(row('en', '| Neople |')).toMatch(/\| Shown when linked \|$/);
    expect(row('ko', '| Enka.Network |')).toMatch(/\| 플레이 로그 계정 카드 \|$/);
    expect(row('en', '| Enka.Network |')).toMatch(/\| Player Log account cards \|$/);
    const valveKo = row('ko', '| Valve(Steam) |');
    const valveEn = row('en', '| Valve (Steam) |');
    expect(valveKo).toMatch(/\| 플레이 로그 계정 카드 \|$/);
    expect(valveEn).toMatch(/\| Player Log account cards \|$/);
    for (const v of [valveKo, valveEn]) {
      expect(v).toContain('Valve Corporation');
      expect(v).not.toContain('nofollow');
    }
    expect(body('ko', 'credits')).toContain('플레이 로그의 계정 카드는 아래 출처에서 받은 데이터로 만듭니다. 아래 고지는 이 페이지와 플레이 로그에 함께 표시합니다.');
    expect(body('en', 'credits')).toContain('The account cards on the Player Log are built from the sources below. The notices below are shown on this page and on the Player Log.');
  });
});

/** Committed card crops (src/assets/account-cards/, provenance in sources.json); the credits follow file presence. */
const cardFile = (n: number) => existsSync(join(root, `src/assets/account-cards/card-${n}.webp`));
const gameRecordImages = readFileSync(join(root, 'src/data/game-records.yaml'), 'utf8').match(/^\s+image: /gm) ?? [];

describe('character cards, Riot assets and game screenshots in credits', () => {
  it('PL-7: credits name the card art, the Riot assets with the Legal Jibber Jabber notice, and the screenshots with the Blizzard line (ko, en)', () => {
    const ko = raw('ko', 'credits');
    const en = raw('en', 'credits');
    const kob = body('ko', 'credits');
    const enb = body('en', 'credits');
    // one H2 for the game art and screenshots; its id carries no trademark (the Riot words stay in the paragraph label)
    expect(ko).toContain('\n## 게임 그림·스크린샷\n');
    expect(en).toContain('\n## Game art and screenshots\n');
    // HoYoverse crops: the cards reuse the credited illustrations
    if (cardFile(1) && cardFile(2) && has('eula') && has('remielle')) {
      expect(kob).toContain('플레이 로그 연동 계정 카드의 유라·레미엘 그림은 위 일러스트를 잘라 쓴 것입니다.');
      expect(enb).toContain("The Eula and Remielle pictures on the Player Log's linked-account cards are crops of the illustrations above.");
    }
    // Riot assets: the paragraph, the policy link, then the notice verbatim (lang="en" on the Korean page)
    expect(cardFile(3) && cardFile(4)).toBe(true);
    expect(kob).toContain(
      '**라이엇 게임즈 에셋.** 플레이 로그 연동 계정 카드의 이즈리얼(리그 오브 레전드)과 펭구(전략적 팀 전투) 그림은 라이엇 게임즈가 <span lang="en">Data Dragon</span>으로 공개한 라이엇 게임즈 에셋을 잘라 쓴 것입니다. 라이엇 게임즈의 “Legal Jibber Jabber” 정책에 따라 무료로, 광고 없이 씁니다.',
    );
    expect(enb).toContain(
      "**Riot Games assets.** The Ezreal (League of Legends) and Pengu (Teamfight Tactics) pictures on the Player Log's linked-account cards are crops of Riot Games assets published through Riot's Data Dragon. They are used free of charge and without ads under Riot Games' “Legal Jibber Jabber” policy.",
    );
    // the showcase art (owner ruling 2026-10-06): Ezreal's Data Dragon splash and Pengu from the TFT website
    if (has('ezreal') && has('pengu')) {
      expect(kob).toContain(
        "**쇼케이스 그림.** 플레이 로그 '좋아하는 게임' 쇼케이스의 이즈리얼 그림은 라이엇 게임즈가 <span lang=\"en\">Data Dragon</span>으로 공개한 이즈리얼 기본 일러스트(가운데 맞춤판)이고, 펭구 그림은 전략적 팀 전투 공식 홈페이지(<https://teamfighttactics.leagueoflegends.com/>)에 실린 펭구 그림입니다. 둘 다 같은 정책에 따라 씁니다.",
      );
      expect(enb).toContain(
        "**Showcase art.** The Ezreal picture in the Player Log's “Games I play” showcase is his base splash art (the centred version) published through Riot's Data Dragon; the Pengu picture is from the official Teamfight Tactics website (<https://teamfighttactics.leagueoflegends.com/>). Both are used under the same policy.",
      );
    }
    expect(ko).toContain('[“Legal Jibber Jabber” 정책](https://www.riotgames.com/en/legal)');
    expect(en).toContain('[“Legal Jibber Jabber” policy](https://www.riotgames.com/en/legal)');
    expect(ko).toContain(`\n<span lang="en">${ui.ko['notice.riotAssets']}</span>\n`);
    expect(en).toContain(`\n${ui.en['notice.riotAssets']}\n`);
    expect(ui.en['notice.riotAssets']).toMatch(/ was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games\. Riot Games does not endorse or sponsor this project\.$/);
    // Hearthstone card art: the official news header it is cropped from
    expect(cardFile(5)).toBe(true);
    expect(kob).toContain(
      '**하스스톤 그림.** 연동 계정 카드의 하스스톤 그림은 블리자드 엔터테인먼트의 하스스톤 공식 소식 글(<https://hearthstone.blizzard.com/en-us/news/24008694>) 머리 이미지에서 여관주인 부분을 잘라 쓴 것입니다.',
    );
    expect(enb).toContain(
      "**Hearthstone art.** The Hearthstone picture on the linked-account cards is a crop of the Innkeeper from the header image of Blizzard Entertainment's official Hearthstone news post (<https://hearthstone.blizzard.com/en-us/news/24008694>).",
    );
    // Screenshots: the owner's own captures, as evidence; then the Blizzard line
    expect(gameRecordImages.length).toBe(3);
    expect(kob).toContain(
      "**게임 기록 스크린샷.** '내 게임 업적'의 스크린샷 세 장은 본인이 직접 찍은 전략적 팀 전투(라이엇 게임즈)와 하스스톤(블리자드 엔터테인먼트) 게임 화면으로, 기록의 증거로 보여 줍니다.",
    );
    expect(enb).toContain(
      "**Game record screenshots.** The three screenshots in “My game achievements” are my own captures of Teamfight Tactics (Riot Games) and Hearthstone (Blizzard Entertainment), shown as evidence of the records.",
    );
    expect(ko).toContain(`\n<span lang="en">${ui.ko['notice.blizzard']}</span>\n`);
    expect(en).toContain(`\n${ui.en['notice.blizzard']}\n`);
    // the Steam card art is the owner's own avatar
    const valveKo = ko.split('\n').find((l) => l.startsWith('| Valve(Steam) |')) ?? '';
    const valveEn = en.split('\n').find((l) => l.startsWith('| Valve (Steam) |')) ?? '';
    expect(valveKo).toContain('Steam 카드에는 본인의 Steam 아바타를 보여 줍니다.');
    expect(valveEn).toContain('The Steam card shows my own Steam avatar.');
    // no logo is credited, because none is used
    for (const t of [kob, enb]) expect(t).not.toMatch(/(라이엇|블리자드|하스스톤|Riot|Blizzard|Hearthstone)[^.\n]{0,40}(로고|logo)/i);
  });

  it('PL-7: the Riot status no longer says that no assets are used', () => {
    for (const lang of LANGS) {
      const row = raw(lang, 'credits').split('\n').find((l) => l.startsWith(lang === 'ko' ? '| 라이엇 게임즈 |' : '| Riot Games |')) ?? '';
      expect(row, lang).not.toContain(lang === 'ko' ? '에셋 미사용' : 'no API or assets');
      if (!RIOT_NOTICE_ON_PAGES) expect(row.endsWith(`| ${RIOT_STATUS[lang]} |`), lang).toBe(true);
    }
    // the paragraph the status points to sits above the table
    for (const lang of LANGS) {
      const text = raw(lang, 'credits');
      const label = lang === 'ko' ? '**라이엇 게임즈 에셋.**' : '**Riot Games assets.**';
      const table = lang === 'ko' ? '| 라이엇 게임즈 |' : '| Riot Games |';
      expect(text.indexOf(label), lang).toBeGreaterThan(-1);
      expect(text.indexOf(label), lang).toBeLessThan(text.indexOf(table));
    }
  });

  it('PL-7: credits were updated with the card and screenshot text (frontmatter date on or after it)', () => {
    for (const lang of LANGS) {
      const updated = (readFrontmatter(file(lang, 'credits')) as { updated: string }).updated;
      expect(updated >= '2026-10-05', lang).toBe(true);
    }
  });
});
