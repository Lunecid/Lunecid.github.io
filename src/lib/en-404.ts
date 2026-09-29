// src/lib/en-404.ts — inline page-end script for src/pages/404.astro (P2-15, fix round 1 item 5).
// GitHub Pages serves this one dist/404.html for every unmatched path, ko or en, always rendered in Korean; this
// script rewrites it to the English 1:1 equivalent when the attempted path started with /en/.
// The emitted script is self-contained, like head-init.ts and viewer-queue.ts: no runtime imports, so 404.astro
// inlines it with <script is:inline set:html={EN_404_SCRIPT} />. It is deliberately NOT an ES module (Astro's own
// <script> tags in a component become type="module", which defers execution until after the document has fully
// parsed — long enough for the browser to paint the Korean version first, a visible flash). A plain classic script
// placed at the end of body executes synchronously, in place, before that first paint. Strings and paths are
// interpolated from ui.ts / config.ts at build time so they cannot drift from the rest of the site.
//
// The achievement toast host (src/components/hud/AchievementHost.astro, P1-9b) reads data-lang, data-close-label
// and its aria-label when its deferred module script starts, after this script, so patching those attributes here
// lets it show its toasts in English.
import { CV_HREF } from '../config';
import { ui } from '../i18n/ui';

const en = ui.en;
const ko = ui.ko;
const j = (value: string) => JSON.stringify(value);

export const EN_404_SCRIPT = `(function () {
  if (location.pathname.indexOf('/en/') !== 0) return;
  var d = document.documentElement;
  d.lang = 'en';
  document.title = ${j(`${en['404.title']} · Seongeun Baek`)};

  var skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = ${j(en['site.skipToContent'])};

  var menu = document.getElementById('hud-menu');
  if (menu) menu.setAttribute('aria-label', ${j(en['nav.label'])});

  var NAV_ITEMS = [
    ['01', ${j(en['nav.research'])}, '/en/research/'],
    ['02', ${j(en['nav.projects'])}, '/en/projects/'],
    ['03', ${j(en['nav.records'])}, '/en/records/'],
    ['04', ${j(en['nav.playerLog'])}, '/en/player-log/']
  ];
  var navLinks = document.querySelectorAll('#hud-menu a');
  for (var i = 0; i < navLinks.length && i < NAV_ITEMS.length; i++) {
    var a = navLinks[i];
    var item = NAV_ITEMS[i];
    a.setAttribute('href', item[2]);
    a.innerHTML = '';
    var num = document.createElement('span');
    num.className = 'hud-nav__num';
    num.setAttribute('aria-hidden', 'true');
    num.textContent = item[0];
    a.appendChild(num);
    a.appendChild(document.createTextNode(' ' + item[1]));
  }

  var brand = document.querySelector('.hud-nav__brand');
  if (brand) {
    brand.setAttribute('href', '/en/');
    var brandSr = brand.querySelector('.sr-only');
    if (brandSr) brandSr.textContent = ${j(en['nav.brandSr'])};
  }

  var toggle = document.querySelector('[data-nav-toggle]');
  if (toggle) {
    toggle.setAttribute('data-label-closed', ${j(en['nav.menu'])});
    toggle.setAttribute('data-label-open', ${j(en['nav.closeMenu'])});
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.textContent = ${j(en['nav.menu'])};
  }

  var cv = document.querySelector('.hud-nav__cv');
  if (cv) {
    cv.setAttribute('href', ${j(CV_HREF.en)});
    cv.setAttribute('title', ${j(en['nav.cvResume'])});
    var cvSr = cv.querySelector('.sr-only');
    if (cvSr) cvSr.textContent = ${j(` — ${en['nav.cvResume']}`)};
  }

  // KO/EN switch: the nav renders none here by default (a 404 has no real bilingual counterpart — see the note
  // in 404.astro above BaseLayout's altLangHref). Two variants, matching the site's own .hud-nav__lang--bar /
  // --panel split, so the extra element never crowds the already-tight mobile bar at 320px (it would otherwise
  // wrap onto a second line, which the scrim below the bar does not account for).
  if (toggle) {
    var barLink = document.createElement('a');
    barLink.className = 'nf-lang-switch nf-lang-switch--bar';
    barLink.setAttribute('href', '/');
    barLink.setAttribute('hreflang', 'ko');
    barLink.setAttribute('lang', 'ko');
    barLink.appendChild(document.createTextNode('KO'));
    // Fix round 2 item 3: "KO" alone gave this link the same accessible name problem the abbreviated "KO"/"EN"
    // bar switch elsewhere on the site already solves with a sr-only expansion (HudNav.astro's
    // .hud-nav__lang--bar link) — match that pattern instead of leaving this one truncated.
    var barLinkSr = document.createElement('span');
    barLinkSr.className = 'sr-only';
    barLinkSr.textContent = ${j(` ${en['action.switchLanguage']}`)};
    barLink.appendChild(barLinkSr);
    var tools = document.querySelector('.hud-nav__tools');
    if (tools) tools.insertBefore(barLink, toggle);
  }
  if (menu) {
    var panelWrap = document.createElement('p');
    panelWrap.className = 'nf-lang-switch nf-lang-switch--panel';
    var panelLink = document.createElement('a');
    panelLink.setAttribute('href', '/');
    panelLink.setAttribute('hreflang', 'ko');
    panelLink.setAttribute('lang', 'ko');
    panelLink.textContent = ${j(en['action.switchLanguage'])};
    panelWrap.appendChild(panelLink);
    menu.appendChild(panelWrap);
  }

  var footerNav = document.querySelector('.site-footer__nav');
  if (footerNav) footerNav.setAttribute('aria-label', ${j(en['footer.siteInfo'])});
  var footerLinks = document.querySelectorAll('.site-footer__links a');
  var FOOTER = [[${j(en['nav.stats'])}, '/en/stats/'], [${j(en['nav.privacy'])}, '/en/privacy/'], [${j(en['nav.credits'])}, '/en/credits/']];
  for (var j = 0; j < footerLinks.length && j < FOOTER.length; j++) {
    footerLinks[j].textContent = FOOTER[j][0];
    footerLinks[j].setAttribute('href', FOOTER[j][1]);
  }

  var timeEl = document.querySelector('.site-footer__updated time');
  var iso = timeEl ? timeEl.getAttribute('datetime') : null;
  if (iso) {
    var copy = document.querySelector('.site-footer__copy');
    if (copy) copy.textContent = ${j(en['footer.copyright'])}.replace('{year}', iso.slice(0, 4));
    var updated = document.querySelector('.site-footer__updated');
    if (updated) {
      var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var ymd = iso.split('-');
      var enDate = MONTHS[parseInt(ymd[1], 10) - 1] + ' ' + parseInt(ymd[2], 10) + ', ' + ymd[0];
      updated.textContent = '';
      updated.appendChild(document.createTextNode(${j(`${en['footer.lastUpdated']} `)}));
      var t2 = document.createElement('time');
      t2.setAttribute('datetime', iso);
      t2.textContent = enDate;
      updated.appendChild(t2);
    }
  }

  // Fix round 2 item 1: the footer motion toggle's visible label is now constant (WCAG 2.5.3 — see
  // SiteFooter.astro), not swapped per state, so there is just one text node to translate here; the aria-hidden
  // ON/OFF chip inside the button is already fixed English in both languages and needs no change. The button's
  // own runtime script (SiteFooter.astro's sync(), a deferred module, so it always runs after this inline one)
  // touches aria-pressed/disabled, the chip's text, the note's visibility below and — fix round 3 item 1 — the
  // button's aria-describedby, which it points at the note (#motion-os-note) only while the OS itself forces
  // reduced motion and removes otherwise. It never touches this label or the note's text, so translating both once
  // here is never overwritten later. Fix round 4 item 1: because of that runtime aria-describedby, the note's text
  // IS the button's accessible description in the OS-forced state, so it must be the exact English string every
  // other /en/ footer renders (ui.ts action.motionOsOff). It is interpolated from ui.ts at build time below rather
  // than hand-copied: fix round 3 reworded ui.ts but left the older hand-copied wording here, which read as
  // contradicting the ON chip and was announced as the button's description on /en/<missing>/.
  var motion = document.querySelector('[data-motion-toggle]');
  if (motion) {
    for (var mc = motion.firstChild; mc; mc = mc.nextSibling) {
      if (mc.nodeType === 3) {
        mc.textContent = ${j(` ${en['action.reduceMotion']} `)};
        break;
      }
    }
  }
  var motionNote = document.getElementById('motion-os-note');
  if (motionNote) motionNote.textContent = ${j(en['action.motionOsOff'])};

  // P1-9b (P-03): the achievement host is server markup plus a deferred module script
  // (src/scripts/achievement-host.ts) that reads its language and close label from the host's own attributes when it
  // starts, which is after this inline script. Patching those attributes here (only where they still hold the
  // Korean values) makes the toast render in English; the region name is the live aria-label.
  var achHost = document.querySelector('[data-achievement-host]');
  if (achHost) {
    if (achHost.getAttribute('data-lang') === 'ko') achHost.setAttribute('data-lang', 'en');
    if (achHost.getAttribute('data-close-label') === ${j(ko['achievement.dismiss'])}) achHost.setAttribute('data-close-label', ${j(en['achievement.dismiss'])});
    if (achHost.getAttribute('aria-label') === ${j(ko['achievement.region'])}) achHost.setAttribute('aria-label', ${j(en['achievement.region'])});
  }

  var actions = document.querySelector('[data-go-actions]');
  if (actions) {
    var actionLinks = actions.querySelectorAll('a');
    if (actionLinks[0]) { actionLinks[0].textContent = ${j(en['404.home'])}; actionLinks[0].setAttribute('href', '/en/'); }
    if (actionLinks[1]) { actionLinks[1].textContent = ${j(en['404.projects'])}; actionLinks[1].setAttribute('href', '/en/projects/'); }
  }
  var secondary = document.querySelector('[data-go-secondary]');
  if (secondary) {
    secondary.setAttribute('lang', 'ko');
    var secLinks = secondary.querySelectorAll('a');
    if (secLinks[0]) { secLinks[0].textContent = ${j(ko['404.home'])}; secLinks[0].setAttribute('href', '/'); }
    if (secLinks[1]) { secLinks[1].textContent = ${j(ko['404.projects'])}; secLinks[1].setAttribute('href', '/projects/'); }
  }
  var primaryMsg = document.querySelector('.go__plain:not(.go__plain--en)');
  var secondaryMsg = document.querySelector('.go__plain--en');
  if (primaryMsg) { primaryMsg.textContent = ${j(en['404.message'])}; primaryMsg.removeAttribute('lang'); }
  if (secondaryMsg) { secondaryMsg.textContent = ${j(ko['404.message'])}; secondaryMsg.setAttribute('lang', 'ko'); }
})();`;
