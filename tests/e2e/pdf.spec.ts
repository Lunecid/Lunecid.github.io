import { test, expect } from './helpers';
import { DOCUMENTS } from '../../src/config';

test('3 résumé PDFs are served as application/pdf and linked from /records/', async ({ page, request }) => {
  const hrefs = Object.values(DOCUMENTS);
  expect(hrefs).toHaveLength(3);
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toContain('application/pdf');
    expect((await res.body()).subarray(0, 5).toString('latin1'), `${href} starts with %PDF-`).toBe('%PDF-');
  }
  for (const records of ['/records/', '/en/records/']) {
    const response = await page.goto(records);
    expect(response?.status(), records).toBe(200);
    for (const href of hrefs) {
      await expect(page.locator(`#documents a[href="${href}"]`).first(), `${records} links ${href}`).toBeVisible();
    }
  }
});
