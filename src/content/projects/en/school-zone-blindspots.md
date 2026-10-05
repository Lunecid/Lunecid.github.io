---
title: 'Predicting the Blind Spots'
summary: 'Predicted child-pedestrian accident risk across the Busan road network and located high-risk roads that are not designated school zones.'
period:
  start: '2025-05'
  end: '2025-07'
org: 'Busan Metropolitan City · 2025 Big Data Utilization Contest (DX CHALLENGE)'
type: 'Competition'
team: '4-person team'
role: 'Led the problem framing and analysis direction; built the public-data pipeline, QGIS spatial mapping and features; designed the XGBoost model and spatial cross-validation; made the risk heatmaps and the presentation.'
tools: ['Python', 'QGIS', 'XGBoost', 'scikit-learn', 'Google Colab']
tags: ['Geospatial', 'Machine learning', 'Public data']
award:
  name: 'Top Excellence Award (Mayor of Busan Award)'
  org: 'Busan Metropolitan City'
  date: '2025-07-11'
  certificate: 'busan-mayor-award'
cover:
  src: '../../../assets/projects/school-zone-blindspots/risk-heatmap.webp'
  alt: 'Heatmap of predicted child-pedestrian accident probability across Busan road points. Colour: predicted accident probability (teal low → red/black high); red dots: recorded accidents; pink lines: existing school zones.'
  label: 'RISK HEATMAP'
  # P-07 F-042: the alt's first sentence and the legend of the figure 2–4 captions, word for word (no new fact).
  caption:
    ko: '부산 전역 도로 지점의 어린이 보행자 사고 예측 확률 히트맵. 색: 예측 사고 확률(청록 낮음 → 빨강·검정 높음) · 빨간 점: 실제 사고 지점 · 분홍 선: 기존 어린이 보호구역.'
    en: 'Heatmap of predicted child-pedestrian accident probability across Busan road points. Colour: predicted accident probability (teal low → red/black high) · red dots: recorded accidents · pink lines: existing school zones.'
figures:
  - src: '../../../assets/projects/school-zone-blindspots/spatial-cv-blocks.webp'
    alt: 'Scatter plot of all analysis points in Busan, colored into 10 geographic blocks ordered by projected X (EPSG:5186, metres). Axes are metres, not latitude/longitude.'
    caption: 'The 10 geographic blocks used for spatial cross-validation. Points in the same block go only to training or only to validation. Axes are projected metres (EPSG:5186), not lat/long.'
    inlineAfter: 'Figure 1'
  - src: '../../../assets/projects/school-zone-blindspots/false-positive-areas.webp'
    alt: 'Busan-wide false-positive heatmap. Colour: predicted accident probability (teal low → red/black high). Red dots: recorded accidents. Pink lines: existing school zones. Areas with no recorded accident that the model rated high-risk appear red.'
    caption: 'Areas with no recorded accident that the model rated high-risk. Colour: predicted accident probability (teal low → red/black high) · red dots: recorded accidents · pink lines: existing school zones.'
    inlineAfter: 'Figure 2'
  - src: '../../../assets/projects/school-zone-blindspots/gupo-existing-zone.webp'
    alt: 'Heatmap around Gupo-dong. Colour: predicted accident probability (teal low → red/black high). Red dots: recorded accidents. Pink lines: existing school zones overlapping the high-risk area.'
    caption: 'Gupo-dong: the model also rates an existing school zone as high-risk. Colour: predicted accident probability (teal low → red/black high) · red dots: recorded accidents · pink lines: existing school zones.'
    inlineAfter: 'Figure 3'
  - src: '../../../assets/projects/school-zone-blindspots/yeonsan-unprotected.webp'
    alt: 'Heatmap around Yeonsan-dong. Colour: predicted accident probability (teal low → red/black high). Red dots: recorded accidents. Almost no pink school-zone lines.'
    caption: 'Yeonsan-dong: high risk but almost no school zone. Colour: predicted accident probability (teal low → red/black high) · red dots: recorded accidents · pink lines: existing school zones.'
    inlineAfter: 'Figure 4'
links:
  github: 'https://github.com/Lunecid/busan-school-zone-blindspots'
  report: 'https://github.com/Lunecid/busan-school-zone-blindspots/blob/main/docs/report.pdf'
  slides: 'https://github.com/Lunecid/busan-school-zone-blindspots/blob/main/docs/presentation.pdf'
audience:
  game: 'In a game, the same structure applies to churn prediction: players who look likely to leave but are still here can be read as a list to act on first, not as model error.'
  research: 'I built 32 features at two radii (300 m and 50 m) for about 240,000 points placed every 30 m along Busan''s roads, and evaluated XGBoost with spatial cross-validation over 10 geographic blocks. Points predicted as high-risk without a recorded accident were not discarded as errors but split by school-zone status, and those outside a school zone became policy blind-spot candidates.'
status: 'published'
facts:
  points: { ko: '240,064', en: '240,064' }
  positives: { ko: '61,848', en: '61,848' }
  sources: { ko: '16', en: '16' }
  features: { ko: '32', en: '32' }
  blocks: { ko: '10', en: '10' }
  recall: { ko: '0.87', en: '0.87' }
  precision: { ko: '0.62', en: '0.62' }
  f1: { ko: '0.72', en: '0.72' }
# DS-6: the general case study's key-figures band (every number a fact above; labels are fragments of this body).
keyFigures:
  - { value: '{fact.points}', unit: 'points', label: '{fact.positives} carried an accident label', bar: [positives, points] }
  - { value: '{fact.sources}', label: 'public datasets' }
  - { value: '{fact.features}', label: 'features' }
  - { value: '{fact.blocks}', label: 'geographic blocks' }
metrics:
  title: 'Spatial block cross-validation'
  label: 'The model found most of the areas where accidents actually happened: under spatial block cross-validation, recall on accident areas was 0.87, with precision 0.62 and F1 0.72.'
  rows:
    - { key: 'Recall', fact: recall }
    - { key: 'Precision', fact: precision }
    - { key: 'F1', fact: f1, highlight: true }
---

## Question

About 94% of child-pedestrian accidents in Korea happen outside designated school zones (Korea Road Traffic Authority, TAAS). Zones drawn around schools do not cover the routes children actually take to academies, playgrounds and convenience stores.

So the question had two steps: which roads in Busan do children actually get hurt on, and which of those are not school zones? Most earlier studies covered Seoul and its metropolitan area. Busan has steep hills and a mix of old and new road layouts, so the model had to take terrain and road structure as direct inputs.

## Data

- **Child facilities**: daycare centers, kindergartens and elementary schools, private academies (Childcare Information Portal, Busan Metropolitan Office of Education, Busan Big Data Wave)
- **Traffic environment**: crosswalks, traffic lights, bus stops, intersections, subway stations, road centerlines, sidewalks (Busan Big Data Wave, National Geographic Information Institute)
- **Area features**: floating population aged 0–14 (Busan Data Open Lab), zoning (V-World), contour lines and existing school zones (National Geographic Information Institute)
- **Accidents**: locations of child-pedestrian accidents from 2020 to 2024, copied point by point from the TAAS map. Accidents that did not touch a road, such as those inside apartment complexes or parking lots, were removed.

Sixteen public datasets in total. Placing a point every 30 m along road centerlines gave about 240,000 points across Busan. Raw data stay out of the public repository under each provider's terms.

## Method

1. **Why 30 m.** A study of pedestrian accidents in Seoul (L-function and KDE) found that accident clusters become distinct from about 30–35 m. I followed that and placed a point every 30 m.
2. **Features at two radii.** Within 300 m, the legal range of a school zone, I collected neighborhood variables such as child population, facilities and land use. Within 50 m, roughly the distance a driver needs to see and avoid a pedestrian, I collected traffic variables such as signals, crosswalks and intersections. A 5 m digital elevation model built from contour lines added the slope at each point. 32 features in total.
3. **Model.** The spatial variables are highly correlated, so I chose XGBoost, which handles multicollinearity and missing values and reports feature importance. The label is whether a child-pedestrian accident occurred within 300 m of the point; 61,848 of the 240,064 points carried an accident label, so `scale_pos_weight` weighted the minority class.
4. **Spatial cross-validation.** Nearby points resemble each other (spatial autocorrelation), so a random split inflates performance. I split Busan into 10 geographic blocks and kept each block entirely in training or in validation (`StratifiedGroupKFold`, Figure 1). Every probability on the map comes from a model that did not see that point (out-of-fold).
5. **Threshold.** A single missed child accident is costly, so the decision threshold was lowered from 0.5 to 0.45.

## Result

The model found most of the areas where accidents actually happened: under spatial block cross-validation, recall on accident areas was 0.87, with precision 0.62 and F1 0.72. Because I favored fewer misses, the number of points predicted as risky but without a recorded accident also grew (Figure 2). On the heatmaps, colour is predicted accident probability (teal low → red/black high), red dots are recorded accidents, and pink lines are existing school zones.

Instead of discarding these false positives, I split them in two.

- **High-risk and already a school zone** (Gupo-dong, Gamman-dong): the model's rating supports the existing designation (Figure 3).
- **High-risk and not a school zone** (Yeonsan-dong, U1-dong, Munhyeon-dong and others): candidates for policy blind spots that preventive measures do not reach (Figure 4).

The team surveyed five neighborhoods on foot (Jangjeon, Sajik, Gupo, Gamman and Yeonsan) to check road layouts and facility density. The analysis won the Top Excellence Award (Mayor of Busan Award) in the Big Data Analysis Division of the 2025 Big Data Utilization Contest.

## For product & planning teams

The model is useful less for its accuracy than for deciding where to look next. Places predicted as risky but without accidents yet become a field-survey priority list, and the highest-priority segments can be considered for temporary school-zone status, speed bumps, better crosswalks or pedestrian signals before an accident happens. Because risk moves as the city changes, we also proposed retraining on fresh data at regular intervals to keep the list current.

## My role

In a team of four, I:

- **Framing**: led the problem definition ("accidents outside school zones") and the analysis direction.
- **Data**: collected the public data, mapped it in QGIS, and built the 30 m points and two-radius features.
- **Modeling**: trained XGBoost and designed the spatial cross-validation.
- **Visualization and presentation**: made the accident-probability heatmaps and wrote the presentation.

## What I learned

- **A false positive is a hypothesis.** It may be a structural error of the model, so it has to be checked on site and by experts. That is why we did the field survey.
- **Correlation, not causation.** Facility density or road width should not be read as direct causes of accidents.
- **Prediction needs explanation.** Feature importance alone could not explain the risk at a given point. Next time I would use SHAP to break down per-point factors and model risk by time of day, such as school commutes and academy hours.
- **The validation scheme changes the conclusion.** Spatial data need block-wise splits, not random ones, to avoid inflated performance.
