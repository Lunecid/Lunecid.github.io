import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import CredentialList from '../../src/components/records/CredentialList.astro';
import { resumeSchema, type ResumeData } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import { credentialItems } from '../../src/lib/records';
import { renderAstro } from './helpers';

const resume = resumeSchema.parse(parseYamlDocument(readFileSync(resolve(process.cwd(), 'src/data/resume.yaml'), 'utf8'), 'resume'));
const LANGUAGES: ResumeData['languages'] = [
  { id: 'korean', name: { ko: '한국어', en: 'Korean' }, level: { ko: '모국어', en: 'Native' }, records: false, pdf: { ko: false, en: true, academic: true } },
  {
    id: 'toeic',
    name: { ko: 'TOEIC', en: 'TOEIC' },
    level: { ko: '775점', en: '775' },
    date: '2024-12-15',
    validUntil: '2026-12-15',
    onExpire: 'mark',
    records: true,
    pdf: { ko: true, en: true, academic: true },
  },
];
const ACTIVITIES: ResumeData['activities'] = [
  {
    id: 'lg-aimers-7',
    text: {
      ko: 'LG Aimers 7기 온라인 해커톤(리조트 식음업장 메뉴 수요 예측) 817팀 중 32위 · 상위 4%',
      en: 'LG Aimers (7th cohort) online hackathon, resort menu demand forecasting — 32nd of 817 teams (top 4%)',
    },
    date: '2025-07',
    end: '2025-09',
    href: 'https://dacon.io/myprofile/530929/competition',
    pdf: { ko: true, en: false, academic: false },
  },
];
const TITLES = { ko: { activities: '대외활동', certifications: '자격', languages: '어학', training: '교육' }, en: { activities: 'Activities', certifications: 'Certifications', languages: 'Languages', training: 'Training' } };

function groupsOf(fixture: ResumeData, lang: 'ko' | 'en', today: string) {
  const items = credentialItems(fixture, lang, today);
  return (['activities', 'certifications', 'languages', 'training'] as const).map((id) => ({ id, title: TITLES[lang][id], items: items[id] }));
}

describe('CredentialList.astro: one INVENTORY table (P1-9)', () => {
  it('one table, the four kinds as row groups whose ids are the records anchors, an expired badge', async () => {
    const fixture = { ...resume, languages: LANGUAGES };
    const expired = await renderAstro(CredentialList, { props: { variant: 'game', lang: 'ko', groups: groupsOf(fixture, 'ko', '2026-12-16') } });
    expect(expired).toMatch(/<section(?=[^>]*\bid="inventory")[^>]*>/);
    expect(expired).toContain('INVENTORY');
    expect(expired).toMatch(/<h2[^>]*>대외활동·자격·어학·교육<\/h2>/);
    expect(expired.match(/<table\b/g)).toHaveLength(1);
    const bodies = [...expired.matchAll(/<tbody id="([a-z]+)"/g)].map((m) => m[1]);
    expect(bodies).toEqual(['activities', 'certifications', 'languages', 'training']);
    expect(expired).toMatch(/<th colspan="2" scope="rowgroup"[^>]*>\s*<span class="creds__group-title"[^>]*>어학<\/span>/);
    expect(expired).toMatch(/<span class="creds__badge lh-tag"[^>]*>만료<\/span>/);
    expect(expired).not.toContain('한국어'); // records: false stays PDF-only

    const valid = await renderAstro(CredentialList, { props: { variant: 'game', lang: 'ko', groups: groupsOf(fixture, 'ko', '2026-12-15') } });
    expect(valid).not.toContain('creds__badge');
    expect(valid).toContain('2026.12.15까지 유효');
  });

  it('an activity with an end month renders a period in the date column', async () => {
    const fixture = { ...resume, activities: ACTIVITIES };
    const ko = await renderAstro(CredentialList, { props: { variant: 'game', lang: 'ko', groups: groupsOf(fixture, 'ko', '2026-01-01') } });
    expect(ko).toContain('LG Aimers 7기 온라인 해커톤(리조트 식음업장 메뉴 수요 예측) 817팀 중 32위 · 상위 4%');
    expect(ko).toMatch(/<a class="creds__ev"[^>]*href="https:\/\/dacon\.io\/myprofile\/530929\/competition"[^>]*>\s*DACON 기록<span class="creds__ev-arrow"[^>]*>↗<\/span>\s*<\/a>/);
    expect(ko).toMatch(/<td class="creds__meta"[^>]*>2025\.07 – 2025\.09<\/td>/);
    const en = await renderAstro(CredentialList, { props: { variant: 'game', lang: 'en', groups: groupsOf(fixture, 'en', '2026-01-01') } });
    expect(en).toMatch(/<a class="creds__ev"[^>]*href="https:\/\/dacon\.io\/myprofile\/530929\/competition"[^>]*>\s*DACON record<span class="creds__ev-arrow"[^>]*>↗<\/span>\s*<\/a>/);
    expect(en).toMatch(/<td class="creds__meta"[^>]*>Jul 2025 – Sep 2025<\/td>/);
    expect(en).toMatch(/<h2[^>]*>Activities, certificates, languages and training<\/h2>/);
  });

  it('activities without href render text only (no DACON evidence link)', async () => {
    const { href: _omit, ...withoutHref } = ACTIVITIES[0];
    const fixture = { ...resume, activities: [withoutHref] };
    const ko = await renderAstro(CredentialList, { props: { variant: 'game', lang: 'ko', groups: groupsOf(fixture, 'ko', '2026-01-01') } });
    expect(ko).not.toContain('creds__ev');
    expect(ko).not.toContain('DACON 기록');
  });

  it('CDS and CCAIM training show name, organiser, period, and no hours text', async () => {
    const ko = await renderAstro(CredentialList, { props: { variant: 'game', lang: 'ko', groups: groupsOf(resume, 'ko', '2026-01-01') } });
    expect(ko).toContain('CDS빅데이터 교육');
    expect(ko).toContain('부산대학교');
    expect(ko).toMatch(/<td class="creds__meta"[^>]*>2024\.07 – 2024\.08<\/td>/);
    expect(ko).toContain('CCAIM Machine Learning for Healthcare Summer School 2026');
    expect(ko).toContain('케임브리지대학교 CCAIM(Cambridge Centre for AI in Medicine) · 온라인 참가');
    expect(ko).toMatch(/<td class="creds__meta"[^>]*>2026\.09<\/td>/);
    const trainingBlock = ko.match(/<tbody id="training"[\s\S]*?<\/tbody>/)?.[0] ?? '';
    expect(trainingBlock).not.toMatch(/0시간|undefined| · <\/td>/);
    const orderKo = ['멀티잇', 'CDS빅데이터', 'OxML', '참여연구원', 'CCAIM'];
    const positionsKo = orderKo.map((name) => trainingBlock.indexOf(name));
    expect(positionsKo.every((i) => i >= 0)).toBe(true);
    expect([...positionsKo].sort((a, b) => a - b)).toEqual(positionsKo);

    const en = await renderAstro(CredentialList, { props: { variant: 'game', lang: 'en', groups: groupsOf(resume, 'en', '2026-01-01') } });
    expect(en).toContain('CDS Big Data Training');
    expect(en).toContain('Pusan National University');
    expect(en).toMatch(/<td class="creds__meta"[^>]*>Jul 2024 – Aug 2024<\/td>/);
    expect(en).toContain('CCAIM Machine Learning for Healthcare Summer School 2026');
    expect(en).toContain('Cambridge Centre for AI in Medicine (CCAIM), University of Cambridge (online)');
    expect(en).toMatch(/<td class="creds__meta"[^>]*>Sep 2026<\/td>/);
    const trainingEn = en.match(/<tbody id="training"[\s\S]*?<\/tbody>/)?.[0] ?? '';
    expect(trainingEn).not.toMatch(/0 hours|undefined| · <\/td>/);
    const orderEn = ['Multi-IT', 'CDS Big Data', 'OxML', 'Research Ethics', 'CCAIM'];
    const positionsEn = orderEn.map((name) => trainingEn.indexOf(name));
    expect(positionsEn.every((i) => i >= 0)).toBe(true);
    expect([...positionsEn].sort((a, b) => a - b)).toEqual(positionsEn);
  });
});
