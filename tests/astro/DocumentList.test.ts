import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import DocumentList from '../../src/components/records/DocumentList.astro';
import { DOCUMENTS } from '../../src/config';
import { resumeSchema } from '../../src/content/schemas';
import { parseYamlDocument } from '../../src/content/yaml-loader';
import type { Lang } from '../../src/i18n/ui';
import { renderAstro } from './helpers';
import { getVariant } from '../../src/variants';

const resume = resumeSchema.parse(parseYamlDocument(readFileSync(resolve(process.cwd(), 'src/data/resume.yaml'), 'utf8'), 'resume'));
const GAME_DOCS = getVariant('game').documents.list;
const GAME_HREFS = GAME_DOCS.map((id) => DOCUMENTS[id]);
const documentsFor = (lang: Lang) =>
  GAME_DOCS.map((id) => {
    const d = resume.documents.find((x) => x.id === id);
    if (!d) throw new Error(`no document ${id}`);
    return { id: d.id, label: d.label[lang], href: DOCUMENTS[d.id] };
  });

describe('DocumentList.astro', () => {
  it('3 PDF links to /cv/*.pdf', async () => {
    const ko = await renderAstro(DocumentList, { props: { lang: 'ko', documents: documentsFor('ko') } });
    expect(ko).toMatch(/<section(?=[^>]*\bid="documents")[^>]*>/);
    expect(ko).toMatch(/<h2[^>]*>이력서 PDF<\/h2>/);
    const hrefs = [...ko.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(GAME_HREFS);
    for (const href of hrefs) expect(href).toMatch(/^\/cv\/[a-z0-9-]+\.pdf$/);
    expect(ko).toContain('국문 이력서');
    expect(ko.match(/type="application\/pdf"/g)).toHaveLength(3);

    const en = await renderAstro(DocumentList, { props: { lang: 'en', documents: documentsFor('en') } });
    expect(en).toMatch(/<h2[^>]*>Résumé PDFs<\/h2>/);
    expect(en).toContain('Korean résumé');
    expect(en).toContain('English résumé');
    // PDF links are files: never prefixed with /en.
    expect([...en.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1])).toEqual(GAME_HREFS);
  });

  it('labels state language and page count, never the ambiguous "Résumé (1 page)" (batch 3b P2-32)', async () => {
    const en = await renderAstro(DocumentList, { props: { lang: 'en', documents: documentsFor('en') } });
    expect(en).not.toMatch(/>\s*Résumé \(1 page\)\s*</);
    expect(en).toContain('Korean résumé (2 pages)');
    expect(en).toContain('English résumé (1 page)');
    const ko = await renderAstro(DocumentList, { props: { lang: 'ko', documents: documentsFor('ko') } });
    expect(ko).toContain('국문 이력서 (2쪽)');
    expect(ko).toContain('영문 이력서 (1쪽)');
  });
});
