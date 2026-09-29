// src/lib/variant-pref.ts — the remembered version (§5.5). Written only by a chooser choice and by the version switch
// (A-7); visiting a version page never writes it. Storage errors are swallowed (private mode, blocked storage).
import { STORAGE_KEYS } from '../config';
import { isVariantId, type VariantId } from '../variants/ids';

export function storedVariant(): VariantId | null {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.variant);
    return isVariantId(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberVariant(variant: VariantId): void {
  try {
    localStorage.setItem(STORAGE_KEYS.variant, variant);
  } catch {
    /* storage blocked: the chooser simply shows again next time */
  }
}
