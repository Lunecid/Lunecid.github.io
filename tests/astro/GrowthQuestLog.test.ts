import { describe, expect, it } from 'vitest';
import GrowthQuestLog from '../../src/components/research/GrowthQuestLog.astro';
import { buildGrowth } from '../../src/lib/growth';
import { loadGrowthInputs } from '../helpers/growth-inputs';
import { readSource, renderAstro } from './helpers';

const model = { ko: buildGrowth(loadGrowthInputs('ko'), 'ko'), en: buildGrowth(loadGrowthInputs('en'), 'en') };
const render = (lang: 'ko' | 'en') => renderAstro(GrowthQuestLog, { props: { model: model[lang] } });
const cards = (html: string) => html.split(/<article\b/).slice(1);

describe('GrowthQuestLog.astro (game version)', () => {
  it('section#growth with the QUEST LOG head, the title and the lede', async () => {
    const html = await render('ko');
    expect(html).toMatch(/<section(?=[^>]*\bid="growth")(?=[^>]*aria-labelledby="growth-title")[^>]*>/);
    expect(html).toMatch(/<h2[^>]*id="growth-title"[^>]*>성장하는 데이터 분석가<\/h2>/);
    expect(html).toContain('QUEST LOG');
    expect(html).toContain(model.ko.copy.lede);
  });

  it('seven quest cards and three locked slots, each with a focusable node that links to its card', async () => {
    const html = await render('ko');
    const all = cards(html);
    expect(all.filter((c) => /class="[^"]*gq-q--lock/.test(c))).toHaveLength(3);
    expect(all.filter((c) => /class="gq-q gq-q--(top|bot)/.test(c))).toHaveLength(7);
    for (const s of model.ko.steps) {
      expect(html).toMatch(new RegExp(`<a[^>]*class="gq-node[^"]*"[^>]*href="#gr-q-${s.id}"`));
      expect(html).toContain(`id="gr-q-${s.id}"`);
    }
    for (const f of model.ko.future) expect(html).toMatch(new RegExp(`href="#gr-q-${f.id}"[^>]*aria-label="${f.title}, ${f.status}"`));
    // every node has a visible tooltip twin (hover and keyboard focus) and an accessible name
    const nodes = [...html.matchAll(/<a[^>]*class="gq-node[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(nodes).toHaveLength(10);
    for (const n of nodes) {
      expect(n[0]).toMatch(/aria-label="[^"]+"/);
      expect(n[1]).toMatch(/class="gq-tip"[^>]*aria-hidden="true"/);
    }
  });

  it('a card shows the role badge and level pips, the party, my part and the team’s part, and the achievement', async () => {
    const html = await render('ko');
    const kick = cards(html).find((c) => c.includes('id="gr-q-kickick-park"')) ?? '';
    expect(kick).toContain('Lv.2');
    expect(kick).toContain('여러 단계 담당');
    expect(kick).toMatch(/class="gq-party"[^>]*role="img"[^>]*aria-label="5인 팀"/);
    expect(kick.match(/<use href="#gq-pp"/g)).toHaveLength(1);
    expect(kick.match(/<use href="#gq-po"/g)).toHaveLength(4);
    expect(kick).toMatch(/<dt>내 담당<\/dt><dd>주제 선정과 전처리, 자치구별 Tableau 시각화, 웹사이트 구축을 맡았습니다\.<\/dd>/);
    expect(kick).toMatch(/<dt>팀원 담당<\/dt><dd>YOLOv8 · PyTorch<\/dd>/);
    expect(kick).toMatch(/class="gq-ach"[\s\S]*최우수상/);
    const lg = cards(html).find((c) => c.includes('id="gr-q-lg-aimers-7"')) ?? '';
    expect(lg).not.toContain('gq-party');
    expect(lg).toMatch(/class="gq-ach gq-ach--rank"[\s\S]*817팀 중 32위 · 상위 4%/);
    expect(lg).toContain('모델링 및 학습 파이프라인 설계 전반');
    const cog = cards(html).find((c) => c.includes('id="gr-q-cog-2026-engagement"')) ?? '';
    expect(cog).toContain('Lv.4');
    expect(cog).toMatch(/<dt>공저자<\/dt><dd>권준호 교수<\/dd>/);
  });

  it('the party log is a white panel grouping the steps by stage; the table view lists every step', async () => {
    const html = await render('ko');
    expect(html).toMatch(/class="gq-plog"/);
    expect(html.match(/class="gq-stage gq-stage--\d"/g)).toHaveLength(3);
    expect(html).toMatch(/<details class="gq-tv"[^>]*>\s*<summary[^>]*>[\s\S]*표로 보기/);
    const table = /<table[\s\S]*<\/table>/.exec(html)?.[0] ?? '';
    expect(table.match(/<th scope="row">/g)).toHaveLength(10);
    expect(table).toContain('<caption>');
    expect(html).toMatch(/class="gq-tv__scroll"[^>]*tabindex="0"[^>]*role="region"/);
  });

  it('the open slots show the thesis title and the PUBG working title under their short labels', async () => {
    const html = await render('ko');
    expect(html).toMatch(/class="gq-q__sub"[^>]*>리그오브레전드에서 승리 확률 변화에 기반한 교전 가치 정의 및 예측에 관한 연구</);
    expect(html).toMatch(/class="gq-q__sub"[^>]*>가제: Surviving a Shrinking Habitat/);
    const table = /<table[\s\S]*<\/table>/.exec(html)?.[0] ?? '';
    expect(table).toContain('석사 학위논문<br>리그오브레전드에서');
  });

  it('English: the same structure in English strings', async () => {
    const html = await render('en');
    expect(html).toMatch(/<h2[^>]*>Growing as a data analyst<\/h2>/);
    expect(html).toContain('View as table');
    expect(html).toContain('Team’s part');
    expect(html).toContain('Several stages');
    expect(html).not.toMatch(/[가-힣]/);
  });

  it('client code: one module script; no inline handlers; the component has no scoped <style> (rules live in growth-game.css)', () => {
    const src = readSource('src/components/research/GrowthQuestLog.astro');
    expect(src).not.toMatch(/<style/);
    expect(src).not.toMatch(/\son[a-z]+=/);
    expect(src).toMatch(/<script>\s*import \{ initGrowthReveal \} from '..\/..\/scripts\/growth-reveal';/);
  });
});
