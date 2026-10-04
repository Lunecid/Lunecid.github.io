import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// src/lib/characters.ts imports island-image.server → astro:assets; this test uses only its glob-based lookup.
vi.mock('astro:assets', () => ({ getImage: vi.fn() }));

import { GOATCOUNTER, RIOT_NOTICE_ON_PAGES, SITE } from '../../src/config';
import { legalSchema } from '../../src/content/schemas';
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
    expect(ko).toBe(`| 라이엇 게임즈 | <span lang="en">${ui.ko['notice.riot']}</span> | ${on ? 'CoG 논문 페이지에 표시' : '연동 시 표시'} |`);
    expect(en).toBe(`| Riot Games | ${ui.en['notice.riot']} | ${on ? 'Shown on the CoG paper page' : 'Shown when linked'} |`);
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
