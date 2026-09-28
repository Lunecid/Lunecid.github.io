// tests/ops/build-pdfs.test.mjs — printPdfs() must release every resource it opens, even when a
// later step throws (fix round 1: a leaked preview server keeps the Node event loop alive, which
// would hang a CI job until timeout instead of failing fast).
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { printPdfs, setPdfMetadata } from '../../scripts/build-pdfs.mjs';

test('printPdfs stops the preview server even when the browser launch fails', async () => {
  let stopped = false;
  const server = { port: 4322, stop: async () => { stopped = true; } };
  const preview = async () => server;
  const launch = async () => {
    throw new Error('browser launch failed: PW_CHANNEL names a missing channel');
  };

  await assert.rejects(() => printPdfs({ preview, launch }), /browser launch failed/);
  assert.equal(stopped, true, 'server.stop() must be called even when launch() throws');
});

test('setPdfMetadata throws on a file that is not a real PDF', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pdf-meta-'));
  try {
    const bad = join(dir, 'not-a-pdf.pdf');
    await writeFile(bad, 'this is not a PDF');
    await assert.rejects(() => setPdfMetadata(bad));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Fix round 1 (controller): a broken metadata step must fail the whole build:pdf run, not just log a warning and
// keep going — main() (unchanged, see the bottom of build-pdfs.mjs) wraps printPdfs() in try/catch and sets
// process.exitCode = 1 on any rejection, so asserting printPdfs() rejects here is what makes `npm run build:pdf`
// exit non-zero. Stubs preview/launch (as above) but lets page.pdf() write a real, deliberately-corrupt file, so
// the *real* setPdfMetadata (real pdf-lib) is what fails — proving the error propagates out of the job loop and
// through both cleanup layers (browser.close(), server.stop()), not just that the helper throws in isolation.
test('printPdfs rejects, but still closes the browser and stops the server, when setPdfMetadata fails mid-loop', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pdf-jobs-'));
  try {
    let stopped = false;
    let closed = false;
    const server = { port: 4322, stop: async () => { stopped = true; } };
    const preview = async () => server;
    const page = {
      goto: async () => ({ ok: () => true, status: () => 200 }),
      emulateMedia: async () => {},
      evaluate: async () => {},
      // A real page.pdf() never writes garbage, but this stands in for whatever could make the output file
      // unparsable; setPdfMetadata (real pdf-lib, not stubbed) is what actually throws on it.
      pdf: async ({ path }) => writeFile(path, 'not a pdf'),
    };
    const browser = { newPage: async () => page, close: async () => { closed = true; } };
    const launch = async () => browser;

    await assert.rejects(() => printPdfs({ preview, launch, distDir: dir }));
    assert.equal(closed, true, 'browser.close() must run even when the metadata step throws');
    assert.equal(stopped, true, 'server.stop() must run even when the metadata step throws');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
