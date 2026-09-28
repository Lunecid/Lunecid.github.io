// Client-safe (used by the FavoriteGames island as well as .astro components).

/**
 * The character credit line in wrap-safe pieces (final fix 2 item 9): split at its ' · ' separators, each separator
 * kept at the end of the piece before it, and every '©' glued to the owner after it with a no-break space. A
 * component renders each piece as its own span, so a narrow line breaks between pieces (never "…Zone" / "Zero)"),
 * and a break never separates the © from its owner.
 */
export function creditParts(credit: string): string[] {
  const parts = credit.split(' · ').map((part) => part.replace(/© /g, '© '));
  return parts.map((part, i) => (i < parts.length - 1 ? `${part} ·` : part));
}
