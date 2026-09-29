// src/lib/variant-runtime.ts — which game modules the current page has (§1.8, A-19). Browser-safe: during SSR there is
// no document, so moduleOn() is false and currentVariant() is null. The one module list is VARIANT_MODULES.
import { VARIANT_MODULES, isVariantId, type ModuleId, type PageVariant } from '../variants/ids';

/** Reads <html data-variant>: 'game' | 'data' | 'neutral', or null when absent or unknown. */
export function currentVariant(): PageVariant | null {
  if (typeof document === 'undefined') return null;
  const value = document.documentElement.getAttribute('data-variant');
  return isVariantId(value) || value === 'neutral' ? value : null;
}

/** True when the page's version has `module` (VARIANT_MODULES); false on neutral pages, without a version, or in SSR. */
export function moduleOn(module: ModuleId): boolean {
  const variant = currentVariant();
  return variant !== null && variant !== 'neutral' && VARIANT_MODULES[variant].includes(module);
}
