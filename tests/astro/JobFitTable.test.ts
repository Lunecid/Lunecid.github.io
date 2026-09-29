import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import JobFitTable from '../../src/components/records/JobFitTable.astro';
import { jobfitSchema } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import type { Lang } from '../../src/i18n/ui';
import { formatDate } from '../../src/i18n/utils';
import type { JobfitStatus } from '../../src/types';
import { anchorBlock, readSource, renderAstro } from './helpers';
import { loadFactSource } from '../helpers/fact-source';

const jobfit = jobfitSchema.parse(parseYamlDocument(readFileSync(resolve(process.cwd(), 'src/data/jobfit.game.yaml'), 'utf8'), 'game'));
const STATUS_KO: Record<JobfitStatus, string> = { met: '충족', partial: '부분', 'in-progress': '보완 중', later: '후순위', 'n-a': '해당 없음' };
const STATUS_EN: Record<JobfitStatus, string> = { met: 'Met', partial: 'Partial', 'in-progress': 'In progress', later: 'Later', 'n-a': 'N/A' };
const render = (lang: Lang) => renderAstro(JobFitTable, { props: { lang, data: jobfit, facts: loadFactSource() } });
const hrefsOf = (html: string): string[] => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);

describe('JobFitTable.astro', () => {
  it('section#job-fit with 13 row headers', async () => {
    const ko = await render('ko');
    expect(ko).toMatch(/<section(?=[^>]*\bid="job-fit")[^>]*>/);
    expect(ko).toMatch(/<h2[^>]*>지원 요건 대응<\/h2>/);
    const rowHeads = [...ko.matchAll(/<th(?=[^>]*scope="row")[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(rowHeads).toHaveLength(13);
    expect(rowHeads).toEqual(jobfit.rows.map((row) => row.requirement.ko));
    const colHeads = [...ko.matchAll(/<th(?=[^>]*scope="col")[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    // explicit roles: the phone layout changes the rows' CSS display, the table semantics stay
    expect(ko).toMatch(/<table class="jobfit__table" role="table"/);
    expect(ko.match(/role="rowheader"/g)).toHaveLength(13);
    expect(ko.match(/role="columnheader"/g)).toHaveLength(5);
    expect(colHeads).toEqual(['요건', '공고 빈도', '근거', '상태', '보완 계획']);
    // final fix 2 item 7: one span per postings count (stacked in the table), the separator kept for screen readers
    expect(ko).toMatch(/<span class="jobfit__freq-part"[^>]*>12\/13<\/span><span class="jobfit__freq-sep"[^>]*> · <\/span><span class="jobfit__freq-part"[^>]*>7\/13<\/span>/);
  });

  it('status shown as text label', async () => {
    const ko = await render('ko');
    const statuses = [...ko.matchAll(/<span(?=[^>]*class="jobfit__status jobfit__status--([a-z-]+)")[^>]*>([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
    expect(statuses).toEqual(jobfit.rows.map((row) => [row.status, STATUS_KO[row.status]]));
    const en = await render('en');
    const enLabels = [...en.matchAll(/<span(?=[^>]*class="jobfit__status jobfit__status--[a-z-]+")[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(enLabels).toEqual(jobfit.rows.map((row) => STATUS_EN[row.status]));
  });

  it("evidence links localized on en and 'None yet' when empty", async () => {
    const en = await render('en');
    const hrefs = hrefsOf(en);
    const internal = hrefs.filter((href) => href.startsWith('/'));
    expect(internal.length).toBeGreaterThan(0);
    for (const href of internal) expect(href.startsWith('/en/')).toBe(true);
    expect(hrefs).toContain('/en/research/cog-2026-engagement/');
    expect(hrefs.some((href) => href.includes('#for-game-teams'))).toBe(false);
    expect(hrefs).toContain('/en/records/#education');
    expect(hrefs).toContain('/en/research/#in-progress');
    // D-6: no posting URLs on the site; D-9: AI·LLM has no evidence yet (take-home, AI·LLM, BM · anomaly).
    // the only external link is the owner's CoG code (PyTorch evidence), never a posting
    expect(hrefs.filter((href) => /^https?:/.test(href))).toEqual(['https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026']);
    const empty = jobfit.rows.filter((row) => row.evidence.length === 0).length;
    expect(empty).toBe(3);
    expect(en.match(/None yet/g)).toHaveLength(empty);

    const ko = await render('ko');
    expect(ko.match(/아직 없음/g)).toHaveLength(empty);
    expect(hrefsOf(ko)).toContain('/research/cog-2026-engagement/');
    expect(hrefsOf(ko).filter((href) => href.startsWith('/en/'))).toEqual([]);
    // D10a: the log-validation row never claims a leakage audit.
    expect(ko).not.toMatch(/누수 (감사|점검)/);
    expect(en).not.toMatch(/leakage audit/i);
  });

  it('as-of date and one anonymized source line (D-6)', async () => {
    const ko = await render('ko');
    expect(ko).toMatch(new RegExp(`<time[^>]*datetime="${jobfit.asOf}"[^>]*>${formatDate(jobfit.asOf, 'ko').replace(/\./g, '\\.')}</time>`));
    expect(ko).toContain('기준일');
    expect(ko).toMatch(/<p(?=[^>]*class="jobfit__note")[^>]*><span[^>]*>출처:<\/span> 국내 게임사 데이터 분석가 공고 13건 \(2024–2026\)<\/p>/);
    expect(ko).not.toMatch(/class="jobfit__sources"/);
    const en = await render('en');
    expect(en).toMatch(new RegExp(`<time[^>]*datetime="${jobfit.asOf}"[^>]*>${formatDate(jobfit.asOf, 'en')}</time>`));
    expect(en).toMatch(/<p(?=[^>]*class="jobfit__note")[^>]*><span[^>]*>Source:<\/span> 13 Korean game-company data-analyst postings \(2024–2026\)<\/p>/);
    for (const html of [ko, en]) {
      expect(html).not.toMatch(/넥슨|NEXON|크래프톤|KRAFTON|컴투스|Com2uS|gamejob|greenhouse|linkareer/i);
    }
  });

  it('next-step cell is empty for met rows and for rows without a genuine step (D-6)', async () => {
    const ko = await render('ko');
    const plans = [...ko.matchAll(/<td class="jobfit__plan"[^>]*>(?:<span class="jobfit__label"[^>]*>보완 계획<\/span>)?([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(plans).toEqual(jobfit.rows.map((row) => row.plan?.ko ?? ''));
    for (const row of jobfit.rows.filter((r) => r.status === 'met')) expect(row.plan, row.id).toBeNull();
  });

  it('P1-11: no sideways scroller; cards below 734px, a fixed-layout table from 734px', async () => {
    const ko = await render('ko');
    expect(ko).not.toContain('jobfit__scroll');
    const src = readSource('src/components/records/JobFitTable.astro');
    expect(src).not.toMatch(/\{[^}]*min-width:\s*\d+px/); // no min-width declaration (media queries aside)
    expect(src).toMatch(/@media \(max-width: 733\.98px\) \{[\s\S]*?\.jobfit__row \{[^}]*grid-template-areas: "req status" "freq freq" "ev ev" "plan plan"/);
    expect(src).toMatch(/\.jobfit__ev \{ display: flex; align-items: center; min-height: var\(--tap\)/); // 44px evidence rows on phones
    expect(src).toMatch(/@media \(min-width: 734px\) \{[\s\S]*?\.jobfit__table \{ table-layout: fixed;/);
    expect(src).toMatch(/@media \(min-width: 1068px\) \{[\s\S]*?\.jobfit__col-req \{ width: 18%; \}[\s\S]*?\.jobfit__col-freq \{ width: 9%; \}/);
    // Fix round 1 item 2: from 734px the target is a real 44px flex row (no negative margin cancelling the
    // padding out again — that let neighbouring evidence links' hit boxes overlap).
    expect(src).toMatch(/\.jobfit__ev \{ display: flex; align-items: center; min-height: var\(--tap\); white-space: nowrap; font-size: 13px; \}/);
    expect(src).not.toMatch(/margin-block:\s*-/); // no negative margin anywhere in this component
  });

  it('P1-11: short evidence labels in the table, the full label as title and accessible name (a part of it, WCAG 2.5.3)', async () => {
    const ko = await render('ko');
    const shortLinks = [
      ...ko.matchAll(
        /<a class="jobfit__ev" href="[^"]+" title="([^"]+)"[^>]*><span class="jobfit__ev-short" aria-hidden="true"[^>]*>([^<]+)<\/span><span class="jobfit__ev-full"[^>]*>([^<]+)<\/span>(?:<span class="jobfit__ev-arrow" aria-hidden="true">↗<\/span>)?<\/a>/g,
      ),
    ];
    expect(shortLinks.length).toBeGreaterThan(10);
    for (const [, titleAttr, short, full] of shortLinks) {
      expect(full).toBe(titleAttr);
      expect(full, `${short} is part of ${full}`).toContain(short);
    }
    expect(ko).toContain('title="CoG 2026 논문(LightGBM)"');
    // P2-14: the code evidence link (GitHub) gets ↗ (leaves the site); the internal /research/ evidence link next
    // to it does not (anchorBlock: tests/astro/helpers.ts, shared with SkillList.test.ts).
    expect(anchorBlock(ko, 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026')).toContain('↗');
    expect(anchorBlock(ko, '/research/cog-2026-engagement/')).not.toContain('↗');
    for (const row of jobfit.rows) for (const e of row.evidence) if (e.short) {
      expect(e.label.ko).toContain(e.short.ko);
      expect(e.label.en).toContain(e.short.en);
    }
  });

  it('P2-18: status badges look different per state (filled / outline / gold dashed / grey)', () => {
    const src = readSource('src/components/records/JobFitTable.astro');
    expect(src).toMatch(/\.jobfit__status--met \{ background: var\(--accent-deep\);[^}]*color: var\(--read-card\)/);
    expect(src).toMatch(/\.jobfit__status--partial \{[^}]*border-color: var\(--accent-deep\); color: var\(--accent-deep\)/);
    expect(src).toMatch(/\.jobfit__status--in-progress \{[^}]*border: 1px dashed var\(--gold\); color: var\(--gold-deep\)/);
    expect(src).toMatch(/\.jobfit__status--later,\s*\.jobfit__status--n-a \{[^}]*color: var\(--read-muted\)/);
  });

  it('A-13 / §2.6: a missing table renders the pending state inside section#job-fit', async () => {
    for (const [lang, line] of [['ko', '공고 조사를 마친 뒤 이 표를 채웁니다.'], ['en', 'This table will be filled in after the job-posting survey is complete.']] as const) {
      const html = await renderAstro(JobFitTable, { props: { lang, data: null, facts: loadFactSource() } });
      expect(html).toMatch(/<section(?=[^>]*\bid="job-fit")[^>]*>/);
      expect(html).toMatch(/<h2[^>]*id="job-fit-title"/);
      expect(html).toMatch(new RegExp(`<p class="jobfit__pending"[^>]*>${line.replace(/\./g, '\\.')}</p>`));
      expect(html).not.toContain('<table');
    }
  });

  it('the intro and the source line resolve {table.*} from the table sample', async () => {
    const ko = await render('ko');
    expect(ko).toContain('국내 게임사 데이터 분석가 공고 13건(2024–2026, 원문 확인)');
    expect(ko).not.toMatch(/\{table\./);
  });
});
