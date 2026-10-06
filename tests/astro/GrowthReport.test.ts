import { describe, expect, it } from 'vitest';
import GrowthReport from '../../src/components/research/GrowthReport.astro';
import { buildGrowth } from '../../src/lib/growth';
import { loadGrowthInputs } from '../helpers/growth-inputs';
import { readSource, renderAstro } from './helpers';

const model = { ko: buildGrowth(loadGrowthInputs('ko'), 'ko'), en: buildGrowth(loadGrowthInputs('en'), 'en') };
const render = (lang: 'ko' | 'en') => renderAstro(GrowthReport, { props: { model: model[lang] } });

describe('GrowthReport.astro (general version)', () => {
  it('section#growth.ed-sec with the editorial head (caption chip, title, lede)', async () => {
    const html = await render('ko');
    expect(html).toMatch(/<section(?=[^>]*\bid="growth")(?=[^>]*class="gd ed-sec")[^>]*>/);
    expect(html).toMatch(/<header class="ed-head ed-sh/);
    expect(html).toMatch(/<h2[^>]*id="growth-title"[^>]*>성장하는 데이터 분석가<\/h2>/);
    expect(html).toContain('성장 기록');
    expect(html).toContain(model.ko.copy.ledeData);
  });

  it('lanes: one head per project, painted results with data-paint-text, role marks that link to their column', async () => {
    const html = await render('ko');
    for (const s of model.ko.steps) {
      expect(html).toContain(`id="gr-c-${s.id}"`);
      expect(html).toMatch(new RegExp(`<a[^>]*class="gd-mk[^"]*"[^>]*href="#gr-c-${s.id}"[^>]*aria-label="${s.title}: 역할 ${s.role.level}, ${s.role.name}"`));
    }
    expect(html.match(/<a[^>]*class="gd-mk/g)).toHaveLength(model.ko.steps.length);
    expect(html.match(/class="gd-tip" aria-hidden="true"/g)).toHaveLength(model.ko.steps.length);
    expect(html).toMatch(/<p class="gd-paint gd-paint--r" data-paint-text>최우수상<small>멀티캠퍼스 · 2024\.03\.12<\/small><\/p>/);
    expect(html).toMatch(/<p class="gd-paint gd-paint--y" data-paint-text>817팀 중 32위 · 상위 4%<\/p>/);
    expect(html).toMatch(/class="gd-paint gd-paint--b" data-paint-text/);
    // the scale lane: only the two studies with numbers, as the site writes them
    expect(html).toContain('<b>240,064</b> 지점');
    expect(html).toContain('<b>206,442</b> 경기');
    expect(html).toContain('<b>약 100만</b> 교전');
    expect(html).toMatch(/class="gd-dot gd-dot--approx"/);
    // the open slots, statuses as the owner answered
    expect(html.match(/class="gd-paint gd-paint--y gd-paint--s" data-paint-text>진행 중</g)).toHaveLength(4);
    expect(html.match(/class="gd-paint gd-paint--y gd-paint--s" data-paint-text>예정</g)).toHaveLength(2);
  });

  it("team lane and cards keep teammates' tools as 팀원 담당; LG Aimers shows no team", async () => {
    const html = await render('ko');
    expect(html).toMatch(/<b>팀원 담당<\/b> YOLOv8 · PyTorch/);
    expect(html).toMatch(/<b>팀원 담당<\/b> scikit-learn · LightGBM · XGBoost · QGIS · Streamlit/);
    expect(html).toContain('팀 구성 기재 없음');
    const sm = /<article class="gd-smc" id="gr-sm-lg-aimers-7"[\s\S]*?<\/article>/.exec(html)?.[0] ?? '';
    expect(sm).not.toContain('gd-team"');
    expect(sm).toContain('모델링 및 학습 파이프라인 설계 전반');
  });

  it('phones: vertical role chart (one labelled image) and one card per project plus the open slots; collaboration figure; table', async () => {
    const html = await render('ko');
    expect(html).toMatch(/class="gd-vrole__fig" role="img" aria-label="역할 단계 계단 그래프: 서울 아파트 매매가 예측 여러 단계 담당/);
    expect(html.match(/<article class="gd-smc"/g)).toHaveLength(model.ko.steps.length);
    expect(html).toContain('class="gd-smc gd-smc--fut"');
    expect(html.match(/<li class="gd-cs">/g)).toHaveLength(3);
    const table = /<table[\s\S]*<\/table>/.exec(html)?.[0] ?? '';
    expect(table.match(/<th scope="row">/g)).toHaveLength(model.ko.steps.length + model.ko.future.length);
    expect(html).toMatch(/<details class="gd-tv">\s*<summary>표로 보기<\/summary>/);
  });

  it('the role tooltip and the cards name a level once (no "제1저자 — 제1저자.")', async () => {
    for (const lang of ['ko', 'en'] as const) {
      const html = await render(lang);
      expect(html).not.toMatch(/제1저자 — 제1저자|First author — First author/);
      expect(html).not.toMatch(/제1저자<span class="gd-tm gd-tm--block">제1저자|First author<span class="gd-tm gd-tm--block">First author/);
    }
  });

  it('the open slots show the thesis title and the PUBG working title under their short labels', async () => {
    const html = await render('ko');
    expect(html).toMatch(/class="gd-fut__sub"[^>]*>리그오브레전드에서 승리 확률 변화에 기반한 교전 가치 정의 및 예측에 관한 연구</);
    expect(html).toMatch(/class="gd-fut__sub"[^>]*>가제: Surviving a Shrinking Habitat/);
    const table = /<table[\s\S]*<\/table>/.exec(html)?.[0] ?? '';
    expect(table).toContain('석사 학위논문<br>리그오브레전드에서');
  });

  it('English strings', async () => {
    const html = await render('en');
    expect(html).toContain('Growing as a data analyst');
    expect(html).toContain('<b>~1M</b> engagements');
    expect(html).toContain('View as table');
    expect(html).not.toMatch(/[가-힣]/);
  });

  it('no scoped <style>; the module script only', () => {
    const src = readSource('src/components/research/GrowthReport.astro');
    expect(src).not.toMatch(/<style/);
    expect(src).not.toMatch(/\son[a-z]+=/);
    expect(src).toMatch(/<script>\s*import \{ initGrowthReveal \} from '..\/..\/scripts\/growth-reveal';/);
  });
});
