// README "연동 켜기": the owner's setup steps, written generically (no login e-mail, Riot ID or subdomain), linked from
// the management screen's error texts as `#연동-켜기`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE } from '../../src/config';
import { looksLikeSecret } from '../../src/lib/account-ids';

const README = readFileSync(join(process.cwd(), 'README.md'), 'utf8').replace(/\r\n/g, '\n');
const HEADING = '## 연동 켜기';

function section(): string {
  const start = README.indexOf(`\n${HEADING}\n`);
  if (start < 0) return '';
  const rest = README.slice(start + 1);
  const next = rest.slice(HEADING.length).search(/\n## /);
  return next < 0 ? rest : rest.slice(0, HEADING.length + next + 1);
}

/** The owner actions' titles, in order (8-1 … 8-16); each README step starts with its title in bold. */
const STEP_TITLES = [
  'Environment `account-fetch`',
  'Branches',
  'Steam key',
  'Steam privacy',
  'Game showcases',
  'Cloudflare account',
  'First Worker deploy',
  'GitHub App',
  'Install',
  'Worker secrets',
  'Check',
  'Send the address and wait',
  'First login',
  'Per game',
  'Save and rebuild',
  'Check and log out',
];

describe('README "연동 켜기"', () => {
  const text = section();

  it('has the exact heading the management screen links to', () => {
    expect(README.split('\n')).toContain(HEADING);
    expect(text.startsWith(HEADING)).toBe(true);
  });

  it('numbers sixteen top-level steps in the owner-action order', () => {
    const steps = [...text.matchAll(/^(\d+)\. \*\*(.+?)\.\*\*/gm)].filter((m) => !m[0].startsWith(' '));
    const stepsBeforeSubsections = steps.filter((m) => m.index! < text.indexOf('\n### '));
    expect(stepsBeforeSubsections.map((m) => Number(m[1]))).toEqual(STEP_TITLES.map((_, i) => i + 1));
    expect(stepsBeforeSubsections.map((m) => m[2])).toEqual(STEP_TITLES);
  });

  it('names the app scope, the private-key check, the manage address and the setup command', () => {
    for (const s of ['Only on this account', 'Private keys', '?manage', 'npm run setup', 'npx wrangler login', 'Node 22']) {
      expect(text, s).toContain(s);
    }
    // wrangler login comes before the setup script; step 10 repeats the login when the terminal was closed.
    expect(text.indexOf('`npx wrangler login`')).toBeLessThan(text.indexOf('1. `npm run setup`'));
    expect(text).toContain('### 비상 절차');
    // Spec §8.3: project Pages of the owner's other repositories share this origin.
    expect(text).toContain('다른 저장소에서는 GitHub Pages를 켜지 마세요');
    expect(text).toContain('2(승인 삭제)와 4(client secret 다시 만들기)를 반드시 한 쌍으로');
  });

  it('build-time section names the fetch-accounts job, its environment secret and the public variables', () => {
    const build = README.slice(README.indexOf('## Build-time data, secrets and deploy'), README.indexOf(`\n${HEADING}\n`));
    for (const s of ['`fetch-accounts`', '`account-fetch`', '`STEAM_API_KEY`', '`ACCOUNT_*`', 'public run logs']) {
      expect(build, s).toContain(s);
    }
  });

  it('no command chains with && in code spans or blocks', () => {
    const blocks = README.match(/```[\s\S]*?```/g) ?? [];
    const spans = README.replace(/```[\s\S]*?```/g, '').match(/`[^`\n]+`/g) ?? [];
    for (const c of [...blocks, ...spans]) expect(c).not.toContain('&&');
  });

  it('no whitespace-separated token looks like a secret', () => {
    const tokens = README.split(/\s+/).filter(Boolean);
    expect(tokens.filter((t) => looksLikeSecret(t.replace(/^[`"'(]+|[`"'),.]+$/g, '')) || looksLikeSecret(t))).toEqual([]);
  });

  it('never names the local-only notes folders', () => {
    expect(README).not.toContain(['docs', 'super' + 'powers'].join('/'));
    expect(README).not.toContain('.super' + 'powers');
  });

  it('the only e-mail address is the public contact, never tied to a login', () => {
    const emails = README.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
    expect(new Set(emails)).toEqual(new Set([SITE.email]));
    for (const line of README.split('\n').filter((l) => l.includes(SITE.email))) {
      expect(line).not.toMatch(/log ?in|sign ?in|로그인|Cloudflare|wrangler|Steam|account/i);
    }
    expect(text).not.toContain('@');
  });

  it('no Riot ID outside URLs and headings', () => {
    const prose = README.split('\n')
      .filter((l) => !/^#+ /.test(l))
      .join('\n')
      .replace(/https?:\/\/\S+/g, '');
    expect(prose.match(/\S+#[\p{L}\p{N}]{3,5}\b/gu) ?? []).toEqual([]);
  });
});
