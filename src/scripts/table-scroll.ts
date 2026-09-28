// Table scroll boxes ([data-table-scroll]) of the case studies' Markdown tables (final fix 2 item 19,
// src/lib/figures.ts boxTables). A box is a focusable scroll region (tabindex 0, role region, named by the element its
// data-label-id names) only while its table is wider than it — a phone too narrow for the columns, where the table
// scrolls sideways inside its box instead of breaking words or the page. Where the table fits the box stays plain: no
// extra tab stop and no extra landmark (fix 1 round 2 item 8). Re-checked whenever the box or the table changes size
// (rotation, web fonts arriving). The AUC chart's "view as table" box runs the same logic from its own inline script
// (AucOverallChart.astro), so the home page gets no extra shared script chunk.

function sync(box: HTMLElement): void {
  const overflows = box.scrollWidth > box.clientWidth + 1;
  const labelId = box.dataset.labelId;
  if (overflows) {
    box.tabIndex = 0;
    box.setAttribute('role', 'region');
    if (labelId) box.setAttribute('aria-labelledby', labelId);
  } else {
    box.removeAttribute('tabindex');
    box.removeAttribute('role');
    box.removeAttribute('aria-labelledby');
  }
}

const boxes = Array.from(document.querySelectorAll<HTMLElement>('[data-table-scroll]'));
const observer =
  'ResizeObserver' in window
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          const box = (entry.target as HTMLElement).closest<HTMLElement>('[data-table-scroll]');
          if (box) sync(box);
        }
      })
    : null;
for (const box of boxes) {
  sync(box);
  observer?.observe(box);
  const table = box.querySelector('table');
  if (table) observer?.observe(table);
  box.closest('details')?.addEventListener('toggle', () => sync(box));
}
