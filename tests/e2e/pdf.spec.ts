import { test, expect, dataPath, gamePath } from './helpers';
import { DOCUMENTS } from '../../src/config';
import { getVariant } from '../../src/variants';

test('every DOCUMENTS PDF is served as application/pdf and each records page links its version\'s documents', async ({ page, request }) => {
  const hrefs = Object.values(DOCUMENTS);
  expect(hrefs).toHaveLength(Object.keys(DOCUMENTS).length);
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toContain('application/pdf');
    expect((await res.body()).subarray(0, 5).toString('latin1'), `${href} starts with %PDF-`).toBe('%PDF-');
  }
  const listed = [
    { variant: 'game', routes: [gamePath('/records/'), gamePath('/records/', 'en')] },
    { variant: 'data', routes: [dataPath('/records/'), dataPath('/records/', 'en')] },
  ] as const;
  for (const { variant, routes } of listed) for (const records of routes) {
    const response = await page.goto(records);
    expect(response?.status(), records).toBe(200);
    const own = getVariant(variant).documents.list.map((id) => DOCUMENTS[id]);
    expect(own, variant).toHaveLength(3);
    for (const href of own) {
      await expect(page.locator(`#documents a[href="${href}"]`).first(), `${records} links ${href}`).toBeVisible();
    }
  }
});
