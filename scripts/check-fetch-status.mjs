// Finds build-time fetch results that hit 401/403 (authFailed: true) in src/data/generated/**/*.json.
// CI: `node scripts/check-fetch-status.mjs src/data/generated --github-output` records auth_failed=true|false
// as a build-job output; the post-deploy job fetch-health fails the workflow when it is true (spec §7.1).
import { appendFile, readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

async function listJsonFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(path);
  }
  return files;
}

/** Sorted POSIX paths (relative to dir) of every JSON file whose root object has authFailed === true. */
export async function findAuthFailures(dir) {
  const hits = [];
  for (const file of await listJsonFiles(dir)) {
    let data;
    try {
      data = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      continue; // unreadable or invalid JSON is not an auth failure
    }
    if (data !== null && typeof data === 'object' && data.authFailed === true) {
      hits.push(relative(dir, file).split(sep).join('/'));
    }
  }
  return hits.sort();
}

async function main() {
  const args = process.argv.slice(2);
  const githubOutput = args.includes('--github-output');
  const dir = args.find((arg) => !arg.startsWith('--')) ?? 'src/data/generated';
  const hits = await findAuthFailures(dir);
  if (githubOutput) {
    const line = `auth_failed=${hits.length > 0}\n`;
    const outFile = process.env.GITHUB_OUTPUT;
    if (outFile) await appendFile(outFile, line);
    else process.stdout.write(line);
    if (hits.length > 0) console.log(`authFailed: true in ${hits.join(', ')} (fetch-health fails after deploy)`);
    return;
  }
  if (hits.length > 0) {
    console.error(`Build-time fetch got 401/403 (authFailed: true) in:\n${hits.map((h) => `  ${dir}/${h}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`no authFailed in ${dir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
