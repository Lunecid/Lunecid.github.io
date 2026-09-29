---
title: "Kill-Conditioned Engagement Outcome Prediction in League of Legends Under Minute-Resolution Public Telemetry"
# 국문 제목(선택). 목록에는 원제를 그대로 쓰고, 한국어 페이지에서만 "(국문 제목)"을 붙여 보조로 보여 준다.
titleKo: "1분 해상도 공개 텔레메트리에서의 리그 오브 레전드 킬 조건부 교전 결과 예측"
# 기록 페이지 기술 근거 링크에 쓰는 짧은 제목.
shortTitle:
  ko: "리그 오브 레전드 교전 결과 예측"
  en: "Predicting League of Legends engagement outcomes"
# affiliation: 논문 LaTeX(paper/main.tex)의 \IEEEauthorblockA 그대로, 이메일 줄은 뺀다(논문 페이지, D-15).
authors:
  - { name: "Seongeun Baek", nameKo: "백성은", me: true, affiliation: ["Pusan National University", "South Korea"] }
  - { name: "Joonho Kwon", nameKo: "권준호", me: false, affiliation: ["Pusan National University", "South Korea"] }
venue: "IEEE Conference on Games (CoG 2026)"
venueShort: "IEEE CoG 2026"
year: 2026
format: "Oral"
status: "presented"
presentedAt: { venue: "Madrid, Spain", start: "2026-09-01", end: "2026-09-04" }
# 논문 페이지 상태 줄(발표 형식 · 장소 · 날짜). presentedAt은 PDF가 쓴다(formatDateSpan, batch 3b P2-32).
presentation:
  ko: "구두 발표 · 스페인 마드리드 · 2026.09.01–04"
  en: "Oral presentation · Madrid, Spain · Sep 1–4, 2026"
statusNote:
  ko: "IEEE Xplore 게재 예정"
  en: "To appear in IEEE Xplore"
doi: null
pdf: null          # spec §8: accepted manuscript + IEEE notice + DOI, only after the DOI exists
code: "https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026"
caseStudy: "/research/cog-2026-engagement/"
tldr:
  ko: "교전 직전 30초의 공개 경기 기록(Riot API)만으로 교전 뒤 어느 팀이 이득을 볼지 예측하고, 공개 데이터가 보여 주는 것과 보여 주지 못하는 것을 쟀습니다."
  en: "Predicts which team gains from a League of Legends engagement using only the 30 seconds of public match records (Riot API) before it, and measures what those records can and cannot reveal."
bibtex: |
  @inproceedings{baek2026killconditioned,
    author    = {Baek, Seongeun and Kwon, Joonho},
    title     = {Kill-Conditioned Engagement Outcome Prediction in {League of Legends} Under Minute-Resolution Public Telemetry},
    booktitle = {2026 IEEE Conference on Games (CoG)},
    year      = {2026},
    month     = sep,
    address   = {Madrid, Spain},
    publisher = {IEEE},
    note      = {Oral presentation. To appear in IEEE Xplore}
  }
abstract: >-
  We study how much pre-engagement signal is recoverable from the public Riot API
  for League of Legends engagement outcome prediction. Because the API provides
  minute-resolution participant snapshots and sparse millisecond event logs, we
  define a kill-conditioned localized engagement task rather than attempting to
  detect all teamfights. Given the 30 s preceding a retrospectively localized combat
  episode, the goal is to predict which side obtains positive post-engagement
  exchange value under a pre-specified domain-grounded label. From 206,442 Korean
  Master+ ranked solo/duo matches, we construct approximately one million labeled
  engagements across three consecutive patches and evaluate paradigm–representation
  pairings under a chronological patch-holdout protocol. Engineered temporal tabular
  summaries with LightGBM achieve the strongest result, with AUC 0.675. The
  evaluated non-tabular neural baselines cluster between 0.569 and 0.581, while a
  matched-input MLP reaches AUC 0.626, indicating that both the engineered
  representation and the tree-based learner contribute to the gap. Performance
  improves in later-game and one-sided resource states, but close-state engagements
  remain difficult. We interpret the results as measuring public-telemetry
  informativeness: coarse snapshots expose strategic favorability, while
  fine-grained execution remains largely unobserved.
abstractKo: >-
  공개 Riot API에서 리그 오브 레전드 교전 결과 예측에 쓸 수 있는 교전 전 신호가 얼마나
  복원되는지 살펴본다. 이 API는 1분 간격의 참가자 스냅샷과 드문 밀리초 단위 사건 기록을
  제공하므로, 모든 한타를 검출하려 하기보다 킬을 조건으로 하는 국소 교전 과제를 정의한다.
  사후에 위치를 정한 전투 구간의 직전 30초가 주어졌을 때, 미리 정한 도메인 기반 라벨에서
  교전 뒤 교환 가치가 양수인 쪽을 예측하는 것이 목표다. 한국 서버 마스터 이상 솔로 랭크
  206,442경기에서 연속된 세 패치에 걸친 약 100만 개의 라벨된 교전을 만들고, 패치 단위
  시간순 홀드아웃으로 학습 패러다임과 입력 표현의 조합을 평가한다. 시간 요약 통계로 설계한
  표 형식 특징과 LightGBM이 AUC 0.675로 가장 높았다. 평가한 비표 형식 신경망 기준선은
  0.569–0.581에 모였고, 같은 입력을 쓴 MLP는 AUC 0.626에 이르러, 설계한 표현과 트리 기반
  학습기가 모두 격차에 기여함을 보여 준다. 경기 후반과 자원이 한쪽으로 기운 상태에서는
  성능이 오르지만, 팽팽한 상태의 교전은 여전히 어렵다. 이 결과를 공개 텔레메트리의 정보량을
  잰 것으로 해석한다. 거친 스냅샷은 전략적 우세를 드러내지만, 세밀한 교전 수행은 대부분
  관측되지 않는다.
# paper/abstract.tex의 IEEEkeywords 블록 그대로(논문 페이지의 "Index Terms—").
keywords: ["League of Legends", "esports analytics", "engagement-outcome prediction", "public game telemetry"]
thumbnail:
  src: "../../assets/research/cog-2026/label-horizon.webp"
  alt: "Figure 1 of the paper. Top: champion-kill events and 60-second timeline frames pass through temporal clustering, spatial validation, and merging to produce a localized engagement. Bottom: the model observes six 5-second bins before onset and a label window of events decides whether the blue or red side gained."
  altKo: "논문 그림 1. 위: 킬 사건과 60초 타임라인 프레임이 시간 군집화, 공간 검증, 병합을 거쳐 하나의 교전이 됩니다. 아래: 교전 시작 전 5초 구간 6개를 관측하고, 라벨 창의 사건으로 블루 팀과 레드 팀 중 어느 쪽이 이득을 봤는지 정합니다."
highlight: true
card:
  tags: [ml, collection]
  tools: [Python, LightGBM, PyTorch]
facts:
  window: { ko: 30초, en: 30 seconds }
  matchesShort: { ko: 20.6만 경기, en: 206K matches }
---
