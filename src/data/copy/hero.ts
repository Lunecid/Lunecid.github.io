// Home hero + MAIN MENU copy. Every href is base form (Korean, version-free); HomeView builds the links with pageHref.
// The headline/tagline/status/about text lives in the version identity (src/variants/*.ts, resolved through fact
// tokens; the same source feeds the site and the PDFs).
import { t, type Localized } from '../../i18n/utils';

export interface HeroCopy {
  /** Title card above the H1: the romanized name on Korean pages; none on English pages, where it only repeated the
   *  H1 (final fix 2 item 11). */
  roman: string | null;
  /** Mockup label above the name (a bracket label, not a D-8 section number). */
  label: string;
  /** Affiliation + specialties (P2-16): the role is said once, on the player card. */
  meta: string;
  ctas: { primary: { label: string; href: string } };
  /** cvLabel: the button text; the document name (D-7) comes from ui.ts nav.cvResume. */
  contact: { cvLabel: string; jobFitLabel: string; jobFitHref: string };
  /** The no-art hero (D-1): the CoG AUC chart in a HUD frame, with a link to the paper page. */
  artifact: { label: string; linkLabel: string; href: string };
  swap: { groupLabel: string; replayLabel: string };
  /** The class line is the version headline: as written in Korean, in upper case in English (HomeView, contract §1.6). */
  playerCard: { label: string; badges: string[]; photoAlt: string };
}

export const heroCopy: Localized<HeroCopy> = {
  ko: {
    roman: 'SEONGEUN BAEK',
    label: '[ PLAYER PROFILE ]',
    meta: '부산대학교 데이터사이언스 석사과정 · 게임 텔레메트리 · 그래프 ML',
    ctas: { primary: { label: '연구 보기', href: '/research/' } },
    contact: { cvLabel: 'CV (PDF)', jobFitLabel: t('ko', 'action.viewJobFit'), jobFitHref: '/records/#job-fit' },
    artifact: { label: 'FIG · {pub.cog-2026-engagement.venueAbbr} · AUC BY MODEL', linkLabel: '논문 초록 보기', href: '/research/cog-2026-engagement/' },
    swap: { groupLabel: '첫 화면 캐릭터 선택', replayLabel: '등장 다시 보기' },
    playerCard: {
      label: '플레이어 카드',
      badges: ['{pub.cog-2026-engagement.venueShort} ORAL', '{awards.name:top} ×{awards.count:top}'],
      photoAlt: t('ko', 'card.photoAlt'),
    },
  },
  en: {
    roman: null,
    label: '[ PLAYER PROFILE ]',
    meta: 'M.S. student in Data Science, Pusan National University · Game telemetry · Graph ML',
    ctas: { primary: { label: 'See research', href: '/research/' } },
    contact: { cvLabel: 'CV (PDF)', jobFitLabel: t('en', 'action.viewJobFit'), jobFitHref: '/records/#job-fit' },
    artifact: { label: 'FIG · {pub.cog-2026-engagement.venueAbbr} · AUC BY MODEL', linkLabel: 'Read the abstract', href: '/research/cog-2026-engagement/' },
    swap: { groupLabel: 'Choose the hero character', replayLabel: 'Replay entrance' },
    playerCard: {
      label: 'Player card',
      badges: ['{pub.cog-2026-engagement.venueShort} ORAL', '{awards.name:top} ×{awards.count:top}'],
      photoAlt: t('en', 'card.photoAlt'),
    },
  },
};

export interface MainMenuCopy {
  items: { num: '01' | '02' | '03' | '04'; href: string; title: string; caption: string }[];
  hint: string;
}

/** mockup-port §4 captions (body text may name games; URLs and titles never do). */
export const mainMenuCopy: Localized<MainMenuCopy> = {
  ko: {
    items: [
      { num: '01', href: '/research/', title: t('ko', 'nav.research'), caption: '리그 오브 레전드 교전 예측 · PUBG 생존 모델' },
      { num: '02', href: '/projects/', title: t('ko', 'nav.projects'), caption: '{awards.name:top} ×{awards.count:top} · 웹 서비스' },
      { num: '03', href: '/records/', title: t('ko', 'nav.records'), caption: '학력 · 수상 · 자격 · 이력서' },
      { num: '04', href: '/player-log/', title: t('ko', 'nav.playerLog'), caption: '좋아하는 게임 · 업적 · 숨은 요소' },
    ],
    hint: '↑↓ 이동 · Enter 선택 · 마우스 클릭도 가능',
  },
  en: {
    items: [
      { num: '01', href: '/research/', title: t('en', 'nav.research'), caption: 'League of Legends engagement prediction · PUBG survival model' },
      { num: '02', href: '/projects/', title: t('en', 'nav.projects'), caption: '{awards.name:top} ×{awards.count:top} · web service' },
      { num: '03', href: '/records/', title: t('en', 'nav.records'), caption: 'Education · awards · certifications · CV' },
      { num: '04', href: '/player-log/', title: t('en', 'nav.playerLog'), caption: 'Games I play · achievements · hidden extras' },
    ],
    hint: '↑↓ move · Enter select · click works too',
  },
};

/** Hero slogan lines: split after the first ', ', '; ' or ': ' (punctuation stays on line 1); no separator → [text, '']. */
export function splitTagline(text: string): [string, string] {
  const match = /[,;:] /.exec(text);
  if (!match) return [text, ''];
  return [text.slice(0, match.index + 1), text.slice(match.index + 2)];
}
