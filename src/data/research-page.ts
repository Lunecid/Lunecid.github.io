// Copy for /research/ and /en/research/. Korean first, English second.
// The three interest titles are also the Academic CV research interests (resume.yaml profile.researchInterests,
// P1-19; tests/content/records.test.ts keeps the two lists equal).
// `ongoing` lists work that is still in progress only.
// The #for-labs block text is version copy: identity.labNote in src/variants/{game,data}.ts (R-3); the e-mail is SITE.email.

export const researchPage = {
  intro: {
    ko: '게임이 남기는 로그로 플레이어의 선택과 팀 플레이를 연구합니다. 부산대학교 데이터사이언스전문대학원 데이터사이언스연구실(DataLab, 지도교수 권준호)에서 석사과정을 밟고 있습니다.',
    en: 'I study player decisions and team play through the logs games leave behind. I am a master’s student in the Data Science Lab (DataLab, advisor Prof. Joonho Kwon) at the Graduate School of Data Science, Pusan National University.',
  },

  interests: [
    {
      id: 'logs',
      // One real figure per interest (P1-9): the kill-gap KDE, the paper's Fig. 1, the AUC chart (InterestCards.astro).
      figure: 'kill-gap',
      title: { ko: '로그로 읽는 플레이어 행동', en: 'Player behavior from logs' },
      body: {
        ko: '게임이 남기는 사건 기록과 상태 기록에서 플레이어의 선택을 복원합니다. 대규모 경기 데이터를 정제하고, 기록에 무엇이 담기고 무엇이 빠지는지부터 확인합니다.',
        en: 'I reconstruct player decisions from the event and state records games produce. I work with large match datasets and start by checking what the records capture and what they leave out.',
      },
    },
    {
      id: 'graphs',
      figure: 'label-horizon',
      title: { ko: '시간과 공간 속의 팀 플레이', en: 'Team play in space and time' },
      body: {
        ko: '플레이어를 서로 연결된 그래프로 보고, 교전과 이동, 생존을 시간과 공간 위에서 모델링합니다. 그래프 신경망과 시공간 모델을 씁니다.',
        en: 'I treat players as a connected graph and model fights, movement, and survival over time and space, using graph neural networks and spatiotemporal models.',
      },
    },
    {
      id: 'readable',
      figure: 'auc',
      title: { ko: '읽을 수 있는 결과', en: 'Results people can read' },
      body: {
        ko: '모델의 수치를 기획자와 플레이어가 읽을 수 있는 그림과 문장으로 옮깁니다. 어떤 상황에서 예측이 맞고 어디서 한계가 생기는지 함께 보여 줍니다.',
        en: 'I turn model outputs into figures and plain sentences that designers and players can read, and show where predictions hold and where they break down.',
      },
    },
  ],

  ongoing: [
    {
      id: 'cog-journal',
      status: { ko: '준비 중', en: 'In preparation' },
      title: { ko: 'CoG 2026 논문의 저널 확장', en: 'Journal extension of the CoG 2026 paper' },
      body: {
        ko: '교전을 나누는 기준을 데이터 분포로 점검하고, 교전 가치의 정의와 평가를 넓히고 있습니다.',
        en: 'Checking the engagement boundaries against the data distribution, and broadening how engagement value is defined and evaluated.',
      },
      href: '/research/cog-2026-engagement/',
    },
    {
      id: 'ms-thesis',
      status: { ko: '준비 중 · 2027년 2월 졸업 예정', en: 'In preparation · expected Feb 2027' },
      title: { ko: '석사 학위논문: 리그 오브 레전드 교전의 전략적 가치', en: 'M.S. thesis: the strategic value of League of Legends engagements' },
      body: {
        ko: '공개 경기 기록(Riot API)으로 교전을 구성하고, 교전 전후 추정 승리 확률의 변화로 교전의 가치를 정의한 뒤, 교전 전 정보로 그 변화를 예측합니다.',
        en: 'Builds engagements from public match records (Riot API), defines an engagement’s value as the change in estimated win probability across it, and predicts that change from pre-engagement information.',
      },
      href: null,
    },
    {
      id: 'pubg-survival',
      status: { ko: '진행 중', en: 'Ongoing' },
      title: { ko: 'PUBG 시공간 그래프 생존 모델', en: 'PUBG spatiotemporal graph survival model' },
      body: {
        ko: '배틀그라운드 경기를 시간 단계별 그래프(플레이어, 팀, 자기장)로 만들고, 플레이어가 언제 탈락할지 위험도를 예측하는 생존 모델을 만들고 있습니다.',
        en: 'Represents each PUBG match as a sequence of graphs (players, teams, the play zone) and builds a survival model that predicts each player’s elimination risk over time.',
      },
      // Not linked yet: PUBG_Lab stays unlinked until the owner marks the repository ready.
      href: null,
    },
  ],
} as const;
