// src/variants/data.ts — the general data analyst version (B-1, B-2, B-6, B-10, B-12). P1: same views and HUD layout with
// the game modules off; P2 designs it. Copy is fact-free apart from tokens (R-4). P2-9 may reword `about`, never add facts.
import { BASE_PATH, VARIANT_MODULES, VARIANT_PREFIX } from './ids';
import { gameVariant } from './game';
import type { Variant } from './types';

export const dataVariant: Variant = {
  id: 'data',
  prefix: VARIANT_PREFIX.data,
  modules: VARIANT_MODULES.data,
  layout: 'data',
  theme: 'editorial',
  identity: {
    headline: { ko: '데이터 분석가', en: 'Data Analyst' },
    siteTitle: { ko: '백성은 · 데이터 분석가', en: 'Seongeun Baek · Data Analyst' },
    tagline: { ko: '질문을 데이터로 바꾸고, 결과를 결정으로 잇습니다.', en: 'I turn questions into data, and results into decisions.' },
    status: { ko: '{person.graduation} 석사 졸업 예정', en: 'M.S. expected {person.graduation}' },
    about: {
      ko: '부산대학교 데이터사이언스전문대학원 석사과정에 재학하고 있습니다. 공공데이터 경진대회에서 주제 제안부터 데이터 처리, 예측 모델, 공간 매핑, 시각화까지 전 과정을 함께했고, 팀 프로젝트에서는 주제 선정과 데이터 수집·전처리, 시각화, 웹페이지 구현을 맡았습니다. 공개 경기 기록으로 교전 결과를 예측한 연구를 {pub.cog-2026-engagement.venueShort}에서 구두 발표했습니다.',
      en: 'I am an M.S. student at the Graduate School of Data Science, Pusan National University. In a public-data competition I took part in the whole process, from proposing the topic to data processing, the predictive model, spatial mapping and visualization; in team projects I handled topic selection, data collection and preprocessing, visualization and building a website. I presented a study that predicts engagement outcomes from public match records as an oral paper at {pub.cog-2026-engagement.venueShort}.',
    },
    labNote: {
      title: { ko: '연구실 안내', en: 'For research labs' },
      body: gameVariant.identity.labNote.body, // B-10: the block stays, only the title is neutral
    },
  },
  orders: {
    homeFeatured: ['project:school-zone-blindspots', 'project:youth-startup-location', 'project:kickick-park'],
    projectsOrder: ['project:school-zone-blindspots', 'project:youth-startup-location', 'project:kickick-park', 'pub:cog-2026-engagement', 'project:kbo-attendance', 'project:seoul-apartment-automl'],
    recordsProjectsOrder: ['project:school-zone-blindspots', 'project:youth-startup-location', 'project:kickick-park', 'project:kbo-attendance', 'project:seoul-apartment-automl'],
    pdfProjectOrder: ['project:school-zone-blindspots', 'project:youth-startup-location', 'project:kickick-park', 'pub:cog-2026-engagement'],
  },
  jobfit: 'data',
  documents: { resume: { ko: 'resume-data-ko', en: 'resume-data-en' }, academic: 'cv-academic', list: ['resume-data-ko', 'resume-data-en', 'cv-academic'] },
  nav: [
    { key: 'research', base: BASE_PATH.research },
    { key: 'projects', base: BASE_PATH.projects },
    { key: 'records', base: BASE_PATH.records },
  ],
  // Spec §8 editorial caption table: a quiet caption in the page language over each title (never the title again).
  captions: {
    research: { ko: '연구', en: 'Research' },
    publications: { ko: '연구 성과', en: 'Research output' },
    projects: { ko: '작업', en: 'Work' },
    selectProject: { ko: '작업', en: 'Work' },
    patchNotes: { ko: '소식', en: 'News' },
    profile: { ko: '프로필', en: 'Profile' },
    questLog: { ko: '이력', en: 'Background' },
    achievements: { ko: '성과', en: 'Recognition' },
    inventory: { ko: '이력', en: 'Background' },
    skills: { ko: '역량', en: 'Capabilities' },
    jobFit: { ko: '직무 적합성', en: 'Role fit' },
    documents: { ko: '문서', en: 'Documents' },
    interests: { ko: '연구', en: 'Research' },
    inProgress: { ko: '연구', en: 'Research' },
    forLabs: { ko: '연락', en: 'Contact' },
    github: { ko: '코드', en: 'Code' },
    figures: { ko: '자료', en: 'Materials' },
    links: { ko: '자료', en: 'Materials' },
    projectDetails: { ko: '프로젝트', en: 'Project' },
    researchContribution: { ko: '의의', en: 'Significance' },
    pageResearch: { ko: '포트폴리오', en: 'Portfolio' },
    pageProjects: { ko: '포트폴리오', en: 'Portfolio' },
    pageRecords: { ko: '포트폴리오', en: 'Portfolio' },
    heroLabel: { ko: '포트폴리오', en: 'Portfolio' },
    nowPlaying: { ko: '진행 중', en: 'Ongoing' },
  },
  pageMeta: {
    home: {
      ko: { title: '백성은 · 데이터 분석가', description: '데이터 분석가 백성은의 포트폴리오. 연구, 프로젝트, 이력서.' },
      en: { title: 'Seongeun Baek · Data Analyst', description: 'Portfolio of Seongeun Baek, data analyst. Research, projects, and résumé.' },
    },
    records: {
      ko: { title: '기록·이력서 · 백성은', description: '학력, 수상, 자격, 기술, 데이터 분석가 지원 요건 대응표와 이력서 PDF.' },
      en: gameVariant.pageMeta.records.en,
    },
    projects: {
      ko: { title: '프로젝트 · 백성은', description: '공공데이터 경진대회, 부산시·부산테크노파크 데이토리 랩(Datory Lab) 과제, 멀티캠퍼스 부트캠프 프로젝트와 연구에서 한 데이터 분석 사례 연구입니다. 질문·데이터·방법·결과와 제 역할을 적었습니다.' },
      en: { title: 'Projects · Seongeun Baek', description: 'Data analysis case studies from a public-data competition, a Busan Technopark Datory Lab task, a Multicampus bootcamp and research, with my role in each.' },
    },
    research: {
      ko: { title: '연구 · 백성은', description: '공개 경기 기록으로 교전 결과를 예측한 논문과 진행 중인 연구, 연구 관심사입니다.' },
      en: { title: 'Research · Seongeun Baek', description: 'A paper that predicts engagement outcomes from public match records, work in progress, and research interests.' },
    },
  },
};
