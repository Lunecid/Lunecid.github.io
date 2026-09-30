import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allRoutes, parseRoute } from '../../src/lib/routes';

type LhConfig = { ci: { collect: { url: string[] } } };
const paths = (file: string): string[] =>
  (JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')) as LhConfig).ci.collect.url.map((url) => new URL(url).pathname);
const mobile = [...paths('lighthouserc.json'), ...paths('lighthouserc.secondary.json')];
const desktop = paths('lighthouserc.desktop.json');

/** Every page kind the quality budgets bind (contract §0.1, A-21). Language twins are not separate kinds: they share
 *  layout, CSS, scripts and images with the measured page, and axe covers every route. */
const KINDS: Record<string, (path: string) => boolean> = {
  chooser: (p) => p === '/',
  'game home': (p) => p === '/game/',
  'general home': (p) => p === '/data/',
  'general projects': (p) => p === '/data/projects/',
  'general case study': (p) => /^\/data\/projects\/[a-z0-9-]+\/$/.test(p),
  'general paper page': (p) => /^\/data\/research\/[a-z0-9-]+\/$/.test(p),
  'general records': (p) => p === '/data/records/',
  'shared page': (p) => parseRoute(p)?.kind === 'shared',
  '404': (p) => p === '/404.html',
};

describe('Lighthouse covers every page kind (P2-13)', () => {
  it('mobile runs', () => {
    for (const [kind, matches] of Object.entries(KINDS)) expect(mobile.some(matches), kind).toBe(true);
  });
  it('desktop runs', () => {
    for (const [kind, matches] of Object.entries(KINDS)) expect(desktop.some(matches), kind).toBe(true);
  });
  it('every URL is a route of the table, or the 404 page', () => {
    const routes = new Set(allRoutes());
    for (const path of [...mobile, ...desktop]) expect(routes.has(path) || path === '/404.html', path).toBe(true);
  });
});
