// Task 2: the external-asset gate script and whatever it wrote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STAGING = process.env.ASSET_STAGING ?? 'C:/Users/todtj/PycharmProjects/Portpolio/.superpowers/assets';
const SCRIPT = '../../scripts/download-external-assets.mjs';

function listTree(dir) {
  return existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).sort() : [];
}

function readRepo(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p) : null;
}

function isMp3Bytes(buf) {
  return (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
}

/** Minimal Response stand-in for injected fetch. */
function fakeResponse(body, { status = 200, headers = {} } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    url: '',
    headers: new Headers(headers),
    text: async () => buf.toString('utf8'),
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

test('importing the module performs no fetch and writes no file', async () => {
  const before = { pub: listTree(join(ROOT, 'public')), staging: listTree(join(STAGING, 'characters')) };
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    throw new Error('fetch must not run on import');
  };
  try {
    const mod = await import(SCRIPT);
    assert.ok(Array.isArray(mod.ITEMS));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 0);
  assert.deepEqual(listTree(join(ROOT, 'public')), before.pub);
  assert.deepEqual(listTree(join(STAGING, 'characters')), before.staging);
});

test('ITEMS URLs are https and targets are inside the staging root or public/', async () => {
  const { ITEMS, targetPath } = await import(SCRIPT);
  // Final review fix 1 item 9: the SFX items (a Kenney zip and a downloaded-and-executed ffmpeg binary) are gone.
  assert.deepEqual(ITEMS.map((i) => i.id), ['character-remielle', 'character-eula', 'character-mona', 'bgm', 'goatcounter-script', 'card-source-ezreal', 'card-source-pengu', 'card-source-innkeeper']);
  for (const item of ITEMS) {
    const url = item.source ?? item.page;
    assert.match(url, /^https:\/\//, item.id);
    assert.ok(!item.target.path.includes('..') && !/^[a-z]:|^\//i.test(item.target.path), `${item.id} target must be relative`);
    assert.ok(['staging', 'repo'].includes(item.target.root), `${item.id}: target root ${item.target.root}`);
    assert.ok(['png', 'jpg', 'mp3', 'js'].includes(item.kind), `${item.id}: kind ${item.kind}`);
    assert.equal(item.registry, undefined, item.id);
    if (item.target.root === 'staging') assert.match(item.target.path, /^(characters\/(remielle|eula|mona)\.png|account-cards\/(ezreal-splash\.jpg|pengu\.png|innkeeper-header\.jpg))$/);
    if (item.target.root === 'repo') assert.match(item.target.path, /^public\//);
  }
  const staged = targetPath(ITEMS[0], { staging: '/stage', repoRoot: '/repo' });
  assert.equal(staged.replace(/\\/g, '/'), '/stage/characters/remielle.png');
});

test('the card sources: two Data Dragon items and the innkeeper header, https, exact URLs, targets in staging', async () => {
  const { ITEMS, targetPath } = await import(SCRIPT);
  const cards = ITEMS.filter((i) => i.id.startsWith('card-source-'));
  assert.deepEqual(
    cards.map(({ id, kind, source, target }) => ({ id, kind, source, target })),
    [
      { id: 'card-source-ezreal', kind: 'jpg', source: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ezreal_0.jpg', target: { root: 'staging', path: 'account-cards/ezreal-splash.jpg' } },
      { id: 'card-source-pengu', kind: 'png', source: 'https://ddragon.leagueoflegends.com/cdn/16.19.1/img/tft-tactician/Tooltip_PenguKnight_Classic_Tier1.png', target: { root: 'staging', path: 'account-cards/pengu.png' } },
      { id: 'card-source-innkeeper', kind: 'jpg', source: 'https://bnetcmsus-a.akamaihd.net/cms/blog_header/r6/R6XIUXOQB0IT1698251687641.jpg', target: { root: 'staging', path: 'account-cards/innkeeper-header.jpg' } },
    ],
  );
  for (const item of cards) {
    const url = new URL(item.source);
    assert.equal(url.protocol, 'https:', item.id);
    assert.equal(item.page, undefined, `${item.id}: a direct file, never resolved from a page`);
    assert.ok(item.note.length > 20, item.id);
    assert.equal(targetPath(item, { staging: '/stage', repoRoot: '/repo' }).replace(/\\/g, '/'), `/stage/${item.target.path}`);
  }
  // the Riot items come from Data Dragon; the innkeeper is the header image of the Hearthstone news post (credited)
  assert.deepEqual(cards.map((i) => new URL(i.source).host), ['ddragon.leagueoflegends.com', 'ddragon.leagueoflegends.com', 'bnetcmsus-a.akamaihd.net']);
  assert.match(cards[2].note, /hearthstone\.blizzard\.com\/en-us\/news\/24008694/);
});

test('checkBytes accepts a JPEG (FF D8 FF) and a PNG for their kinds and rejects anything else', async () => {
  const { checkBytes } = await import(SCRIPT);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  assert.equal(checkBytes('jpg', jpeg), null);
  assert.match(checkBytes('jpg', png), /not a JPEG/);
  assert.match(checkBytes('jpg', Buffer.from('<html>blocked</html>')), /not a JPEG/);
  assert.match(checkBytes('jpg', Buffer.from([0xff, 0xd8])), /not a JPEG/);
  assert.equal(checkBytes('png', png), null);
  assert.match(checkBytes('png', jpeg), /not a PNG/);
});

test('final review fix 1 item 9: the downloader never downloads and runs a program', () => {
  const source = readFileSync(join(ROOT, 'scripts/download-external-assets.mjs'), 'utf8');
  assert.doesNotMatch(source, /node:child_process|execFileSync|spawn|gunzip|ffmpeg|registry\.npmjs\.org|\.exe\b|tar\.exe/);
  assert.doesNotMatch(source, /sfx-pack|sfx-converter|kenney/i);
});

test('checkBytes accepts real signatures and rejects wrong ones and a wrong SRI', async () => {
  const { checkBytes } = await import(SCRIPT);
  assert.equal(checkBytes('png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), null);
  assert.match(checkBytes('png', Buffer.from('GIF89a')), /not a PNG/);
  assert.equal(checkBytes('mp3', Buffer.from('ID3\u0004\u0000')), null);
  assert.equal(checkBytes('mp3', Buffer.from([0xff, 0xfb, 0x90, 0x00])), null);
  assert.match(checkBytes('mp3', Buffer.from('<html>')), /not an MP3/);
  // Final review fix 1 item 9: no zip / gzip-binary kinds any more.
  assert.match(checkBytes('zip', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0])), /unknown kind/);
  assert.match(checkBytes('gz-binary', Buffer.from([0x1f, 0x8b, 0x08])), /unknown kind/);
  assert.match(checkBytes('js', Buffer.from('console.log(1)')), /SRI mismatch/);
});

test('the page resolver reads the FMA fileUrl and refuses a page that does not state CC0', async () => {
  const { resolveSource, ITEMS } = await import(SCRIPT);
  const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  const pages = {
    [byId.bgm.page]: `<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a><div data-track-info='{"id":201834,"fileUrl":"https:\\/\\/files.freemusicarchive.org\\/tracks\\/abc.mp3"}'></div>`,
  };
  const fetchImpl = async (url) => fakeResponse(pages[url] ?? '', { status: pages[url] ? 200 : 404 });
  assert.equal(await resolveSource(byId.bgm, fetchImpl), 'https://files.freemusicarchive.org/tracks/abc.mp3');
  const noLicense = async () => fakeResponse(`<div data-track-info='{"fileUrl":"https:\\/\\/files.freemusicarchive.org\\/tracks\\/abc.mp3"}'></div>`);
  await assert.rejects(resolveSource(byId.bgm, noLicense), /does not state CC0/);
});

test('count.v5.js matches the GoatCounter SRI when present', async (t) => {
  const buf = readRepo('public/js/count.v5.js');
  if (!buf) {
    t.skip('public/js/count.v5.js not approved/downloaded: the CDN script is used');
    return;
  }
  const { GOATCOUNTER } = await import('../../src/config.ts');
  assert.equal(`sha384-${createHash('sha384').update(buf).digest('base64')}`, GOATCOUNTER.sri);
});

test('BGM file starts with an ID3 tag or MPEG frame sync when present', (t) => {
  const buf = readRepo('public/audio/bgm/everything-you-ever-dreamed.mp3');
  if (!buf) {
    t.skip('BGM not approved/downloaded: the BGM button is hidden');
    return;
  }
  assert.ok(buf.length > 100_000, 'BGM file is suspiciously small');
  assert.ok(isMp3Bytes(buf));
});

test('SFX files are all four or none, each an MP3', () => {
  const files = ['move', 'select', 'open', 'close'].map((n) => readRepo(`public/audio/sfx/${n}.mp3`));
  const present = files.filter(Boolean);
  assert.ok(present.length === 0 || present.length === 4, `found ${present.length} of 4 SFX files`);
  for (const buf of present) assert.ok(isMp3Bytes(buf));
  assert.deepEqual(listTree(join(ROOT, 'public/audio/sfx')).filter((f) => !/^(move|select|open|close)\.mp3$/.test(f)), []);
});

test('staged character files are PNGs when present', (t) => {
  const dir = join(STAGING, 'characters');
  if (!existsSync(STAGING)) {
    t.skip('no staging root on this machine (e.g. CI)');
    return;
  }
  for (const name of listTree(dir)) {
    assert.match(name, /^(remielle|eula|mona)\.png$/);
    const buf = readFileSync(join(dir, name));
    assert.ok(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${name} is not a PNG`);
  }
});

test('downloadItem writes a verified file only into its target and refuses a wrong signature', async () => {
  const { downloadItem, ITEMS } = await import(SCRIPT);
  const { mkdtemp, rm } = await import('node:fs/promises');
  const staging = await mkdtemp(join(tmpdir(), 'sb-stage-'));
  const repoRoot = await mkdtemp(join(tmpdir(), 'sb-repo-'));
  try {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const ok = await downloadItem(ITEMS[0], { staging, repoRoot, fetchImpl: async () => fakeResponse(png) });
    assert.equal(ok.files.length, 1);
    assert.equal(ok.files[0].path.replace(/\\/g, '/'), `${staging.replace(/\\/g, '/')}/characters/remielle.png`);
    assert.equal(ok.files[0].sha256, createHash('sha256').update(png).digest('hex'));
    assert.deepEqual(listTree(repoRoot), []);
    await assert.rejects(downloadItem(ITEMS[1], { staging, repoRoot, fetchImpl: async () => fakeResponse('<html>blocked</html>') }), /not a PNG file \(nothing written\)/);
    assert.equal(existsSync(join(staging, 'characters/eula.png')), false);
    const js = ITEMS.find((i) => i.id === 'goatcounter-script');
    await assert.rejects(downloadItem(js, { staging, repoRoot, fetchImpl: async () => fakeResponse('tampered()') }), /SRI mismatch/);
    assert.equal(existsSync(join(repoRoot, 'public/js/count.v5.js')), false);
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  }
});
