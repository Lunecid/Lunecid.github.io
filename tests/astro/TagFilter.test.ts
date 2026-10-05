import { transform } from 'esbuild';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import TagFilter from '../../src/components/projects/TagFilter.astro';
import { readSource, renderAstro } from './helpers';

const labelsOf = (html: string): string[] => [...html.matchAll(/data-tag="[a-z-]+"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1] ?? '');

describe('TagFilter.astro', () => {
  it("group labelled by projects.filterLabel with an 'all' button pressed", async () => {
    const ko = await renderAstro(TagFilter, { props: { lang: 'ko', keys: ['nlp', 'ml'], controls: 'project-grid' } });
    expect(ko).toMatch(/<div[^>]*class="tag-filter"[^>]*role="group"[^>]*aria-label="태그로 거르기"/);
    expect(ko).toMatch(/<button[^>]*aria-pressed="true"[^>]*data-tag-all[^>]*>전체<\/button>/);
    expect(ko.match(/aria-pressed="true"/g) ?? []).toHaveLength(1);
    expect(ko.match(/aria-pressed="false"/g) ?? []).toHaveLength(2);
    const en = await renderAstro(TagFilter, { props: { lang: 'en', keys: ['nlp'], controls: 'project-grid' } });
    expect(en).toMatch(/aria-label="Filter by tag"/);
    expect(en).toMatch(/>All<\/button>/);
  });

  it('one button per given key in TAG_KEYS order with localized labels', async () => {
    const ko = await renderAstro(TagFilter, { props: { lang: 'ko', keys: ['viz', 'nlp', 'ml', 'nlp'], controls: 'project-grid' } });
    expect([...ko.matchAll(/data-tag="([a-z-]+)"/g)].map((m) => m[1])).toEqual(['ml', 'viz', 'nlp']);
    expect(labelsOf(ko)).toEqual(['머신러닝', '시각화', '자연어 처리']);
    const en = await renderAstro(TagFilter, { props: { lang: 'en', keys: ['viz', 'nlp', 'ml'], controls: 'project-grid' } });
    expect(labelsOf(en)).toEqual(['Machine learning', 'Visualization', 'NLP']);
  });

  it('buttons carry data-tag keys and aria-controls the grid', async () => {
    const html = await renderAstro(TagFilter, { props: { lang: 'ko', keys: ['nlp', 'ml'], controls: 'project-grid' } });
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button).toContain('type="button"');
      expect(button).toContain('aria-controls="project-grid"');
    }
    expect(buttons.filter((button) => /data-tag="/.test(button))).toHaveLength(2);
    expect(html).toMatch(/data-controls="project-grid"/);
    expect(html).toMatch(/data-count-template="\{n\}개"/);
    // P2-8: a separate singular template ("1 project", not "1 projects" — Korean has no distinction).
    expect(html).toMatch(/data-count-template-one="\{n\}개"/);
    const en = await renderAstro(TagFilter, { props: { lang: 'en', keys: ['nlp', 'ml'], controls: 'project-grid' } });
    expect(en).toMatch(/data-count-template="\{n\} projects"/);
    expect(en).toMatch(/data-count-template-one="\{n\} project"/);
    expect(html).toMatch(/<p[^>]*role="status"[^>]*data-tag-filter-status/);
    expect(html).toMatch(/<script\b[^>]*src="[^"]*TagFilter\.astro\?astro&(?:amp;)?type=script/);
  });

  it('filter UI is hidden without JS', () => {
    const source = readSource('src/components/projects/TagFilter.astro');
    expect(source).toMatch(/\.tag-filter\s*\{[^}]*display:\s*none/);
    expect(source).toMatch(/:global\(html\.js\)\s*\.tag-filter/);
    expect(source).toMatch(/:global\(html\.js\)\s*\.tag-filter\s*\{[^}]*display:\s*flex/);
  });
});

// R1 (motion audit): a click swaps the cards inside one same-document view transition of type `filter`, so the
// remaining cards glide to their new places. The component's module script runs here in a JSDOM window with a stub
// document.startViewTransition that records its argument and runs the update only when the test says so.
// jsdom ships no type declarations; this test needs only its constructor.
type JsdomCtor = new (html: string, opts: { url: string; runScripts: 'outside-only' }) => { window: Window & typeof globalThis & { eval: (code: string) => unknown } };
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: JsdomCtor };
type Api = 'object' | 'callback-only' | 'none';
type Stub = { calls: unknown[]; runUpdate: () => void };

async function mount(opts: { api?: Api; reduce?: boolean; search?: string } = {}) {
  const { api = 'object', reduce = false, search = '' } = opts;
  const source = readSource('src/components/projects/TagFilter.astro');
  const script = /<script>([\s\S]*?)<\/script>/.exec(source)![1]!;
  const js = (await transform(script, { loader: 'ts' })).code;
  const markup = await renderAstro(TagFilter, { props: { lang: 'en', keys: ['ml', 'viz'], controls: 'project-grid' } });
  const dom = new JSDOM(
    `<!doctype html><html class="js" data-motion="${reduce ? 'reduce' : 'full'}"><body>${markup}` +
      '<div id="project-grid"><article data-tags="ml">a</article><article data-tags="viz">b</article><article data-tags="ml viz">c</article></div></body></html>',
    { url: `https://lunecid.github.io/en/game/projects/${search}`, runScripts: 'outside-only' },
  );
  const { window } = dom;
  const stub: Stub = { calls: [], runUpdate: () => {} };
  if (api !== 'none') {
    (window.document as unknown as { startViewTransition: (arg: unknown) => unknown }).startViewTransition = (arg: unknown) => {
      stub.calls.push(arg);
      if (api === 'callback-only' && typeof arg !== 'function') throw new window.TypeError('parameter 1 is not of type Function');
      const update = typeof arg === 'function' ? (arg as () => void) : (arg as { update: () => void }).update;
      stub.runUpdate = update;
      return {};
    };
  }
  window.eval(js);
  const doc = window.document;
  const button = (tag: string) => doc.querySelector<HTMLButtonElement>(`button[data-tag="${tag}"]`)!;
  const hidden = () => [...doc.querySelectorAll<HTMLElement>('#project-grid > [data-tags]')].map((el) => el.hidden);
  const status = () => doc.querySelector('[data-tag-filter-status]')!.textContent;
  return { window, doc, stub, button, hidden, status };
}

describe('TagFilter.astro reflow (R1)', () => {
  it('R1: a click swaps the cards inside one view transition of type filter; aria-pressed and the status change at once', async () => {
    const { stub, button, hidden, status, window } = await mount();
    expect(stub.calls).toEqual([]);
    button('ml').click();
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]).toMatchObject({ types: ['filter'] });
    expect(typeof (stub.calls[0] as { update: unknown }).update).toBe('function');
    // synchronous: the pressed state, the status line and the URL
    expect(button('ml').getAttribute('aria-pressed')).toBe('true');
    expect(status()).toBe('2 projects');
    expect(window.location.search).toBe('?tag=ml');
    // the cards change only inside the transition's update
    expect(hidden()).toEqual([false, false, false]);
    stub.runUpdate();
    expect(hidden()).toEqual([false, true, false]);
  });

  it('R1: the first apply and popstate never start a view transition', async () => {
    const { stub, button, hidden, window } = await mount({ search: '?tag=viz' });
    expect(stub.calls).toEqual([]);
    expect(hidden()).toEqual([true, false, false]);
    expect(button('viz').getAttribute('aria-pressed')).toBe('true');
    window.history.replaceState(null, '', '?tag=ml');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    expect(stub.calls).toEqual([]);
    expect(hidden()).toEqual([false, true, false]);
  });

  it('R1: reduced motion or no API → a direct swap', async () => {
    const reduced = await mount({ reduce: true });
    reduced.button('viz').click();
    expect(reduced.stub.calls).toEqual([]);
    expect(reduced.hidden()).toEqual([true, false, false]);
    const none = await mount({ api: 'none' });
    none.button('viz').click();
    expect(none.hidden()).toEqual([true, false, false]);
    expect(none.button('viz').getAttribute('aria-pressed')).toBe('true');
  });

  it('R1: when the object form throws (Chrome 111–124) the callback form is used', async () => {
    const { stub, button, hidden } = await mount({ api: 'callback-only' });
    button('viz').click();
    expect(stub.calls).toHaveLength(2);
    expect(typeof stub.calls[0]).toBe('object');
    expect(typeof stub.calls[1]).toBe('function');
    stub.runUpdate();
    expect(hidden()).toEqual([true, false, false]);
  });

  it('R1: a back/forward that lands while a click\'s swap is pending wins; the stale swap does nothing', async () => {
    const { stub, button, hidden, window } = await mount();
    button('viz').click();
    expect(stub.calls).toHaveLength(1);
    // before the transition runs its update, the visitor goes back to ?tag=ml
    window.history.replaceState(null, '', '?tag=ml');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    expect(hidden()).toEqual([false, true, false]);
    stub.runUpdate();
    expect(hidden()).toEqual([false, true, false]);
    expect(button('ml').getAttribute('aria-pressed')).toBe('true');
  });

  it('R1: the cards are named only during a filter transition and glide over --dur-reflow; the root does not animate', () => {
    const css = readSource('src/components/projects/TagFilter.astro').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    expect(css).toContain(':root:active-view-transition-type(filter) #project-grid > [data-tags] { view-transition-name: match-element; view-transition-class: pcard; }');
    expect(css).toContain('::view-transition-group(*.pcard) { animation-duration: var(--dur-reflow); animation-timing-function: var(--ease-wipe); }');
    expect(css).toContain('::view-transition-old(*.pcard):only-child { animation: vt-out var(--dur-nav-out) var(--ease-in) both; }');
    expect(css).toContain('::view-transition-new(*.pcard):only-child { animation: vt-in var(--dur-nav-in) var(--ease-out) var(--dur-nav-out) both; }');
    expect(css).toContain(':root:active-view-transition-type(filter)::view-transition-old(root), :root:active-view-transition-type(filter)::view-transition-new(root) { animation: none; }');
  });
});
