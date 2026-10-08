---
title: 'Menu Demand Forecasting for Resort Restaurants'
summary: 'A three-person team forecast seven days of resort menu demand in the LG Aimers hackathon, placing 32nd of 817 teams; I built the whole forecasting pipeline.'
period:
  start: '2025-08'
  end: '2025-08'
org: 'LG Aimers (7th cohort) · DACON'
type: 'Hackathon'
team: '3-person team' # owner 2026-10-08: the team's preliminary-round code-report deck lists three members
role: 'Designed and built the whole forecasting pipeline: preprocessing and features, the BiGRU and LightGBM models, the ensemble and the post-processing.'
tools: ['Python', 'PyTorch', 'LightGBM', 'scikit-learn']
tags: ['Machine learning']
# owner 2026-10-08: from the team's deck and the submission code (see the Korean file); the code wins where they differ.
cover:
  src: '../../../assets/projects/resort-menu-demand/ensemble-pipeline.webp'
  alt: 'Infographic of the forecasting pipeline. On the left, the input (28 days of one menu''s sales, calendar and holidays, 7-day lags and an exponential moving average) splits into a BiGRU above (recursive: one day at a time, each forecast fed to the next day) and a LightGBM below (direct: each horizon h predicted at once); on the right the two are blended with a weight α(h) per horizon, then capped, smoothed with a 3-day median and rounded into a 7-day forecast per menu. A band at the bottom shows sMAPE, the metric all three tuning steps used.'
  label: 'ENSEMBLE PIPELINE'
  fit: contain
figures:
  - src: '../../../assets/projects/resort-menu-demand/ensemble-pipeline.webp'
    alt: 'Infographic of the forecasting pipeline. On the left, the input (28 days of one menu''s sales, calendar and holidays, 7-day lags and an exponential moving average) splits into a BiGRU above (recursive: one day at a time, each forecast fed to the next day) and a LightGBM below (direct: each horizon h predicted at once); on the right the two are blended with a weight α(h) per horizon, then capped, smoothed with a 3-day median and rounded into a 7-day forecast per menu. A band at the bottom shows sMAPE, the metric all three tuning steps used.'
    caption: 'The forecasting pipeline of the submission code. The BiGRU predicts one day at a time and feeds each forecast into the next day''s input; LightGBM predicts each horizon h directly. The two are blended with a weight α(h) chosen per horizon on a holdout, then capped, median-smoothed and rounded. The post-processing bars are a schematic.'
    inlineAfter: 'Figure 1'
    video: '/video/resort-menu-pipeline'
links: {}
audience:
  game: 'In a game, this is the same structure as forecasting next week''s demand for each shop item from its daily sales to prepare limited items and event stock.'
  research: 'Forecasting the next seven days from 28 days of a menu''s sales, I built a recursive BiGRU that feeds each forecast back as the next day''s input and a direct LightGBM that takes the horizon h as an input, and blended the two with a weight α(h) chosen per horizon on a holdout.'
status: 'published'
---

## Question

A restaurant needs to know each menu item's demand ahead of time to prepare ingredients and staff. The LG Aimers 7th-cohort online hackathon asked for forecasts of menu sales at the food and beverage outlets of a resort.

The question: given a menu item's sales over the last 28 days, how many will sell on each of the next seven days?

## Data

The competition provided daily sales quantities per outlet and menu item at the resort. Each menu name carries its outlet's name in front, so the outlet is known too.

- **Training data**: daily sales quantities per outlet and menu item. Negative sales were set to 0.
- **Test data**: each test file holds 28 consecutive days of sales per menu item, and the next seven days are forecast and submitted. As the rules required, each forecast used only the 28 days of its own file.
- **Metric**: sMAPE (symmetric mean absolute percentage error, the mean of the daily error 2|F − A| / (|A| + |F|) for a forecast F and an actual A; Makridakis, 1993), computed per outlet and averaged with outlet weights. Days with no actual sales are left out. When I wrote the metric into code, I gave the two key outlets (Damha and Mirasia) a weight of 2 and the rest 1.

## Method

I designed and built the forecasting pipeline below (Figure 1).

1. **Features.** From the date: year, month, day, day of the week, and whether it is a weekend or a public holiday (Korean holidays from the Python `holidays` package), with day of week and month also one-hot encoded. From sales: the mean of the previous 7 days, the value 7 days earlier, the standard deviation of the previous 7 days, and an exponential moving average (α = 0.30). These 30 features were scaled to 0–1.
2. **BiGRU: recursive.** The 28-day sequence, with a menu embedding (16 dimensions) and a sinusoidal positional encoding (16 dimensions; Vaswani et al., 2017), went into a bidirectional GRU (Cho et al., 2014) with a hidden size of 192, and additive attention (Bahdanau et al., 2015) summarised the 28 days in one context vector. The forecast is made one day at a time, seven times; each day's forecast is used to recompute the sales features of the next day's input. The output is a baseline plus a correction: the baseline g·(7-day mean) + (1 − g)·(previous day), with a mix g learned per menu item, plus a correction from the network, a menu bias and a menu × day-of-week bias, passed through softplus to keep it non-negative.
3. **Training the BiGRU.** The loss is the outlet-weighted sMAPE of the metric, with extra weights of 1.2, 1.1 and 1.05 on the first three days. AdamW, a cosine learning rate with warm restarts, mixed precision and gradient clipping. During training, the probability of feeding the actual value instead of the model's own forecast into the next day's input rose from 20% to 50% over the epochs. Five seeds were trained separately; for each seed the median forecast of the last epochs' checkpoints and the best validation checkpoint was taken, then the median across seeds.
4. **LightGBM: direct.** LightGBM (Ke et al., 2017) predicts the sales on day t + h straight from the features at day t: one row per (t, h), with the horizon h (1–7) as a feature. It adds the length of the current zero-sales run (zero_run), the days since the last sale (last_nz_gap) and the share of zero-sales days in the last 28 (zero_ratio). The loss is a Tweedie loss with power p = 1.2. A Tweedie distribution is an exponential dispersion model whose variance is proportional to the mean to the power p; for 1 < p < 2 it is a compound Poisson–gamma distribution with a point mass at zero (Jørgensen, 1987). The training weights multiply the outlet weight and a horizon weight, and rows with zero sales get a weight of 0, as in the metric.
5. **Ensemble.** The last 49 days of the training period were held out, and the forecasts for its first seven days chose a blend weight α(h) for each horizon h. The final forecast is α(h)·BiGRU + (1 − α(h))·LightGBM. The search went over 0–1 in steps of 0.05, then over ±0.10 around the best value in steps of 0.01, scored by the outlet-weighted sMAPE. The weights chosen for each seed were averaged with weights inversely proportional to their holdout error.
6. **Post-processing.** Forecasts above a cap, the larger of the 99th percentile and twice the mean of the menu item's recent sales, were cut to the cap. Days 2–6 of the seven-day forecast were smoothed with a 3-day running median (the left neighbour already smoothed), and the submitted values were rounded to whole units.

## Result

The team placed 32nd of the 817 teams in the online hackathon (top 4%; the DACON profile record). The submitted forecast is the output of the pipeline in Figure 1.

The leaderboard and holdout scores are not in the remaining material, so they are not given.

## My role

In a team of three, I built the whole forecasting pipeline:

- **Feature engineering**: the calendar and holiday features, the lag and rolling statistics and the moving average of sales, and the zero-sales features for LightGBM.
- **Models**: designed and trained the BiGRU (positional encoding, attention, an output made of a baseline and a correction) and the direct LightGBM.
- **Ensemble and post-processing**: the seed and checkpoint ensembles, the per-horizon blend search, the cap and the median smoothing.
- **Evaluation**: wrote the competition metric into code and used it as the BiGRU loss, LightGBM's early-stopping score and the criterion of the α(h) search.

## What I learned

- **The description and the code need checking separately.** The deck says that the share of the model's own forecasts fed into the next day's input rises from 20% to 50% during training: the direction of scheduled sampling (Bengio et al., 2015), which starts from the actual values and moves toward the model's own forecasts so that training comes to resemble inference. In the code, though, the probability is that of feeding the actual value, so the share of the model's own forecasts actually fell from 80% to 50%. The checkpoints, too, were the last epochs, not the deck's "top five by validation". Both still produced scores, so neither showed, and I did not run the comparison with code fixed to match the intent.
- **Recursive and direct multi-step forecasts go wrong in different ways.** A recursive model feeds its earlier forecasts back in, so its errors accumulate over the horizon; a direct model predicts each horizon separately, so its errors do not accumulate, but it cannot use the relation between the days (Ben Taieb et al., 2012). Choosing α(h) for each horizon let the data settle that trade-off.
- **What the competition metric rewards is not what operations need.** sMAPE penalises a forecast below the actual more than one above it by the same amount (Goodwin & Lawton, 1999), and this metric leaves out days without sales. The training followed the metric and left those days out too, so the models in effect learned how many sell when any sell. Forecasts tuned this way tend to run high, and in a restaurant that means ingredients left over. An actual order quantity should be the demand quantile set by the ratio of the costs of having too much and too little: the answer to the newsvendor problem (Arrow, Harris & Marschak, 1951).
