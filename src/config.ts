// Site constants. Import-free and erasable TypeScript only: scripts/*.mjs import this file with plain Node (type stripping).
export const SITE = {
  url: 'https://lunecid.github.io',
  email: 'todtjddms104204@pusan.ac.kr',
  githubLogin: 'Lunecid',
  githubUrl: 'https://github.com/Lunecid',
  daconUrl: 'https://dacon.io/myprofile/530929/home',
  labUrl: 'https://datalab.pusan.ac.kr/datalab/index.do',
  repoUrl: 'https://github.com/Lunecid/Lunecid.github.io',
} as const;

export const DOCUMENTS = {
  'resume-ko': '/cv/seongeun-baek-resume-ko.pdf',
  'resume-en': '/cv/seongeun-baek-resume-en.pdf',
  'cv-academic': '/cv/seongeun-baek-cv-academic.pdf',
  // P1-17 (§10.4): the general version's résumés; file names keep the version apart (links already sent stay valid).
  'resume-data-ko': '/cv/seongeun-baek-resume-data-ko.pdf',
  'resume-data-en': '/cv/seongeun-baek-resume-data-en.pdf',
} as const;
export type DocumentId = keyof typeof DOCUMENTS;
export const PRINT_ROUTES: Readonly<Record<DocumentId, string>> = {
  'resume-ko': '/print/resume-ko/',
  'resume-en': '/print/resume-en/',
  'cv-academic': '/print/cv-academic/',
  'resume-data-ko': '/print/resume-data-ko/',
  'resume-data-en': '/print/resume-data-en/',
};

export const MEDIA = {
  bgm: '/audio/bgm/everything-you-ever-dreamed.mp3',
  sfxDir: '/audio/sfx/',
  goatcounterSelfHosted: '/js/count.v5.js',
} as const;

/** The ONLY source of the GoatCounter site code (page script, live total, dashboard link, privacy wording, build-time fetch). */
export const GOATCOUNTER: { readonly code: string | null; readonly sri: string; readonly cdnSrc: string } = {
  code: 'lunecid', // Task 32 step 1: GoatCounter site code (https://lunecid.goatcounter.com); null = not collecting
  sri: 'sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ',
  cdnSrc: 'https://gc.zgo.at/count.v5.js',
};

export const STORAGE_KEYS = {
  motion: 'sb:motion', // localStorage 'on' | 'off'
  sound: 'sb:sound', // localStorage 'on' | 'off'
  achievements: 'sb:achievements', // localStorage JSON Record<achievementId, ISO timestamp>
  visits: 'sb:visits', // localStorage JSON { sections: NavSection[]; langs: Lang[] }
  intro: 'sb:intro', // sessionStorage '1' once the CRT intro played (or was skipped)
  variant: 'sb:variant', // localStorage 'game' | 'data': the chooser choice (written only by the chooser and the version switch, A-7)
  bgmTime: 'sb:bgm-t', // sessionStorage JSON { t, at }: BGM resume position (N20), ignored after 30 min
} as const;

export const NAV_HEIGHT_PX = 52;

/** Preflight Q13: HUD/read section labels use muted grey (not lime accent). */
export const HUD_LABEL_LIME = false;

/** Preflight Q19: Riot notice on the CoG paper page. false = named on /credits/ only. */
export const RIOT_NOTICE_ON_PAGES = false;
