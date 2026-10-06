// @vitest-environment jsdom
// The case sheet markup (src/lib/case/sheet.ts): the v4 sheet.html as an escaped template, per language.
import { readFileSync } from 'node:fs';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { publicationSchema } from '../../src/content/schemas';
import { caseCopy } from '../../src/data/copy/case/cog-2026';
import { CASE_FACTS, gapSteps, killGap, overallAuc, pairCounts, strataRows } from '../../src/data/research/cog-2026-case';
import { caseSheetData, renderCaseSheet, type CaseSheetInput } from '../../src/lib/case/sheet';
import { readFrontmatter } from '../content/helpers';
import { loadFactSource } from '../helpers/fact-source';

const facts = loadFactSource();
const pub = publicationSchema(z.string()).parse(readFrontmatter('src/content/publications/cog-2026-engagement.md'));
const IMG = { fig1: { src: '/_astro/fig1.webp', srcset: '/_astro/fig1.webp 640w', width: 1600, height: 873 }, kde: { src: '/_astro/kde.webp', srcset: '/_astro/kde.webp 640w', width: 1440, height: 800 } };
const input = (lang: 'ko' | 'en'): CaseSheetInput => ({ lang, facts, paper: pub, images: IMG });
const sheet = (lang: 'ko' | 'en') => {
  const data = caseSheetData(input(lang));
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${data.html}</body></html>`, 'text/html');
  return { data, doc, html: data.html };
};
const auc3 = (v: number) => v.toFixed(3);

describe('case sheet', () => {
  for (const lang of ['ko', 'en'] as const) {
    it(`${lang}: one dialog, named and described, with five chapters whose h3 ids are cs-prefixed`, () => {
      const { doc } = sheet(lang);
      const dialog = doc.querySelector('dialog.cs')!;
      expect(dialog).not.toBeNull();
      expect(dialog.getAttribute('aria-labelledby')).toBe('cs-title');
      expect(dialog.getAttribute('aria-describedby')).toBe('cs-desc');
      expect(doc.getElementById('cs-title')!.textContent).toBe(pub.shortTitle![lang]);
      const chapters = [...doc.querySelectorAll('section.cs-ch')];
      expect(chapters.map((c) => c.id)).toEqual(['cs-ch1', 'cs-ch2', 'cs-ch3', 'cs-ch4', 'cs-ch5']);
      for (const c of chapters) expect(c.querySelector('h3')!.id).toBe(`${c.id}-t`);
      for (const el of doc.querySelectorAll('[id]')) expect(el.id, 'every id is cs-prefixed').toMatch(/^cs-/);
      const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(doc.querySelectorAll('.cs-steps button').length).toBe(5);
    });

    it(`${lang}: figures and tables numbered in order (16 figures, 6 tables), one role=img with a label per chart`, () => {
      const { doc } = sheet(lang);
      const fig = lang === 'ko' ? '그림' : 'Fig.';
      const table = lang === 'ko' ? '표' : 'Table';
      const figs = [...doc.querySelectorAll('figcaption .cs-cap-n')].map((e) => e.textContent);
      expect(figs).toEqual(Array.from({ length: 16 }, (_, i) => `${fig} ${i + 1}.`));
      const tables = [...doc.querySelectorAll('caption .cs-cap-n')].map((e) => e.textContent);
      expect(tables).toEqual(Array.from({ length: 6 }, (_, i) => `${table} ${i + 1}.`));
      const plots = [...doc.querySelectorAll('[data-plot]')];
      expect(plots.length).toBe(11);
      for (const p of plots) {
        expect(p.getAttribute('role')).toBe('img');
        expect(p.getAttribute('aria-label')!.length).toBeGreaterThan(20);
      }
    });

    it(`${lang}: every chart's label names every number the chart draws`, () => {
      const { doc } = sheet(lang);
      const label = (viz: string) => doc.querySelector(`[data-viz="${viz}"] [data-plot]`)!.getAttribute('aria-label')!;
      const n = (v: number) => v.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');
      const want: Record<string, string[]> = {
        sampling: ['0', String(CASE_FACTS.snapshotSec), String(2 * CASE_FACTS.snapshotSec), String(CASE_FACTS.windowSec)],
        res: ['0', String(CASE_FACTS.snapshotSec), String(2 * CASE_FACTS.snapshotSec), String(CASE_FACTS.windowSec)],
        pipe: [String(CASE_FACTS.clusterGapSec), String(CASE_FACTS.minAlivePerTeam)],
        win: [CASE_FACTS.windowSec, CASE_FACTS.binSec, CASE_FACTS.bins, CASE_FACTS.onsetLeadSec, CASE_FACTS.labelMinSec, CASE_FACTS.labelMaxSec].map(String),
        split: Object.values(CASE_FACTS.patches),
        auc: overallAuc.map((r) => auc3(r.auc)),
        gap: [gapSteps().from, gapSteps().input, gapSteps().mlp, gapSteps().learner, gapSteps().to, gapSteps().total].map(auc3),
        waffle: [pairCounts().pairs, pairCounts().chance, pairCounts().extra, pairCounts().wrong].map(String),
        gauge: ['0.5', '1.0', auc3(gapSteps().to), '35', auc3(gapSteps().mlp), '0.569–0.581'],
        strata: strataRows().flatMap((r) => [auc3(r.lgbm), `${auc3(r.neural[0])}–${auc3(r.neural[1])}`]),
        'gap-ruler': [String(killGap.modes[0]), String(killGap.modes[1]), String(killGap.valley), `${killGap.ariBand[0]}–${killGap.ariBand[1]}`, String(killGap.ariMin), String(CASE_FACTS.clusterGapSec)],
      };
      for (const [viz, values] of Object.entries(want)) for (const v of values) expect(label(viz), `${viz} ${v}`).toContain(v);
      expect(n(CASE_FACTS.engagements)).toBe('1,115,123');
    });

    it(`${lang}: tables match the data`, () => {
      const { doc } = sheet(lang);
      const tables = [...doc.querySelectorAll('table')];
      const cells = (t: Element) => [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim()));
      const aucTable = cells(tables[1]!);
      expect(aucTable.map((r) => [r[0], r[3]])).toEqual(overallAuc.map((r) => [r.model, auc3(r.auc)]));
      expect(cells(tables[2]!).map((r) => r[2])).toEqual([`+${auc3(gapSteps().input)}`, `+${auc3(gapSteps().learner)}`, `+${auc3(gapSteps().total)}`]);
      expect(cells(tables[4]!).map((r) => [r[1], r[2]])).toEqual(strataRows().map((r) => [auc3(r.lgbm), `${auc3(r.neural[0])}–${auc3(r.neural[1])}`]));
      expect(cells(tables[5]!).map((r) => r[1])).toEqual([killGap.n.toLocaleString('en-US'), `${killGap.modes[0]} s`, `${killGap.valley} s`, `${killGap.modes[1]} s`, `${killGap.ariBand[0]}–${killGap.ariBand[1]} s`, `≤ ${CASE_FACTS.clusterGapSec} s`]);
      const flow = [...doc.querySelectorAll('.cs-flow__v')].map((e) => e.textContent);
      expect(flow).toEqual([CASE_FACTS.collectedMatches, CASE_FACTS.matches, CASE_FACTS.engagements, Object.keys(CASE_FACTS.patches).length].map((v) => v.toLocaleString('en-US')));
    });

    it(`${lang}: no script, style element or event handler; text escaped; the paper link is a placeholder`, () => {
      const { html, doc } = sheet(lang);
      expect(html).not.toMatch(/<script|<style|\son[a-z]+=/i);
      expect(doc.querySelectorAll('script, style').length).toBe(0);
      const paper = doc.querySelector('a[data-case-paper]')!;
      expect(paper.getAttribute('href')).toBe('');
      expect(doc.querySelector(`a[href="${pub.code}"]`)).not.toBeNull();
      expect(doc.getElementById('cs-bibtex')!.textContent).toBe(pub.bibtex.trimEnd());
      expect(html).not.toMatch(/\{(?:case|pub)\.|\^\[|\*\*/);
      // a string with markup characters comes out escaped
      const evil = caseSheetData({ ...input(lang), paper: { ...pub, bibtex: '<img src=x onerror=alert(1)>' } }).html;
      expect(evil).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it(`${lang}: authors from the frontmatter, romanized in both languages; venue through the fact tokens`, () => {
      const { doc } = sheet(lang);
      const by = doc.querySelector('.cs-cover__by')!;
      expect(by.getAttribute('lang')).toBe('en');
      expect(by.textContent).toBe(`${pub.authors.map((a) => a.name).join(' · ')} · ${pub.venueShort} (Oral)`);
      expect(doc.querySelector('.cs-cover__kick')!.textContent).toBe(`CASE FILE · ${pub.venueShort} · ORAL`);
    });

    it(`${lang}: references are reader-facing (D6): no repository path`, () => {
      const { doc } = sheet(lang);
      const refs = [...doc.querySelectorAll('#cs-refs li')].map((li) => li.textContent!);
      expect(refs.length).toBe(6);
      expect(refs.join(' ')).not.toMatch(/src\/|\.ts\b|\.md\b|\.webp\b/);
      expect(refs[5]).toContain(pub.title);
      expect(refs[5]).toContain(String(CASE_FACTS.paperNumber));
    });
  }

  it('the en fragment is lang="en"; the ko fragment marks its English kicker lang="en"', () => {
    const ko = sheet('ko').doc;
    const en = sheet('en').doc;
    expect(en.querySelector('dialog')!.getAttribute('lang')).toBe('en');
    expect(ko.querySelector('dialog')!.getAttribute('lang')).toBe('ko');
    expect(ko.querySelector('.cs-cover__kick')!.getAttribute('lang')).toBe('en');
    expect([...ko.querySelectorAll('.cs-ch__en')].every((e) => e.getAttribute('lang') === 'en')).toBe(true);
    expect(en.querySelectorAll('.cs-ch__en').length).toBe(0);
  });

  it('the JSON per language stays within 20 KB gzipped and carries the chart labels and the runtime strings', async () => {
    const { gzipSync } = await import('node:zlib');
    for (const lang of ['ko', 'en'] as const) {
      const json = JSON.stringify(caseSheetData(input(lang)));
      expect(gzipSync(json).length, lang).toBeLessThanOrEqual(20 * 1024);
      const data = JSON.parse(json);
      expect(Object.keys(data).sort()).toEqual(['html', 'labels', 'lang', 'say', 'strings']);
      expect(data.say).toHaveLength(5);
      expect(data.labels.window).toContain(String(CASE_FACTS.windowSec));
    }
    expect(readFileSync('src/lib/case/sheet.ts', 'utf8')).not.toMatch(/innerHTML|<script/);
  });

  it('the copy reaches the sheet: every ko chapter title is in the markup', () => {
    const { doc } = sheet('ko');
    for (const ch of ['ch1', 'ch2', 'ch3', 'ch4', 'ch5'] as const) expect(doc.getElementById(`cs-${ch}-t`)!.textContent).toContain(caseCopy.ko[ch].title);
  });
});
