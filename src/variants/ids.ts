// src/variants/ids.ts — version ids, prefixes, the game-module list and page sets (spec §4.2, §4.3, contract §1.2).
// Import-free and erasable TypeScript only: plain Node (scripts/*), src/lib/routes.ts and the inline-script builders
// import this file (tests/unit/toolchain.test.ts).

export const VARIANT_IDS = ['game', 'data'] as const;
export type VariantId = (typeof VARIANT_IDS)[number];
/** Values of <html data-variant>. 'neutral' = chooser, shared pages, 404. */
export type PageVariant = VariantId | 'neutral';

export function isVariantId(value: unknown): value is VariantId {
  return (VARIANT_IDS as readonly unknown[]).includes(value);
}

export const VARIANT_PREFIX: { readonly game: '/game'; readonly data: '/data' } = { game: '/game', data: '/data' };

/** §4.3: the one list of game modules. B-2, §4.2 and §12 all point here. */
export const MODULE_IDS = ['characterArt', 'mainMenu', 'bgm', 'sfx', 'achievements', 'crtIntro', 'playerLog', 'audienceGame'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];
export const VARIANT_MODULES: Readonly<Record<VariantId, readonly ModuleId[]>> = { game: MODULE_IDS, data: [] };

/** CA-1: base paths by name (Korean form, version-free, trailing slash). Views and pages name paths through this. */
export const BASE_PATH = {
  home: '/',
  research: '/research/',
  projects: '/projects/',
  records: '/records/',
  playerLog: '/player-log/',
  privacy: '/privacy/',
  credits: '/credits/',
  stats: '/stats/',
} as const;

/** Static (non-detail) pages per version, as base paths. routes.ts adds every paper and project page to both. */
export const VARIANT_STATIC_PATHS: Readonly<Record<VariantId, readonly string[]>> = {
  game: [BASE_PATH.home, BASE_PATH.research, BASE_PATH.projects, BASE_PATH.records, BASE_PATH.playerLog],
  data: [BASE_PATH.home, BASE_PATH.research, BASE_PATH.projects, BASE_PATH.records],
};

/** R-2: version-free public pages; their URLs do not change. */
export const SHARED_PATHS = [BASE_PATH.privacy, BASE_PATH.credits, BASE_PATH.stats] as const;
export type SharedPath = (typeof SHARED_PATHS)[number];
export const CHOOSER_PATH = '/';

/** Old URLs (the published game version) redirect to this version. */
export const LEGACY_VARIANT: VariantId = 'game';
/** §5.5: old home anchors that the chooser forwards to /game/#… regardless of the saved choice. */
export const LEGACY_HOME_ANCHORS = ['main-menu', 'featured-projects', 'research-highlight', 'patch-notes', 'hello'] as const;
