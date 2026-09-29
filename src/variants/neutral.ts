// src/variants/neutral.ts — identity of the version-free pages: the chooser, the Academic CV headline (B-11), JSON-LD on
// the chooser (A-25) and og:site_name on neutral pages (A-24).
import type { Localized, UiKey } from '../i18n/utils';
import { BASE_PATH, type SharedPath } from './ids';

export const NEUTRAL_IDENTITY: { headline: Localized; siteTitle: Localized; oneLiner: Localized } = {
  headline: { ko: '연구자 · 데이터 분석가', en: 'Researcher · Data Analyst' }, // B-11
  siteTitle: { ko: '백성은', en: 'Seongeun Baek' },
  oneLiner: { ko: '데이터로 사람의 행동을 읽는 분석가입니다. 보고 싶은 포트폴리오를 고르세요.', en: 'I read human behaviour from data. Choose the portfolio you want to see.' }, // B-13
};

/** CA-21: the shared pages in footer order (stats → privacy → credits), for both footers. */
export const SHARED_NAV: readonly { key: 'stats' | 'privacy' | 'credits'; base: SharedPath; label: UiKey }[] = [
  { key: 'stats', base: BASE_PATH.stats, label: 'nav.stats' },
  { key: 'privacy', base: BASE_PATH.privacy, label: 'nav.privacy' },
  { key: 'credits', base: BASE_PATH.credits, label: 'nav.credits' },
];
