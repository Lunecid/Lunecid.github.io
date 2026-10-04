// src/islands/account/ManagePanel.tsx — the owner management section (account-link spec §4.1–§4.8, §3.7; plan AL-18,
// part 1: GitHub login, the per-game fields with their check buttons, Steam login, save, the no-login fallback; part 2:
// rebuild, run progress, per-game results, the copy button of the fallback). The lazy chunk of AccountLinks'
// ?manage mode (AL-20) and the only importer of src/i18n/accounts-admin.ts. Requests, popups, channel messages and
// timers all go through the AL-17 core bound to the page by the caller (AdminApi), so tests inject fakes; the relay
// origin is admin.deps.relay alone, and the one other request is the same-origin read of the player-log page after a
// deploy. The handle stays in admin.box, the login nonce and the Steam state in refs: none is rendered, stored or
// logged. Free text (nicknames, Riot IDs, Steam names) is always a JSX text node. There is no <form> and no password
// field. The panel owns the session clock (the 15-minute idle and the 60-minute cap logout) and the run tracking, so
// AccountLinks must keep it mounted for the page's life: closing the dialog hides it but never unmounts it (AL-20).
import { useEffect, useId, useLayoutEffect, useRef, useState, type JSX, type ReactNode, type Ref } from 'react';
import { ACCOUNT_ADMIN } from '../../config';
import { adminCopy, type AdminKey } from '../../i18n/accounts-admin';
import type { Lang } from '../../i18n/ui';
import { STEAM_XML_CACHE_HOURS } from '../../lib/account-config';
import {
  RUN_URL_RE,
  RelayError,
  WORKFLOW_URL,
  createSessionClock,
  ghCommands,
  listenLinkChannel,
  pollRun,
  retryAfterSeconds,
  startGithubLogin,
  startGithubLoginSameTab,
  startSteamLogin,
  varsFromList,
  type AdminDeps,
  type FormStore,
  type HandleBox,
  type RelayApi,
} from '../../lib/account-admin';
import { ACCOUNT_VARS, enkaProfileUrl, looksLikeSecret, normalize, parseHoyoUid, parseRiotId, parseSteamId64, riotLinks, validateVar, type AccountVar } from '../../lib/account-ids';
import type { AccountTile, AccountTileKey } from '../../lib/account-view';
import { routePath } from '../../lib/routes';
import { BASE_PATH } from '../../variants/ids';
import './ManagePanel.css';

/** The AL-17 core bound to the page by AccountLinks (AL-20); tests pass fakes. */
export interface AdminApi {
  deps: AdminDeps;
  box: HandleBox;
  relay: RelayApi;
  /** Subscribes a check to the page's wake events (visibilitychange, pageshow); returns the unsubscribe. */
  listenWake(check: () => void): () => void;
}

/** What a same-tab return left (AL-20): a #gh-error code, or the failure of its /gh/session call. */
export interface LoginError {
  kind: 'gh-error' | 'relay';
  code: string;
  retryAfter?: number;
}

export interface ManagePanelProps {
  lang: Lang;
  /** Every enabled tile in GAME_IDS order (the groups follow it; LoL and TFT share the Riot group, DV-27). */
  tiles: AccountTile[];
  /** Whether Valve's button image ships (AL-16); without it the Steam image button is never drawn (R-19). */
  steamButton: boolean;
  /** Kept by AccountLinks, so typed values outlive a sign-out and an account switch. */
  store: FormStore<AccountVar>;
  admin: AdminApi;
  focus: 'first-control' | 'heading' | 'error' | null;
  onDirtyChange(dirty: boolean): void;
  /** The tile on screen: its group is highlighted, and before the form shows its state note leads the section. */
  current?: AccountTileKey | null;
  loginError?: LoginError | null;
  /**
   * While a run is tracked: the static chip for the "연동 관리" button ("빌드 중 · {n}분", spec §4.6), new each minute;
   * null once tracking ends. AccountLinks shows it while the dialog is closed.
   */
  onBuildChip?(chip: string | null): void;
}

type GroupKey = 'zzz' | 'genshin' | 'riot' | 'steam';
type Field = AccountVar | 'riotConfirm';
/** A line of copy with its values, an optional link after it and an optional second line. */
type Msg = { key: AdminKey; vars?: Record<string, string | number>; link?: 'readme' | 'apps'; then?: Msg };
type FocusTarget = 'first-control' | 'heading' | 'error' | 'manual' | 'cancel' | 'same-tab' | 'steam-unlink' | Field;

/** The deploy workflow's jobs in pipeline order (.github/workflows/deploy.yml); each has its stage line (spec §4.6). */
const JOBS = ['secrets-scan', 'fetch-accounts', 'build', 'deploy', 'fetch-health'] as const;
type JobName = (typeof JOBS)[number];
interface Job {
  name: JobName;
  status: string | null;
  conclusion: string | null;
  stepsDone: number;
  stepsTotal: number;
}
type Stage = { key: AdminKey; done?: number; total?: number };
/** A platform of a page's #acct-status (slot = the tile's slot). */
type Platform = { slot: number; state: 'shown' | 'hidden' | 'absent' };
/** The read of the player-log page with ?r=<run>: under way, gave up (later / notYet), or what the run put there. */
type Site = 'checking' | 'later' | 'notYet' | readonly Platform[];
/** [다시 빌드] and what followed (spec §4.5, §4.6). */
interface Build {
  /** The tracked run; null when there is none to follow (the workflow page is linked instead). */
  id: number | null;
  /** A verified run link (RUN_URL_RE and this run), else the workflow page. */
  url: string;
  startedAt: number;
  /** started: dispatched without a run id; busy: another run, without an id; stopped: tracking ended without a result. */
  phase: 'started' | 'busy' | 'tracking' | 'done' | 'stopped';
  stage: Stage | null;
  stopped: 'login' | 'timeout' | null;
  result: 'deployed' | 'failed' | null;
  /** fetch-health failed after the deploy (spec §4.6). */
  authFailed: boolean;
  site: Site | null;
}

const GROUP_OF: Readonly<Record<AccountTileKey, GroupKey>> = { genshin: 'genshin', zzz: 'zzz', lol: 'riot', tft: 'riot', steam: 'steam' };
const ID_VAR: Readonly<Record<GroupKey, AccountVar>> = { genshin: 'ACCOUNT_GENSHIN_UID', zzz: 'ACCOUNT_ZZZ_UID', riot: 'ACCOUNT_RIOT_ID', steam: 'ACCOUNT_STEAM_ID64' };
/** The identity variable deleted together with its ID (spec §4.4); the Riot ID has none. */
const NAME_VAR: Readonly<Partial<Record<GroupKey, AccountVar>>> = { genshin: 'ACCOUNT_GENSHIN_NAME', zzz: 'ACCOUNT_ZZZ_NAME', steam: 'ACCOUNT_STEAM_NAME' };
/** Fields in DOM order per group (the SteamID64 sits in the manual-entry <details> after the name). */
const GROUP_FIELDS: Readonly<Record<GroupKey, readonly Field[]>> = {
  zzz: ['ACCOUNT_ZZZ_UID', 'ACCOUNT_ZZZ_NAME'],
  genshin: ['ACCOUNT_GENSHIN_UID', 'ACCOUNT_GENSHIN_NAME'],
  riot: ['ACCOUNT_RIOT_ID', 'riotConfirm'],
  steam: ['ACCOUNT_STEAM_NAME', 'ACCOUNT_STEAM_ID64'],
};

const REPO_URL = `https://github.com/${ACCOUNT_ADMIN.owner}/${ACCOUNT_ADMIN.repo}`;
/** The public README section "연동 켜기" (spec §4.7: copy points here, never at a spec section). */
const README_SETUP_URL = `${REPO_URL}#연동-켜기`;
const VARIABLES_URL = `${REPO_URL}/settings/variables/actions`;
/** Where the owner revokes the app's grant by hand when the relay could not confirm it (AL-17 review). */
const AUTHORIZED_APPS_URL = 'https://github.com/settings/apps/authorizations';
/** Valve's unmodified button image (R-19), served by the site; the alt is Valve's English label in both languages. */
const STEAM_IMAGE = { src: '/img/sits_01.png', width: 180, height: 35, alt: 'Sign in through Steam' } as const;
const IDLE_MINUTES = 15;
const MINUTE = 60_000;
/** The status line's minutes are refreshed this often. */
const STATUS_TICK_MS = 15_000;
/** Relay codes with their own §4.7 text ('invalid' needs a field and is handled by save). */
const RELAY_CODES: ReadonlySet<string> = new Set(['relay-unset', 'handle', 'ticket', 'forbidden', 'busy', 'gh-perm', 'gh-rejected', 'dispatch', 'upstream', 'config', 'network', 'rate', 'unknown']);
/** Texts that point at the README section; the link follows them. */
const README_KEYS: ReadonlySet<AdminKey> = new Set<AdminKey>(['gh.no-access', 'gh.config', 'config', 'relay-unset']);
/** Added whenever the grant revoke is not confirmed: the beacon, a 401's revoke and a failed /gh/logout are fire-and-forget. */
const UNCONFIRMED: Msg = { key: 'revokeUnconfirmed', link: 'apps' };
const RUNS_URL = `${REPO_URL}/actions/runs/`;
/** After a deploy the page is read again every 30 s for up to 10 minutes until it carries the run's id (spec §4.6). */
const SITE_RETRY_MS = 30_000;
const SITE_RETRY_CAP_MS = 10 * 60_000;

const fill = (template: string, values: Record<string, string | number> = {}): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : whole));
const isKey = (key: string): key is AdminKey => Object.hasOwn(adminCopy.ko, key);
const nfcTrim = (s: string): string => s.normalize('NFC').trim();
const kstTime = (ms: number): string =>
  `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms))} KST`;
const groupOfVar = (k: AccountVar): GroupKey => (Object.keys(ID_VAR) as GroupKey[]).find((g) => ID_VAR[g] === k || NAME_VAR[g] === k) ?? 'riot';

function withItem<T>(set: ReadonlySet<T>, item: T, on: boolean): ReadonlySet<T> {
  if (set.has(item) === on) return set;
  const next = new Set(set);
  if (on) next.add(item);
  else next.delete(item);
  return next;
}

function ghErrorMsg(code: string): Msg {
  const key = `gh.${code}`;
  if (!isKey(key)) return { key: 'unknown' };
  return README_KEYS.has(key) ? { key, link: 'readme' } : { key };
}

/** The #acct-status states on this page (slot → state), or null when the element is missing or unreadable. */
function pageStates(): ReadonlyMap<number, string> | null {
  if (typeof document === 'undefined') return null;
  try {
    const data: unknown = JSON.parse(document.getElementById('acct-status')?.textContent ?? '');
    const platforms = (data as { platforms?: unknown }).platforms;
    if (!Array.isArray(platforms)) return null;
    return new Map(platforms.filter((p) => Number.isInteger(p?.slot) && typeof p?.state === 'string').map((p) => [p.slot as number, p.state as string]));
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const textOf = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const countOf = (v: unknown): number => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : 0);
const runIdOf = (v: unknown): number | null => (Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : null);

/** The relay's htmlUrl only when it passes RUN_URL_RE and names this run (spec §4.5: the page checks it again). */
function verifiedRunUrl(url: unknown, id: number): string | null {
  return typeof url === 'string' && RUN_URL_RE.test(url) && url.endsWith(`/${id}`) ? url : null;
}

/** run.jobs as the deploy workflow's own jobs, in pipeline order. */
function jobsOf(raw: unknown): Job[] {
  if (!Array.isArray(raw)) return [];
  const jobs: Job[] = [];
  for (const j of raw) {
    if (!isRecord(j) || !(JOBS as readonly unknown[]).includes(j.name)) continue;
    jobs.push({ name: j.name as JobName, status: textOf(j.status), conclusion: textOf(j.conclusion), stepsDone: countOf(j.stepsDone), stepsTotal: countOf(j.stepsTotal) });
  }
  return jobs.sort((a, b) => JOBS.indexOf(a.name) - JOBS.indexOf(b.name));
}

/** The stage line (spec §4.6): waiting until the run starts, then the furthest job in progress; between jobs the last line stays. */
function stageOf(status: string | null, jobs: Job[], prev: Stage | null): Stage {
  if (status !== 'in_progress') return { key: 'stage.queued' };
  const job = jobs.filter((j) => j.status === 'in_progress').at(-1);
  if (job === undefined) return prev ?? { key: 'stage.queued' };
  return job.name === 'build' ? { key: 'stage.build', done: job.stepsDone, total: job.stepsTotal } : { key: `stage.${job.name}` };
}

/** The platforms of a fetched page's #acct-status when this run built it; null otherwise (an older page, no status). */
function platformsOf(html: string, id: number): Platform[] | null {
  // DOMParser runs no script and loads nothing; only the JSON text of the one element is read
  const text = new DOMParser().parseFromString(html, 'text/html').getElementById('acct-status')?.textContent ?? '';
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.runId !== String(id) || !Array.isArray(data.platforms)) return null;
  return data.platforms.filter((p): p is Platform => isRecord(p) && Number.isSafeInteger(p.slot) && (p.state === 'shown' || p.state === 'hidden' || p.state === 'absent'));
}

/** A link that opens in a new tab and says so (spec §3.7). */
function NewTab({ href, label, newTab, className, linkRef }: { href: string; label: string; newTab: string; className?: string; linkRef?: Ref<HTMLAnchorElement> }): JSX.Element {
  return (
    <a ref={linkRef} className={className} href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
      {label}
      <span aria-hidden="true">↗</span> <span className="sr-only">{newTab}</span>
    </a>
  );
}

export default function ManagePanel(props: ManagePanelProps): JSX.Element {
  const { lang, tiles, steamButton, store, admin, focus, onDirtyChange, current = null, loginError = null, onBuildChip } = props;
  const relay = admin.deps.relay;
  const copy = adminCopy[lang];
  const uid = useId();
  const idOf = (part: string): string => `${uid}${part}`;

  const [phase, setPhase] = useState<'out' | 'in' | 'ended'>(() => (admin.box.get() !== null ? 'in' : 'out'));
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [, setVersion] = useState(0);
  const bump = (): void => setVersion((v) => v + 1);
  const [loaded, setLoaded] = useState(false);
  const [perms, setPerms] = useState(false);
  const [storedVars, setStoredVars] = useState<ReadonlySet<AccountVar>>(() => new Set());
  const [alert, setAlert] = useState<Msg | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [confirmSameTab, setConfirmSameTab] = useState(false);
  const [warn, setWarn] = useState<{ kind: 'idle' | 'cap'; n: number } | null>(null);
  const [saveMsg, setSaveMsg] = useState<Msg | null>(null);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<Field>>(() => new Set());
  const [required, setRequired] = useState<ReadonlySet<Field>>(() => new Set());
  const [secret, setSecret] = useState<ReadonlySet<Field>>(() => new Set());
  const [serverInvalid, setServerInvalid] = useState<Field | null>(null);
  const [riotConfirm, setRiotConfirm] = useState('');
  const [unlink, setUnlink] = useState<ReadonlySet<GroupKey>>(() => new Set());
  const [steamResult, setSteamResult] = useState('');
  const [steamError, setSteamError] = useState<Msg | null>(null);
  const [manualOpen, setManualOpen] = useState(!steamButton);
  const [noLoginOpen, setNoLoginOpen] = useState(relay === null);
  const [states] = useState(pageStates);
  const [, setTick] = useState(0);
  const [build, setBuild] = useState<Build | null>(null);
  const [buildMsg, setBuildMsg] = useState<Msg | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [copied, setCopied] = useState<{ text: string; ok: boolean } | null>(null);

  const pendingN = useRef<string | null>(null);
  const pendingS = useRef<string | null>(null);
  const clockRef = useRef<ReturnType<typeof createSessionClock> | null>(null);
  /** Bumped by every session start, so a late /gh/logout answer never rewrites a newer session's line. */
  const sessionSeq = useRef(0);
  const leaving = useRef(false);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const loginRef = useRef<HTMLButtonElement>(null);
  const sameTabRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const readmeRef = useRef<HTMLAnchorElement>(null);
  const manualRef = useRef<HTMLElement>(null);
  const steamUnlinkRef = useRef<HTMLInputElement>(null);
  const warnRef = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Map<Field, HTMLInputElement>());
  /** Bumped by every [다시 빌드], so answers about an earlier run are dropped. */
  const buildSeq = useRef(0);
  /** pollRun's cancel while a run is tracked. */
  const stopPoll = useRef<(() => void) | null>(null);
  const siteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The codes of the polling failures shown since the last good answer: each is announced, and opens §4.8, once. By
   * code, not by text: a rate's time changes with every failure.
   */
  const pollErrors = useRef(new Set<AdminKey>());
  const lastJobs = useRef<Job[]>([]);
  const chipSent = useRef<string | null>(null);

  // groups in tile order; LoL and TFT make one Riot group
  const groups: { key: GroupKey; tiles: AccountTile[] }[] = [];
  for (const tile of tiles) {
    const key = GROUP_OF[tile.key];
    const group = groups.find((g) => g.key === key);
    if (group) group.tiles.push(tile);
    else groups.push({ key, tiles: [tile] });
  }
  const allFields = groups.flatMap((g) => GROUP_FIELDS[g.key]);

  const valueOf = (f: Field): string => (f === 'riotConfirm' ? riotConfirm : store.get(f));
  const fieldLabel = (f: Field): string => copy[(f === 'riotConfirm' ? 'label:field.riotConfirm' : `label:field.${f}`) as AdminKey];
  const idEmptied = (g: GroupKey): boolean => store.get(ID_VAR[g]) === '' && store.changed(ID_VAR[g]);

  /** The field's rule (spec §4.3) as a copy key; null when the value can be saved. */
  function errorOf(f: Field): AdminKey | null {
    if (f === 'riotConfirm') {
      const id = store.get('ACCOUNT_RIOT_ID');
      if (!store.changed('ACCOUNT_RIOT_ID') || id === '') return null;
      return nfcTrim(riotConfirm) === nfcTrim(id) ? null : 'err.riotConfirm';
    }
    const v = store.get(f);
    const g = groupOfVar(f);
    if (v === '') {
      if (ID_VAR[g] === f) return idEmptied(g) && !unlink.has(g) ? 'err.unlink' : null;
      return store.get(ID_VAR[g]) !== '' ? 'err.required' : null;
    }
    switch (f) {
      case 'ACCOUNT_GENSHIN_UID':
      case 'ACCOUNT_ZZZ_UID':
        return parseHoyoUid(v) === null ? 'err.uid' : null;
      case 'ACCOUNT_STEAM_ID64':
        return parseSteamId64(v) === null ? 'err.steamId' : null;
      case 'ACCOUNT_RIOT_ID':
        return parseRiotId(v) === null ? 'err.riot' : null;
      default: {
        const n = normalize(v);
        return n === null ? 'err.text' : n === '' ? 'err.required' : null;
      }
    }
  }
  /**
   * Errors show after blur, a check-button press or save (spec §3.7); the secret warning at once. A check-button press
   * on an empty field only shows "required" while it stays empty: it never blocks a save.
   */
  const shownError = (f: Field): AdminKey | null => {
    if (secret.has(f)) return 'secret';
    if (required.has(f) && valueOf(f) === '') return 'err.required';
    return revealed.has(f) ? errorOf(f) : null;
  };

  /** What a save sends, in ACCOUNT_VARS order; an emptied ID deletes the ID and its name once the unlink box is ticked (§2.3, §4.4). */
  function pendingChanges(): { name: AccountVar; value: string | null }[] {
    const out = new Map<AccountVar, string | null>();
    for (const { key: g } of groups) {
      const id = ID_VAR[g];
      const name = NAME_VAR[g];
      if (idEmptied(g)) {
        if (!unlink.has(g)) continue;
        out.set(id, null);
        if (name) out.set(name, null);
        continue;
      }
      for (const k of name ? [id, name] : [id]) if (store.changed(k)) out.set(k, store.get(k) === '' ? null : store.get(k));
    }
    return ACCOUNT_VARS.filter((k) => out.has(k)).map((k) => ({ name: k, value: out.get(k) ?? null }));
  }

  function errorMsg(e: unknown, steam = false): Msg {
    if (!(e instanceof RelayError)) return { key: 'unknown' };
    const steamKey = `steam.${e.code}`;
    if (steam && isKey(steamKey)) return { key: steamKey };
    if (e.code === 'rate') {
      const now = admin.deps.now;
      return { key: 'rate', vars: { time: kstTime(now() + retryAfterSeconds(e.extra?.retryAfter, 60) * 1000) } };
    }
    if (RELAY_CODES.has(e.code) && isKey(e.code)) return README_KEYS.has(e.code) ? { key: e.code, link: 'readme' } : { key: e.code };
    return { key: 'unknown' };
  }

  const requestFocus = (t: FocusTarget): void => {
    pendingFocus.current = t;
  };
  function targetOf(t: FocusTarget): HTMLElement | null {
    switch (t) {
      case 'heading':
        return headingRef.current;
      case 'error':
        return errorRef.current;
      case 'manual':
        return manualRef.current;
      case 'cancel':
        return cancelRef.current;
      case 'same-tab':
        return sameTabRef.current;
      case 'steam-unlink':
        return steamUnlinkRef.current;
      case 'first-control':
        if (relay === null) return readmeRef.current;
        if (phaseRef.current !== 'in') return loginRef.current;
        return allFields.map((f) => inputs.current.get(f)).find((el) => el !== undefined) ?? null;
      default:
        return inputs.current.get(t) ?? null;
    }
  }

  /** The login has ended on this page: the line goes to the error line, a role="alert" (spec §3.7). */
  function dropSession(msg: Msg): void {
    // a focused control that exists only while signed in goes now: focus moves to the line that says why
    if (document.activeElement?.closest('.mp__head button, .mp__save, .mp__warn, .mp-steam')) requestFocus('error');
    clockRef.current?.stop();
    clockRef.current = null;
    pendingS.current = null;
    setWarn(null);
    setPerms(false);
    setPhase('ended');
    setAlert(msg);
    stopTracking();
  }

  /** The relay refused the handle (401): the core cleared the box and asked for the revoke without waiting. */
  function handleRefused(): void {
    dropSession({ key: 'handle', then: UNCONFIRMED });
    setNoLoginOpen(true);
    requestFocus('error');
  }

  function onRequestError(e: unknown): void {
    if (e instanceof RelayError && e.code === 'handle') return handleRefused();
    setNoLoginOpen(true);
    setAlert(errorMsg(e));
  }

  // ---- rebuild and run tracking (spec §4.5, §4.6) ----

  /** Polling stops when the login ends under it: the run link and [결과 확인] stay (spec §4.6). */
  function stopTracking(): void {
    if (stopPoll.current === null) return;
    stopPoll.current();
    stopPoll.current = null;
    setBuild((b) => (b === null ? b : { ...b, phase: 'stopped', stopped: 'login', stage: null }));
  }

  function runBuild(id: number | null, url: string, phase: Build['phase']): Build {
    const now = admin.deps.now; // deps are called unbound, as the core calls them
    return { id, url, startedAt: now(), phase, stage: null, stopped: phase === 'stopped' ? 'login' : null, result: null, authFailed: false, site: null };
  }

  /** pollRun every 20 s while the tab is visible; the idle clock waits meanwhile, the 60-minute cap does not (§4.2). */
  function track(id: number, url: string): void {
    // First: pause() ends a session whose deadline has already passed, and that logout empties the box at once.
    clockRef.current?.pause();
    stopPoll.current?.(); // one loop at a time: one still running is cancelled before another starts
    stopPoll.current = null;
    if (phaseRef.current !== 'in' || admin.box.get() === null) {
      setBuild(runBuild(id, url, 'stopped')); // the login ended while the dispatch was on its way
      return;
    }
    const seq = buildSeq.current;
    lastJobs.current = [];
    setBuild(runBuild(id, url, 'tracking'));
    setWarn((w) => (w?.kind === 'idle' ? null : w));
    stopPoll.current = pollRun(admin.deps, admin.relay, id, {
      visible: () => document.visibilityState !== 'hidden',
      onUpdate: (run, jobs) => latest.current.onRunUpdate(seq, id, run, jobs),
      onError: (e) => latest.current.onPollError(seq, e),
      onStop: (reason) => latest.current.onRunStop(seq, id, reason),
    });
  }

  function onRunUpdate(seq: number, id: number, raw: unknown, rawJobs: unknown): void {
    if (seq !== buildSeq.current) return;
    const run = isRecord(raw) ? raw : {};
    const jobs = jobsOf(rawJobs);
    const status = textOf(run.status);
    const url = verifiedRunUrl(run.htmlUrl, id);
    lastJobs.current = jobs;
    if (pollErrors.current.size > 0) {
      pollErrors.current.clear();
      setBuildMsg(null);
    }
    setBuild((b) =>
      b === null || b.id !== id || b.phase !== 'tracking' ? b : { ...b, url: url ?? b.url, stage: status === 'completed' ? b.stage : stageOf(status, jobs, b.stage) },
    );
  }

  /** A failed poll (polling goes on): its §4.7 text once per code, and §4.8 opens. */
  function onPollError(seq: number, e: unknown): void {
    if (seq !== buildSeq.current) return;
    const msg = errorMsg(e);
    if (pollErrors.current.has(msg.key)) return;
    pollErrors.current.add(msg.key);
    setBuildMsg(msg);
    setNoLoginOpen(true);
  }

  /** Spec §4.6: judged by job, not by the run's conclusion (a failed fetch-health fails a run that did deploy). */
  function onRunStop(seq: number, id: number, reason: 'done' | 'timeout' | 'handle'): void {
    if (seq !== buildSeq.current) return;
    stopPoll.current = null;
    if (reason === 'handle') {
      setBuild((b) => (b === null ? b : { ...b, phase: 'stopped', stopped: 'login', stage: null }));
      handleRefused();
      return;
    }
    if (phaseRef.current === 'in') clockRef.current?.resume();
    if (reason === 'timeout') {
      setBuild((b) => (b === null ? b : { ...b, phase: 'stopped', stopped: 'timeout', stage: null }));
      return;
    }
    const conclusion = (name: JobName) => lastJobs.current.find((j) => j.name === name)?.conclusion ?? null;
    const deployed = conclusion('deploy') === 'success';
    setBuild((b) =>
      b === null ? b : { ...b, phase: 'done', stage: null, result: deployed ? 'deployed' : 'failed', authFailed: deployed && conclusion('fetch-health') === 'failure' },
    );
    if (deployed) void checkSite(seq, id, true);
  }

  function clearSiteTimer(): void {
    if (siteTimer.current === null) return;
    const clear = admin.deps.clearTimeout;
    clear(siteTimer.current);
    siteTimer.current = null;
  }

  /**
   * Reads this site's player-log page with ?r=<run>, no-store (spec §4.6): its #acct-status tells what the run put on the
   * site. After a deploy a page from the CDN's cache is read again every 30 s for up to 10 minutes; [결과 확인] reads once.
   */
  async function checkSite(seq: number, id: number, retry: boolean): Promise<void> {
    clearSiteTimer();
    const { fetch: fetchPage, now, setTimeout: set } = admin.deps;
    const deadline = now() + SITE_RETRY_CAP_MS;
    const show = (site: Site) => setBuild((b) => (b === null || b.id !== id ? b : { ...b, site }));
    show('checking');
    const read = async (): Promise<Platform[] | null> => {
      try {
        const res = await fetchPage(`${routePath(BASE_PATH.playerLog, lang, 'game')}?r=${id}`, { cache: 'no-store' });
        return res.ok ? platformsOf(await res.text(), id) : null;
      } catch {
        return null; // offline or refused: the same as a page without this run
      }
    };
    const attempt = async (): Promise<void> => {
      // a read still unanswered after 30 s (a stalled CDN or network) counts as no match; its late answer is dropped
      const timedOut = new Promise<null>((resolve) => {
        siteTimer.current = set(() => resolve(null), SITE_RETRY_MS);
      });
      const platforms = await Promise.race([read(), timedOut]);
      if (seq !== buildSeq.current) return;
      clearSiteTimer();
      if (platforms !== null) return show(platforms);
      if (retry && now() + SITE_RETRY_MS <= deadline) {
        siteTimer.current = set(() => void attempt(), SITE_RETRY_MS);
        return;
      }
      show(retry ? 'later' : 'notYet');
    };
    await attempt();
  }

  /** [다시 빌드]: relay('dispatch') with no argument; the relay builds {ref: 'main'} itself (spec §4.5). */
  async function rebuild(): Promise<void> {
    if (phaseRef.current !== 'in' || dispatching || build?.phase === 'tracking') return;
    buildSeq.current += 1;
    const seq = buildSeq.current;
    clearSiteTimer();
    pollErrors.current.clear();
    setBuildMsg(null);
    setBuild(null);
    setDispatching(true);
    try {
      const res = await admin.relay.relay('dispatch');
      if (seq !== buildSeq.current) return; // unmounted, or a newer [다시 빌드]: this answer starts nothing
      const data = isRecord(res) ? res : {};
      const id = runIdOf(data.runId);
      if (id === null) setBuild(runBuild(null, WORKFLOW_URL, 'started'));
      else track(id, verifiedRunUrl(data.htmlUrl, id) ?? WORKFLOW_URL);
    } catch (e) {
      if (seq !== buildSeq.current) return;
      if (e instanceof RelayError && e.code === 'handle') {
        handleRefused();
      } else if (e instanceof RelayError && e.code === 'busy') {
        // the relay refuses a second run while one is in progress: follow that one (spec §4.5)
        setBuildMsg({ key: 'busy' });
        setNoLoginOpen(true);
        const id = e.extra?.runId ?? null;
        if (id === null) setBuild(runBuild(null, WORKFLOW_URL, 'busy'));
        else track(id, verifiedRunUrl(`${RUNS_URL}${id}`, id) ?? WORKFLOW_URL);
      } else {
        setBuildMsg(errorMsg(e));
        setNoLoginOpen(true);
      }
    } finally {
      setDispatching(false);
    }
  }

  /** [결과 확인] after the login ended or tracking timed out: the page read needs no login (spec §4.6). */
  function checkResult(): void {
    if (build === null || build.id === null || build.site === 'checking') return;
    void checkSite(buildSeq.current, build.id, false);
  }

  /** After session() filled the box: the clock (it reads expiresAt once), then vars.list and workflow.get (spec §4.2). */
  async function startSession(focusHeading: boolean): Promise<void> {
    sessionSeq.current += 1;
    setPhase('in');
    setAlert(null);
    setBlocked(false);
    setConfirmSameTab(false);
    setPerms(false);
    clockRef.current?.stop();
    // The panel owns this clock; it runs whether the dialog is open or not (the panel stays mounted, AL-20).
    clockRef.current = createSessionClock({
      now: admin.deps.now,
      setTimeout: admin.deps.setTimeout,
      clearTimeout: admin.deps.clearTimeout,
      listenWake: admin.listenWake,
      idleMinutes: IDLE_MINUTES,
      idleWarnMinutes: ACCOUNT_ADMIN.idleWarnMinutes,
      capWarnMinutes: ACCOUNT_ADMIN.capWarnMinutes,
      expiresAt: () => admin.box.expiresAt(),
      onIdleWarn: (n) => setWarn({ kind: 'idle', n }),
      onCapWarn: (n) => setWarn({ kind: 'cap', n }),
      onEnd: () => void latest.current.endSession(false),
    });
    if (focusHeading) requestFocus('heading');
    try {
      const list = await admin.relay.relay('vars.list');
      await admin.relay.relay('workflow.get');
      const saved = varsFromList(list);
      store.load(saved);
      setStoredVars(new Set(Object.keys(saved) as AccountVar[]));
      setLoaded(true);
      setPerms(true);
      bump();
    } catch (e) {
      onRequestError(e);
    }
  }

  /** [로그아웃], 15-minute idle, the 60-minute cap: ended at once, then /gh/logout revokes the grant; values stay (§2.3). */
  async function endSession(fromButton: boolean): Promise<void> {
    const seq = sessionSeq.current;
    dropSession({ key: 'loginEnded' });
    if (fromButton) requestFocus('first-control');
    const revoked = await admin.relay.logout();
    if (!revoked && seq === sessionSeq.current) setAlert({ key: 'loginEnded', then: UNCONFIRMED });
  }

  function onTicket(ticket: string, n: string): void {
    pendingN.current = null;
    admin.relay.session(ticket, n).then(
      () => latest.current.startSession(true),
      (e: unknown) => {
        setAlert(errorMsg(e));
        setNoLoginOpen(true);
      },
    );
  }

  function onGhError(code: string): void {
    pendingN.current = null;
    setAlert(ghErrorMsg(code));
    setNoLoginOpen(true);
  }

  /** The three states must agree: the relay's (from the signed return_to), the popup's s, the one in memory (§4.3). */
  async function verifySteam(fields: Record<string, string>, s: string): Promise<void> {
    const expected = pendingS.current;
    pendingS.current = null;
    try {
      const res = await admin.relay.verifySteam({ ...fields, s });
      const id = parseSteamId64(res.steamid);
      if (expected === null || s !== expected || res.state !== expected || id === null) throw new RelayError('invalid', null);
      // a name that looks like a secret is treated as unknown: it never enters a field (spec §4.3 looksLikeSecret)
      const name = res.personaname !== null && !looksLikeSecret(res.personaname) ? res.personaname : null;
      if (name !== null) store.set('ACCOUNT_STEAM_NAME', name);
      else if (store.get('ACCOUNT_STEAM_ID64') !== id) store.set('ACCOUNT_STEAM_NAME', ''); // no stale name beside a new ID
      store.set('ACCOUNT_STEAM_ID64', id);
      const line = res.profilePublic === true ? 'label:steamPublic' : res.profilePublic === false ? 'label:steamPrivate' : 'label:steamUnknown';
      setSteamError(null);
      setSteamResult(fill(copy[line], { name: name ?? copy['label:nameUnknown'], id }));
      bump();
    } catch (e) {
      if (e instanceof RelayError && e.code === 'handle') onRequestError(e);
      setSteamResult('');
      setSteamError(errorMsg(e, true));
      setManualOpen(true);
      setNoLoginOpen(true);
      requestFocus('manual');
    }
  }

  const latest = useRef({ startSession, endSession, dropSession, onTicket, onGhError, verifySteam, onRunUpdate, onPollError, onRunStop });
  latest.current = { startSession, endSession, dropSession, onTicket, onGhError, verifySteam, onRunUpdate, onPollError, onRunStop };

  function login(): void {
    setAlert(null);
    let r: ReturnType<typeof startGithubLogin>;
    try {
      r = startGithubLogin(admin.deps, lang);
    } catch (e) {
      setAlert(errorMsg(e));
      setNoLoginOpen(true);
      return;
    }
    if ('blocked' in r) {
      pendingN.current = null;
      setBlocked(true);
      setAlert({ key: 'popup-blocked' });
      setNoLoginOpen(true);
      return;
    }
    pendingN.current = r.n;
    setBlocked(false);
  }

  function sameTab(force: boolean): void {
    if (!force && store.dirty()) {
      setConfirmSameTab(true);
      requestFocus('cancel');
      return;
    }
    setConfirmSameTab(false);
    leaving.current = true; // the panel already warned: no second prompt from beforeunload
    try {
      startGithubLoginSameTab(admin.deps, lang);
    } catch (e) {
      leaving.current = false;
      setAlert(errorMsg(e));
      setNoLoginOpen(true);
      requestFocus('error');
    }
  }

  function steamLogin(): void {
    setSteamError(null);
    setSteamResult('');
    let r: ReturnType<typeof startSteamLogin>;
    try {
      r = startSteamLogin(admin.deps);
    } catch (e) {
      setSteamError(errorMsg(e, true));
      setNoLoginOpen(true);
      return;
    }
    if ('blocked' in r) {
      pendingS.current = null;
      setSteamError({ key: 'popup-blocked' });
      setNoLoginOpen(true);
      return;
    }
    pendingS.current = r.state;
  }

  /** [Steam 연동 해제] empties both Steam fields (spec §2.3); focus goes to the unlink box, or the name field without one. */
  function unlinkSteam(): void {
    store.set('ACCOUNT_STEAM_ID64', '');
    store.set('ACCOUNT_STEAM_NAME', '');
    setSteamResult('');
    bump();
    requestFocus(idEmptied('steam') ? 'steam-unlink' : 'ACCOUNT_STEAM_NAME');
  }

  function change(f: Field, raw: string): void {
    const isSecret = looksLikeSecret(raw);
    const value = isSecret ? '' : raw;
    if (f === 'riotConfirm') setRiotConfirm(value);
    else store.set(f, value);
    setSecret((prev) => withItem(prev, f, isSecret));
    setRequired((prev) => withItem(prev, f, false));
    if (serverInvalid === f) setServerInvalid(null);
    bump();
  }
  const reveal = (f: Field): void => setRevealed((prev) => withItem(prev, f, true));

  async function save(): Promise<void> {
    if (saving) return;
    setSaveMsg(null);
    setRevealed(new Set(allFields));
    const bad = allFields.find((f) => errorOf(f) !== null);
    if (bad !== undefined) {
      if (bad === 'ACCOUNT_STEAM_ID64') setManualOpen(true);
      requestFocus(bad);
      return;
    }
    // The relay's own rules (validateVar, looksLikeSecret) before any request: nothing is sent unless every value
    // passes; a secret-looking value is emptied with the warning (spec §4.3).
    const sends: { name: AccountVar; value: string | null }[] = [];
    for (const op of pendingChanges()) {
      if (op.value === null) {
        sends.push(op);
        continue;
      }
      const check = validateVar(op.name, op.value);
      if (!check.ok) {
        if (check.reason === 'secret') {
          store.set(op.name, '');
          setSecret((prev) => withItem(prev, op.name, true));
          bump();
        }
        if (op.name === 'ACCOUNT_STEAM_ID64') setManualOpen(true);
        requestFocus(op.name);
        return;
      }
      sends.push({ name: op.name, value: check.value });
    }
    if (sends.length === 0) return;
    setSaving(true);
    setServerInvalid(null);
    let saved = 0;
    for (const op of sends) {
      try {
        if (op.value === null) await admin.relay.relay('vars.delete', { name: op.name });
        else await admin.relay.relay('vars.set', { name: op.name, value: op.value });
        store.set(op.name, op.value ?? '');
        store.markSaved(op.name);
        setStoredVars((prev) => withItem(prev, op.name, op.value !== null));
        saved += 1;
      } catch (e) {
        setSaving(false);
        bump();
        if (e instanceof RelayError && e.code === 'handle') {
          onRequestError(e);
          return;
        }
        // the field is at fault only for invalid and gh-rejected; any other failure keeps focus where it is
        const atField = e instanceof RelayError && (e.code === 'invalid' || e.code === 'gh-rejected');
        const before: Msg | undefined = saved > 0 ? { key: 'savedBefore', vars: { n: saved } } : undefined;
        setSaveMsg(e instanceof RelayError && e.code === 'invalid' ? { key: 'invalid', vars: { field: fieldLabel(op.name), n: saved } } : { ...errorMsg(e), then: before });
        setNoLoginOpen(true);
        if (atField) {
          setServerInvalid(op.name);
          if (op.name === 'ACCOUNT_STEAM_ID64') setManualOpen(true);
          requestFocus(op.name);
        }
        return;
      }
    }
    setSaving(false);
    setUnlink(new Set());
    setSaveMsg({ key: 'saved' });
    bump();
  }

  /**
   * Activity in the section restarts only the idle clock (no request) and clears the idle warning; inside the warning
   * the [계속 로그인] press clears it itself, so the button is not removed under the key or pointer that presses it.
   */
  const activity = (event: { target: EventTarget | null }): void => {
    if (phaseRef.current !== 'in') return;
    clockRef.current?.touch();
    if (event.target instanceof Node && warnRef.current?.contains(event.target)) return;
    setWarn((w) => (w?.kind === 'idle' ? null : w));
  };

  // the popup results (/link-return/ over BroadcastChannel)
  useEffect(() => {
    if (relay === null) return;
    return listenLinkChannel(admin.deps, {
      pendingN: () => pendingN.current,
      pendingSteamState: () => pendingS.current,
      onTicket: (ticket, n) => latest.current.onTicket(ticket, n),
      onGhError: (code) => latest.current.onGhError(code),
      onSteam: (fields, s) => void latest.current.verifySteam(fields, s),
    });
  }, [relay, admin]);

  // mounted after a same-tab return: AccountLinks already turned the ticket into a handle
  useEffect(() => {
    if (admin.box.get() !== null) void latest.current.startSession(false);
    return () => {
      clockRef.current?.stop();
      stopPoll.current?.();
      stopPoll.current = null;
      buildSeq.current += 1; // a page read still on its way lands nowhere
      clearSiteTimer();
    };
    // mount only
  }, []);

  // A same-tab return that failed (AL-20): set after mount, so the alert is announced rather than present at once.
  const loginErrorKey = loginError === null ? null : `${loginError.kind}:${loginError.code}:${loginError.retryAfter ?? ''}`;
  useEffect(() => {
    if (loginError === null) return;
    const extra = loginError.retryAfter === undefined ? undefined : { retryAfter: loginError.retryAfter };
    setAlert(loginError.kind === 'gh-error' ? ghErrorMsg(loginError.code) : errorMsg(new RelayError(loginError.code, null, extra)));
    setNoLoginOpen(true);
    // keyed by the error's value, not the object's identity
  }, [loginErrorKey]);

  // Wake events (pageshow from the back-forward cache, visibilitychange): a page shown again is not leaving, and a
  // handle dropped while it slept (the pagehide beacon) ends the session here too.
  useEffect(
    () =>
      admin.listenWake(() => {
        leaving.current = false;
        if (phaseRef.current === 'in' && admin.box.get() === null) latest.current.dropSession({ key: 'loginEnded', then: UNCONFIRMED });
      }),
    [admin],
  );

  // the minutes left in the status line, and a tracked run's minutes (its line and the chip)
  const tracking = build?.phase === 'tracking';
  useEffect(() => {
    if (phase !== 'in' && !tracking) return;
    const { setTimeout: set, clearTimeout: clear } = admin.deps;
    let timer = set(function tick() {
      setTick((n) => n + 1);
      timer = set(tick, STATUS_TICK_MS);
    }, STATUS_TICK_MS);
    return () => clear(timer);
  }, [phase, tracking, admin]);

  const dirty = store.dirty();
  useEffect(() => {
    onDirtyChange(dirty);
    // reports changes of `dirty` only
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = ''; // older browsers prompt only when returnValue is set
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useLayoutEffect(() => {
    if (focus !== null) requestFocus(focus);
  }, [focus]);
  useLayoutEffect(() => {
    const t = pendingFocus.current;
    if (t === null) return;
    const el = targetOf(t);
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  });

  const now = admin.deps.now;
  const expires = admin.box.expiresAt();
  const minutesLeft = expires === null ? 0 : Math.max(0, Math.ceil((expires - now()) / MINUTE));
  const elapsed = build === null ? 0 : Math.max(0, Math.floor((now() - build.startedAt) / MINUTE));
  // the chip for AccountLinks' "연동 관리" button: sent when it changes, never before a run is tracked
  const chip = tracking ? fill(copy['label:chip'], { n: elapsed }) : null;
  useEffect(() => {
    if (chip === chipSent.current) return;
    chipSent.current = chip;
    onBuildChip?.(chip);
  }, [chip]);
  const shownOnPage = (tile: AccountTile): boolean => (states?.has(tile.slot) ? states.get(tile.slot) === 'shown' : tile.state === 'shown');
  const formShown = loaded && phase !== 'out';
  // before the form shows, the current tile's state note leads the section (spec §2.2 step 3, §3.5)
  const currentTile = current === null ? undefined : tiles.find((tile) => tile.key === current);
  const tileNote: AdminKey | null =
    formShown || currentTile === undefined || shownOnPage(currentTile) ? null : currentTile.state === 'error' ? 'state.error' : currentTile.state === 'stale' ? 'state.stale' : 'notLinked';
  const btn = 'mp-btn btn btn--line cut cut--line';

  function renderMsg(m: Msg | null): ReactNode {
    if (m === null) return null;
    return (
      <>
        <span>{fill(copy[m.key], m.vars)}</span>
        {m.link !== undefined && (
          <>
            {' '}
            <NewTab
              href={m.link === 'readme' ? README_SETUP_URL : AUTHORIZED_APPS_URL}
              label={copy[m.link === 'readme' ? 'label:readme' : 'label:authorizedApps']}
              newTab={copy['label:newTab']}
            />
          </>
        )}
        {m.then !== undefined && <> {renderMsg(m.then)}</>}
      </>
    );
  }

  function renderField(f: Field, help?: ReactNode, inputMode?: 'numeric'): JSX.Element {
    const id = idOf(`f-${f}`);
    const helpId = idOf(`h-${f}`);
    const errId = idOf(`e-${f}`);
    const err = shownError(f);
    const changed = f !== 'riotConfirm' && store.changed(f);
    const invalid = (err !== null && err !== 'secret') || serverInvalid === f;
    const describedBy = [help !== undefined ? helpId : null, err !== null ? errId : null].filter(Boolean).join(' ');
    return (
      <div className="mp-field" key={f}>
        <label className="mp-field__label" htmlFor={id}>
          {fieldLabel(f)}
          {changed && (
            <>
              {' '}
              <span className="mp-field__changed">{copy['label:changed']}</span>
            </>
          )}
        </label>
        <input
          ref={(el) => {
            if (el) inputs.current.set(f, el);
            else inputs.current.delete(f);
          }}
          id={id}
          className="mp-field__input"
          type="text"
          value={valueOf(f)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode={inputMode}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          onChange={(e) => change(f, e.currentTarget.value)}
          onBlur={() => reveal(f)}
        />
        {help !== undefined && (
          <p id={helpId} className="mp-field__help">
            {help}
          </p>
        )}
        <p id={errId} className="mp-field__err">
          {err === null ? '' : copy[err]}
        </p>
      </div>
    );
  }

  /** Spec §3.7: a valid value makes a new-tab link; otherwise an aria-disabled button that shows the field error. */
  function renderCheck(label: AdminKey, href: string | null, f: Field): JSX.Element {
    if (href !== null) return <NewTab key={label} className="mp-check" href={href} label={copy[label]} newTab={copy['label:newTab']} />;
    return (
      <button
        key={label}
        type="button"
        className="mp-check"
        aria-disabled="true"
        aria-describedby={idOf(`e-${f}`)}
        onClick={() => {
          setRequired((prev) => withItem(prev, f, true));
          reveal(f);
        }}
      >
        {copy[label]}
      </button>
    );
  }

  function renderUnlink(g: GroupKey): JSX.Element | null {
    if (!idEmptied(g)) return null;
    return (
      <label className="mp-unlink">
        <input
          ref={g === 'steam' ? steamUnlinkRef : undefined}
          type="checkbox"
          checked={unlink.has(g)}
          onChange={(e) => {
            const on = e.currentTarget.checked; // read now: the updater may run after the event
            setUnlink((prev) => withItem(prev, g, on));
          }}
        />{' '}
        {copy['label:unlinkConfirm']}
      </label>
    );
  }

  function renderGroup(g: GroupKey, groupTiles: AccountTile[]): JSX.Element {
    const lines = groupTiles.map((tile) => ({ tile, shown: shownOnPage(tile) }));
    const hidden = lines.find((l) => !l.shown);
    const note: AdminKey | null =
      hidden === undefined ? null : !storedVars.has(ID_VAR[g]) ? 'notLinked' : (`state.${hidden.tile.state === 'shown' ? 'unlinked' : hidden.tile.state}` as AdminKey);
    let body: ReactNode;
    if (g === 'genshin' || g === 'zzz') {
      const uidVar = ID_VAR[g];
      body = (
        <>
          {renderField(uidVar, copy['help.uid'], 'numeric')}
          {renderUnlink(g)}
          {renderField(NAME_VAR[g] as AccountVar, copy['help.nickname'])}
          <div className="mp-checks">{renderCheck('label:enka', enkaProfileUrl(g, store.get(uidVar)), uidVar)}</div>
        </>
      );
    } else if (g === 'riot') {
      const v = store.get('ACCOUNT_RIOT_ID');
      const links = parseRiotId(v) === null ? null : riotLinks(normalize(v) ?? v);
      body = (
        <>
          {renderField('ACCOUNT_RIOT_ID', copy['help.riot'])}
          {renderUnlink(g)}
          {renderField('riotConfirm', copy['help.riotConfirm'])}
          <div className="mp-checks">
            {renderCheck('label:opgg', links?.lol ?? null, 'ACCOUNT_RIOT_ID')}
            {renderCheck('label:lolchess', links?.tft ?? null, 'ACCOUNT_RIOT_ID')}
          </div>
        </>
      );
    } else {
      body = (
        <>
          {phase === 'in' ? (
            steamButton && (
              <div className="mp-steam">
                <button type="button" className="mp-steam__btn" aria-describedby={idOf('steam-help')} onClick={steamLogin}>
                  <img src={STEAM_IMAGE.src} width={STEAM_IMAGE.width} height={STEAM_IMAGE.height} lang="en" alt={STEAM_IMAGE.alt} />
                </button>
                <p id={idOf('steam-help')} className="mp-field__help">
                  {copy.steamHelp}
                </p>
              </div>
            )
          ) : (
            <p className="mp-group__note">{copy.steamNeedsLogin}</p>
          )}
          <p className="mp-steam__result" role="status">
            {steamResult}
          </p>
          <p className="mp__alert" role="alert">
            {renderMsg(steamError)}
          </p>
          {renderField(
            'ACCOUNT_STEAM_NAME',
            <>
              {copy.steamNameHelp} {fill(copy.steamNameCache, { n: STEAM_XML_CACHE_HOURS })}
            </>,
          )}
          <details className="mp-manual" data-mp="steam-manual" open={manualOpen} onToggle={(e) => setManualOpen(e.currentTarget.open)}>
            <summary className="mp-manual__sum" ref={manualRef}>
              {copy['label:steamManual']}
            </summary>
            {/* a full keyboard: a profile address is accepted too */}
            {renderField('ACCOUNT_STEAM_ID64', copy.steamIdHelp)}
          </details>
          {renderUnlink(g)}
          {store.get('ACCOUNT_STEAM_ID64') !== '' && (
            <button type="button" className={btn} onClick={unlinkSteam}>
              {copy['label:steamUnlink']}
            </button>
          )}
        </>
      );
    }
    return (
      <fieldset key={g} className="mp-group" data-group={g} data-current={current !== null && GROUP_OF[current] === g ? '' : undefined}>
        <legend className="mp-group__name">{groupTiles.map((tile) => tile.name).join(' · ')}</legend>
        {g === 'riot' ? (
          lines.map((l) => (
            <p key={l.tile.key} className="mp-group__state">
              {`${l.tile.name} · ${copy[l.shown ? 'label:shown' : 'label:notShown']}`}
            </p>
          ))
        ) : (
          <p className="mp-group__state">{copy[lines[0]?.shown ? 'label:shown' : 'label:notShown']}</p>
        )}
        {note !== null && <p className="mp-group__note">{copy[note]}</p>}
        {body}
      </fieldset>
    );
  }

  /**
   * The run (spec §4.6): failures in a role="alert"; the stage, then the outcome, in a polite role="status" whose text
   * changes only with them (steps and minutes sit outside it); the verified run link, [결과 확인] and [새로 고침] after.
   */
  function renderBuild(): JSX.Element {
    const b = build;
    const lines: string[] = [];
    if (b !== null) {
      if (b.phase === 'started') lines.push(copy.dispatched);
      if (b.phase === 'tracking' && b.stage !== null) lines.push(copy[b.stage.key]);
      if (b.phase === 'stopped') lines.push(copy[b.stopped === 'timeout' ? 'result.timeout' : 'result.loginEnded']);
      if (b.result === 'failed') lines.push(copy['result.failed']);
      if (b.site === 'checking' && b.result === 'deployed') lines.push(copy['result.checking']);
      if (b.site === 'later') lines.push(copy['result.later']);
      if (b.site === 'notYet') lines.push(copy['result.notYet']);
      const platforms = Array.isArray(b.site) ? (b.site as readonly Platform[]) : [];
      // tile order, as the groups above; a platform without a tile here is not shown
      const results = tiles.flatMap((tile) => platforms.filter((p) => p.slot === tile.slot).map((p) => ({ tile, shown: p.state === 'shown', hidden: p.state === 'hidden' })));
      for (const r of results) lines.push(fill(copy[r.shown ? 'label:game.shown' : 'label:game.hidden'], { game: r.tile.name }));
      if (b.authFailed) {
        lines.push(copy['result.authFailed']);
        if (results.some((r) => r.tile.key === 'steam' && r.hidden)) lines.push(copy['result.steamHint']);
      }
      if (results.some((r) => !r.shown)) lines.push(copy['result.reasons']);
    }
    const stage = b?.phase === 'tracking' ? b.stage : null;
    const steps = stage?.key === 'stage.build' && (stage.total ?? 0) > 0 ? fill(copy['label:steps'], { done: stage.done ?? 0, total: stage.total ?? 0 }) : null;
    const checkable = b !== null && b.phase === 'stopped' && b.id !== null;
    const refreshable = b !== null && (b.phase === 'done' || (b.phase === 'stopped' && Array.isArray(b.site)));
    return (
      <div className="mp-build" data-mp="build">
        <p className="mp__alert" role="alert">
          {renderMsg(buildMsg)}
        </p>
        <div className="mp-build__status" role="status">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {b?.phase === 'tracking' && (
          <p className="mp-build__meta">
            {steps !== null && <span>{steps} · </span>}
            <span>{fill(copy['label:elapsed'], { n: elapsed, eta: ACCOUNT_ADMIN.etaMinutes })}</span>
          </p>
        )}
        {b !== null && (
          <p className="mp-build__link">
            <NewTab href={b.url} label={copy[b.url === WORKFLOW_URL ? 'label:webRunLink' : 'label:runLink']} newTab={copy['label:newTab']} />
          </p>
        )}
        {(checkable || refreshable) && (
          <div className="mp-build__actions">
            {checkable && (
              <button type="button" className={btn} aria-disabled={b.site === 'checking' ? 'true' : undefined} onClick={checkResult}>
                {copy['label:checkResult']}
              </button>
            )}
            {refreshable && (
              <button type="button" className={btn} onClick={() => admin.deps.location.reload()}>
                {copy['label:refresh']}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const changes = pendingChanges();
  const commands = ghCommands(changes);
  const commandText = commands.lines.join('\n');
  /** §4.8: the command lines to the clipboard; the note says whether it worked, for these lines only. */
  function copyCommands(): void {
    const text = commandText;
    const done = (ok: boolean) => setCopied({ text, ok });
    try {
      navigator.clipboard.writeText(text).then(
        () => done(true),
        () => done(false),
      );
    } catch {
      done(false); // no Clipboard API here
    }
  }
  const skippedOf = (reason: 'invalid' | 'unsafe-shell') => commands.skipped.filter((s) => s.reason === reason).map((s) => s.name);
  const names = (list: readonly string[]) => (
    <ul className="mp-nologin__names">
      {list.map((name) => (
        <li key={name}>
          <code>{name}</code>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {tileNote !== null && <p className="mp-tile-note">{copy[tileNote]}</p>}
      <section className="mp bracket" aria-labelledby={idOf('title')} onPointerDown={activity} onKeyDown={activity} onInput={activity}>
        <div className="mp__head">
          <h3 id={idOf('title')} className="mp__title" tabIndex={-1} ref={headingRef}>
            {phase === 'in' ? fill(copy['label:status'], { n: minutesLeft }) : copy['label:title']}
          </h3>
          {phase === 'in' && (
            <button type="button" className={btn} onClick={() => void endSession(true)}>
              {copy['label:logout']}
            </button>
          )}
        </div>
        <p className="mp__owner">{copy.owner}</p>
        <p className="mp__alert" role="alert" tabIndex={-1} ref={errorRef} data-mp="error">
          {renderMsg(alert)}
        </p>
        {relay === null ? (
          <p className="mp__unset">
            {copy['relay-unset']} <NewTab linkRef={readmeRef} href={README_SETUP_URL} label={copy['label:readme']} newTab={copy['label:newTab']} />
          </p>
        ) : (
          phase !== 'in' && (
            <div className="mp__login">
              <button type="button" className={btn} ref={loginRef} aria-describedby={idOf('login-help')} onClick={login}>
                {copy['label:login']}
              </button>
              <p id={idOf('login-help')} className="mp-field__help">
                {copy.loginHelp}
              </p>
              {blocked && !confirmSameTab && (
                <button type="button" className={btn} ref={sameTabRef} onClick={() => sameTab(false)}>
                  {copy['label:sameTab']}
                </button>
              )}
              {confirmSameTab && (
                <div className="mp__confirm" role="group" aria-labelledby={idOf('tab-warn')}>
                  <p id={idOf('tab-warn')}>{copy.sameTabWarn}</p>
                  <button type="button" className={btn} onClick={() => sameTab(true)}>
                    {copy['label:loginAnyway']}
                  </button>
                  <button
                    type="button"
                    className={btn}
                    ref={cancelRef}
                    onClick={() => {
                      setConfirmSameTab(false);
                      requestFocus('same-tab');
                    }}
                  >
                    {copy['label:cancel']}
                  </button>
                </div>
              )}
            </div>
          )
        )}
        {phase === 'in' && perms && <p className="mp__perms">{copy['label:perms']}</p>}
        <div className="mp__alert mp__warn" role="alert" ref={warnRef}>
          {warn !== null && (
            <>
              <span>{fill(copy[warn.kind === 'idle' ? 'idleWarn' : 'capWarn'], { n: warn.n })}</span>
              {warn.kind === 'idle' && (
                <button
                  type="button"
                  className={btn}
                  onClick={() => {
                    clockRef.current?.touch();
                    setWarn(null);
                    requestFocus('heading'); // the button removes itself
                  }}
                >
                  {copy['label:stayIn']}
                </button>
              )}
            </>
          )}
        </div>
        {formShown && (
          <div className="mp__form">
            <p className="mp-field__help">{copy.checkHelp}</p>
            {groups.map((g) => renderGroup(g.key, g.tiles))}
            {phase === 'in' && (
              <div className="mp__save">
                <button type="button" className="mp-btn btn btn--fill cut" disabled={saving} onClick={() => void save()}>
                  {copy['label:save']}
                </button>
                {/* aria-disabled, not disabled: while a run is tracked the button keeps its focus (spec §4.5) */}
                <button type="button" className={btn} aria-disabled={dispatching || tracking ? 'true' : undefined} onClick={() => void rebuild()}>
                  {copy['label:rebuild']}
                </button>
              </div>
            )}
            <p className="mp__alert" role="alert" data-mp="save-alert">
              {renderMsg(saveMsg)}
            </p>
            {renderBuild()}
          </div>
        )}
        <details className="mp-nologin" data-mp="no-login" open={noLoginOpen} onToggle={(e) => setNoLoginOpen(e.currentTarget.open)}>
          <summary className="mp-nologin__sum">{copy['label:noLogin']}</summary>
          <ol className="mp-nologin__steps">
            <li>
              <p>
                {copy.webVars} <NewTab href={VARIABLES_URL} label={copy['label:webVarsLink']} newTab={copy['label:newTab']} />
              </p>
              {changes.length > 0 && (
                <>
                  <p>{copy['label:changedNames']}</p>
                  {names(changes.map((c) => c.name))}
                </>
              )}
            </li>
            <li>
              <p>
                {copy.webRun} <NewTab href={WORKFLOW_URL} label={copy['label:webRunLink']} newTab={copy['label:newTab']} />
              </p>
            </li>
          </ol>
          <h4 className="mp-nologin__h">{copy['label:commands']}</h4>
          <p>{copy.ghInstall}</p>
          <p className="mp-nologin__ps">{copy['label:psNote']}</p>
          {/* a keyboard-focusable scroller: the long lines scroll sideways (WCAG 2.1.1) */}
          <pre className="mp-nologin__pre" tabIndex={0}>
            <code>{commandText}</code>
          </pre>
          <div className="mp-nologin__copy">
            <button type="button" className={btn} onClick={copyCommands}>
              {copy['label:copy']}
            </button>
            <span role="status">{copied !== null && copied.text === commandText ? copy[copied.ok ? 'copied' : 'copyFailed'] : ''}</span>
          </div>
          {skippedOf('unsafe-shell').length > 0 && (
            <>
              <p>{copy.skippedShell}</p>
              {names(skippedOf('unsafe-shell'))}
            </>
          )}
          {skippedOf('invalid').length > 0 && (
            <>
              <p>{copy.skippedInvalid}</p>
              {names(skippedOf('invalid'))}
            </>
          )}
        </details>
      </section>
    </>
  );
}
