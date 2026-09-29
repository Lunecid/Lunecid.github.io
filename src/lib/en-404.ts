// src/lib/en-404.ts — inline end-of-body script of src/pages/404.astro (R-1, §7). GitHub Pages serves one Korean
// dist/404.html for every unknown path; this classic script (no imports at run time, so it runs in place before first
// paint) rewrites it to English when the path starts with /en/ (/en/…, /en/game/…, /en/data/…). Every string and href
// is computed here at build time from ui.en, PAGE_META and the link builders, then JSON-inlined: nothing is hand-copied.
import { PAGE_META } from '../data/copy/pages';
import { languages, ui } from '../i18n/ui';
import { chooserHref, homeHref, pageHref } from './links';
import { chooserRoute } from './routes';
import { NEUTRAL_IDENTITY, SHARED_NAV } from '../variants/neutral';

const en = ui.en;
const STRINGS = {
  title: PAGE_META['not-found'].en.title,
  skip: en['site.skipToContent'],
  heading: en['404.title'],
  message: en['404.message'],
  homes: {
    game: { href: homeHref('en', 'game'), label: en['404.gameHome'] },
    data: { href: homeHref('en', 'data'), label: en['404.dataHome'] },
  },
  brand: { href: chooserHref('en'), label: NEUTRAL_IDENTITY.siteTitle.en },
  lang: { href: chooserRoute('ko'), label: languages.ko },
  footer: {
    label: en['footer.siteInfo'],
    copyright: en['footer.copyright'],
    links: [
      ...SHARED_NAV.map((item) => ({ key: item.key, href: pageHref(item.base, { lang: 'en', variant: null }), label: en[item.label] })),
      { key: 'chooser', href: chooserHref('en', { choose: true }), label: en['nav.chooser'] },
    ],
  },
};

export const EN_404_SCRIPT = `(function () {
  if (location.pathname.indexOf('/en/') !== 0) return;
  var S = ${JSON.stringify(STRINGS)};
  var one = function (selector, fn) { var el = document.querySelector(selector); if (el) fn(el); };
  document.documentElement.lang = 'en';
  document.title = S.title;
  one('.skip-link', function (el) { el.textContent = S.skip; });
  one('[data-nf-title]', function (el) { el.textContent = S.heading; });
  one('[data-nf-message]', function (el) { el.textContent = S.message; });
  ['game', 'data'].forEach(function (v) {
    one('[data-nf-home="' + v + '"]', function (el) { el.setAttribute('href', S.homes[v].href); el.textContent = S.homes[v].label; });
  });
  one('[data-nt-brand]', function (el) { el.setAttribute('href', S.brand.href); el.textContent = S.brand.label; });
  one('[data-nt-lang]', function (el) {
    el.setAttribute('href', S.lang.href);
    el.setAttribute('hreflang', 'ko');
    el.setAttribute('lang', 'ko');
    el.textContent = S.lang.label;
  });
  one('.nt-footer__nav', function (el) { el.setAttribute('aria-label', S.footer.label); });
  S.footer.links.forEach(function (link) {
    one('[data-nt-footer-link="' + link.key + '"]', function (el) { el.setAttribute('href', link.href); el.textContent = link.label; });
  });
  one('[data-year]', function (el) { el.textContent = S.footer.copyright.replace('{year}', el.getAttribute('data-year')); });
})();`;
