// src/lib/achievements.ts — site achievements runtime (spec §5 사이트 업적; trigger bus D13).
// Content code only calls emitTrigger(trigger). AchievementHost (one island per page) drains the queue, maps
// triggers to achievement ids (achievements.yaml) and calls unlock(). State lives only in this browser
// (localStorage 'sb:achievements' and 'sb:visits'); every storage access is wrapped, with an in-memory fallback.
import { STORAGE_KEYS } from '../config';
import { NAV_SECTIONS, type AchievementTrigger, type NavSection } from '../types';
import type { Lang } from '../i18n/ui';
import type { AchievementData } from '../content/schemas';

export type AchievementDef = AchievementData;

export const TRIGGER_EVENT = 'sb:trigger';
export const UNLOCK_EVENT = 'sb:achievement-unlocked';

declare global {
  interface Window {
    __sbTriggers?: AchievementTrigger[];
    __sbIntroSkipped?: boolean;
  }
}

interface Visits {
  sections: NavSection[];
  langs: Lang[];
}

const LANGS: readonly Lang[] = ['ko', 'en'];

let memoryUnlocked: Record<string, string> = {};
let memoryVisits: Visits = { sections: [], langs: [] };

/**
 * The achievements a visitor can actually reach on this build: bgm-on only when the BGM file exists (the BGM button
 * is rendered only then, P1-18). Used by the Player Log list (its "n / total" count) and the toast host.
 */
export function availableAchievements<T extends Pick<AchievementDef, 'trigger'>>(defs: readonly T[], sound: { bgm: boolean }): T[] {
  return defs.filter((d) => d.trigger !== 'bgm-on' || sound.bgm);
}

/** Validates a data-section attribute value against NAV_SECTIONS; anything else → null. */
export function toNavSection(v: string | undefined): NavSection | null {
  return v !== undefined && (NAV_SECTIONS as readonly string[]).includes(v) ? (v as NavSection) : null;
}

function isNavSectionValue(v: unknown): v is NavSection {
  return typeof v === 'string' && toNavSection(v) !== null;
}

function isLang(v: unknown): v is Lang {
  return v === 'ko' || v === 'en';
}

/** The ONLY API content code calls: queues the trigger (survives until the host hydrates) and dispatches TRIGGER_EVENT. */
export function emitTrigger(trigger: AchievementTrigger): void {
  if (typeof window === 'undefined') return;
  (window.__sbTriggers ??= []).push(trigger);
  window.dispatchEvent(new CustomEvent(TRIGGER_EVENT, { detail: { trigger } }));
}

/** Empties window.__sbTriggers in place and returns what it held. */
export function drainTriggers(): AchievementTrigger[] {
  if (typeof window === 'undefined' || !window.__sbTriggers) return [];
  return window.__sbTriggers.splice(0);
}

function readStoredUnlocked(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.achievements);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, at] of Object.entries(parsed)) if (typeof at === 'string') out[id] = at;
    return out;
  } catch {
    return {};
  }
}

/** Unlocked ids → ISO time, from storage plus this page's in-memory record; {} when storage fails. */
export function readUnlocked(): Record<string, string> {
  return { ...readStoredUnlocked(), ...memoryUnlocked };
}

export function isUnlocked(id: string): boolean {
  return Object.hasOwn(readUnlocked(), id);
}

/** true when newly unlocked: records the ISO time in memory and storage (errors ignored) and dispatches UNLOCK_EVENT. */
export function unlock(id: string, now: Date = new Date()): boolean {
  if (isUnlocked(id)) return false;
  const at = now.toISOString();
  memoryUnlocked = { ...memoryUnlocked, [id]: at };
  try {
    localStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify({ ...readStoredUnlocked(), [id]: at }));
  } catch {
    /* storage blocked: memoryUnlocked keeps this page consistent */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UNLOCK_EVENT, { detail: { id } }));
  return true;
}

export function idsForTrigger(defs: readonly AchievementDef[], trigger: AchievementTrigger): string[] {
  return defs.filter((d) => d.trigger === trigger).map((d) => d.id);
}

function readStoredVisits(): Visits {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.visits);
    if (!raw) return { sections: [], langs: [] };
    const parsed: unknown = JSON.parse(raw);
    const obj = parsed !== null && typeof parsed === 'object' ? (parsed as { sections?: unknown; langs?: unknown }) : {};
    return {
      sections: Array.isArray(obj.sections) ? obj.sections.filter(isNavSectionValue) : [],
      langs: Array.isArray(obj.langs) ? obj.langs.filter(isLang) : [],
    };
  } catch {
    return { sections: [], langs: [] };
  }
}

function union<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])];
}

/**
 * Updates localStorage['sb:visits'] (in-memory fallback). Returns 'visit-all-sections' once all 4 NAV_SECTIONS were
 * seen and 'switch-language' once both languages were seen — on every call while that holds (unlock is idempotent).
 */
export function recordVisit(section: NavSection | null, lang: Lang): AchievementTrigger[] {
  const stored = readStoredVisits();
  const visits: Visits = {
    sections: union(stored.sections, memoryVisits.sections),
    langs: union(stored.langs, memoryVisits.langs),
  };
  if (section !== null && !visits.sections.includes(section)) visits.sections.push(section);
  if (!visits.langs.includes(lang)) visits.langs.push(lang);
  memoryVisits = visits;
  try {
    localStorage.setItem(STORAGE_KEYS.visits, JSON.stringify(visits));
  } catch {
    /* storage blocked: memoryVisits keeps this page consistent */
  }
  const out: AchievementTrigger[] = [];
  if (NAV_SECTIONS.every((s) => visits.sections.includes(s))) out.push('visit-all-sections');
  if (LANGS.every((l) => visits.langs.includes(l))) out.push('switch-language');
  return out;
}

/** Tests only: forget the in-memory fallbacks. */
export function __resetAchievementMemory(): void {
  memoryUnlocked = {};
  memoryVisits = { sections: [], langs: [] };
}
