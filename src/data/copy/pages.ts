import { GOATCOUNTER } from '../../config';
import type { Lang } from '../../i18n/ui';
import type { Localized } from '../../i18n/utils';

export type PageKey =
  | 'home'
  | 'research'
  | 'research-story'
  | 'projects'
  | 'records'
  | 'player-log'
  | 'stats'
  | 'privacy'
  | 'credits'
  | 'not-found';

/** /stats/ meta for both states: 'offline' while GOATCOUNTER.code is null (nothing collected), else 'collecting'. */
export const STATS_META: Record<'offline' | 'collecting', Localized<{ title: string; description: string }>> = {
  offline: {
    ko: {
      title: '방문 통계 · 백성은',
      description: '방문 통계는 GoatCounter를 연결한 뒤 이 페이지에 공개합니다. 아직 방문 기록을 모으지 않습니다.',
    },
    en: {
      title: 'Visitor Stats · Seongeun Baek',
      description: 'Visitor statistics will be published here once GoatCounter is connected. No visits are recorded yet.',
    },
  },
  collecting: {
    ko: {
      title: '방문 통계 · 백성은',
      description: '쿠키 없이 모은 이 사이트의 방문 수, 인기 페이지, 유입 경로.',
    },
    en: {
      title: 'Visitor Stats · Seongeun Baek',
      description: 'Visits, top pages, and referrers for this site, collected without cookies.',
    },
  },
};

/** /stats/ meta for a GoatCounter site code: 'offline' while it is null, 'collecting' once it is set (P2-33). */
export function statsMetaFor(code: string | null): Localized<{ title: string; description: string }> {
  return STATS_META[code === null ? 'offline' : 'collecting'];
}

/**
 * Exact <title> and meta description per page. Neither titles nor descriptions (which are also og:description and
 * the OG card subtitle) contain game trademarks such as Riot (tests/unit/page-meta.test.ts); body text may.
 */
export const PAGE_META: Record<PageKey, Localized<{ title: string; description: string }>> = {
  home: {
    ko: {
      title: '백성은 · 게임 데이터 분석가·연구자',
      description: '게임 데이터 분석가·연구자 백성은의 포트폴리오. 연구, 프로젝트, 이력서, 플레이 로그.',
    },
    en: {
      title: 'Seongeun Baek · Game Data Analyst & Researcher',
      description: 'Portfolio of Seongeun Baek, game data analyst and researcher. Research, projects, résumé, and player log.',
    },
  },
  research: {
    ko: {
      title: '연구 · 백성은',
      description: '게임 로그로 플레이어의 선택과 팀 플레이를 연구합니다. 논문, 진행 중인 연구, 연구 관심사.',
    },
    en: {
      title: 'Research · Seongeun Baek',
      description: 'Research on player decisions and team play from game logs: publications, ongoing work, and interests.',
    },
  },
  'research-story': {
    ko: {
      title: '교전 결과 예측 논문 · 백성은',
      description: '교전 직전 30초의 공개 경기 기록으로 교전 뒤 이득을 예측한 IEEE CoG 2026 구두 발표 논문의 초록과 BibTeX.',
    },
    en: {
      title: 'Engagement Outcome Prediction Paper · Seongeun Baek',
      description: 'Abstract and BibTeX of an IEEE CoG 2026 oral paper that predicts engagement outcomes from 30 seconds of public match records.',
    },
  },
  projects: {
    ko: {
      title: '프로젝트 · 백성은',
      description: '게임 로그 연구와 공공데이터 경진대회에서 한 데이터 분석 사례 연구입니다. 질문·데이터·방법·결과와 제 역할을 적었습니다.',
    },
    en: {
      title: 'Projects · Seongeun Baek',
      description: 'Data analysis case studies from game log research and public-data competitions, with the question, data, method, results and my role in each.',
    },
  },
  records: {
    ko: {
      title: '기록·이력서 · 백성은',
      description: '학력, 수상, 자격, 기술, 게임사 데이터 분석가 지원 요건 대응표와 이력서 PDF.',
    },
    en: {
      title: 'Records & CV · Seongeun Baek',
      description: 'Education, awards, certifications, skills, a job-requirements fit table, and résumé PDFs.',
    },
  },
  'player-log': {
    ko: {
      title: '플레이 로그 · 백성은',
      description: '회원 카드, 좋아하는 게임과 캐릭터, 이 사이트에서 모을 수 있는 업적.',
    },
    en: {
      title: 'Player Log · Seongeun Baek',
      description: 'A membership card, the games and characters I like, and the achievements you can collect on this site.',
    },
  },
  // P2-33: the description follows GOATCOUNTER.code (see STATS_META below), like the page itself.
  stats: statsMetaFor(GOATCOUNTER.code),
  privacy: {
    ko: {
      title: '개인정보 처리방침 · 백성은',
      description: '이 사이트가 모으는 정보와 모으지 않는 정보.',
    },
    en: {
      title: 'Privacy Policy · Seongeun Baek',
      description: 'What this site collects and what it does not.',
    },
  },
  credits: {
    ko: {
      title: '출처·고지 · 백성은',
      description: '이 사이트에 쓴 이미지, 데이터, 글꼴 등의 출처와 권리 고지.',
    },
    en: {
      title: 'Credits · Seongeun Baek',
      description: 'Sources and rights notices for the images, data, fonts and other media on this site.',
    },
  },
  'not-found': {
    ko: {
      title: 'GAME OVER · 백성은',
      description: '페이지를 찾을 수 없습니다. Page not found.',
    },
    en: {
      title: 'GAME OVER · Seongeun Baek',
      description: 'Page not found. 페이지를 찾을 수 없습니다.',
    },
  },
};

/** Project case-study <title>/description: `${title} · 백성은` / `${title} · Seongeun Baek`, description = summary. */
export function projectPageMeta(title: string, summary: string, lang: Lang): { title: string; description: string } {
  return { title: `${title} · ${lang === 'ko' ? '백성은' : 'Seongeun Baek'}`, description: summary };
}
