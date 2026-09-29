// Final review fix 1 item 8: /stats/ publishes only real site routes and referrer hostnames (hostile fixtures).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allRoutes } from '../../src/lib/routes';
import {
  MAX_HOST_LENGTH,
  MAX_PATH_LENGTH,
  MAX_ROWS,
  MAX_TITLE_LENGTH,
  cleanPages,
  cleanReferrers,
  referrerHost,
  sitePath,
} from '../../src/lib/stats-hygiene';

const ROUTES = allRoutes();

describe('sitePath', () => {
  it('keeps real routes (query string and hash dropped) and nothing else', () => {
    expect(sitePath('/', ROUTES)).toBe('/');
    expect(sitePath('/en/game/records/', ROUTES)).toBe('/en/game/records/');
    expect(sitePath('/game/records/?utm_source=x&q=<script>', ROUTES)).toBe('/game/records/');
    expect(sitePath('/game/projects/kickick-park/#figures', ROUTES)).toBe('/game/projects/kickick-park/');
    for (const hostile of [
      '/<script>alert(1)</script>',
      '/%3Cscript%3Ealert(1)%3C/script%3E',
      '/buy-cheap-pills-now/',
      'javascript:alert(1)',
      '/records', // not the canonical route (no trailing slash)
      '/print/resume-ko/', // print pages are not site routes
      '//evil.example/',
      '',
      `/records/?${'a'.repeat(MAX_PATH_LENGTH)}`,
    ]) {
      expect(sitePath(hostile, ROUTES), hostile).toBeNull();
    }
    expect(sitePath(42, ROUTES)).toBeNull();
    expect(sitePath(null, ROUTES)).toBeNull();
  });
});

describe('referrerHost', () => {
  it('reduces a referrer to its lowercase hostname; empty is a direct visit', () => {
    expect(referrerHost('github.com/Lunecid/LOL_teamfight_Lab')).toBe('github.com');
    expect(referrerHost('https://WWW.Google.com/search?q=seongeun')).toBe('www.google.com');
    expect(referrerHost('http://user:secret@news.ycombinator.com:8080/item?id=1')).toBe('news.ycombinator.com');
    expect(referrerHost('android-app://com.google.android.gm/')).toBe('com.google.android.gm');
    expect(referrerHost('')).toBeNull();
    expect(referrerHost('   ')).toBeNull();
    expect(referrerHost(null)).toBeNull();
    expect(referrerHost(undefined)).toBeNull();
  });

  it('drops anything that is not a plain hostname or is too long', () => {
    for (const hostile of [
      'javascript:alert(1)',
      '<img src=x onerror=alert(1)>',
      'https://evil.example/"><script>alert(1)</script>',
      'Buy cheap pills now',
      'newsletter', // a campaign name, not a host
      'Google', // a generated name, not a host
      '192.168.0.1',
      'http://[::1]/',
      `https://${'x'.repeat(MAX_HOST_LENGTH)}.example/`,
      `https://example.com/${'a'.repeat(600)}`,
    ]) {
      expect(referrerHost(hostile), hostile).toBeUndefined();
    }
    expect(referrerHost(7)).toBeUndefined();
  });
});

describe('cleanPages / cleanReferrers', () => {
  it('keep only clean rows, merge duplicates, sort by count and cap the list', () => {
    const pages = cleanPages(
      [
        { path: '/', title: '백성은', count: 70 },
        { path: '/<script>alert(1)</script>', title: 'x', count: 999 },
        { path: '/game/records/?from=<b>spam</b>', title: `t\u0000${'y'.repeat(300)}`, count: 5 },
        { path: '/game/records/', title: '기록', count: 10 },
        { path: '/records/', title: '기록', count: 40 }, // legacy game URL (a redirect stub since P1-13): dropped, A-9
        { path: '/en/', title: 'Seongeun Baek', count: '30' },
        { path: '/en/', title: 'Seongeun Baek', count: -4 },
        { path: '/stats/', title: 'Stats', count: 'NaN' },
      ],
      ROUTES,
    );
    expect(pages.map((p) => [p.path, p.count])).toEqual([
      ['/', 70],
      ['/en/', 30],
      ['/game/records/', 15],
      ['/stats/', 0],
    ]);
    for (const page of pages) expect(page.title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(pages.find((p) => p.path === '/game/records/')?.title).not.toMatch(/\u0000/);
    expect(pages.map((p) => p.path), 'A-9: legacy paths leave the top pages').not.toContain('/records/');

    const referrers = cleanReferrers([
      { name: '', count: 50 },
      { name: 'github.com', count: 20 },
      { name: 'https://github.com/Lunecid', count: 3 },
      { name: `https://${'x'.repeat(300)}.example/`, count: 400 },
      { name: '<script>alert(1)</script>', count: 300 },
      { name: 'Buy cheap pills now', count: 200 },
      { name: null, count: 1 },
    ]);
    expect(referrers).toEqual([
      { name: null, count: 51 },
      { name: 'github.com', count: 23 },
    ]);

    const many = Array.from({ length: 30 }, (_, i) => ({ name: `site${i}.example`, count: i }));
    expect(cleanReferrers(many)).toHaveLength(MAX_ROWS);
    expect(cleanReferrers(many)[0]).toEqual({ name: 'site29.example', count: 29 });
  });

  it('the /stats/ view routes both tables through the cleaners (defence in depth for an old stats.json)', () => {
    const view = readFileSync('src/views/StatsView.astro', 'utf8');
    expect(view).toMatch(/cleanPages\(usable\.pages, allRoutes\(\)\)/);
    expect(view).toMatch(/cleanReferrers\(usable\.referrers\)/);
    expect(view).not.toMatch(/usable\.(pages|referrers)\.map/);
  });
});
