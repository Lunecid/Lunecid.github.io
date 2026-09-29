// P2-2a (contract §2.2): a version page's layout is chosen by its page module, never by a shared view, because Astro
// bundles the CSS of every module a page imports, rendered or not. Type-only imports: erased, no module edge, no CSS.
import type BaseLayout from './BaseLayout.astro';
import type DataLayout from './DataLayout.astro';

export type PageLayout = typeof BaseLayout | typeof DataLayout;
