import { describe, expect, it } from 'vitest';
import InProgressList from '../../src/components/research/InProgressList.astro';
import { researchPage } from '../../src/data/research-page';
import { resolveLocalizedDeep } from '../../src/lib/facts';
import { loadFactSource } from '../helpers/fact-source';
import { renderAstro } from './helpers';

/** P1-8: the list as ResearchView passes it, each { ko, en } leaf resolved in its own language. */
const ongoing = resolveLocalizedDeep(researchPage.ongoing, loadFactSource());

const itemChunks = (html: string): string[] => html.split(/<li\b/).slice(1);

describe('InProgressList.astro', () => {
  it('section#in-progress; unlinked items render without anchors', async () => {
    const ko = await renderAstro(InProgressList, { props: { lang: 'ko', variant: 'game', items: ongoing } });
    expect(ko).toMatch(/<section(?=[^>]*\bid="in-progress")[^>]*>/);
    expect(ko).toMatch(/<h2[^>]*>진행 중인 연구<\/h2>/);
    const chunks = itemChunks(ko);
    expect(chunks).toHaveLength(ongoing.length);
    for (const item of ongoing) {
      const chunk = chunks.find((c) => c.includes(`data-item="${item.id}"`));
      expect(chunk, item.id).toBeDefined();
      if (item.href === null) expect(chunk, item.id).not.toMatch(/<a\b/);
      else expect(chunk, item.id).toMatch(new RegExp(`<a[^>]*href="/game${item.href}"`));
    }
    expect(chunks.find((c) => c.includes('data-item="pubg-survival"'))).toContain('PUBG 시공간 그래프 생존 모델');

    const en = await renderAstro(InProgressList, { props: { lang: 'en', variant: 'game', items: ongoing } });
    expect(en).toMatch(/<a[^>]*href="\/en\/game\/research\/cog-2026-engagement\/"/);
    expect(en).not.toMatch(/href="\/(game\/)?(research|projects)\//);
  });

  it('shows each status label in the page language', async () => {
    const en = await renderAstro(InProgressList, { props: { lang: 'en', variant: 'game', items: ongoing } });
    const statuses = [...en.matchAll(/<p(?=[^>]*class="progress-list__status lh-tag")[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]);
    expect(statuses).toEqual(ongoing.map((i) => i.status.en));
  });

  it('owner 2026-10-06: the thesis row carries its title; the PUBG row shows its working title, labelled', async () => {
    for (const variant of ['game', 'data'] as const) {
      const ko = await renderAstro(InProgressList, { props: { lang: 'ko', variant, items: ongoing } });
      const en = await renderAstro(InProgressList, { props: { lang: 'en', variant, items: ongoing } });
      expect(ko).toContain('석사 학위논문: 리그오브레전드에서 승리 확률 변화에 기반한 교전 가치 정의 및 예측에 관한 연구');
      expect(en).toContain('M.S. thesis: A Study on Defining and Predicting Engagement Value Based on Win-Probability Change in League of Legends');
      expect(ko).toMatch(/class="[^"]*progress-list__work[^"]*"[^>]*>가제: Surviving a Shrinking Habitat: Phase-Conditioned Elimination Hazards from Large-Scale Battle Royale Telemetry</);
      expect(en).toMatch(/class="[^"]*progress-list__work[^"]*"[^>]*>Working title: Surviving a Shrinking Habitat/);
    }
  });
});
