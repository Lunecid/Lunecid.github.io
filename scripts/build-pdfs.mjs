// Prints the three /print/* routes to PDFs in dist/cv/ (stack-ops §5.2). Run after `npm run build`.
// Local Windows: PW_CHANNEL=chrome reuses the installed Chrome. CI: `npm exec -- playwright install --with-deps chromium`.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { DOCUMENTS, PRINT_ROUTES } from '../src/config.ts';

/**
 * Chrome/Playwright's `page.pdf()` (CDP Page.printToPDF) has no option for PDF Author/Creator/Producer, and headless
 * Chromium's own Creator string names itself "HeadlessChrome" (verified: neither a `page.pdf()` option nor a
 * `context.newPage({ userAgent })` override changes it — only the browser's own product string does, and CDP does
 * not expose that per-print). Title IS honored already (Chromium's PDF writer uses `document.title`, set per page by
 * PrintLayout's `title` prop), so this only rewrites Author/Creator/Producer, post-build, with pdf-lib. Verified this
 * preserves the tagged-PDF structure, outline and embedded/subset Pretendard fonts that `page.pdf()` produced
 * (tests/ops/pdf.test.mjs "fonts are embedded ... no Type 3").
 */
export async function setPdfMetadata(path) {
  const bytes = await readFile(path);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.setAuthor('Seongeun Baek');
  doc.setCreator('Seongeun Baek portfolio (Astro)');
  doc.setProducer('Playwright + Chromium (Skia/PDF)');
  await writeFile(path, await doc.save());
}

/** @typedef {keyof typeof DOCUMENTS} DocumentId */

/**
 * One job per document: print route → dist path (outputs = distDir + DOCUMENTS[id]).
 * @param {string} distDir
 * @returns {{ id: DocumentId; route: string; out: string }[]}
 */
export function pdfJobs(distDir) {
  return /** @type {DocumentId[]} */ (Object.keys(DOCUMENTS)).map((id) => ({
    id,
    route: PRINT_ROUTES[id],
    out: join(distDir, ...DOCUMENTS[id].split('/').filter(Boolean)),
  }));
}

/**
 * Starts the preview server, launches the browser, prints every pdfJobs('dist') route, and always
 * releases both — even when `launch` throws (e.g. PW_CHANNEL names a missing channel) or a print
 * job fails. A leaked preview server keeps the Node event loop alive, which would hang a CI job
 * until timeout instead of failing fast (fix round 1).
 * `preview`/`launch` are injectable so tests can stub them without starting a real server/browser;
 * main() below passes the real astro/@playwright/test implementations. `distDir` defaults to 'dist' (main()'s
 * real output); tests pass a temp directory so a deliberately-broken run never touches the real build output.
 * @param {{ preview: (opts: object) => Promise<{ port: number; stop: () => Promise<void> }>, launch: (opts: object) => Promise<{ newPage: () => Promise<any>, close: () => Promise<void> }>, distDir?: string }} deps
 */
export async function printPdfs({ preview, launch, distDir = 'dist' }) {
  const port = Number(process.env.PDF_PORT ?? 4322); // preferred port: never the dev (4321) or e2e (4329) port
  const server = await preview({ root: process.cwd(), logLevel: 'warn', server: { port, host: '127.0.0.1' } });
  try {
    // Vite moves to the next free port when `port` is taken ("Port 4322 is in use, trying another one..."):
    // always navigate to the port the preview server actually bound.
    const origin = `http://127.0.0.1:${server.port}`;
    const browser = await launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
    try {
      const page = await browser.newPage();
      for (const job of pdfJobs(distDir)) {
        await mkdir(dirname(job.out), { recursive: true });
        const res = await page.goto(`${origin}${job.route}`, { waitUntil: 'networkidle' });
        if (!res || !res.ok()) throw new Error(`${job.route} -> HTTP ${res?.status()}`);
        await page.emulateMedia({ media: 'print' });
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        await page.pdf({ path: job.out, format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
        await setPdfMetadata(job.out);
        const { size } = await stat(job.out);
        console.log(`pdf ${job.out} ${(size / 1024).toFixed(0)} KiB`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
}

async function main() {
  const { preview } = await import('astro');
  const { chromium } = await import('@playwright/test');
  try {
    await printPdfs({ preview, launch: (opts) => chromium.launch(opts) });
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
