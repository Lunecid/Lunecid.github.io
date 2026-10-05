// src/data/copy/chooser-covers.ts — the framing words on the chooser's two covers and in its opening (v6.2). No fact
// lives here: digits only in `num`/`serial` keys (label numbers; a digit-bearing label nests under one, as
// `game.rail.serial`); `{n}`, `{year}`, `{host}` and `{count}` are filled by code (file count, build year, site host).
// Every key is a placeholder until the owner writes it (COVER_COPY_STATUS); the release gate requires all of them to
// be 'owner'. `display`/`banner` words are decoration (aria-hidden).
import type { Localized } from '../../i18n/utils';

export interface CoverCopy {
  mast: { label: string; files: string };
  game: { file: string; access: string; serial: string; series: string; num: string; display: [string, string, string]; stamp: string; rail: { serial: string } };
  data: { file: string; serial: string; series: string; num: string; banner: [string, string]; stamp: string };
  foot: string;
  touch: { rest: string; aside: string };
  opening: { terminal: string; node: { num: string }; request: string; decrypt: string; pct: { num: string }; granted: string };
  sound: { label: string; on: string; off: string };
}

export const coverCopy: Localized<CoverCopy> = {
  ko: {
    mast: { label: 'PORTFOLIO ARCHIVE', files: 'FILES · {n}' },
    game: { file: 'GAME_ANALYST.DOC', access: 'ACCESS: OPEN', serial: 'NO. PDL-26/01', series: 'PORTFOLIO ARCHIVE', num: 'NO. 01', display: ['GAME', 'DATA', 'ANALYST'], stamp: '기밀 해제', rail: { serial: 'SN PDL-26/01-G' } },
    data: { file: 'DATA_ANALYST.DOC', serial: 'NO. PDL-26/02', series: 'PORTFOLIO ARCHIVE', num: 'NO. 02', banner: ['DATA', 'ANALYST'], stamp: '검토 완료' },
    foot: '{year} · PORTFOLIO · {host}',
    touch: { rest: '뒤의 게임 파일을 누르면 앞으로 꺼냅니다', aside: '한 번 더 누르면 게임 버전으로 이동합니다' },
    opening: { terminal: 'SECURE DOCUMENT TERMINAL', node: { num: 'NODE 02' }, request: '> 열람 요청 · 포트폴리오 문서 {count}건', decrypt: 'DECRYPT', pct: { num: '100%' }, granted: 'ACCESS GRANTED' },
    sound: { label: '효과음', on: '켜짐', off: '꺼짐' },
  },
  // Until the owner gives English wording the Latin labels repeat the Korean page's; the Korean-only values get a
  // neutral English stand-in.
  en: {
    mast: { label: 'PORTFOLIO ARCHIVE', files: 'FILES · {n}' },
    game: { file: 'GAME_ANALYST.DOC', access: 'ACCESS: OPEN', serial: 'NO. PDL-26/01', series: 'PORTFOLIO ARCHIVE', num: 'NO. 01', display: ['GAME', 'DATA', 'ANALYST'], stamp: 'CLEARED', rail: { serial: 'SN PDL-26/01-G' } },
    data: { file: 'DATA_ANALYST.DOC', serial: 'NO. PDL-26/02', series: 'PORTFOLIO ARCHIVE', num: 'NO. 02', banner: ['DATA', 'ANALYST'], stamp: 'REVIEWED' },
    foot: '{year} · PORTFOLIO · {host}',
    touch: { rest: 'Tap the game file behind to bring it forward', aside: 'Tap it again to open the game version' },
    opening: { terminal: 'SECURE DOCUMENT TERMINAL', node: { num: 'NODE 02' }, request: '> ACCESS REQUEST · {count} FILES', decrypt: 'DECRYPT', pct: { num: '100%' }, granted: 'ACCESS GRANTED' },
    sound: { label: 'Sound', on: 'On', off: 'Off' },
  },
};

/** Who wrote each key (dotted path, both languages): 'owner' once the owner has given the wording. */
export const COVER_COPY_STATUS: Readonly<Record<string, 'placeholder' | 'owner'>> = {
  'mast.label': 'placeholder',
  'mast.files': 'placeholder',
  'game.file': 'placeholder',
  'game.access': 'placeholder',
  'game.serial': 'placeholder',
  'game.series': 'placeholder',
  'game.num': 'placeholder',
  'game.display': 'placeholder',
  'game.stamp': 'owner', // "기밀 해제", the owner's word (2026-10-04)
  'game.rail.serial': 'placeholder',
  'data.file': 'placeholder',
  'data.serial': 'placeholder',
  'data.series': 'placeholder',
  'data.num': 'placeholder',
  'data.banner': 'placeholder',
  'data.stamp': 'placeholder',
  foot: 'placeholder',
  'touch.rest': 'placeholder',
  'touch.aside': 'placeholder',
  'opening.terminal': 'placeholder',
  'opening.node.num': 'placeholder',
  'opening.request': 'placeholder',
  'opening.decrypt': 'placeholder',
  'opening.pct.num': 'placeholder',
  'opening.granted': 'placeholder',
  'sound.label': 'placeholder',
  'sound.on': 'placeholder',
  'sound.off': 'placeholder',
};

/** Longest value per key in graphemes, measured after the code fills `{n}`/`{year}`/`{host}`/`{count}`; for the array
 *  keys the limit applies to each word. */
export const COVER_LIMITS: Readonly<Record<string, number>> = {
  'mast.label': 20,
  'mast.files': 12,
  'game.file': 20,
  'game.access': 16,
  'game.serial': 16,
  'game.series': 20,
  'game.num': 8,
  'game.display': 10,
  'game.stamp': 8,
  'game.rail.serial': 16,
  'data.file': 20,
  'data.serial': 16,
  'data.series': 20,
  'data.num': 8,
  'data.banner': 10,
  'data.stamp': 8,
  foot: 40,
  'touch.rest': 48,
  'touch.aside': 48,
  'opening.terminal': 28,
  'opening.node.num': 10,
  'opening.request': 32,
  'opening.decrypt': 12,
  'opening.pct.num': 4,
  'opening.granted': 16,
  'sound.label': 10,
  'sound.on': 6,
  'sound.off': 6,
};
