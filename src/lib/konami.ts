// src/lib/konami.ts — ↑ ↑ ↓ ↓ ← → ← → B A detector for the hidden `konami` achievement (spec §5).
// Pure (no DOM globals), so it runs in the node test project. Keys typed into form fields are ignored.

export const KONAMI_SEQUENCE: readonly string[] = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  if ('isContentEditable' in target && (target as { isContentEditable?: unknown }).isContentEditable === true) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test((target as { tagName?: string }).tagName ?? '');
}

/**
 * Returns a keydown handler. Letters compare lower-case. A wrong key resets progress; a wrong 'ArrowUp' restarts
 * at 1, or stays at 2 right after '↑ ↑' (so '↑ ↑ ↑ ↓ ↓ …' still matches — the only overlap in this sequence).
 */
export function createKonamiDetector(onMatch: () => void): (event: { key: string; target: EventTarget | null }) => void {
  let index = 0;
  return (event) => {
    if (isTypingTarget(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === KONAMI_SEQUENCE[index]) {
      index += 1;
    } else if (key === KONAMI_SEQUENCE[0]) {
      index = index === 2 ? 2 : 1;
    } else {
      index = 0;
    }
    if (index === KONAMI_SEQUENCE.length) {
      index = 0;
      onMatch();
    }
  };
}
