import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer as reactContainerRenderer } from '@astrojs/react/container-renderer';
import { loadRenderers } from 'astro:container';
import { readFileSync } from 'node:fs';

export const SITE_URL = 'https://lunecid.github.io';
type Container = Awaited<ReturnType<typeof AstroContainer.create>>;
export type AstroComponent = Parameters<Container['renderToString']>[0];

/** Renders an Astro component (React islands included) with site + trailingSlash set, at `url` (default '/'). */
export async function renderAstro(
  component: AstroComponent,
  opts: { props?: Record<string, unknown>; slots?: Record<string, string>; url?: string } = {},
): Promise<string> {
  const renderers = await loadRenderers([reactContainerRenderer()]);
  const container = await AstroContainer.create({ renderers, astroConfig: { site: SITE_URL, trailingSlash: 'always' } });
  return container.renderToString(component, {
    props: opts.props ?? {},
    slots: opts.slots,
    request: new Request(new URL(opts.url ?? '/', SITE_URL)),
  });
}

/** Source text of a repo file (for CSS assertions: Container output contains no <style>). */
export function readSource(repoRelPath: string): string {
  return readFileSync(new URL(`../../${repoRelPath}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Isolates one `<a … href="href">…</a>` block from `html`, stopping at that anchor's own closing tag (a lazy
 * match is safe as long as nothing is nested inside it besides spans — true for every evidence chip this is used
 * on). Shared by SkillList.test.ts and JobFitTable.test.ts (fix round 1 minor, P2-14): both check the same thing
 * — a link out to GitHub gets the aria-hidden ↗ mark, an internal /research/ or /projects/ link does not.
 */
export function anchorBlock(html: string, href: string): string {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<a\\b[^>]*href="${escaped}"[^>]*>([\\s\\S]*?)<\\/a>`).exec(html);
  if (!match) throw new Error(`no <a> found for href ${href}`);
  return match[1] ?? '';
}
