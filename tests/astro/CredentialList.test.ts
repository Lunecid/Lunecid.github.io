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
    text: { ko: 'LG Aimers 7기 해커톤 참가', en: 'LG Aimers (7th cohort) hackathon — participant' },
    date: '2025-07',
    end: '2025-09',
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
    const expired = await renderAstro(CredentialList, { props: { lang: 'ko', groups: groupsOf(fixture, 'ko', '2026-12-16') } });
    expect(expired).toMatch(/<section(?=[^>]*\bid="inventory")[^>]*>/);
    expect(expired).toContain('INVENTORY');
    expect(expired).toMatch(/<h2[^>]*>대외활동·자격·어학·교육<\/h2>/);
    expect(expired.match(/<table\b/g)).toHaveLength(1);
    const bodies = [...expired.matchAll(/<tbody id="([a-z]+)"/g)].map((m) => m[1]);
    expect(bodies).toEqual(['activities', 'certifications', 'languages', 'training']);
    expect(expired).toMatch(/<th colspan="2" scope="rowgroup"[^>]*>\s*<span class="creds__group-title"[^>]*>어학<\/span>/);
    expect(expired).toMatch(/<span class="creds__badge lh-tag"[^>]*>만료<\/span>/);
    expect(expired).not.toContain('한국어'); // records: false stays PDF-only

    const valid = await renderAstro(CredentialList, { props: { lang: 'ko', groups: groupsOf(fixture, 'ko', '2026-12-15') } });
    expect(valid).not.toContain('creds__badge');
    expect(valid).toContain('2026.12.15까지 유효');
  });

  it('an activity with an end month renders a period in the date column', async () => {
    const fixture = { ...resume, activities: ACTIVITIES };
    const ko = await renderAstro(CredentialList, { props: { lang: 'ko', groups: groupsOf(fixture, 'ko', '2026-01-01') } });
    expect(ko).toContain('LG Aimers 7기 해커톤 참가');
    expect(ko).toMatch(/<td class="creds__meta"[^>]*>2025\.07 – 2025\.09<\/td>/);
    const en = await renderAstro(CredentialList, { props: { lang: 'en', groups: groupsOf(fixture, 'en', '2026-01-01') } });
    expect(en).toMatch(/<td class="creds__meta"[^>]*>Jul 2025 – Sep 2025<\/td>/);
    expect(en).toMatch(/<h2[^>]*>Activities, certificates, languages and training<\/h2>/);
  });
});
