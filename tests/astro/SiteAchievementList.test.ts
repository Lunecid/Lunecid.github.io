import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import SiteAchievementList from '../../src/components/player-log/SiteAchievementList.astro';
import { achievementSchema } from '../../src/content/schemas';
import { parseYamlList } from '../../src/content/yaml-loader';
import { renderAstro } from './helpers';

const defs = parseYamlList(readFileSync(join(process.cwd(), 'src/data/achievements.yaml'), 'utf8')).map((a) => achievementSchema.parse(a));
const item = (html: string, id: string) => html.match(new RegExp(`<li[^>]*data-ach-id="${id}"[^>]*>([\\s\\S]*?)</li>`))?.[1] ?? '';
const withoutTemplate = (s: string) => s.replace(/<template[\s\S]*?<\/template>/g, '');

describe('SiteAchievementList', () => {
  it('8 items; hidden ones show ??? and keep real text in a template; progress counter and storage note', async () => {
    const html = await renderAstro(SiteAchievementList, { props: { lang: 'ko', defs } });
    expect(html).toMatch(/<section[^>]*id="site-achievements"/);
    expect(html.match(/data-ach-id="/g)).toHaveLength(8);

    const konami = item(html, 'konami');
    expect(withoutTemplate(konami)).toContain('???');
    expect(withoutTemplate(konami)).toContain('고전 게임의 비밀 커맨드가 여기서도 통합니다.'); // P2-34
    expect(withoutTemplate(konami)).not.toContain('↑↑↓↓←→←→BA');
    expect(konami).toMatch(/<template[^>]*data-ach-real[^>]*>[\s\S]*↑↑↓↓←→←→BA[\s\S]*코나미 커맨드를 입력했습니다\.[\s\S]*<\/template>/);

    const gameOver = item(html, 'game-over');
    expect(withoutTemplate(gameOver)).not.toContain('없는 페이지에 도착했습니다.');
    expect(gameOver).toMatch(/<template[\s\S]*없는 페이지에 도착했습니다\.[\s\S]*<\/template>/);

    const reader = item(html, 'abstract-reader');
    expect(reader).toContain('초록 펼치기');
    expect(reader).toContain('논문 초록을 펼쳐 읽었습니다.');
    expect(reader).not.toContain('<template');

    expect(html).toMatch(/data-ach-progress[^>]*>0 \/ 8 달성</);
    expect(html).toContain('data-template="{n} / {total} 달성"');
    expect(html).toContain('달성 기록은 이 브라우저에만 저장됩니다.');
    expect(html.match(/data-ach-state="locked"/g)).toHaveLength(8);
    expect(html).toMatch(/<script[^>]*type="module"/);
  });

  it('final review fix 1 item 19: the abstract achievement names no single page (it fires on /, /research/ and /records/)', () => {
    const reader = defs.find((d) => d.id === 'abstract-reader');
    expect(reader).toBeDefined();
    for (const lang of ['ko', 'en'] as const) {
      for (const text of [reader!.description[lang], reader!.hint[lang]]) {
        expect(text, `${lang}: ${text}`).not.toMatch(/연구 페이지|연구 목록|기록 페이지|홈|Research page|research list|Records page|home/i);
      }
    }
  });

  it('final review fix 1 item 20: Hangul inside English achievement text is marked lang="ko"', async () => {
    const html = await renderAstro(SiteAchievementList, { props: { lang: 'en', defs } });
    expect(item(html, 'bilingual')).toMatch(/<span(?=[^>]*\blang="ko")[^>]*>한국어<\/span>/);
    const untagged = html
      .replace(/<span(?=[^>]*\blang="ko")[^>]*>[^<]*<\/span>/g, '')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '');
    expect(untagged.match(/\p{Script=Hangul}+/gu)).toBeNull();
    // Korean pages are lang="ko" already: no extra spans there.
    const ko = await renderAstro(SiteAchievementList, { props: { lang: 'ko', defs } });
    expect(ko).not.toMatch(/<span(?=[^>]*\blang="ko")/);
  });

  it('English page uses English copy', async () => {
    const html = await renderAstro(SiteAchievementList, { props: { lang: 'en', defs } });
    expect(html).toContain('Abstract Opened');
    expect(html).toMatch(/data-ach-progress[^>]*>0 \/ 8 unlocked</);
    expect(html).toContain('Progress is saved only in this browser.');
  });
});
