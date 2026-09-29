import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { SITE } from '../../src/config';
import { newsSchema, publicationSchema, resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import { homeCopy } from '../../src/data/copy/home';
import { CHANCE_AUC, figureCopy, overallAuc } from '../../src/data/research/cog-2026';
import { GITHUB_EXCLUDED } from '../../src/data/github-repos';
import { researchPage } from '../../src/data/research-page';
import { isKnownInternalHref } from '../../src/lib/routes';
import { findDates, listMarkdown, readFrontmatter, resolveFromFile } from './helpers';

const PUB = 'src/content/publications/cog-2026-engagement.md';
const CODE_URL = 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026';
const publication = publicationSchema(z.string());

const fullText = (path: string) => readFileSync(path, 'utf8');

describe('publication', () => {
  it('publication validates and has no pdf without doi', () => {
    const result = publication.safeParse(readFrontmatter(PUB));
    expect(result.error?.issues ?? []).toEqual([]);
    const data = publication.parse(readFrontmatter(PUB));
    expect(data.pdf).toBeNull();
    expect(data.doi).toBeNull();
    expect(data.statusNote).toEqual({ ko: 'IEEE Xplore 게재 예정', en: 'To appear in IEEE Xplore' });
    expect(data.format).toBe('Oral');
    expect(data.highlight).toBe(true);
    expect(data.authors.filter((a) => a.me).map((a) => a.name)).toEqual(['Seongeun Baek']);
    expect(data.caseStudy).toBe('/research/cog-2026-engagement/');
    expect(isKnownInternalHref(data.caseStudy ?? '')).toBe(true);
  });

  it('paper page data (D-15): IEEE keywords, affiliations without e-mail, presentation lines, short title', () => {
    const data = publication.parse(readFrontmatter(PUB));
    // Verbatim from the IEEEkeywords block of LOL_teamfight/paper/abstract.tex.
    expect(data.keywords).toEqual(['League of Legends', 'esports analytics', 'engagement-outcome prediction', 'public game telemetry']);
    // \IEEEauthorblockA of LOL_teamfight/paper/main.tex without its e-mail line.
    for (const author of data.authors) expect(author.affiliation, author.name).toEqual(['Pusan National University', 'South Korea']);
    expect(fullText(PUB)).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(data.presentation).toEqual({ ko: '구두 발표 · 스페인 마드리드 · 2026.09.01–04', en: 'Oral presentation · Madrid, Spain · Sep 1–4, 2026' });
    expect(data.shortTitle).toEqual({ ko: '리그 오브 레전드 교전 결과 예측', en: 'Predicting League of Legends engagement outcomes' });
    expect(data.bibtex).toContain('booktitle = {2026 IEEE Conference on Games (CoG)}');
  });

  it('code link is the v1.0-cog2026 tag', () => {
    expect(publication.parse(readFrontmatter(PUB)).code).toBe(CODE_URL);
  });

  it('the thumbnail path resolves', () => {
    const src = publication.parse(readFrontmatter(PUB)).thumbnail.src;
    expect(src).toMatch(/assets\/research\/cog-2026\/[a-z-]+\.webp$/);
    expect(existsSync(resolveFromFile(PUB, src)), src).toBe(true);
  });

  it('claims no leakage audit (the CoG page shows the abstract only, D-15)', () => {
    for (const path of [PUB, 'src/data/research/cog-2026.ts']) {
      const text = fullText(path);
      for (const phrase of ['누수 감사', '누수 점검']) expect(text.includes(phrase), `${path} ${phrase}`).toBe(false);
      expect(/leakage audit/i.test(text), path).toBe(false);
    }
  });
});

describe('CoG chart data (kept for reuse after D-15)', () => {
  it('cog-2026.ts AUC numbers match the chart alt texts in both languages', () => {
    expect(CHANCE_AUC).toBe(0.5);
    expect(overallAuc.filter((r) => r.highlight).map((r) => r.id)).toEqual(['lightgbm']);
    expect(overallAuc.map((r) => r.auc)).toEqual([...overallAuc.map((r) => r.auc)].sort((a, b) => b - a));
    for (const lang of ['ko', 'en'] as const) {
      for (const row of overallAuc) expect(figureCopy.aucOverall.alt[lang], `${lang} ${row.id}`).toContain(row.auc.toFixed(3));
    }
    for (const figure of Object.values(figureCopy)) {
      for (const lang of ['ko', 'en'] as const) {
        expect(figure.caption[lang].trim()).not.toBe('');
        expect(figure.alt[lang].trim()).not.toBe('');
      }
    }
  });

  it('F-084: kill-gap KDE caption names the shaded ARI band, valley G, modes and n from the figure', () => {
    for (const lang of ['ko', 'en'] as const) {
      const caption = figureCopy.killGap.caption[lang];
      expect(caption).toMatch(/ARI\s*≥\s*0\.9/);
      expect(caption).toMatch(/10[–-]18/);
      expect(caption).toContain('13.72');
      expect(caption).toContain('5.72');
      expect(caption).toContain('62.73');
      expect(caption).toMatch(/10[,.]417[,.]458/);
    }
    expect(figureCopy.killGap.caption.ko).toMatch(/\uC785\uB2C8\uB2E4/); // 입니다 (합니다체)
  });
});

describe('news', () => {
  it('news validate, dates are quoted strings and hrefs are known routes', () => {
    const files = listMarkdown('src/content/news');
    expect(files.map((f) => basename(f))).toEqual(
      expect.arrayContaining(['2025-07-11-busan-big-data-award.md', '2026-09-01-cog-2026-oral.md', expect.stringMatching(/^\d{4}-\d{2}-\d{2}-cog-2026-accepted\.md$/)]),
    );
    for (const file of files) {
      const fm = readFrontmatter(file);
      expect(findDates(fm), file).toEqual([]);
      const result = newsSchema.safeParse(fm);
      expect(result.error?.issues ?? [], file).toEqual([]);
      const data = newsSchema.parse(fm);
      expect(basename(file).startsWith(`${data.date}-`), `${file} name starts with its date`).toBe(true);
      if (data.href !== null) expect(isKnownInternalHref(data.href), `${file} ${data.href}`).toBe(true);
    }
    const award = newsSchema.parse(readFrontmatter('src/content/news/2025-07-11-busan-big-data-award.md'));
    expect(award.href).toBe('/projects/school-zone-blindspots/');
    const oral = newsSchema.parse(readFrontmatter('src/content/news/2026-09-01-cog-2026-oral.md'));
    expect(oral.dateEnd).toBe('2026-09-04');
  });
});

describe('research page copy', () => {
  it('research-page.ts has both languages for every text and PUBG href is null', () => {
    const problems: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) node.forEach((child, i) => walk(child, `${path}[${i}]`));
      else if (node !== null && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        if ('ko' in record || 'en' in record) {
          for (const lang of ['ko', 'en']) {
            const v = record[lang];
            if (typeof v !== 'string' || v.trim() === '') problems.push(`${path}.${lang}`);
          }
        } else for (const [key, child] of Object.entries(record)) walk(child, `${path}.${key}`);
      }
    };
    walk(researchPage, 'researchPage');
    expect(problems).toEqual([]);
    expect(researchPage.interests).toHaveLength(3);
    const ongoing = new Map<string, string | null>(researchPage.ongoing.map((o) => [o.id, o.href]));
    expect(ongoing.get('pubg-survival')).toBeNull();
    // Owner, 2026-09-28: the course project removed from the site is never listed as ongoing.
    expect(ongoing.has('counseling-nlp')).toBe(false);
    expect(JSON.stringify(researchPage.ongoing)).not.toMatch(/집계한 결과만|aggregate results only/);
    for (const [id, href] of ongoing) if (href !== null) expect(isKnownInternalHref(href), id).toBe(true);
    expect(researchPage.forLabs.email).toBe(SITE.email);
    // contract §5.17: the PUBG repository is not linked anywhere, not even in a comment
    expect(readFileSync('src/data/research-page.ts', 'utf8')).not.toMatch(/github\.com\/Lunecid\/PUBG_Lab/);
  });
});

describe('final review fix 1 item 6: PUBG_Lab stays unlinked, and the public source never talks about its credentials', () => {
  it('the exclusion logic stays and no comment in src/, scripts/, docs/ or .github/ mentions a password or credential', () => {
    expect(GITHUB_EXCLUDED).toContain('PUBG_Lab');
    expect(researchPage.ongoing.find((o) => o.id === 'pubg-survival')?.href).toBeNull();
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return entry.name === 'generated' ? [] : walk(path);
        return /\.(ts|tsx|mjs|js|astro|md|ya?ml|json|css)$/.test(entry.name) ? [path] : [];
      });
    const secretWords = /pass(?:word|wd)|credential|비밀번호|hard-?coded/i;
    const offenders = ['src', 'scripts', 'docs', '.github']
      .filter((dir) => existsSync(dir))
      .flatMap(walk)
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ where: `${file}:${i + 1}`, line }))
          .filter(({ line }) => line.includes('PUBG_Lab') && secretWords.test(line)),
      )
      .map(({ where }) => where);
    expect(offenders).toEqual([]);
    const notes = ['src/data/github-repos.ts', 'src/data/research-page.ts', 'src/components/research/InProgressList.astro'];
    for (const file of notes) expect(readFileSync(file, 'utf8'), file).not.toMatch(/password|credential|hard-coded|DB 비밀번호/i);
  });
});

describe('final review fix 1: one wording per research fact across pages', () => {
  const langs = ['ko', 'en'] as const;

  it('item 13: the home NOW PLAYING line gives each ongoing item the status the research page gives it', () => {
    // "준비 중: a · b / 진행 중: c" → one status per group; statuses come from researchPage.ongoing (the research page's wording).
    const match: Record<string, RegExp> = { 'cog-journal': /저널|journal/i, 'ms-thesis': /석사|M\.S\./, 'pubg-survival': /PUBG/ };
    for (const lang of langs) {
      const groups = homeCopy[lang].researchNowPlaying.split(' / ').map((group) => {
        const at = group.indexOf(': ');
        return { status: group.slice(0, at), items: group.slice(at + 2).split(' · ') };
      });
      for (const item of researchPage.ongoing) {
        const group = groups.find((g) => g.items.some((text) => match[item.id].test(text)));
        expect(group, `${lang}: ${item.id} is on the home line`).toBeDefined();
        expect(group?.status, `${lang}: ${item.id}`).toBe(item.status[lang].split(' · ')[0]);
      }
    }
  });

  it('item 17: the M.S. thesis is described with the research page wording on /records/ and the Academic CV too', () => {
    const resume = resumeSchema.parse(parseYamlDocument(readFileSync('src/data/resume.yaml', 'utf8'), 'resume'));
    const thesis = resume.education.find((e) => e.id === 'ms-pnu')?.thesis;
    const research = researchPage.ongoing.find((o) => o.id === 'ms-thesis');
    expect(thesis).toBeDefined();
    expect(research).toBeDefined();
    const topic = { ko: research!.title.ko.replace(/^석사 학위논문: /, ''), en: research!.title.en.replace(/^M\.S\. thesis: /, '') };
    expect(topic.ko).not.toBe(research!.title.ko);
    expect(topic.en).not.toBe(research!.title.en);
    for (const lang of langs) expect(thesis![lang].split(' — ')[1], lang).toBe(topic[lang]);
  });
});
