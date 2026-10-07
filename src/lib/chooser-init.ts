// src/lib/chooser-init.ts — the chooser's pre-paint redirect (§5.5, contract §2.5). NeutralLayout inlines the returned
// classic script as the FIRST <script> of '/' and '/en/' (before the motion init). Literals are JSON-inlined;
// tests/react/chooser-init.test.ts pins them to the shared constants.
// Owner ruling 2026-10-07: '/' always shows the chooser. The choice is no longer remembered, and the value an earlier
// version stored (sb:variant) is removed here. Only an old home anchor (#hello …) still redirects, to the game home of
// this language (A-27; ?choose skips it). No language detection. window.__sbRedirect tells the counter loader.
import { STORAGE_KEYS } from '../config';
import type { Lang } from '../i18n/ui';
import { LEGACY_HOME_ANCHORS, LEGACY_VARIANT, VARIANT_IDS, VARIANT_PREFIX } from '../variants/ids';
import { LANG_PREFIX } from './routes';

/** JSON for an inline <script>: '<' escaped so a value can never close the script element. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function chooserInitScript(lang: Lang): string {
  const homes = Object.fromEntries(VARIANT_IDS.map((variant) => [variant, `${LANG_PREFIX[lang]}${VARIANT_PREFIX[variant]}/`]));
  return `(function () {
  try { window.localStorage.removeItem(${inlineJson(STORAGE_KEYS.variant)}); } catch (e) {}
  if (/[?&]choose(?:[=&]|$)/.test(location.search)) return;
  var ANCHORS = ${inlineJson(LEGACY_HOME_ANCHORS)};
  var LEGACY = ${inlineJson(homes[LEGACY_VARIANT])};
  var hash = location.hash.replace(/^#/, '');
  if (hash && ANCHORS.indexOf(hash) !== -1) {
    window.__sbRedirect = true;
    location.replace(LEGACY + location.hash);
  }
})();`;
}
