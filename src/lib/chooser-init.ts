// src/lib/chooser-init.ts — the chooser's pre-paint redirect (§5.5, contract §2.5). NeutralLayout inlines the returned
// classic script as the FIRST <script> of '/' and '/en/' (before the motion init), so a returning visitor never sees
// the chooser. Literals are JSON-inlined; tests/react/chooser-init.test.ts pins them to the shared constants.
// Order: ?choose → stay; an old home anchor (#hello …) → the game home of this language (A-27); a stored version →
// its home in this language (the hash kept). No language detection. window.__sbRedirect tells the counter loader.
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
  if (/[?&]choose(?:[=&]|$)/.test(location.search)) return;
  var KEY = ${inlineJson(STORAGE_KEYS.variant)};
  var ANCHORS = ${inlineJson(LEGACY_HOME_ANCHORS)};
  var IDS = ${inlineJson(VARIANT_IDS)};
  var HOMES = ${inlineJson(homes)};
  var LEGACY = ${inlineJson(homes[LEGACY_VARIANT])};
  var hash = location.hash.replace(/^#/, '');
  if (hash && ANCHORS.indexOf(hash) !== -1) {
    window.__sbRedirect = true;
    location.replace(LEGACY + location.hash);
    return;
  }
  var stored = null;
  try { stored = window.localStorage.getItem(KEY); } catch (e) { stored = null; }
  if (IDS.indexOf(stored) !== -1) {
    window.__sbRedirect = true;
    location.replace(HOMES[stored] + location.hash);
  }
})();`;
}
