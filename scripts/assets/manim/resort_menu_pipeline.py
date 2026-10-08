#!/usr/bin/env python3
"""The LG Aimers project's Figure 1 (src/content/projects/*/resort-menu-demand.md) as a Manim infographic.

One scene builds the forecasting pipeline of the team's submission code step by step; its last frame is the whole
infographic. Two outputs:
  scripts/assets/sources/resort-menu-pipeline.png   the last frame, 2400x1350 (import-assets turns it into the WebP
                                                   figure: the cover, the poster frame, print and reduced motion)
  public/video/resort-menu-pipeline.webm           the animation, 1600x900 at 30 fps, VP9 (the first source: every
                                                   Chromium plays it, including builds without H.264)
  public/video/resort-menu-pipeline.mp4            the same in H.264 with the moov atom first (Safari and older browsers)

Every number drawn is a constant of the submission code (owner 2026-10-08: the code file and the preliminary-round
code-report deck; where the two differ, the code wins): the 28-day lookback (LOOKBACK), the 7-day horizon
(FORECAST_DAYS), hidden size 192 (BEST_PARAMS), 5 seeds (SEEDS), Tweedie power 1.2 (LGBM_PARAMS), the α grid 0.05 then
±0.10 by 0.01 and the 49-day holdout (tune_alpha_on_holdout, VALID_DAYS), the cap max(q99, 2 × mean) and the 3-day
median on days 2–6 (apply_outlier_postprocess). No α value is shown: none is in the material. The post-process bars
are a schematic (labelled so), not sales. The text is English (one image for both page languages); the page captions
carry the Korean.

Setup (Ubuntu): apt-get install libpango1.0-dev libcairo2-dev pkg-config, then
  python3 -m venv .venv-manim && .venv-manim/bin/pip install manim==0.19.0 fonttools brotli
  .venv-manim/bin/python scripts/assets/manim/resort_menu_pipeline.py
  node scripts/import-assets.mjs --only=resort-menu-pipeline
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import av
import manimpango
from fontTools.ttLib import TTFont
from PIL import Image
from manim import (
    BOLD,
    DOWN,
    LEFT,
    NORMAL,
    RIGHT,
    UP,
    Arrow,
    ArcBetweenPoints,
    Create,
    DashedLine,
    FadeIn,
    FadeOut,
    GrowArrow,
    GrowFromCenter,
    GrowFromEdge,
    LaggedStart,
    Line,
    Rectangle,
    RoundedRectangle,
    Scene,
    Square,
    Text,
    ValueTracker,
    VGroup,
    always_redraw,
    linear,
    tempconfig,
)

ROOT = Path(__file__).resolve().parents[3]
FONTS = ROOT / 'node_modules/@fontsource-variable/open-sans/files'
STILL = ROOT / 'scripts/assets/sources/resort-menu-pipeline.png'
VIDEO = ROOT / 'public/video/resort-menu-pipeline'  # + .webm, .mp4

BG = '#fcfcfb'
CARD = '#ffffff'
LINE = '#c9c8c2'
INK = '#0b0b0b'
INK2 = '#52514e'
MUTED = '#8a8984'
FAINT = '#ecebe7'
GRU = '#1d4f99'
GRU_T = '#e3ebf7'
LGBM = '#8a4500'
LGBM_T = '#f6eadc'
FONT = 'Open Sans'

HEAD = 16
BODY = 15
SMALL = 13
BIG = 60

# Layout (Manim units; the frame is 14.22 × 8): the input card, the two model lanes, the blend → post-process →
# output column, and the metric as a band across the bottom (it scores all three tuning steps; it is not a step).
L0, L1 = -6.86, -3.2
C0, C1 = -2.74, 2.31
R0, R1 = 2.76, 6.86
LANE_TOP = (0.74, 3.8)
LANE_BOT = (-2.56, 0.5)
INPUT_Y = (-1.0, 2.24)
BLEND_Y = (1.5, 3.8)
POST_Y = (-1.04, 1.24)
OUT_Y = (-2.56, -1.3)
METRIC_Y = (-3.8, -2.82)
PADX = 0.24
PADY = 0.22


def text(s: str, size: float = BODY, color: str = INK2, bold: bool = False, **kw) -> Text:
    return Text(s, font=FONT, font_size=size, color=color, weight=BOLD if bold else NORMAL, **kw)


def card(x0: float, y0: float, x1: float, y1: float, stroke: str = LINE, width: float = 1.6, dashed: bool = False):
    r = RoundedRectangle(corner_radius=0.14, width=x1 - x0, height=y1 - y0)
    r.set_fill(CARD, 1).set_stroke(stroke, width)
    r.move_to([(x0 + x1) / 2, (y0 + y1) / 2, 0])
    if dashed:
        from manim import DashedVMobject

        outline = DashedVMobject(r.copy().set_fill(opacity=0), num_dashes=90, dashed_ratio=0.55)
        return VGroup(r.set_stroke(width=0), outline)
    return r


def top_left(m, x: float, y: float):
    """Put m's top-left corner at (x, y)."""
    return m.move_to([x + m.width / 2, y - m.height / 2, 0])


def header(s: str, x0: float, y1: float, color: str = INK, inset: float = 0.0) -> Text:
    return top_left(text(s, HEAD, color, bold=True), x0 + PADX + inset, y1 - PADY)


def chip(s: str, color: str, fill: str, size: float = SMALL) -> VGroup:
    t = text(s, size, color)
    h = 0.34
    pill = RoundedRectangle(corner_radius=h / 2, width=t.width + 0.3, height=h).set_fill(fill, 1).set_stroke(width=0)
    return VGroup(pill, t.move_to(pill))


def slots(n: int, side: float, gap: float, color: str) -> VGroup:
    return VGroup(*[Square(side).set_fill(color, 0).set_stroke(color, 1.8) for _ in range(n)]).arrange(RIGHT, buff=gap)


def arrow(a, b, color: str = MUTED, width: float = 3.0) -> Arrow:
    return Arrow(a, b, buff=0.04, color=color, stroke_width=width, tip_length=0.13, max_tip_length_to_length_ratio=0.5, max_stroke_width_to_length_ratio=20)


def median3(values: list[float]) -> list[float]:
    """smooth_series_med_except_first of the submission code: days 2–6, the left neighbour already smoothed."""
    y = list(values)
    for i in range(1, len(values) - 1):
        left = y[i - 1] if i - 1 >= 1 else values[i - 1]
        y[i] = sorted([left, y[i], values[i + 1]])[1]
    return y


PACE = 0.8  # every run_time below is scaled by this (about 22 s of animation, then the hold)
HOLD_S = 2.0  # the finished infographic stays on screen this long at the end of the video


class Pipeline(Scene):
    def play(self, *animations, run_time: float | None = None, **kwargs):
        super().play(*animations, run_time=None if run_time is None else run_time * PACE, **kwargs)

    def construct(self):
        self.input_card()
        gru_mid, lgb_mid = self.lanes()
        self.blend(gru_mid, lgb_mid)
        self.post()
        self.output()
        self.metric()

    # ── input: 28 days as four weeks of one menu ────────────────────────────────────────────────────────────────────
    def input_card(self):
        y0, y1 = INPUT_Y
        c = card(L0, y0, L1, y1)
        h = header('INPUT', L0, y1)
        days = VGroup(*[Square(0.22).set_fill(INK2, 1).set_stroke(width=0) for _ in range(28)]).arrange_in_grid(4, 7, buff=0.07)
        top_left(days, L0 + PADX, y1 - 0.55)
        count = ValueTracker(0)
        x_big = L0 + PADX + days.width + 0.28
        big = always_redraw(lambda: top_left(text(f'{int(round(count.get_value()))}', BIG, INK, bold=True), x_big, y1 - 0.5))
        unit = top_left(text('days', BODY, INK2), x_big + 0.04, y1 - 0.5 - 0.72)
        under = top_left(text('daily sales of one menu', SMALL, INK2), L0 + PADX, y1 - 0.55 - days.height - 0.12)
        cal = chip('calendar · holidays', INK2, FAINT)
        lags = chip('7-day lags · EMA', INK2, FAINT)
        top_left(lags, L0 + PADX, y0 + 0.2 + 0.34)
        top_left(cal, L0 + PADX, y0 + 0.2 + 0.34 + 0.42)
        self.play(FadeIn(c), FadeIn(h), run_time=0.5)
        self.add(big)
        self.play(LaggedStart(*[GrowFromCenter(d) for d in days], lag_ratio=0.06), count.animate.set_value(28), run_time=2.0, rate_func=linear)
        big.clear_updaters()
        self.play(FadeIn(unit), FadeIn(under), run_time=0.4)
        self.play(FadeIn(cal, shift=UP * 0.08), FadeIn(lags, shift=UP * 0.08), run_time=0.5)
        self.in_box = c

    # ── the two models ──────────────────────────────────────────────────────────────────────────────────────────────
    def lane(self, ys: tuple[float, float], color: str, tint: str, title: str, name: str, sub: str):
        y0, y1 = ys
        c = card(C0, y0, C1, y1, stroke=color, width=2.4)
        bar = RoundedRectangle(corner_radius=0.04, width=0.08, height=y1 - y0 - 0.04).set_fill(color, 1).set_stroke(width=0)
        bar.move_to([C0 + 0.06, (y0 + y1) / 2, 0])
        h = header(title, C0, y1, color, inset=0.06)
        return c, bar, h

    def block(self, color: str, tint: str, name: str, sub: str, center_y: float) -> VGroup:
        b = RoundedRectangle(corner_radius=0.1, width=1.15, height=0.82).set_fill(tint, 1).set_stroke(color, 2)
        b.move_to([C0 + PADX + 0.06 + 0.575, center_y, 0])
        t1 = text(name, BODY, color, bold=True)
        t2 = text(sub, SMALL, color)
        VGroup(t1, t2).arrange(DOWN, buff=0.07).move_to(b)
        return VGroup(b, t1, t2)

    def lanes(self):
        mid_top = sum(LANE_TOP) / 2
        mid_bot = sum(LANE_BOT) / 2
        a1 = arrow([L1 + 0.04, 1.2, 0], [C0 - 0.04, mid_top, 0])
        a2 = arrow([L1 + 0.04, 0.04, 0], [C0 - 0.04, mid_bot, 0])
        self.play(GrowArrow(a1), GrowArrow(a2), run_time=0.6)

        # BiGRU: one day at a time, each forecast handed to the next step
        y0, y1 = LANE_TOP
        c, bar, h = self.lane(LANE_TOP, GRU, GRU_T, 'BiGRU · RECURSIVE', 'BiGRU', '192')
        blk = self.block(GRU, GRU_T, 'BiGRU', 'hidden 192', y1 - 1.15)
        row = slots(7, 0.28, 0.12, GRU)
        top_left(row, blk[0].get_right()[0] + 0.42, y1 - 1.15 + 0.14 + 0.0)
        row.shift(DOWN * 0.1)
        label = top_left(text('each day’s forecast feeds the next', SMALL, INK2), row.get_left()[0], y1 - 0.58)
        days = text('day 1 … 7', SMALL, INK2).next_to(row, DOWN, buff=0.1)
        chips = [chip('embedding · positional encoding · attention', GRU, GRU_T), chip('median of 5 seeds × checkpoints', GRU, GRU_T)]
        top_left(chips[1], C0 + PADX + 0.06, y0 + 0.2 + 0.34)
        top_left(chips[0], C0 + PADX + 0.06, y0 + 0.2 + 0.34 + 0.42)
        self.play(FadeIn(c), FadeIn(bar), FadeIn(h), FadeIn(blk), run_time=0.6)
        self.play(Create(row), FadeIn(label), run_time=0.5)
        self.play(GrowArrow(arrow(blk[0].get_right(), row[0].get_left(), GRU, 2.6)), run_time=0.3)
        for k in range(7):
            anims = [row[k].animate.set_fill(GRU, 1)]
            if k > 0:
                hop = ArcBetweenPoints(row[k - 1].get_top() + UP * 0.04, row[k].get_top() + UP * 0.04, angle=-2.4).set_stroke(GRU, 2.2)
                anims.append(Create(hop))
            self.play(*anims, run_time=0.36)
        self.play(FadeIn(days), run_time=0.3)
        ghosts = VGroup(*[slots(7, 0.28, 0.12, GRU).set_stroke(opacity=0.35) for _ in range(5)])
        for i, g in enumerate(ghosts):
            g.move_to(row).shift(DOWN * 0.09 * (i + 1) + RIGHT * 0.05 * (i + 1))
        self.play(LaggedStart(*[FadeIn(g) for g in ghosts], lag_ratio=0.15), run_time=0.6)
        self.play(*[g.animate.move_to(row).set_stroke(opacity=0) for g in ghosts], run_time=0.6)
        self.remove(*ghosts)
        self.play(*[FadeIn(ch, shift=UP * 0.08) for ch in chips], run_time=0.4)

        # LightGBM: every horizon h straight from day t, all at once
        y0, y1 = LANE_BOT
        c, bar, h = self.lane(LANE_BOT, LGBM, LGBM_T, 'LightGBM · DIRECT', 'LightGBM', 'day t')
        blk = self.block(LGBM, LGBM_T, 'LightGBM', 'from day t', y1 - 1.04)
        row = slots(7, 0.28, 0.12, LGBM)
        top_left(row, blk[0].get_right()[0] + 0.42, y1 - 1.11)
        start = blk[0].get_corner(RIGHT + UP) + LEFT * 0.14 + DOWN * 0.02
        fan = VGroup(*[ArcBetweenPoints(start, s.get_top() + UP * 0.03, angle=-1.0 + 0.06 * k).set_stroke(LGBM, 2.0) for k, s in enumerate(row)])
        label = text('h = 1 … 7 · one row per (t, h)', SMALL, INK2).next_to(row, DOWN, buff=0.12).align_to(row, LEFT)
        chips = [chip('zero-sales run · gap · ratio', LGBM, LGBM_T), chip('Tweedie loss, p = 1.2', LGBM, LGBM_T)]
        top_left(chips[1], C0 + PADX + 0.06, y0 + 0.2 + 0.34)
        top_left(chips[0], C0 + PADX + 0.06, y0 + 0.2 + 0.34 + 0.42)
        self.play(FadeIn(c), FadeIn(bar), FadeIn(h), FadeIn(blk), run_time=0.6)
        self.play(Create(row), run_time=0.5)
        self.play(*[Create(a) for a in fan], run_time=0.8)
        self.play(*[s.animate.set_fill(LGBM, 1) for s in row], FadeIn(label), run_time=0.45)
        self.play(*[FadeIn(ch, shift=UP * 0.08) for ch in chips], run_time=0.4)
        return mid_top, mid_bot

    # ── blend: α(h) per horizon h, searched on the holdout ───────────────────────────────────────────────────────
    def blend(self, gru_mid: float, lgb_mid: float):
        y0, y1 = BLEND_Y
        c = card(R0, y0, R1, y1)
        h = header('BLEND · PER HORIZON h', R0, y1)
        f1 = text('α(h) · BiGRU', BODY + 1, INK, t2c={'BiGRU': GRU})
        f2 = text('+ (1 − α(h)) · LightGBM', BODY + 1, INK, t2c={'LightGBM': LGBM})
        formula = top_left(VGroup(f1, f2).arrange(DOWN, buff=0.1, aligned_edge=LEFT), R0 + PADX, y1 - 0.58)
        x_a, x_b, y_ax = R0 + PADX + 0.42, R1 - PADX - 0.3, y0 + 0.86
        axis = Line([x_a, y_ax, 0], [x_b, y_ax, 0]).set_stroke(INK2, 2)
        ticks = VGroup(*[Line([x_a + (x_b - x_a) * i / 20, y_ax - 0.06, 0], [x_a + (x_b - x_a) * i / 20, y_ax + 0.06, 0]).set_stroke(INK2, 1.5) for i in range(21)])
        # α = 0 keeps LightGBM only, α = 1 BiGRU only
        e0 = text('0', SMALL, LGBM, bold=True).next_to(axis.get_start(), LEFT, buff=0.12)
        e1 = text('1', SMALL, GRU, bold=True).next_to(axis.get_end(), RIGHT, buff=0.12)
        n1 = top_left(text('grid 0.05, then ±0.10 by 0.01', SMALL, INK2), R0 + PADX, y_ax - 0.2)
        n2 = top_left(text('on a 49-day holdout', SMALL, INK2), R0 + PADX, y_ax - 0.46)
        a1 = arrow([C1 + 0.04, gru_mid, 0], [R0 - 0.04, gru_mid + 0.42, 0])
        a2 = arrow([C1 + 0.04, lgb_mid, 0], [R0 - 0.04, y0 + 0.4, 0])
        self.play(GrowArrow(a1), GrowArrow(a2), run_time=0.6)
        self.play(FadeIn(c), FadeIn(h), run_time=0.4)
        self.play(FadeIn(f1, shift=RIGHT * 0.08), FadeIn(f2, shift=RIGHT * 0.08), run_time=0.6)
        self.play(Create(axis), LaggedStart(*[GrowFromCenter(t) for t in ticks], lag_ratio=0.04), FadeIn(e0), FadeIn(e1), run_time=0.8)
        # the search, as a sweep; it stops nowhere in particular (no α value is in the material)
        mark = Line([x_a, y_ax - 0.15, 0], [x_a, y_ax + 0.15, 0]).set_stroke(INK, 3.4)
        self.play(FadeIn(mark), FadeIn(n1), run_time=0.3)
        self.play(mark.animate.move_to([x_b, y_ax, 0]), run_time=1.0, rate_func=linear)
        span = (x_b - x_a) * 0.2
        lo = x_a + (x_b - x_a) * 0.4
        fine = VGroup(*[Line([lo + span * i / 20, y_ax - 0.035, 0], [lo + span * i / 20, y_ax + 0.035, 0]).set_stroke(INK, 1.1) for i in range(21)])
        band = Rectangle(width=span, height=0.26).set_fill(INK, 0.07).set_stroke(width=0).move_to([lo + span / 2, y_ax, 0])
        self.play(FadeIn(band), mark.animate.move_to([lo, y_ax, 0]), run_time=0.4)
        self.play(LaggedStart(*[GrowFromCenter(t) for t in fine], lag_ratio=0.03), run_time=0.4)
        self.play(mark.animate.move_to([lo + span, y_ax, 0]), run_time=0.7, rate_func=linear)
        self.play(FadeOut(mark), FadeOut(band), FadeOut(fine), FadeIn(n2), run_time=0.5)

    # ── post-process (schematic bars): cap, 3-day median on days 2–6, whole units ─────────────────────────────────
    def post(self):
        y0, y1 = POST_Y
        c = card(R0, y0, R1, y1)
        h = header('POST-PROCESS', R0, y1)
        tag = text('schematic', SMALL, MUTED, slant='ITALIC').next_to(h, RIGHT, buff=0.18).align_to(h, DOWN)
        l1 = top_left(text('cap at max(q99, 2 × mean)', SMALL, INK), R0 + PADX, y1 - 0.56)
        l2 = top_left(text('3-day median, days 2–6 · rounded', SMALL, INK), R0 + PADX, y1 - 0.82)
        raw = [3.2, 4.1, 3.6, 7.4, 3.9, 4.4, 3.4]  # a made-up week with one spike; not data
        cap_v, unit_h = 5.0, 0.13
        bw, bg = 0.26, 0.1
        base_y = y0 + 0.3
        bx0 = R0 + PADX + 0.1

        def bars(vals: list[float]) -> VGroup:
            g = VGroup()
            for i, v in enumerate(vals):
                r = Rectangle(width=bw, height=max(v * unit_h, 0.001)).set_fill(INK2, 1).set_stroke(width=0)
                g.add(r.move_to([bx0 + bw / 2 + i * (bw + bg), base_y + v * unit_h / 2, 0]))
            return g

        right = bx0 + 7 * bw + 6 * bg
        b = bars(raw)
        baseline = Line([bx0 - 0.06, base_y, 0], [right + 0.06, base_y, 0]).set_stroke(LINE, 1.4)
        cap = DashedLine([bx0 - 0.1, base_y + cap_v * unit_h, 0], [right + 0.1, base_y + cap_v * unit_h, 0], dash_length=0.07).set_stroke(INK, 2)
        cap_lab = text('cap', SMALL, INK).next_to(cap, RIGHT, buff=0.1)
        self.play(GrowArrow(arrow([(R0 + R1) / 2, BLEND_Y[0] - 0.02, 0], [(R0 + R1) / 2, y1 + 0.02, 0])), run_time=0.35)
        self.play(FadeIn(c), FadeIn(h), FadeIn(tag), Create(baseline), run_time=0.4)
        self.play(LaggedStart(*[GrowFromEdge(r, DOWN) for r in b], lag_ratio=0.1), run_time=0.8)
        capped = [min(v, cap_v) for v in raw]
        self.play(Create(cap), FadeIn(cap_lab), FadeIn(l1), run_time=0.5)
        self.play(b.animate.become(bars(capped)), run_time=0.5)
        smoothed = median3(capped)
        win = RoundedRectangle(corner_radius=0.05, width=3 * bw + 2 * bg + 0.08, height=cap_v * unit_h + 0.18).set_stroke(INK, 1.6).set_fill(INK, 0.04)
        win.move_to([bx0 + bw / 2 + (bw + bg), base_y + (cap_v * unit_h + 0.18) / 2 - 0.04, 0])
        self.play(FadeIn(win), FadeIn(l2), run_time=0.3)
        vals = list(capped)
        for i in range(1, 6):
            vals[i] = smoothed[i]
            self.play(win.animate.move_to([bx0 + bw / 2 + i * (bw + bg), win.get_center()[1], 0]), b.animate.become(bars(vals)), run_time=0.32)
        self.play(FadeOut(win), b.animate.become(bars([round(v) for v in smoothed])), run_time=0.5)

    # ── output ──────────────────────────────────────────────────────────────────────────────────────────────────────
    def output(self):
        y0, y1 = OUT_Y
        c = card(R0, y0, R1, y1)
        h = header('OUTPUT · 7 DAYS PER MENU', R0, y1)
        row = VGroup(*[Square(0.26).set_fill(INK, 1).set_stroke(width=0) for _ in range(7)]).arrange(RIGHT, buff=0.1)
        top_left(row, R0 + PADX, y1 - 0.58)
        lab = text('+1 … +7', SMALL, INK2).next_to(row, RIGHT, buff=0.2)
        self.play(GrowArrow(arrow([(R0 + R1) / 2, POST_Y[0] - 0.02, 0], [(R0 + R1) / 2, y1 + 0.02, 0])), run_time=0.35)
        self.play(FadeIn(c), FadeIn(h), run_time=0.3)
        self.play(LaggedStart(*[GrowFromCenter(s) for s in row], lag_ratio=0.12), FadeIn(lab), run_time=0.8)

    # ── the metric all three tuning steps score against ──────────────────────────────────────────────────────────
    def metric(self):
        y0, y1 = METRIC_Y
        mid = (y0 + y1) / 2
        c = card(L0, y0, R1, y1, dashed=True)
        h = text('METRIC · sMAPE', HEAD, INK, bold=True)
        h.move_to([L0 + PADX + h.width / 2, mid, 0])
        num = text('2 | F − A |', BODY + 2, INK)
        den = text('| A | + | F |', BODY + 2, INK)
        w = max(num.width, den.width) + 0.16
        rule = Line([-w / 2, 0, 0], [w / 2, 0, 0]).set_stroke(INK, 2)
        frac = VGroup(num, rule, den).arrange(DOWN, buff=0.07)
        frac.move_to([h.get_right()[0] + 0.4 + frac.width / 2, mid, 0])
        n1 = text('F forecast, A actual · days with A > 0 only', SMALL, INK2)
        n2 = text('averaged with store weights', SMALL, INK2)
        notes = VGroup(n1, n2).arrange(DOWN, buff=0.08, aligned_edge=LEFT)
        notes.move_to([frac.get_right()[0] + 0.4 + notes.width / 2, mid, 0])
        used = VGroup(text('scores', SMALL, INK2), chip('BiGRU loss', GRU, GRU_T), chip('LightGBM early stop', LGBM, LGBM_T), chip('α(h) search', INK2, FAINT)).arrange(RIGHT, buff=0.1)
        used.move_to([R1 - PADX - used.width / 2, mid, 0])
        self.play(FadeIn(c), FadeIn(h), run_time=0.4)
        self.play(FadeIn(num, shift=DOWN * 0.08), Create(rule), FadeIn(den, shift=UP * 0.08), run_time=0.6)
        self.play(FadeIn(notes), run_time=0.4)
        self.play(LaggedStart(*[FadeIn(m, shift=UP * 0.08) for m in used], lag_ratio=0.2), run_time=0.7)


def register_fonts(tmp: Path) -> None:
    """Pango cannot read WOFF2: the site's Open Sans files (latin, and greek for α) become TTF for this run."""
    for sub in ('latin', 'greek'):
        f = TTFont(FONTS / f'open-sans-{sub}-wght-normal.woff2')
        f.flavor = None
        out = tmp / f'OpenSans-{sub}.ttf'
        f.save(out)
        if not manimpango.register_font(str(out)):
            raise RuntimeError(f'could not register {out}')


ENCODINGS = (
    # (extension, codec, codec options, container options)
    ('.webm', 'libvpx-vp9', {'crf': '40', 'b': '0', 'deadline': 'good', 'cpu-used': '1', 'row-mt': '1'}, {}),
    ('.mp4', 'libx264', {'crf': '28', 'preset': 'veryslow', 'tune': 'animation', 'profile': 'high'}, {'movflags': 'faststart'}),
)


def encode(frames: list[Path], base: Path, fps: int) -> None:
    """One pass per format from Manim's lossless PNG frames (its own movie files are already CRF 23: a second lossy pass
    only adds noise and bytes). Manim writes a still stretch as a single PNG, so the hold at the end is added here."""
    base.parent.mkdir(parents=True, exist_ok=True)
    for ext, codec, options, container in ENCODINGS:
        encode_one(frames, base.with_suffix(ext), fps, codec, options, container)


def encode_one(frames: list[Path], dst: Path, fps: int, codec: str, options: dict[str, str], container: dict[str, str]) -> None:
    with av.open(str(dst), 'w', options=container) as out:
        first = Image.open(frames[0])
        vout = out.add_stream(codec, rate=fps)
        vout.width, vout.height = first.size
        vout.pix_fmt = 'yuv420p'
        vout.options = options

        def push(img: Image.Image) -> None:
            for packet in vout.encode(av.VideoFrame.from_image(img)):
                out.mux(packet)

        for path in frames:
            push(Image.open(path).convert('RGB'))
        last = Image.open(frames[-1]).convert('RGB')
        for _ in range(round(HOLD_S * fps)):
            push(last)
        for packet in vout.encode():
            out.mux(packet)


def main() -> None:
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        register_fonts(tmp)
        common = {'media_dir': str(tmp / 'media'), 'background_color': BG, 'disable_caching': True, 'verbosity': 'WARNING', 'progress_bar': 'none'}
        with tempconfig({**common, 'pixel_width': 1600, 'pixel_height': 900, 'frame_rate': 30, 'format': 'png', 'output_file': 'frame'}):
            Pipeline().render()
        encode(sorted((tmp / 'media' / 'images').glob('frame*.png')), VIDEO, 30)
        with tempconfig({**common, 'pixel_width': 2400, 'pixel_height': 1350, 'save_last_frame': True, 'write_to_movie': False, 'output_file': 'pipeline-still'}):
            scene = Pipeline()
            scene.render()
            still = Path(scene.renderer.file_writer.image_file_path)
        STILL.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(still, STILL)
    for ext, *_ in ENCODINGS:
        f = VIDEO.with_suffix(ext)
        print(f'ok   {f.relative_to(ROOT)} ({f.stat().st_size // 1024} KB)')
    print(f'ok   {STILL.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
