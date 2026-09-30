// `npm run setup` (account-link spec §5.7.2, owner step 8-10): puts the relay Worker's three secrets with wrangler.
// Node built-ins only. The owner pastes two values: the GitHub App Client ID (visible) and the client secret (hidden
// prompt, never echoed). SEAL_KEY is 32 random bytes made here and never shown. Every value goes to
// `wrangler secret put <NAME>` through the child's stdin only: never on a command line, never in a file, never printed.
// wrangler 4.144.0 reads a piped stdin as the value (wrangler-dist/cli.js, `secret put`: `process.stdin.isTTY ?
// prompt(...) : readFromStdin()`, which reads until the stream ends and trims trailing whitespace).
// The child is node itself running the pinned wrangler's bin script (DV-31): `npx` fails to spawn on Windows (ENOENT),
// and `.cmd` files need a shell there, which would expose the arguments to shell quoting.
import { spawn } from 'node:child_process';
import { randomBytes as cryptoRandomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const PROMPT_CLIENT_ID = 'GitHub App의 Client ID를 붙여 넣고 Enter를 눌러 주세요:';
export const PROMPT_CLIENT_SECRET = 'GitHub App의 client secret을 붙여 넣고 Enter를 눌러 주세요(입력한 글자는 보이지 않습니다):';
export const DONE_MESSAGE = '비밀 세 개를 넣었습니다. 이제 브라우저로 /health 주소를 열어 확인해 주세요.';
export const SECRET_NAMES = ['GH_CLIENT_ID', 'GH_CLIENT_SECRET', 'SEAL_KEY'];
/** No shell on any platform; stdin is a pipe for the value, wrangler's own output goes to the owner's terminal. */
export const SPAWN_OPTIONS = Object.freeze({ cwd: here, stdio: ['pipe', 'inherit', 'inherit'], shell: false, windowsHide: true });
const MAX_TRIES = 5;

/**
 * The wrangler command for one secret. The same on every platform (the `platform` parameter documents that there is
 * no Windows branch: never `npx`/`npx.cmd`, never a shell).
 */
export function wranglerCommand(name, platform = process.platform) {
  void platform;
  return { file: process.execPath, args: [join(here, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'secret', 'put', name] };
}

/** Runs `wrangler secret put <name>` with `value` on stdin; resolves to the exit code (non-zero on any failure). */
export function putSecret(name, value, { spawnImpl = spawn, command = wranglerCommand(name) } = {}) {
  return new Promise((resolveCode) => {
    let settled = false;
    const finish = (code) => {
      if (!settled) {
        settled = true;
        resolveCode(code);
      }
    };
    let child;
    try {
      child = spawnImpl(command.file, command.args, SPAWN_OPTIONS);
    } catch {
      finish(1);
      return;
    }
    child.on('error', () => finish(1));
    child.on('close', (code) => finish(typeof code === 'number' ? code : 1));
    child.stdin.on('error', () => {});
    child.stdin.end(value);
  });
}

/** A pasted value: not empty, no space or line break anywhere (a paste that swallowed a second line is refused). */
const usable = (v) => typeof v === 'string' && v !== '' && !/\s/.test(v);

/** null after MAX_TRIES unusable answers, or when the prompt fails (stdin ended, Ctrl+D). */
async function askUntilUsable(askFn, prompt) {
  for (let i = 0; i < MAX_TRIES; i++) {
    let answer;
    try {
      answer = await askFn(prompt);
    } catch {
      return null;
    }
    if (usable(answer)) return answer;
  }
  return null;
}

/**
 * The whole setup with injected I/O (tests pass fakes; `main` passes the terminal). Returns the process exit code.
 * On failure it prints only the name of the secret that failed.
 */
export async function runSetup({ ask, askHidden, spawnPut, randomBytes, print }) {
  const clientId = await askUntilUsable(ask, PROMPT_CLIENT_ID);
  if (clientId === null) {
    print('GH_CLIENT_ID');
    return 1;
  }
  const clientSecret = await askUntilUsable(askHidden, PROMPT_CLIENT_SECRET);
  if (clientSecret === null) {
    print('GH_CLIENT_SECRET');
    return 1;
  }
  const values = { GH_CLIENT_ID: clientId, GH_CLIENT_SECRET: clientSecret, SEAL_KEY: randomBytes(32).toString('base64') };
  for (const name of SECRET_NAMES) {
    let code;
    try {
      code = await spawnPut(name, values[name]);
    } catch {
      code = 1;
    }
    if (code !== 0) {
      print(name);
      return 1;
    }
  }
  print(DONE_MESSAGE);
  return 0;
}

/** The terminal: one readline interface; while the hidden prompt waits, everything the terminal would echo is dropped. */
export async function main() {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  // terminal follows stdin only: with a keyboard, readline itself echoes (through the muted `output`), so the secret is
  // never shown even when stdout is redirected to a file.
  const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  rl.on('SIGINT', () => {
    rl.close();
    process.stdout.write('\n');
    process.exit(130);
  });
  let closed = false;
  const waiting = new Set();
  rl.on('close', () => {
    closed = true;
    if (waiting.size > 0 && !muted) process.stdout.write('\n'); // the failing name starts on its own line
    for (const reject of waiting) reject(new Error('stdin closed'));
    waiting.clear();
  });
  // A question pending when stdin ends (or Ctrl+D) rejects, so runSetup stops with exit code 1 instead of hanging.
  const question = (prompt) =>
    new Promise((answer, reject) => {
      if (closed) {
        reject(new Error('stdin closed'));
        return;
      }
      const settle = (value) => {
        waiting.delete(reject);
        answer(value);
      };
      waiting.add(reject);
      rl.question(prompt, settle);
    });
  const askHidden = async (prompt) => {
    const pending = question(prompt); // the prompt itself is written before muting
    muted = true;
    try {
      return await pending;
    } finally {
      muted = false;
      process.stdout.write('\n');
    }
  };
  try {
    return await runSetup({
      ask: question,
      askHidden,
      spawnPut: (name, value) => putSecret(name, value),
      randomBytes: cryptoRandomBytes,
      print: (line) => process.stdout.write(`${line}\n`),
    });
  } finally {
    rl.close();
  }
}

// Run only as `node setup-secrets.mjs` (npm run setup), not when imported by the tests. Windows paths compare
// case-insensitively.
const self = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (process.platform === 'win32' ? self.toLowerCase() === invoked.toLowerCase() : self === invoked) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.exitCode = 1;
    },
  );
}
