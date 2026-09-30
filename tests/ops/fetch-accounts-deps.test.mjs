// AL-4 (account-link spec §5.3, §8.1 "poisoned npm package"): the fetch-accounts job runs without `npm ci` and holds
// STEAM_API_KEY, so its code may import only node: built-ins, its own files under scripts/accounts/ and the two
// import-free rule files src/lib/account-ids.ts and src/lib/account-config.ts. No dynamic import of a computed name,
// no require. scripts/fetch-accounts.mjs (AL-6) is checked as soon as it exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ACCOUNTS_DIR = join(ROOT, 'scripts', 'accounts');
const ENTRY = join(ROOT, 'scripts', 'fetch-accounts.mjs');
const ALLOWED_SRC = new Set(['src/lib/account-ids.ts', 'src/lib/account-config.ts']);

/** Strip comments (block and line) so commented-out code is not read as an import; string contents stay. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

/**
 * Every module specifier in a file: static `import … from '…'`, `export … from '…'`, bare `import '…'`, literal
 * `import('…')`; plus the offences the job forbids (`require(`, non-literal `import(`).
 * @param {string} src
 */
export function specifiers(src) {
  const code = stripComments(src);
  const found = [];
  for (const m of code.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?(['"])([^'"]+)\1/g)) found.push(m[2]);
  const offences = [];
  for (const m of code.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)) {
    const arg = m[1].trim();
    const lit = /^(['"])([^'"`$]+)\1$/.exec(arg);
    if (lit) found.push(lit[2]);
    else offences.push(`dynamic import(${arg})`);
  }
  for (const m of code.matchAll(/\brequire\s*\(/g)) offences.push(`require at ${m.index}`);
  if (/\bcreateRequire\b/.test(code)) offences.push('createRequire');
  return { found, offences };
}

/**
 * @param {string} file absolute path of the importing file
 * @param {string} spec
 * @returns {string | null} why the specifier is not allowed, or null
 */
export function refuse(file, spec) {
  if (/^node:[a-z_/]+$/.test(spec)) return null;
  if (!spec.startsWith('./') && !spec.startsWith('../')) return `bare or absolute specifier '${spec}'`;
  const target = resolve(dirname(file), spec);
  const rel = relative(ROOT, target).split(sep).join('/');
  if (ALLOWED_SRC.has(rel)) return null;
  if (rel.startsWith('scripts/accounts/') && !rel.slice('scripts/accounts/'.length).includes('..') && rel.endsWith('.mjs')) return null;
  return `'${spec}' resolves to ${rel}, outside scripts/accounts/ and the two rule files`;
}

const jobFiles = () => [
  ...(existsSync(ENTRY) ? [ENTRY] : []),
  ...readdirSync(ACCOUNTS_DIR, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.mjs') || f.endsWith('.js') || f.endsWith('.ts'))
    .map((f) => join(ACCOUNTS_DIR, f)),
];

test('the checker itself: allowed and refused specifiers, dynamic imports and require are caught', () => {
  const here = join(ACCOUNTS_DIR, 'x.mjs');
  const entry = ENTRY;
  for (const ok of ['node:fs/promises', 'node:crypto', './safe-fetch.mjs', '../../src/lib/account-ids.ts', '../../src/lib/account-config.ts']) assert.equal(refuse(here, ok), null, ok);
  for (const ok of ['./accounts/steam.mjs', '../src/lib/account-ids.ts', '../src/lib/account-config.ts']) assert.equal(refuse(entry, ok), null, ok);
  for (const bad of ['fs', 'js-yaml', 'undici', '/etc/x.mjs', 'https://evil.example/x.mjs', '../../src/config.ts', '../../src/lib/seo.ts', '../fetch-github.mjs', './data.json', 'node:../x']) {
    assert.notEqual(refuse(here, bad), null, bad);
  }
  assert.notEqual(refuse(entry, './fetch-github.mjs'), null);

  const sample = [
    "import { a } from 'node:fs';",
    'import * as b from "./b.mjs";',
    "import c, {\n  d,\n  e,\n} from '../../src/lib/account-ids.ts';",
    "import './side-effect.mjs';",
    "export { f } from './f.mjs';",
    "export * from 'js-yaml';",
    "const g = await import('./g.mjs');",
    'const h = await import(name);',
    'const i = await import(`./${x}.mjs`);',
    "const j = require('fs');",
    "// import k from 'commented-out';",
    "/* import l from 'also-commented'; */",
  ].join('\n');
  const { found, offences } = specifiers(sample);
  assert.deepEqual(found.sort(), ['../../src/lib/account-ids.ts', './b.mjs', './f.mjs', './g.mjs', './side-effect.mjs', 'js-yaml', 'node:fs'].sort());
  assert.equal(offences.length, 3, offences.join('; '));
});

test('fetch-accounts code imports only node:*, scripts/accounts/* and the two import-free rule files', () => {
  const files = jobFiles();
  const rels = files.map((f) => relative(ROOT, f).split(sep).join('/'));
  for (const must of ['scripts/accounts/safe-fetch.mjs', 'scripts/accounts/reasons.mjs']) assert.ok(rels.includes(must), `${must} is checked`);
  const problems = [];
  for (const file of files) {
    const { found, offences } = specifiers(readFileSync(file, 'utf8'));
    const rel = relative(ROOT, file).split(sep).join('/');
    for (const o of offences) problems.push(`${rel}: ${o}`);
    for (const spec of found) {
      const why = refuse(file, spec);
      if (why) problems.push(`${rel}: ${why}`);
      else if (spec.startsWith('.')) assert.ok(existsSync(resolve(dirname(file), spec)), `${rel}: '${spec}' exists`);
    }
  }
  assert.deepEqual(problems, []);
});

test('reasons.mjs is import-free (it is also read where only its text is wanted)', () => {
  const { found, offences } = specifiers(readFileSync(join(ACCOUNTS_DIR, 'reasons.mjs'), 'utf8'));
  assert.deepEqual(found, []);
  assert.deepEqual(offences, []);
});

test('the rule files the job imports stay import-free, so the allowance cannot pull in anything else', () => {
  for (const rel of ALLOWED_SRC) {
    const { found, offences } = specifiers(readFileSync(join(ROOT, rel), 'utf8'));
    assert.deepEqual([...found, ...offences], [], rel);
  }
});
