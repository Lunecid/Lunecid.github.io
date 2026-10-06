// The growth infographic "성장하는 데이터 분석가" on the research pages (owner-approved prototype, 2026-10-06): a
// quest log on the game version, research-report lanes on the general version. This file holds only what the sources
// do not: which source each step reads, the ordinal levels, and the copy. Every fact (period, team, role sentence,
// teammates' tools, award, rank, numbers, titles, statuses' items) is derived by src/lib/growth.ts from the project
// frontmatter, awards.yaml, resume.yaml, the publications, research-page.ts and research/cog-2026.ts.
// Copy holds facts only as tokens (tests/unit/fact-lint.test.ts scans this module).
import type { Localized } from '../i18n/utils';
import type { ProjectSlug } from '../lib/routes';

/**
 * Role and method levels are ordinals, never scores or percentages.
 *
 * Role: a reading of the role sentence on each project page ("내 역할"), ordered by the scope of responsibility.
 *   1 = one stage of the team's pipeline (one kind of work: data collection; or data exploration + engineering)
 *   2 = several stages (topic, processing, visualisation, web …; LG Aimers: the modelling and training pipeline)
 *   3 = led the problem definition and analysis direction (the role sentence says 주도 / "Led")
 *   4 = first author (the owner is the publication's first author)
 * Method: modelling sophistication as the site describes each step; null when the modelling was the teammates' part
 * (shown as such, never as a level).
 *   1 = visualisation-centred · 2 = a trained model with spatial cross-validation · 3 = a demand-forecasting
 *   competition with a leaderboard rank · 4 = model–representation pairings under a chronological patch holdout
 * tests/unit/growth.test.ts pins level 3 ⇔ 주도 and level 4 ⇔ first author.
 */
export type GrowthLevel = 1 | 2 | 3 | 4;
export const GROWTH_LEVELS: readonly GrowthLevel[] = [1, 2, 3, 4];

export type GrowthSource =
  | { kind: 'project'; slug: ProjectSlug }
  /** resume.yaml activities[id] */
  | { kind: 'activity'; id: string }
  /** publications/<id>.md with resume.yaml publicationProject */
  | { kind: 'paper'; id: string };

/** A quantity on the log-scale lane: a fact token (braces included) whose value is a number on the site ("240,064", "약 100만"). */
export interface GrowthScaleDef {
  token: string;
  unit: Localized;
}

export interface GrowthStepDef {
  id: string;
  source: GrowthSource;
  role: GrowthLevel;
  method: GrowthLevel | null;
  /** The role sentence where the site has none. */
  roleText?: Localized;
  /** Method lane text where method is not null. */
  methodText?: Localized;
  /** The modelling or analysis that was not the owner's (from the summary / role sentence), and whose it was. */
  teamNote?: Localized;
  teamNoteBy?: 'teamPart' | 'teamWork';
  /** The data lane's qualitative source line. */
  data?: Localized;
  scale?: readonly GrowthScaleDef[];
  /** Organisation and kind of a step that is not a project (projects carry org and type). */
  org?: Localized;
  type?: Localized;
}

const COG = 'cog-2026-engagement';
const ZONE = 'school-zone-blindspots';

/** Chronological (period start, then end); src/lib/growth.ts checks the order. */
export const growthSteps: readonly GrowthStepDef[] = [
  {
    id: 'seoul-apartment-automl',
    source: { kind: 'project', slug: 'seoul-apartment-automl' },
    role: 2,
    method: 1,
    methodText: { ko: 'Tableau 시각화', en: 'Tableau visualization' },
    // summary: "4인 팀이 AutoML로 … 모델을 골랐고"; role: "모델링을 제외한 전 과정"
    teamNote: { ko: 'AutoML 모델 선택', en: 'Model selection with AutoML' },
  },
  {
    id: 'kickick-park',
    source: { kind: 'project', slug: 'kickick-park' },
    role: 2,
    method: null,
    // summary: "5인 팀이 반납 사진 주차 판정 모델을 학습했고"; teamTools YOLOv8, PyTorch
    teamNote: { ko: '주차 판정 모델', en: 'The parking-judgement model' },
    // audience.research: "공공데이터로 자치구·행정동의 입지 우선순위를 매긴 뒤"
    data: { ko: '공공데이터(입지 탐색)', en: 'Public data (site search)' },
  },
  {
    id: 'kbo-attendance',
    source: { kind: 'project', slug: 'kbo-attendance' },
    role: 1,
    method: null,
    // summary: "구단 성적과 관중 수의 관계를 4인 팀이 통계적으로 검정한"
    teamNote: { ko: '구단 성적과 관중 수의 통계 검정', en: 'Statistical tests of team performance and attendance' },
    teamNoteBy: 'teamWork',
    data: { ko: '웹 크롤링 수집', en: 'Web crawling' },
  },
  {
    id: ZONE,
    source: { kind: 'project', slug: ZONE },
    role: 3,
    method: 2,
    methodText: {
      ko: `XGBoost + 공간 교차검증({project.${ZONE}.fact.blocks}개 지리 블록)`,
      en: `XGBoost + spatial cross-validation ({project.${ZONE}.fact.blocks} geographic blocks)`,
    },
    data: { ko: `공공데이터 {project.${ZONE}.fact.sources}종`, en: `{project.${ZONE}.fact.sources} public datasets` },
    scale: [{ token: `{project.${ZONE}.fact.points}`, unit: { ko: '지점', en: 'points' } }],
  },
  {
    id: 'youth-startup-location',
    source: { kind: 'project', slug: 'youth-startup-location' },
    role: 1,
    method: null,
    // summary: "4인 팀이 … 음식점 매출을 예측한 프로젝트로, 저는 데이터 탐색과 엔지니어링을"; teamTools
    teamNote: { ko: '군집 분석·매출 예측 모델링', en: 'Clustering and sales-forecast modeling' },
    data: { ko: '생활인구·소비매출·음식점 데이터', en: 'Floating-population, spending and restaurant data' },
  },
  {
    id: 'lg-aimers-7',
    source: { kind: 'activity', id: 'lg-aimers-7' },
    // owner, 2026-10-06: the role sentence below is the owner's answer (the site had none); team size unknown → not shown.
    role: 2,
    roleText: { ko: '모델링 및 학습 파이프라인 설계 전반', en: 'Designed the modeling and training pipeline end to end' },
    method: 3,
    methodText: { ko: '메뉴 수요 예측', en: 'Menu demand forecasting' },
    // resume.yaml: "아래 결과는 DACON 프로필 기록이다" (the activity's href is the DACON profile)
    org: { ko: 'DACON', en: 'DACON' },
    type: { ko: '해커톤', en: 'Hackathon' },
  },
  {
    id: COG,
    source: { kind: 'paper', id: COG },
    role: 4,
    roleText: {
      ko: `제1저자. 공개 경기 기록(Riot API) {pub.${COG}.fact.matches}경기에서 {pub.${COG}.fact.engagements} 개 교전을 구성하고, 패치 단위 시간순 홀드아웃으로 평가했습니다.`,
      en: `First author. Built {pub.${COG}.fact.engagements} engagements from {pub.${COG}.fact.matches} public matches (Riot API) and evaluated them with a chronological patch holdout.`,
    },
    method: 4,
    // the builder puts the pairing count (research/cog-2026.ts overallAuc) and the best model in front of / after this
    methodText: { ko: `시간순 패치 홀드아웃 · 최고 AUC {pub.${COG}.fact.bestAuc}`, en: `chronological patch holdout · best AUC {pub.${COG}.fact.bestAuc}` },
    data: { ko: '공개 경기 기록(Riot API)', en: 'Public match records (Riot API)' },
    scale: [
      { token: `{pub.${COG}.fact.matches}`, unit: { ko: '경기', en: 'matches' } },
      { token: `{pub.${COG}.fact.engagements}`, unit: { ko: '교전', en: 'engagements' } },
    ],
    type: { ko: '연구', en: 'Research' },
  },
];

/** Open slots after the timeline: titles and statuses from research-page.ts ongoing (statuses: RESEARCH_STATUS, owner
 *  ruling 2026-10-06). The PUBG slot keeps the owner's short label instead of the study's working title. */
export const growthFuture: readonly { id: string; ongoing: string; label?: Localized }[] = [
  { id: 'cog-journal', ongoing: 'cog-journal' },
  // the part of the thesis title before the colon
  { id: 'ms-thesis', ongoing: 'ms-thesis' },
  // owner, 2026-10-06: no title and no claims yet, only the label
  { id: 'pubg', ongoing: 'pubg-survival', label: { ko: '배틀그라운드 연구', en: 'PUBG study' } },
];

export const growthCopy = {
  title: { ko: '성장하는 데이터 분석가', en: 'Growing as a data analyst' },
  captionGame: { ko: 'QUEST LOG', en: 'QUEST LOG' },
  captionData: { ko: '성장 기록', en: 'Growth' },
  lede: {
    ko: `첫 팀 프로젝트에서는 파이프라인의 한 부분을 맡았습니다. 공모전에서는 팀의 문제 정의와 분석 방향을 이끌었고, 지금은 지도교수와 함께 쓴 {pub.${COG}.venueShort} 논문의 제1저자입니다.`,
    en: `In my first team project I took one part of the pipeline. In a competition I led the team’s problem framing and analysis direction, and now I am the first author of a {pub.${COG}.venueShort} paper written with my advisor.`,
  },
  ledeData: {
    ko: '프로젝트와 연구를 역할·방법·데이터·협업 네 갈래로 나란히 놓았습니다. 역할은 팀 파이프라인의 한 단계에서 팀의 문제 정의 주도로, 다시 지도교수와의 공동 연구 제1저자로 옮겨 갔습니다.',
    en: 'Projects and research side by side in four lanes: role, method, data and collaboration. The role moved from one stage of a team pipeline to leading a team’s problem framing, and then to first author of joint research with my advisor.',
  },
  role: {
    1: { ko: '한 단계 담당', en: 'One stage' },
    2: { ko: '여러 단계 담당', en: 'Several stages' },
    3: { ko: '문제 정의 주도', en: 'Led problem framing' },
    4: { ko: '제1저자', en: 'First author' },
  },
  /** Short role names for the narrow vertical chart's axis. */
  roleShort: {
    1: { ko: '한 단계', en: 'One stage' },
    2: { ko: '여러 단계', en: 'Several' },
    3: { ko: '주도', en: 'Led' },
    4: { ko: '제1저자', en: 'First author' },
  },
  method: {
    1: { ko: '시각화 중심', en: 'Visualization-led' },
    2: { ko: '모델 학습 + 공간 교차검증', en: 'Model training + spatial cross-validation' },
    3: { ko: '수요 예측 해커톤', en: 'Demand-forecasting hackathon' },
    4: { ko: '모델·표현 조합 비교', en: 'Model–representation pairings' },
  },
  legend: {
    quest: { ko: '퀘스트', en: 'Quest' },
    achievement: { ko: '업적(수상·발표)', en: 'Achievement (award, talk)' },
    locked: { ko: '진행 중 · 예정', en: 'In progress · planned' },
    levels: { ko: '단계는 서열이며 점수가 아닙니다', en: 'Levels are an order, not a score' },
    award: { ko: '수상', en: 'Award' },
    talk: { ko: '학회 발표', en: 'Conference talk' },
    rank: { ko: '순위 · 진행 중', en: 'Rank · in progress' },
    me: { ko: '나', en: 'Me' },
    others: { ko: '팀원·공저자', en: 'Teammates, co-author' },
  },
  mine: { ko: '내 담당', en: 'My part' },
  teamPart: { ko: '팀원 담당', en: 'Team’s part' },
  teamWork: { ko: '팀 작업', en: 'Team work' },
  coAuthor: { ko: '공저자', en: 'Co-author' },
  roleLabel: { ko: '역할', en: 'Role' },
  methodLabel: { ko: '방법', en: 'Method' },
  notOnSite: { ko: '사이트에 기재 없음', en: 'Not stated on the site' },
  teamUnknown: { ko: '팀 구성 기재 없음', en: 'Team not stated' },
  next: { ko: '다음', en: 'Next' },
  start: { ko: 'START', en: 'START' },
  lanes: {
    project: { ko: '프로젝트', en: 'Project' },
    result: { ko: '성과', en: 'Result' },
    role: { ko: '역할', en: 'Role' },
    method: { ko: '방법', en: 'Method' },
    scale: { ko: '데이터', en: 'Data' },
    scaleSub: { ko: '규모 · 로그', en: 'Scale · log' },
    source: { ko: '출처', en: 'Source' },
    team: { ko: '협업', en: 'Team' },
  },
  laneAlt: {
    role: { ko: '역할 단계 계단 그래프', en: 'Step chart of the role level' },
    scale: { ko: '데이터 규모(로그 척도). 다른 프로젝트는 사이트에 규모 수치가 없습니다', en: 'Data scale (log scale). The other projects state no size on the site' },
  },
  vrole: {
    title: { ko: '역할 단계', en: 'Role level' },
    note: { ko: '위에서 아래로 시간 순입니다. 오른쪽일수록 맡은 범위가 큽니다.', en: 'Time runs top to bottom; further right means a wider role.' },
  },
  party: {
    kicker: { ko: 'PARTY LOG', en: 'PARTY LOG' },
    title: { ko: '팀의 한 단계에서, 팀의 방향으로, 제1저자로', en: 'From one stage of a team, to its direction, to first author' },
    lede: {
      ko: '모든 퀘스트는 파티 플레이였습니다. 내가 맡은 부분과 팀원이 맡은 부분을 프로젝트 페이지에 적힌 그대로 나눴습니다. 팀원의 작업은 내 기술로 적지 않습니다.',
      en: 'Every quest was party play. My part and my teammates’ part are split as the project pages state them; teammates’ work is never listed as my skill.',
    },
    stage: { ko: 'STAGE', en: 'STAGE' },
  },
  collab: {
    title: { ko: '협업 속에서 맡은 일', en: 'My part within the team' },
    lede: {
      ko: '모든 프로젝트는 팀 작업이었습니다. 내가 맡은 부분과 팀원이 맡은 부분을 나눠 적었고, 팀원의 작업은 ‘팀원 담당’으로 표시합니다.',
      en: 'Every project was team work. My part and the team’s part are listed separately; teammates’ work is marked “Team’s part”.',
    },
  },
  stages: {
    1: { ko: '팀 파이프라인의 한 부분을 맡았습니다', en: 'I took one part of a team pipeline' },
    2: { ko: '팀의 문제 정의와 분석 방향을 이끌었습니다', en: 'I led a team’s problem framing and analysis direction' },
    3: { ko: '지도교수와의 공동 연구, 제1저자', en: 'Joint research with my advisor, as first author' },
  },
  table: {
    toggle: { ko: '표로 보기', en: 'View as table' },
    region: { ko: '성장 기록 표', en: 'Growth table' },
    caption: { ko: '프로젝트별 역할·방법·데이터·협업. 역할·방법 단계는 서열이며 점수가 아닙니다.', en: 'Role, method, data and collaboration per project. Role and method levels are an order, not a score.' },
    period: { ko: '기간', en: 'Period' },
    project: { ko: '프로젝트', en: 'Project' },
    org: { ko: '기관', en: 'Organisation' },
    team: { ko: '팀', en: 'Team' },
    role: { ko: '역할 단계', en: 'Role level' },
    mine: { ko: '내 담당', en: 'My part' },
    others: { ko: '팀원 담당', en: 'Team’s part' },
    method: { ko: '방법', en: 'Method' },
    data: { ko: '데이터', en: 'Data' },
    result: { ko: '성과', en: 'Result' },
  },
  foot: {
    role: { ko: '역할 단계는 각 프로젝트 페이지의 ‘내 역할’ 문구로 나눈 서열입니다', en: 'Role levels are an order read from each project page’s role sentence' },
    method: { ko: '방법 단계', en: 'Method levels' },
    blank: { ko: '팀 구성이 사이트에 없는 항목은 비워 두었습니다.', en: 'Where the site does not state the team, it is left blank.' },
    scale: { ko: '데이터 규모는 사이트에 수치가 있는 연구만 로그 척도에 찍었습니다.', en: 'Only work with a size stated on the site is plotted on the log scale.' },
  },
} as const;

/** The pairing count in front of the CoG method line (the count is research/cog-2026.ts overallAuc.length). */
export const growthPairings: Localized<(n: number) => string> = {
  ko: (n) => `${n}개 모델·표현 조합`,
  en: (n) => `${n} model–representation pairings`,
};
