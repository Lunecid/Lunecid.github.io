// The growth infographic's data (src/data/growth.ts + src/lib/growth.ts): every fact it shows equals its source,
// teammates' tools stay the team's part, levels follow the ordinal rule, both languages carry the same structure.
import { describe, expect, it } from 'vitest';
import { GROWTH_LEVELS, growthCopy, growthFuture, growthSteps } from '../../src/data/growth';
import { overallAuc } from '../../src/data/research/cog-2026';
import { RESEARCH_STATUS, researchPage } from '../../src/data/research-page';
import type { Lang } from '../../src/i18n/ui';
import { formatYm } from '../../src/i18n/utils';
import { FORMAT_PHRASE, resolveFacts } from '../../src/lib/facts';
import { buildGrowth, parseSiteNumber, type GrowthModel } from '../../src/lib/growth';
import { loadGrowthInputs } from '../helpers/growth-inputs';

const LANGS = ['ko', 'en'] as const;
const inputs = { ko: loadGrowthInputs('ko'), en: loadGrowthInputs('en') };
const model: Record<Lang, GrowthModel> = { ko: buildGrowth(inputs.ko, 'ko'), en: buildGrowth(inputs.en, 'en') };
const step = (lang: Lang, id: string) => {
  const s = model[lang].steps.find((x) => x.id === id);
  if (!s) throw new Error(`no step ${id}`);
  return s;
};
const project = (lang: Lang, slug: string) => {
  const p = inputs[lang].projects.find((x) => x.slug === slug);
  if (!p) throw new Error(`no project ${slug}`);
  return p.data;
};

describe('growth infographic data (GR-1)', () => {
  it('seven steps from the Seoul apartment project to the CoG paper, in time order, same ids and levels in both languages', () => {
    for (const lang of LANGS) {
      expect(model[lang].steps.map((s) => s.id)).toEqual(['seoul-apartment-automl', 'kickick-park', 'kbo-attendance', 'school-zone-blindspots', 'youth-startup-location', 'lg-aimers-7', 'cog-2026-engagement']);
      const starts = model[lang].steps.map((s) => s.start);
      expect([...starts].sort()).toEqual(starts);
    }
    expect(model.en.steps.map((s) => [s.role.level, s.method?.level ?? null])).toEqual(model.ko.steps.map((s) => [s.role.level, s.method?.level ?? null]));
  });

  it('project steps read period, title, org, type, team and the role sentence verbatim from the frontmatter', () => {
    for (const lang of LANGS) {
      for (const def of growthSteps.filter((d) => d.source.kind === 'project')) {
        const s = step(lang, def.id);
        const p = project(lang, def.id);
        expect(s.title).toBe(p.title);
        expect(s.org).toBe(p.org);
        expect(s.type).toBe(p.type);
        expect(s.start).toBe(p.period.start);
        expect(s.period).toBe(`${formatYm(p.period.start, lang)}–${formatYm(p.period.end ?? p.period.start, lang)}`);
        expect(s.team?.label).toBe(p.team);
        expect(String(s.team?.size)).toBe(/^\d+/.exec(p.team)?.[0]);
        expect(s.role.text).toBe(p.role);
      }
    }
  });

  it("teammates' tools appear only as the team's part (팀원 담당), never in the owner's role", () => {
    for (const lang of LANGS) {
      for (const def of growthSteps.filter((d) => d.source.kind === 'project')) {
        const s = step(lang, def.id);
        const tools = project(lang, def.id).teamTools;
        if (!tools) {
          expect(s.teamPart, def.id).toBeNull();
          continue;
        }
        expect(s.teamPart).toEqual({ label: growthCopy.teamPart[lang], text: tools.join(' · ') });
        for (const tool of tools) expect(s.role.text, `${def.id} ${tool}`).not.toContain(tool);
      }
    }
    expect(growthCopy.teamPart.ko).toBe('팀원 담당');
  });

  it('role levels follow the ordinal rule: 3 ⇔ the role sentence says it led, 4 ⇔ first author; names from the copy', () => {
    for (const lang of LANGS) {
      for (const s of model[lang].steps) {
        expect(GROWTH_LEVELS).toContain(s.role.level);
        expect(s.role.name).toBe(growthCopy.role[s.role.level][lang]);
        const led = lang === 'ko' ? s.role.text.includes('주도') : /^Led\b/.test(s.role.text);
        expect(s.role.level === 3, s.id).toBe(led);
      }
      const firstAuthor = inputs[lang].publications.filter((p) => p.data.authors[0]?.me).map((p) => p.id);
      expect(model[lang].steps.filter((s) => s.role.level === 4).map((s) => s.id)).toEqual(firstAuthor);
      expect(model[lang].steps.at(-1)?.role.level).toBe(4);
    }
  });

  it('awards come from awards.yaml (the same names as the project frontmatter); the CoG talk from the publication', () => {
    for (const lang of LANGS) {
      for (const slug of ['kickick-park', 'school-zone-blindspots']) {
        const fm = project(lang, slug).award;
        const award = inputs[lang].awards.find((a) => a.id === fm?.certificate);
        expect(step(lang, slug).award).toMatchObject({ kind: 'award', name: award?.name[lang] });
        expect(award?.name[lang]).toBe(fm?.name);
        expect(step(lang, slug).award?.sub).toContain(award?.org[lang]);
      }
      const pub = inputs[lang].publications.find((p) => p.id === 'cog-2026-engagement')?.data;
      const talk = step(lang, 'cog-2026-engagement').award;
      expect(talk?.kind).toBe('talk');
      expect(talk?.name).toBe(`${pub?.venueShort} ${FORMAT_PHRASE[lang][pub?.format ?? 'Oral']}`);
      expect(pub?.presentation?.[lang]).toContain(talk?.sub);
      for (const id of ['seoul-apartment-automl', 'kbo-attendance', 'youth-startup-location']) expect(step(lang, id).award).toBeNull();
    }
  });

  it('LG Aimers: title, task and rank are the resume activity text split, nothing added; team and role sentence from its page', () => {
    for (const lang of LANGS) {
      const act = inputs[lang].resume.activities.find((a) => a.id === 'lg-aimers-7');
      const s = step(lang, 'lg-aimers-7');
      const joined = lang === 'ko' ? `${s.title}(${s.sub}) ${s.award?.name}` : `${s.title}, ${s.sub} — ${s.award?.name}`;
      expect(joined).toBe(act?.text[lang]);
      expect(s.award?.kind).toBe('rank');
      expect(s.period).toBe(formatYm(act?.date ?? '', lang));
      // owner 2026-10-08: the project page resort-menu-demand states the team and the role sentence
      const p = project(lang, 'resort-menu-demand');
      expect(s.team).toEqual({ size: 3, label: p.team });
      expect(s.role.text).toBe(p.role);
      expect(s.teamPart).toBeNull(); // the page names no teammates' tools
      expect(s.role.level).toBe(2);
    }
    expect(step('ko', 'lg-aimers-7').award?.name).toBe('817팀 중 32위 · 상위 4%');
    expect(step('ko', 'lg-aimers-7').role.text).toContain('예측 파이프라인 전체');
  });

  it('the CoG step: period and team from resume.yaml publicationProject, co-author = the advisor, numbers from the facts', () => {
    const facts = inputs.ko.facts;
    for (const lang of LANGS) {
      const s = step(lang, 'cog-2026-engagement');
      const pp = inputs[lang].resume.publicationProject;
      const pub = inputs[lang].publications.find((p) => p.id === 'cog-2026-engagement')?.data;
      expect(s.start).toBe(pp?.period.start);
      expect(s.team).toEqual({ size: pub?.authors.length, label: pp?.team[lang] });
      expect(s.teamPart).toEqual({ label: growthCopy.coAuthor[lang], text: inputs[lang].resume.profile.advisor[lang] });
      const coauthor = pub?.authors.find((a) => !a.me);
      expect(s.teamPart?.text).toContain(lang === 'ko' ? coauthor?.nameKo : coauthor?.name);
      expect(s.title).toBe(pub?.shortTitle?.[lang]);
      expect(s.role.text).toContain(resolveFacts('{pub.cog-2026-engagement.fact.matches}', lang, facts));
      expect(s.role.text).toContain(resolveFacts('{pub.cog-2026-engagement.fact.engagements}', lang, facts));
      const best = overallAuc.find((r) => r.highlight);
      expect(s.method?.text).toContain(String(overallAuc.length));
      expect(s.method?.text).toContain(`${best?.auc.toFixed(3)}`);
      expect(s.method?.text).toContain(best?.model);
    }
  });

  it('the log-scale lane plots only numbers the site states, parsed from the fact strings', () => {
    expect(parseSiteNumber('240,064')).toBe(240064);
    expect(parseSiteNumber('약 100만')).toBe(1_000_000);
    expect(parseSiteNumber('~1M')).toBe(1_000_000);
    expect(() => parseSiteNumber('many')).toThrow();
    for (const lang of LANGS) {
      const plotted = model[lang].steps.filter((s) => s.scale.length > 0).map((s) => [s.id, s.scale.map((p) => [p.value, p.approx])]);
      expect(plotted).toEqual([
        ['school-zone-blindspots', [[240064, false]]],
        ['cog-2026-engagement', [[206442, false], [1_000_000, true]]],
      ]);
      expect(model[lang].scaleTicks.map((t) => t.value)).toEqual([1e4, 1e5, 1e6]);
    }
    expect(model.ko.scaleTicks.map((t) => t.label)).toEqual(['1만', '10만', '100만']);
    expect(model.en.scaleTicks.map((t) => t.label)).toEqual(['10K', '100K', '1M']);
  });

  it('future slots: titles from research-page.ts ongoing, statuses from RESEARCH_STATUS (진행 중, 진행 중, 예정)', () => {
    for (const lang of LANGS) {
      const future = model[lang].future;
      expect(future.map((f) => f.status)).toEqual([RESEARCH_STATUS.inProgress[lang], RESEARCH_STATUS.inProgress[lang], RESEARCH_STATUS.planned[lang]]);
      const journal = researchPage.ongoing.find((o) => o.id === 'cog-journal');
      expect(future[0]?.title).toBe(resolveFacts(journal?.title[lang] ?? '', lang, inputs[lang].facts));
      const thesis = researchPage.ongoing.find((o) => o.id === 'ms-thesis');
      expect(thesis?.title[lang].startsWith(`${future[1]?.title}:`)).toBe(true);
      expect(future[2]?.title).toBe(growthFuture[2]?.label?.[lang]);
    }
    expect(model.ko.future.map((f) => f.status)).toEqual(['진행 중', '진행 중', '예정']);
  });

  it('collaboration stages group the steps with a known team by role level (LG Aimers since its page, owner 2026-10-08)', () => {
    for (const lang of LANGS) {
      const stages = model[lang].stages.map((st) => [st.n, st.items.map((s) => s.id)]);
      expect(stages).toEqual([
        [1, ['seoul-apartment-automl', 'kickick-park', 'kbo-attendance', 'youth-startup-location', 'lg-aimers-7']],
        [2, ['school-zone-blindspots']],
        [3, ['cog-2026-engagement']],
      ]);
      expect(model[lang].stages[0]?.years).toBe('2023–2025');
    }
  });

  it('a role sentence never repeats its level name (no "제1저자 — 제1저자.")', () => {
    for (const lang of LANGS) {
      for (const s of model[lang].steps) expect(s.role.text.toLowerCase().startsWith(s.role.name.toLowerCase()), `${lang} ${s.id}: ${s.role.text}`).toBe(false);
    }
  });

  it('the intro\'s first-role wording matches the first step\'s role level (owner ruling 2026-10-06)', () => {
    for (const lang of LANGS) {
      const first = model[lang].steps[0]!;
      expect(first.role.level).toBe(2);
      // the intros, the party-log title and the stage-1 heading (stage 1 holds level-1 and level-2 projects)
      for (const text of [model[lang].copy.lede, model[lang].copy.ledeData, model[lang].copy.party.title, model[lang].copy.stages[1]]) {
        if (first.role.level >= 2) expect(text, `${lang}: ${text}`).not.toMatch(lang === 'ko' ? /한 부분|한 단계/ : /one part|one stage/i);
      }
    }
    expect(model.ko.copy.lede).toContain('모델링을 뺀 단계들');
    expect(model.ko.copy.ledeData).toContain('팀 파이프라인의 여러 단계를 맡는 데서');
    expect(model.en.copy.ledeData).toContain('several stages of a team pipeline');
    // owner 2026-10-08: stage 1 also holds LG Aimers (the whole pipeline), so the heading no longer says "some"
    expect(model.ko.copy.stages[1]).toBe('팀 파이프라인의 단계를 맡았습니다');
    expect(model.en.copy.party.title).toBe('From stages of a team pipeline, to its direction, to first author');
    for (const lang of LANGS) expect(`${model[lang].copy.stages[1]} ${model[lang].copy.party.title}`).not.toMatch(/일부|\bsome\b/);
  });

  it('copy: every entry has ko and en, none empty; the model resolves every token', () => {
    const walk = (v: unknown, where: string): void => {
      if (v && typeof v === 'object' && 'ko' in v && 'en' in v) {
        for (const lang of LANGS) expect((v as Record<Lang, unknown>)[lang], `${where}.${lang}`).toBeTruthy();
        return;
      }
      if (v && typeof v === 'object') for (const [k, c] of Object.entries(v)) walk(c, `${where}.${k}`);
    };
    walk(growthCopy, 'growthCopy');
    walk(growthSteps, 'growthSteps');
    for (const lang of LANGS) expect(JSON.stringify(model[lang])).not.toMatch(/\{[a-z][\w-]*(?:\.[\w-]+)+\}/);
  });
});
