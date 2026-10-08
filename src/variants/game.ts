// src/variants/game.ts — the game data analyst version (the published site). Copy moved here from resume.yaml profile,
// ui.ts site.title, research-page.ts forLabs and pages.ts (R-3); facts are tokens (R-4).
import { ui } from '../i18n/ui';
import type { Localized } from '../i18n/utils';
import { BASE_PATH, VARIANT_MODULES, VARIANT_PREFIX } from './ids';
import type { CaptionKey, Variant } from './types';

const fromUi = (key: keyof typeof ui.ko): Localized => ({ ko: ui.ko[key], en: ui.en[key] });
const same = (text: string): Localized => ({ ko: text, en: text });

/** Today's HUD captions (A-30: the data version copies them until P2-4). */
const GAME_CAPTIONS: Readonly<Record<CaptionKey, Localized>> = {
  research: fromUi('section.research'),
  publications: fromUi('section.publications'),
  projects: fromUi('section.projects'),
  selectProject: fromUi('section.selectProject'),
  patchNotes: fromUi('section.patchNotes'),
  profile: fromUi('section.profile'),
  questLog: fromUi('section.questLog'),
  achievements: fromUi('section.achievements'),
  inventory: fromUi('section.inventory'),
  skills: fromUi('section.skills'),
  jobFit: fromUi('section.jobFit'),
  documents: fromUi('section.documents'),
  interests: fromUi('section.interests'),
  inProgress: fromUi('section.inProgress'),
  forLabs: fromUi('section.forLabs'),
  github: fromUi('section.github'),
  figures: fromUi('section.figures'),
  links: fromUi('section.links'),
  projectDetails: fromUi('section.projectDetails'),
  researchContribution: fromUi('section.researchContribution'),
  pageResearch: same('RESEARCH'),
  pageProjects: same('SELECT YOUR PROJECT'),
  pageRecords: same('RECORDS'),
  heroLabel: same('[ PLAYER PROFILE ]'),
  nowPlaying: same('[ NOW PLAYING ]'),
};

export const gameVariant: Variant = {
  id: 'game',
  prefix: VARIANT_PREFIX.game,
  modules: VARIANT_MODULES.game,
  layout: 'base',
  theme: 'hud',
  identity: {
    headline: { ko: '게임 데이터 분석가 · 연구자', en: 'Game Data Analyst · Researcher' },
    siteTitle: { ko: '백성은 · 게임 데이터 분석가·연구자', en: 'Seongeun Baek · Game Data Analyst & Researcher' },
    tagline: { ko: '플레이어를 예측하는 데서 멈추지 않고, 이해하는 데이터를 만듭니다.', en: 'Beyond predicting players: building data that explains them.' },
    status: {
      ko: '{person.graduation} 석사 졸업 예정 · 게임 데이터 분석가 채용과 박사과정 진학을 함께 준비하고 있습니다.',
      en: 'M.S. expected {person.graduation} · Pursuing game data analyst roles and Ph.D. programs in parallel.',
    },
    about: {
      ko: '부산대학교 데이터사이언스전문대학원 석사과정에서 게임 데이터를 연구하고 있습니다. 리그 오브 레전드의 공개 경기 기록(Riot API)으로 교전 결과를 예측한 연구를 {pub.cog-2026-engagement.venueShort}에서 구두 발표했습니다. 공공데이터 경진대회와 팀 프로젝트에서는 공간 데이터 분석과 예측 모델을 맡았습니다.',
      en: 'I am an M.S. student at the Graduate School of Data Science, Pusan National University, working on game data. I presented a study that predicts the outcome of kill-conditioned engagements in League of Legends from public match records (Riot API) as an oral paper at {pub.cog-2026-engagement.venueShort}. In public-data competitions and team projects, I worked on spatial data analysis and predictive models.',
    },
    labNote: {
      title: { ko: '게임 연구실 교수님께', en: 'For game research labs' },
      body: {
        ko: '공개 게임 데이터로 재현할 수 있는 벤치마크를 만들고, 무엇을 예측할 수 있고 무엇은 할 수 없는지까지 재는 연구를 이어 가고 싶습니다. 대규모 경기 로그의 수집과 정제, 시간 순서를 지킨 평가, 결과의 한계를 글로 정리하는 일을 직접 해 왔고, 그 결과를 {pub.cog-2026-engagement.venueShort}에서 구두 발표했습니다. {person.graduation} 석사 졸업 예정이며 박사과정 진학을 준비하고 있습니다. 연구 주제나 면담에 관해서는 이메일로 연락해 주세요.',
        en: 'I want to keep building reproducible benchmarks from public game data and measuring what can be predicted and what cannot. I have done the large-scale match log collection and cleaning, the time-ordered evaluation, and the write-up of limitations myself, and gave an oral presentation of the results at {pub.cog-2026-engagement.venueShort}. I expect to finish my master’s in {person.graduation} and am preparing to apply to Ph.D. programs. Please email me about research topics or a meeting.',
      },
    },
  },
  orders: {
    homeFeatured: ['pub:cog-2026-engagement', 'project:school-zone-blindspots', 'project:kickick-park'],
    // P2 Task 6 (P-07 F-062, owner decision 13, audit 2026-09-29): the page-less card comes before youth-startup-location,
    // so a linked case study closes the grid. With seven cards (owner 2026-10-08: resort-menu-demand) the rows fill
    // at two and at four columns, and the span-2 selector of ProjectCartridge (an even last card) no longer applies.
    projectsOrder: ['pub:cog-2026-engagement', 'project:school-zone-blindspots', 'project:kickick-park', 'project:resort-menu-demand', 'project:kbo-attendance', 'project:seoul-apartment-automl', 'project:youth-startup-location'],
    recordsProjectsOrder: ['project:school-zone-blindspots', 'project:kickick-park', 'project:youth-startup-location', 'project:resort-menu-demand', 'project:kbo-attendance', 'project:seoul-apartment-automl'],
    // A-17: equals today's end-month sort (tests/unit/resume-model.test.ts pins that).
    pdfProjectOrder: ['pub:cog-2026-engagement', 'project:youth-startup-location', 'project:school-zone-blindspots', 'project:kickick-park'],
  },
  jobfit: 'game',
  documents: { resume: { ko: 'resume-ko', en: 'resume-en' }, academic: 'cv-academic', list: ['resume-ko', 'resume-en', 'cv-academic'] },
  nav: [
    { key: 'research', base: BASE_PATH.research },
    { key: 'projects', base: BASE_PATH.projects },
    { key: 'records', base: BASE_PATH.records },
    { key: 'player-log', base: BASE_PATH.playerLog },
  ],
  captions: GAME_CAPTIONS,
  pageMeta: {
    home: {
      ko: { title: '백성은 · 게임 데이터 분석가·연구자', description: '게임 데이터 분석가·연구자 백성은의 포트폴리오. 연구, 프로젝트, 이력서, 플레이 로그.' },
      en: { title: 'Seongeun Baek · Game Data Analyst & Researcher', description: 'Portfolio of Seongeun Baek, game data analyst and researcher. Research, projects, résumé, and player log.' },
    },
    records: {
      ko: { title: '기록·이력서 · 백성은', description: '학력, 수상, 자격, 기술, 게임사 데이터 분석가 지원 요건 대응표와 이력서 PDF.' },
      en: { title: 'Records & CV · Seongeun Baek', description: 'Education, awards, certifications, skills, a job-requirements fit table, and résumé PDFs.' },
    },
  },
};
