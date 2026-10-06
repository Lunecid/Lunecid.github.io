// src/lib/case/sheet.ts — the case-study sheet's markup (the approved v4 sheet.html as an escaped template) and the JSON
// the static endpoint src/pages/case/[slug]/[lang].json.ts serves per language. Build time only: the page ships none of
// it; overlay.ts fetches the JSON on intent. Every string is escaped; the copy's inline marks (**b**, *em*, ~sub~ and
// the citations ^[a,f]) become markup only after escaping. No script or style element and no on* attribute (CSP). Ids are cs-
// prefixed so they never clash with the page's anchors; figures and tables are numbered in order of appearance.
import { caseCopy, type CaseCopy } from '../../data/copy/case/cog-2026';
import {
  CASE_FACTS, CASE_LITERATURE, fmtAuc, gapSteps, killGap, overallAuc, pairCounts, strataRows, type StratumRow,
} from '../../data/research/cog-2026-case';
import { figureCopy } from '../../data/research/cog-2026';
import type { PublicationFrontmatter } from '../../content/schemas';
import type { Lang } from '../../i18n/ui';
import { formatNumber } from '../../i18n/utils';
import { resolveDeep, type FactSource } from '../facts';
import { bibtexField } from '../publications';
import { chartLabels, type ChartLabels } from './charts';

export interface CaseImage { src: string; srcset: string; width: number; height: number }
export interface CaseSheetInput {
  lang: Lang;
  facts: FactSource;
  paper: Pick<PublicationFrontmatter, 'title' | 'shortTitle' | 'authors' | 'bibtex' | 'code' | 'venueShort' | 'year'>;
  /** Fig. 1 of the paper and the follow-up kill-gap figure, as built by the endpoint (getImage). */
  images: { fig1: CaseImage; kde: CaseImage };
}
/** What the endpoint serves: the dialog markup, the chart words, the pipeline lines and the runtime's strings. */
export interface CaseSheetData {
  lang: Lang;
  html: string;
  labels: ChartLabels;
  say: string[];
  strings: { copy: string; copied: string; copyDone: string; copyFail: string; tipAuc: string };
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const SOURCES = 'abcdef';
/** Escaped text with the copy's inline marks turned into markup. */
export function inline(text: string): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~(.+?)~/g, '<sub>$1</sub>')
    .replace(/\^\[([a-f](?:,[a-f])*)\]/g, (_, ids: string) => `<span class="cs-src">[${ids.split(',').map((id) => `S${SOURCES.indexOf(id) + 1}`).join(', ')}]</span>`);
}
/** Inline marks for a span that stays italic text (*…* → <i>): the references list. */
const inlineRef = (text: string): string => inline(text).replace(/<em>(.+?)<\/em>/g, '<i>$1</i>');
const attr = (s: string): string => esc(s.replace(/\^\[[a-f,]+\]/g, '').replace(/[*~]/g, ''));

export function caseSheetData(input: CaseSheetInput): CaseSheetData {
  const { lang } = input;
  const c = resolveDeep(caseCopy[lang], lang, input.facts) as CaseCopy;
  return {
    lang,
    html: renderCaseSheet(input, c),
    labels: chartLabels(c.charts, lang),
    say: c.ch2.pipe.say.map(inline),
    strings: { copy: c.chrome.copy, copied: c.chrome.copied, copyDone: c.chrome.copyDone, copyFail: c.chrome.copyFail, tipAuc: c.charts.tipAuc },
  };
}

/** The dialog markup for one language (c = the resolved copy of that language). */
export function renderCaseSheet(input: CaseSheetInput, c: CaseCopy): string {
  const { lang, paper, images } = input;
  const n = (v: number) => formatNumber(v, lang);
  let figN = 0;
  let tabN = 0;
  const figLabel = () => `${c.chrome.figure} ${++figN}.`;
  const tabLabel = () => `${c.chrome.table} ${++tabN}.`;
  const enAttr = lang === 'en' ? '' : ' lang="en"';

  const badge = (kind: 'real' | 'calc' | 'schem' | 'follow', label: string) => `<span class="cs-badge cs-badge--${kind}">${esc(label)}</span>`;
  const bar = (b: string, play = false) =>
    `<div class="cs-viz__bar">${b}${play
      ? `<button type="button" class="cs-play" data-play>▶ ${esc(c.chrome.play)}</button>`
      : `<button type="button" class="cs-viz__replay" data-replay>↻ ${esc(c.chrome.replay)}</button>`}</div>`;
  const caption = (id: string, title: string, rest = '') =>
    `<figcaption class="cs-viz__cap"><span id="cs-cap-${id}"><b class="cs-cap-n">${esc(figLabel())}</b> ${inline(title)}</span>${rest ? ` ${inline(rest)}` : ''}</figcaption>`;
  /** A chart figure: overlay.ts draws the SVG into [data-plot] at the plot's width. */
  const chart = (viz: string, b: string, alt: string, title: string, cap: string, opts: { lift?: boolean; between?: string; after?: string; play?: boolean; plotClass?: string } = {}) => {
    const plot = `<div class="cs-viz__plot${opts.plotClass ? ` ${opts.plotClass}` : ''}" data-plot role="img" aria-label="${attr(alt)}"></div>`;
    return `<figure class="cs-viz${opts.lift ? ' cs-viz--lift' : ''}" data-viz="${viz}" aria-labelledby="cs-cap-${viz}">${bar(b, opts.play)}${opts.between ?? ''}${plot}${opts.after ?? ''}${caption(viz, title, cap)}</figure>`;
  };
  const more = (body: string) => `<details class="cs-more"><summary>${esc(c.chrome.details)}</summary><div class="cs-more__in">${body}</div></details>`;
  const h4 = (t: string, extra = '') => `<h4>${inline(t)}${extra}</h4>`;
  const p = (t: string, cls = '') => `<p${cls ? ` class="${cls}"` : ''}>${inline(t)}</p>`;
  const table = (cap: string, head: string[], rows: string[][], numCols: number[] = [], cls = 'cs-tbl') =>
    `<div class="cs-tbl-wrap"><table class="${cls}"><caption><b class="cs-cap-n">${esc(tabLabel())}</b> ${inline(cap)}</caption>`
    + `<thead><tr>${head.map((h, i) => `<th scope="col"${numCols.includes(i) ? ' class="cs-num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map((r) => `<tr>${r.map((cell, i) => `<td${numCols.includes(i) ? ' class="cs-num"' : ''}>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const img = (im: CaseImage, alt: string, capText: string) =>
    `<figure class="cs-fig-img"><img src="${esc(im.src)}" srcset="${esc(im.srcset)}" sizes="(min-width: 1000px) 560px, 92vw" alt="${attr(alt)}" width="${im.width}" height="${im.height}" loading="lazy" decoding="async"><figcaption class="cs-viz__cap"><b class="cs-cap-n">${esc(figLabel())}</b> ${inline(capText)}</figcaption></figure>`;
  const next = (go: string, label: string, up = false) => `<button type="button" class="cs-next" data-go="${go}">${esc(label)} <span aria-hidden="true">${up ? '↑' : '↓'}</span></button>`;
  const steps = c.steps;
  const nextLabel = (i: number) => `${c.chrome.next} · ${i + 1} ${[c.ch1, c.ch2, c.ch3, c.ch4, c.ch5][i]!.title}`;
  const chTitle = (i: number, ch: { title: string; en: string }) =>
    `<h3 class="cs-ch__title cs-wide" id="cs-ch${i}-t" tabindex="-1"><span class="cs-ch__no">${i}</span>${esc(ch.title)}${ch.en ? `<span class="cs-ch__en" lang="en">${esc(ch.en)}</span>` : ''}</h3>`;
  const rail = (i: number, title: string, hero: string) => `<aside class="cs-rail" aria-label="${attr(`${i} ${title} ${c.chrome.railLabel}`)}">${hero}</aside>`;
  const hero = (value: string, label: string, attrs = '') => `<p class="cs-hero"${attrs}><span class="cs-hero__v">${value}</span><span class="cs-hero__k">${inline(label)}</span></p>`;
  const g = gapSteps();
  const stratumLabel = (r: StratumRow) => c.ch4.more.strataRows[r.key];
  const range = (r: readonly [number, number]) => `${fmtAuc(r[0])}–${fmtAuc(r[1])}`;

  // ── cover ──
  const cover = `<div class="cs-cover cs-pg">
<p class="cs-cover__kick"${enAttr}>${esc(c.cover.kicker)}</p>
<p class="cs-cover__thesis">${inline(c.cover.thesis)}</p>
<p class="cs-cover__by" lang="en">${paper.authors.map((a) => `<span>${esc(a.name)}</span>`).join(' · ')} · <span>${esc(c.cover.venue)}</span></p>
<div class="cs-abstract"><h3 class="cs-abstract__h">${esc(c.cover.abstractH)}</h3><p class="cs-cover__answer">${inline(c.cover.answer)}</p><p class="cs-kw"><b>${esc(c.cover.keywordsH)}</b> ${esc(c.cover.keywords)}</p></div>
<div class="cs-stats" data-cover>
<div class="cs-stat cs-stat--lead"><span class="cs-stat__v" data-count="${CASE_FACTS.engagements}">${n(CASE_FACTS.engagements)}</span><span class="cs-stat__k">${inline(c.cover.stats[0]!)}</span></div>
<div class="cs-stats__pair"><div class="cs-stat"><span class="cs-stat__v" data-count="${g.to}" data-dec="3">${fmtAuc(g.to)}</span><span class="cs-stat__k">${inline(c.cover.stats[1]!)}</span></div>
<div class="cs-stat"><span class="cs-stat__v">${fmtAuc(CASE_FACTS.strata.gold[0].lgbm)}</span><span class="cs-stat__k">${inline(c.cover.stats[2]!)}</span></div></div>
</div>
<ul class="cs-legend" role="list" aria-label="${attr(c.cover.legend)}"><li>${esc(c.cover.legendH)}</li><li>${badge('real', c.badge.real)}</li><li>${badge('calc', c.badge.calc)}</li><li>${badge('schem', c.badge.schem)}</li><li>${badge('follow', c.badge.follow)}</li></ul>
</div>`;

  // ── 1 question ──
  const m1 = c.ch1.more;
  const ch1 = `<section class="cs-ch cs-pg" id="cs-ch1" aria-labelledby="cs-ch1-t">${chTitle(1, c.ch1)}
${rail(1, c.ch1.title, hero(`${CASE_FACTS.snapshotSec}<small>s</small>`, c.ch1.hero))}
<div class="cs-col"><p class="cs-lede">${inline(c.ch1.lede)}</p>
<ul class="cs-pts" role="list">${c.ch1.points.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>
${chart('sampling', badge('schem', c.badge.schem), c.ch1.sampling.alt, c.ch1.sampling.title, c.ch1.sampling.cap, {
    lift: true,
    after: `<ul class="cs-keys" role="list"><li><i class="cs-k-line" aria-hidden="true"></i>${esc(c.ch1.sampling.keys[0]!)}</li><li><i class="cs-k-dot" aria-hidden="true"></i>${esc(c.ch1.sampling.keys[1]!)}</li><li><i class="cs-k-dash" aria-hidden="true"></i>${esc(c.ch1.sampling.keys[2]!)}</li><li><i class="cs-k-win" aria-hidden="true"></i>${esc(c.ch1.sampling.keys[3]!)}</li></ul>`,
  })}
${more(`${h4(m1.nyquistH)}${p(m1.nyquist)}${h4(m1.twoResH)}${p(m1.twoRes)}${chart('res', badge('schem', c.badge.schem), m1.res.alt, m1.res.title, m1.res.cap)}${h4(m1.whyH)}${p(m1.why)}${h4(m1.scopeH)}${p(m1.scope)}${h4(m1.killsH)}${p(m1.kills)}`)}
${next('cs-ch2', nextLabel(1))}</div></section>`;

  // ── 2 measurement design ──
  const m2 = c.ch2.more;
  const flowVals = [CASE_FACTS.collectedMatches, CASE_FACTS.matches, CASE_FACTS.engagements, Object.keys(CASE_FACTS.patches).length];
  const arrow = (i: number) => `<div class="cs-flow__arrow" aria-hidden="true"><svg viewBox="0 0 18 12"><path class="cs-a cs-fade" style="--i:${i}" d="M1 6h14M11 2l4 4-4 4" fill="none" stroke="var(--cs-cy)" stroke-width="1.5"/></svg></div>`;
  const flow = `<figure class="cs-viz cs-viz--plain" data-viz="flow" aria-labelledby="cs-cap-flow">${bar(badge('real', c.badge.real))}<div class="cs-flow">${flowVals.map((v, i) =>
    `${i ? arrow(i * 3 - 1) : ''}<div class="cs-flow__node${i === 0 ? ' cs-flow__node--ctx' : ''} cs-a cs-rise" style="--i:${i * 3}"><span class="cs-flow__v"${i ? ` data-count="${v}"` : ''}>${n(v)}</span><span class="cs-flow__u">${esc(c.ch2.flow.nodes[i]!)}</span></div>`).join('')}</div>${caption('flow', c.ch2.flow.title, c.ch2.flow.cap)}</figure>`;
  const stages = `<ol class="cs-stages" role="list" aria-label="${attr(c.chrome.stagesLabel)}">${c.ch2.pipe.stages.map((st, i) =>
    `<li><button type="button" data-stage="${i + 1}" aria-pressed="false"><b>${esc(st.tag || String(i))}</b><span class="cs-lg">${esc(st.long)}</span><span class="cs-sh" aria-hidden="true">${esc(st.short)}</span></button></li>`).join('')}</ol>`;
  const pipeFig = chart('pipe', badge('schem', c.badge.schem), c.ch2.pipe.alt, c.ch2.pipe.title, c.ch2.pipe.cap, { lift: true, play: true, between: stages, plotClass: 'cs-pl', after: '<p class="cs-stage-say" aria-live="polite" data-say></p>' });
  const evs = `<ul class="cs-evs" role="list" aria-label="${attr(c.chrome.eventsLabel)}">${c.ch2.win.events.map((e, i) => `<li style="--i:${i}">${esc(e)}</li>`).join('')}</ul>`
    + `<div class="cs-out"><span class="cs-out__k">${esc(c.ch2.win.outLabel)}</span><span class="cs-team cs-team--b"><i aria-hidden="true"></i>${esc(c.ch2.win.blue)}</span><span class="cs-muted">${esc(c.ch2.win.or)}</span><span class="cs-team cs-team--r"><i aria-hidden="true"></i>${esc(c.ch2.win.red)}</span></div>`;
  const winFig = chart('win', badge('real', c.badge.paperSetting), c.ch2.win.alt, c.ch2.win.title, c.ch2.win.cap, { lift: true, after: evs });
  const dots = ['full', 'full', 'half', 'none'];
  const ladder = `<figure class="cs-viz cs-viz--plain" data-viz="ladder" aria-labelledby="cs-cap-ladder">${bar(badge('real', c.badge.fact))}<ul class="cs-ladder" role="list">${c.ch2.ladder.rows.map((r, i) =>
    `<li style="--i:${i}"><span class="cs-dot cs-dot--${dots[i]}" aria-hidden="true"></span><span>${inline(r.what)}<small>${esc(r.note)}</small></span><span class="cs-st${i < 2 ? ' cs-st--y' : ''}">${esc(r.state)}</span></li>`).join('')}</ul>${caption('ladder', c.ch2.ladder.title, c.ch2.ladder.cap)}</figure>`;
  const eq = `<p class="cs-eq" role="math" aria-label="${attr(m2.labelAlt)}">y = 𝟙[ Σ<sub>u</sub> α<sub>u</sub> σ<sub>u</sub> v<sub>u</sub> &gt; 0 ]</p>`;
  const where = ['u', 'σ<sub>u</sub>', 'v<sub>u</sub>', 'α<sub>u</sub>'];
  const ch2More = more(`${h4(m2.rulesH)}${table(m2.rulesCap, m2.rulesHead, m2.rules.map((r) => r.map(inline)))}`
    + `${h4(m2.setupH)}<dl class="cs-dl">${m2.setup.map(([k, v]) => `<dt>${esc(k!)}</dt><dd>${inline(v!)}</dd>`).join('')}</dl>${p(m2.setupNote, 'cs-small cs-muted')}`
    + `${h4(m2.labelH)}${eq}<ul class="cs-eq-where" role="list">${m2.labelWhere.map((t, i) => `<li><code>${where[i]}</code>${inline(t)}</li>`).join('')}</ul>${p(m2.labelNote, 'cs-small cs-muted')}`
    + `${h4(m2.leakH)}${p(m2.leak)}${h4(m2.featuresH)}${p(m2.features)}`
    + `${h4(m2.figH)}${img(images.fig1, figureCopy.labelHorizon.alt[lang], m2.figCap)}`);
  const ch2 = `<section class="cs-ch cs-pg" id="cs-ch2" aria-labelledby="cs-ch2-t">${chTitle(2, c.ch2)}
${rail(2, c.ch2.title, hero(`<span data-count="${CASE_FACTS.engagements}">${n(CASE_FACTS.engagements)}</span>`, c.ch2.hero, ' data-hero-count'))}
<div class="cs-col"><p class="cs-lede">${inline(c.ch2.lede)}</p>${p(c.ch2.say, 'cs-say')}
${flow}${pipeFig}${winFig}${ladder}${ch2More}
${next('cs-ch3', nextLabel(2))}</div></section>`;

  // ── 3 result I ──
  const m3 = c.ch3.more;
  const aucRows = overallAuc.map((r) => [esc(r.model), esc(r.view[lang]), esc(m3.groups[r.group]), fmtAuc(r.auc)]);
  const gapRows = m3.gapRows.map(([k, v], i) => [esc(k!), inline(v!), `+${fmtAuc([g.input, g.learner, g.total][i]!)}`]);
  const splitFig = chart('split', badge('real', c.badge.setting), c.ch3.split.alt, c.ch3.split.title, c.ch3.split.cap);
  const aucFig = chart('auc', badge('real', c.badge.real), figureCopy.aucOverall.alt[lang], c.ch3.auc.title, c.ch3.auc.cap, { lift: true });
  const gapFig = chart('gap', badge('calc', c.badge.calc), c.ch3.gap.alt, c.ch3.gap.title, '', { lift: true });
  const pairs = pairCounts();
  const waffle = chart('waffle', badge('calc', c.badge.calc), m3.waffle.alt, m3.waffle.title, m3.waffle.cap, {
    after: `<ul class="cs-keys" role="list"><li><i class="cs-k-chance" aria-hidden="true"></i><b>${n(pairs.chance)}</b> ${esc(m3.waffle.keys[0]!)}</li><li><i class="cs-k-extra" aria-hidden="true"></i><b>+${n(pairs.extra)}</b> ${esc(m3.waffle.keys[1]!)}</li><li><i class="cs-k-wrong" aria-hidden="true"></i><b>${n(pairs.wrong)}</b> ${esc(m3.waffle.keys[2]!)}</li></ul>`,
  });
  const gauge = chart('gauge', badge('real', c.badge.real), m3.gauge.alt, m3.gauge.title, `${m3.gauge.cap}`).replace('</figcaption>', ` ${badge('calc', c.badge.calc)}</figcaption>`);
  const ch3 = `<section class="cs-ch cs-pg" id="cs-ch3" aria-labelledby="cs-ch3-t">${chTitle(3, c.ch3)}
${rail(3, c.ch3.title, hero(fmtAuc(g.to), c.ch3.hero))}
<div class="cs-col"><p class="cs-lede">${inline(c.ch3.lede)}</p>
${splitFig}
${aucFig}
${gapFig}
${p(c.ch3.say, 'cs-say')}
${more(`${h4(m3.whyH)}${p(m3.why)}${h4(m3.tableH)}${table(m3.aucCap, m3.aucHead, aucRows, [3])}${table(m3.gapCap, m3.gapHead, gapRows, [2])}${p(m3.gapNote, 'cs-small cs-muted')}`
    + `${h4(m3.priorH)}${p(m3.prior)}${h4(m3.readH)}${p(m3.read)}<div class="cs-figrow">${waffle}${gauge}</div>`)}
${next('cs-ch4', nextLabel(3))}</div></section>`;

  // ── 4 result II ──
  const m4 = c.ch4.more;
  const strataFig = chart('strata', badge('real', c.badge.real), c.ch4.strata.alt, c.ch4.strata.title, c.ch4.strata.cap, {
    lift: true,
    after: `<ul class="cs-keys" role="list"><li><i class="cs-k-dot" aria-hidden="true"></i>${esc(c.ch4.strata.keys[0]!)}</li><li><i class="cs-k-band" aria-hidden="true"></i>${esc(c.ch4.strata.keys[1]!)}</li></ul>`,
  });
  const d = c.ch4.decomp;
  const decomp = `<figure class="cs-viz cs-viz--plain" data-viz="decomp" aria-labelledby="cs-cap-decomp">${bar(badge('schem', c.badge.schem))}<p class="cs-decomp" role="img" aria-label="${attr(d.alt)}">`
    + `<span class="cs-decomp__y cs-a cs-rise" style="--i:0" aria-hidden="true">Y <i>≈</i></span>`
    + `<span class="cs-decomp__t cs-decomp__t--obs cs-a cs-rise" style="--i:2" aria-hidden="true"><b>${esc(d.obs)}</b><small>${esc(d.obsNote)}</small></span>`
    + `<i class="cs-decomp__op cs-a cs-rise" style="--i:3" aria-hidden="true">+</i>`
    + `<span class="cs-decomp__t cs-decomp__t--hid cs-a cs-rise" style="--i:4" aria-hidden="true"><b>${esc(d.hid)}</b><small>${esc(d.hidNote)}</small></span>`
    + `<i class="cs-decomp__op cs-a cs-rise" style="--i:5" aria-hidden="true">+</i>`
    + `<span class="cs-decomp__t cs-decomp__t--noise cs-a cs-rise" style="--i:6" aria-hidden="true"><b>${esc(d.noise)}</b><small>&nbsp;</small></span></p>`
    + `<p class="cs-note">${inline(d.note)}</p>${caption('decomp', d.title)}</figure>`;
  const alts = table(c.ch4.altCap, c.ch4.altHead, c.ch4.alts.map(([e, how], i) => [`<span class="cs-n">${i + 1}</span>${inline(e!)}`, inline(how!)]), [], 'cs-mini');
  const kgRows = [n(killGap.n), `${killGap.modes[0]} s`, `${killGap.valley} s`, `${killGap.modes[1]} s`, `${killGap.ariBand[0]}–${killGap.ariBand[1]} s`, `≤ ${CASE_FACTS.clusterGapSec} s`];
  const ch4 = `<section class="cs-ch cs-pg" id="cs-ch4" aria-labelledby="cs-ch4-t">${chTitle(4, c.ch4)}
${rail(4, c.ch4.title, hero(fmtAuc(CASE_FACTS.strata.gold[0].lgbm), c.ch4.hero))}
<div class="cs-col"><p class="cs-lede">${inline(c.ch4.lede)}</p>${p(c.ch4.say, 'cs-say')}
${strataFig}${decomp}
<h4 class="cs-sub"><span class="cs-sub__n">4.1</span>${esc(c.ch4.altH)}</h4>${alts}
<p class="cs-note">${inline(c.ch4.seedNote)}</p>
${more(`${h4(m4.strataH)}${table(m4.strataCap, m4.strataHead, strataRows().map((r) => [esc(stratumLabel(r)), fmtAuc(r.lgbm), range(r.neural)]), [1, 2])}`
    + `${h4(m4.followH, ` ${badge('follow', c.badge.followOut)}`)}${p(m4.follow)}`
    + `${chart('gap-ruler', badge('follow', c.badge.follow), m4.ruler.alt, m4.ruler.title, m4.ruler.cap)}`
    + `${img(images.kde, figureCopy.killGap.alt[lang], m4.kdeCap)}`
    + `${table(m4.kgCap, m4.kgHead, m4.kgRows.map((k, i) => [inline(k), esc(kgRows[i]!)]), [1])}`)}
${next('cs-ch5', nextLabel(4))}</div></section>`;

  // ── 5 discussion ──
  const c5 = c.ch5;
  const ch5 = `<section class="cs-ch cs-ch--rows" id="cs-ch5" aria-labelledby="cs-ch5-t">
<div class="cs-pg">${chTitle(5, c5)}
${rail(5, c5.title, hero(`<span class="cs-q">≥ </span>${fmtAuc(g.to)}`, c5.hero))}
<div class="cs-col"><p class="cs-lede">${inline(c5.lede)}</p>
<h4 class="cs-sub cs-sub--first"><span class="cs-sub__n">5.1</span>${esc(c5.shownH)}</h4>
<div class="cs-ledger"><div class="cs-ledger__col"><h4 class="cs-ledger__h">${esc(c5.shown)}</h4><ul role="list">${c5.shownItems.map((it) => `<li>${inline(it.text)} <span class="cs-ev">${esc(it.ev)}</span>${inline(it.src)}</li>`).join('')}</ul></div>
<div class="cs-ledger__col cs-ledger__col--hyp"><h4 class="cs-ledger__h">${esc(c5.hyp)}</h4><ul role="list">${c5.hypItems.map((t) => `<li>${inline(t)}</li>`).join('')}</ul></div></div>
<p class="cs-ledger__how"><b>${esc(c5.howH)}</b>${inline(c5.how)}</p>
${more(`${h4(c5.more.boundH)}${p(c5.more.bound)}`)}
<h4 class="cs-sub"><span class="cs-sub__n">5.2</span>${esc(c5.changeH)}</h4>
<ul class="cs-arrows" role="list">${c5.changes.map(([k, v]) => `<li><b>${inline(k!)}</b><i aria-hidden="true">→</i><span>${inline(v!)}</span></li>`).join('')}</ul>
<h4 class="cs-sub"><span class="cs-sub__n">5.3</span>${esc(c5.rolesH)}</h4>
</div></div>
<ul class="cs-dcards" role="list">${c5.cards.map((card) => `<li class="cs-dcard"><h4>${esc(card.who)}</h4><dl><dt>${esc(c5.cardLabels[0]!)}</dt><dd>${inline(card.ask)}</dd><dt>${esc(c5.cardLabels[1]!)}</dt><dd>${inline(card.why)}</dd><dt>${esc(c5.cardLabels[2]!)}</dt><dd>${inline(card.change)}</dd></dl></li>`).join('')}</ul>
<div class="cs-pg"><div class="cs-col" style="grid-column:2">
<div class="cs-links"><a class="cs-btn cs-btn--fill" data-case-paper href="">${esc(c.chrome.paperPage)} <span aria-hidden="true">→</span></a>${paper.code ? `<a class="cs-btn cs-btn--line" href="${esc(paper.code)}" rel="noopener">${esc(c.chrome.code)} <span class="sr-only">(${esc(`${paper.code.split('/').pop()} ${c.chrome.codeTag}`)})</span><span aria-hidden="true">↗</span></a>` : ''}</div>
${p(c5.ongoing, 'cs-small cs-muted')}
</div></div></section>`;

  // ── references, BibTeX ──
  const initials = (name: string) => { const parts = name.split(' '); return `${parts.slice(0, -1).map((x) => `${x[0]}.`).join(' ')} ${parts.at(-1)}`; };
  const names = paper.authors.map((a) => initials(a.name));
  const authorList = names.length > 2 ? `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}` : names.join(' and ');
  const booktitle = bibtexField(paper.bibtex, 'booktitle') ?? paper.venueShort;
  const address = bibtexField(paper.bibtex, 'address');
  const s6 = `${authorList}, “${paper.title},” in *${booktitle}*${address ? `, ${address}` : ''}, ${paper.year}, paper ${CASE_FACTS.paperNumber}: ${c.refs.s6Where}`;
  const refs = [c.refs.s1, c.refs.s2, c.refs.s3, c.refs.s4, c.refs.s5, s6];
  const end = `<footer class="cs__end cs-pg"><div class="cs-wide">
<h3>${esc(c.chrome.refsH)}</h3>
<ol class="cs-refs" id="cs-refs" role="list">${refs.map((r, i) => `<li id="cs-ref-s${i + 1}"><b>[S${i + 1}]</b><span${i === 5 ? enAttr : ''}>${inlineRef(r)}</span></li>`).join('')}</ol>
<h4 class="cs-refs__h">${esc(c.chrome.refsExtH)}</h4>
<ol class="cs-refs cs-refs--ext" role="list">${Object.values(CASE_LITERATURE).map((ref) => `<li lang="en">${inlineRef(ref.ref)}</li>`).join('')}</ol>
${`<details class="cs-more"><summary>${esc(c.chrome.bibtex)}</summary><div class="cs-more__in"><div class="cs-bib"><button type="button" class="cs-copy" data-copy>${esc(c.chrome.copy)}</button><pre id="cs-bibtex" lang="en">${esc(paper.bibtex.trimEnd())}</pre></div><p class="sr-only" aria-live="polite" data-copy-status></p></div></details>`}
${next('cs-ch1', `${c.chrome.toStart} · 1 ${c.ch1.title}`, true)}
</div></footer>`;

  const nav = `<nav aria-label="${attr(c.dialog.nav)}"><ol class="cs-steps" role="list">${steps.map((s, i) =>
    `<li><button type="button" data-go="cs-ch${i + 1}" aria-controls="cs-ch${i + 1}"><span class="cs-steps__n">${String(i + 1).padStart(2, '0')}</span><span class="cs-steps__l">${esc(s.long)}</span><span class="cs-steps__s" aria-hidden="true">${esc(s.short)}</span></button></li>`).join('')}</ol></nav>`;

  return `<dialog class="cs" lang="${lang}" aria-labelledby="cs-title" aria-describedby="cs-desc">
<div class="cs__scrim" data-close></div>
<section class="cs__sheet" tabindex="-1">
<header class="cs__head"><div class="cs__grab" aria-hidden="true"></div>
<h2 class="cs__title" id="cs-title">${esc(c.dialog.title)}</h2>
<p class="sr-only" id="cs-desc">${esc(c.dialog.desc)}</p>
<button type="button" class="cs__close" data-close aria-label="${attr(c.dialog.close)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="2" fill="none"/></svg></button>
${nav}<div class="cs__progress" aria-hidden="true"><i></i></div></header>
<div class="cs__body" id="cs-body">${cover}${ch1}${ch2}${ch3}${ch4}${ch5}${end}</div>
</section></dialog>`;
}

