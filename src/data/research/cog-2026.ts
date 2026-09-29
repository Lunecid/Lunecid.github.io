// Numbers and figure copy for the CoG 2026 AUC charts. The CoG page itself shows the abstract only since D-15;
// overallAuc / figureCopy.aucOverall feed the home hero artefact and the cartridge AucLabel. Keep them in sync.
// All AUCs: held-out test on patch 15.16, mean of three seeds (paper/result.tex).

export const CHANCE_AUC = 0.5;

type L = { ko: string; en: string };

// src: paper/result.tex, table tab:main-results ("Held-out AUC on patch 15.16")
export const overallAuc: ReadonlyArray<{
  id: string; model: string; view: L; auc: number; group: 'tabular' | 'neural'; highlight?: boolean;
}> = [
  { id: 'lightgbm',    model: 'LightGBM',    view: { ko: '설계한 표 형식', en: 'engineered tabular' },    auc: 0.675, group: 'tabular', highlight: true },
  { id: 'mlp',         model: 'MLP',         view: { ko: '같은 표 입력',   en: 'same tabular input' },    auc: 0.626, group: 'tabular' },
  { id: 'bigru',       model: 'Bi-GRU',      view: { ko: '거시 시퀀스',    en: 'macro sequence' },        auc: 0.581, group: 'neural' },
  { id: 'layered',     model: 'Layered',     view: { ko: '결합',          en: 'fusion' },                auc: 0.581, group: 'neural' },
  { id: 'transformer', model: 'Transformer', view: { ko: '거시 시퀀스',    en: 'macro sequence' },        auc: 0.576, group: 'neural' },
  { id: 'crossattn',   model: 'Cross-Attn',  view: { ko: '사건–선수',      en: 'event–player' },          auc: 0.571, group: 'neural' },
  { id: 'stgnn',       model: 'ST-GNN',      view: { ko: '시공간 그래프',  en: 'spatio-temporal graph' }, auc: 0.569, group: 'neural' },
  { id: 'graphsage',   model: 'GraphSAGE',   view: { ko: '선수 그래프',    en: 'player graph' },          auc: 0.569, group: 'neural' },
];

// Captions and alt texts kept for charts still in use (from the removed case-study Markdown, D-15).
// The AUC alt texts spell out every number of overallAuc (tests/content/research.test.ts).
export const figureCopy: Readonly<Record<'aucOverall' | 'killGap' | 'labelHorizon', { caption: L; alt: L }>> = {
  aucOverall: {
    caption: {
      ko: '15.16 패치 테스트 AUC, 세 시드 평균. 세로선은 우연 수준(0.5)입니다.',
      en: 'Test AUC on patch 15.16, mean of three seeds. The vertical line marks chance (0.5).',
    },
    alt: {
      ko: '모델별 AUC 점 그래프. LightGBM 0.675, 같은 입력의 MLP 0.626, Bi-GRU 0.581, 결합 모델 0.581, Transformer 0.576, 교차 어텐션 0.571, ST-GNN 0.569, GraphSAGE 0.569. 모두 우연 수준 0.5보다 높습니다.',
      en: 'Dot plot of AUC by model: LightGBM 0.675, MLP on the same input 0.626, Bi-GRU 0.581, layered fusion 0.581, Transformer 0.576, cross-attention 0.571, ST-GNN 0.569, GraphSAGE 0.569. All are above chance at 0.5.',
    },
  },
  // kill-gap-kde.webp (follow-up work, not in the CoG paper): caption/alt from the removed case-study Markdown (D-15).
  // Caption numbers are the labels printed on the figure itself (shaded ARI band, valley G, modes, n).
  killGap: {
    caption: {
      ko: '후속 연구: 세 패치에서 이어진 킬 사이 간격(n = 10,417,458)의 로그 척도 분포입니다. 봉우리는 5.72초와 62.73초이고, 그 사이 골짜기 G는 13.72초입니다. 음영 구간은 ARI ≥ 0.9인 10–18초입니다.',
      en: 'Follow-up work: the distribution of inter-kill gaps across three patches (n = 10,417,458, log scale). Modes at 5.72 s and 62.73 s; valley G at 13.72 s. The shaded band is ARI ≥ 0.9 (10–18 s).',
    },
    alt: {
      ko: '킬 간격 분포 곡선. 5.72초와 62.73초에 두 봉우리가 있고 그 사이 13.72초에 골짜기가 있습니다. 10초에서 18초 사이가 음영으로 표시되어 있습니다.',
      en: 'Density curve of inter-kill intervals with peaks at 5.72 and 62.73 seconds and a valley at 13.72 seconds. The band from 10 to 18 seconds is shaded.',
    },
  },
  // label-horizon.webp = the paper's Fig. 1 (its alt texts were the publication thumbnail's until P1-8; the thumbnail
  // is now kill-gap-kde.webp with the killGap alt, P-01/F-045).
  labelHorizon: {
    caption: {
      ko: 'CoG 2026 논문 그림 1: 교전 구간을 찾는 과정과 예측 설정입니다.',
      en: 'CoG 2026 paper, Fig. 1: engagement localization and the prediction setting.',
    },
    alt: {
      ko: '논문 그림 1. 위: 킬 사건과 60초 타임라인 프레임이 시간 군집화, 공간 검증, 병합을 거쳐 하나의 교전이 됩니다. 아래: 교전 시작 전 5초 구간 6개를 관측하고, 라벨 창의 사건으로 블루 팀과 레드 팀 중 어느 쪽이 이득을 봤는지 정합니다.',
      en: 'Figure 1 of the paper. Top: champion-kill events and 60-second timeline frames pass through temporal clustering, spatial validation, and merging to produce a localized engagement. Bottom: the model observes six 5-second bins before onset and a label window of events decides whether the blue or red side gained.',
    },
  },
};
