---
title: 'Restaurant Locations for Young Founders in Busan'
summary: 'A four-person team grouped Busan districts into four types and predicted restaurant sales and store survival; I did the data exploration and data engineering.'
period:
  start: '2025-05' # earliest file: the plan of 2025-05-22 (drive survey 2.7); owner-confirmed 2026-09-28
  end: '2025-11'
org: 'Pusan National University Graduate School of Data Science · DatoryLab'
type: 'Datory Lab task' # owner 2026-09-30
team: '4-person team'
role: 'Explored the floating-population, consumer-spending and restaurant data and did the data engineering.'
tools: ['Python']
teamTools: ['scikit-learn', 'LightGBM', 'XGBoost', 'QGIS', 'Streamlit'] # D-9: the team's tools; my part was data exploration and data engineering (owner, 2026-09-28)
tags: ['Machine learning', 'Public data', 'Visualization']
cover:
  src: '../../../assets/projects/youth-startup-location/cluster-zscore-heatmap.webp'
  alt: 'Heatmap of key-feature z-scores by cluster. Cluster 0 is near average; cluster 1 is high on late-night foot traffic; cluster 2 on middle-aged share and competition; cluster 3 on the floating-to-resident ratio.'
  label: 'CLUSTER PROFILES'
  fit: contain # P1-6: the heatmap (the old PCA scatter had a Plotly tooltip baked in), whole, never cut mid-line
figures:
  - src: '../../../assets/projects/youth-startup-location/cluster-zscore-heatmap.webp'
    alt: 'Heatmap of key-feature z-scores by cluster. Cluster 0 is near average; cluster 1 is high on late-night foot traffic; cluster 2 on middle-aged share and competition; cluster 3 on the floating-to-resident ratio.'
    caption: 'Z-scores of key features by cluster; redder means above average. Cluster 0=Residential, 1=Nightlife, 2=Middle-aged, 3=Residential and transit hub.'
    inlineAfter: 'Figure 1'
    # P-06 F-007 step 2: the z-scores printed in the heatmap, feature names as printed.
    table:
      columns:
        - { ko: 변수, en: Feature }
        - { ko: 군집 0, en: Cluster 0 }
        - { ko: 군집 1, en: Cluster 1 }
        - { ko: 군집 2, en: Cluster 2 }
        - { ko: 군집 3, en: Cluster 3 }
      rows:
        - ['youth_floating_ratio', '-0.13', '1.22', '1.82', '-0.75']
        - ['middle_aged_floating_ratio', '-0.09', '0.43', '2.32', '-0.74']
        - ['floating_pop_17_20', '-0.09', '2.29', '0.37', '-0.70']
        - ['floating_resident_ratio', '-0.25', '-0.68', '-1.33', '1.16']
        - ['floating_pop_11_14', '-0.09', '1.97', '0.62', '-0.69']
        - ['floating_pop_22_01', '-0.08', '2.39', '-0.09', '-0.62']
        - ['competition_intensity', '-0.03', '0.74', '1.42', '-0.66']
links:
  github: 'https://github.com/Lunecid/busan-youth-startup-location'
  report: 'https://github.com/Lunecid/busan-youth-startup-location/blob/main/docs/report.pdf'
audience:
  game: 'In a game, this is the same structure as a segment strategy that offers different content and products to each player cluster instead of designing for the average player.'
  research: 'The team clustered about 200 Busan administrative districts into four commercial-area types with K-Means on standardized spending, population and competition features (elbow method and silhouette score for the number of clusters), and predicted restaurant sales with LightGBM on a log-transformed target. Potential Gap, predicted minus actual sales, points to districts that earn less than their conditions suggest. Finally, an XGBoost classifier trained on about 50,000 actual stores predicted three-year survival (ROC-AUC 0.832), shown on a map of 100 m hexagons.'
status: 'published'
---

## Question

Two restaurants with the same menu and skills can do very differently depending on the district they open in, yet locations are still chosen by instinct or scattered information. Busan is also losing young residents, so helping young founders succeed matters to the city as well.

The question: if a young founder opens a restaurant in Busan, which administrative districts still have room relative to their conditions?

## Data

Three kinds of data from Busan Big Data Wave and the national public data portal were aggregated for every administrative district in Busan (about 200).

- **Floating population**: daily averages per month by sex, time of day and age group
- **Consumer spending**: daily averages per month by sex, time of day, business type and age group
- **Restaurants**: number of restaurants per district and counts by type (Korean, Chinese, Japanese, cafés and others)

The target was each district's average monthly sales in food and nightlife businesses. The repository holds only district-level tables processed from Busan City open data.

## Method

The team ran the analysis below.

1. **Derived features.** Competition intensity (restaurants per person of floating population), floating-to-resident ratio (commercial vs. residential areas), youth and middle-aged shares of floating population, and floating population at lunch (11:00–14:00), dinner (17:00–20:00) and late night (22:00–01:00).
2. **Commercial-area types.** After standardizing the features, K-Means grouped districts with similar spending, population and competition. The elbow method and silhouette score gave four clusters.
3. **Sales prediction.** XGBoost and LightGBM were compared, with a log transform for the skewed sales distribution.
4. **Potential Gap.** Predicted sales minus actual sales. The larger the value, the less a district earns compared with what its conditions suggest.

## Result

Busan's restaurant districts fell into four distinct types (Figure 1).

<!-- row-headers -->
| Type | Cluster | Profile | Suggested businesses |
|---|---|---|---|
| Residential | 0 | All indicators below average, weak competition | Delivery-only kitchens, family restaurants |
| Nightlife | 1 | High foot traffic from 10 p.m. to 1 a.m., many young visitors | Bars, late-night food, fast food |
| Middle-aged | 2 | Highest middle-aged share, strong competition | Health food and traditional cuisine, with clear differentiation |
| Residential and transit hub | 3 | Only the floating-to-resident ratio is high | Commuter brunch cafés, pickup and grab-and-go |

For sales, LightGBM with a log-transformed target fit best. The districts with the largest Potential Gap were Hadan 2-dong (Saha-gu), Bujeon 1-dong (Busanjin-gu) and Gupo 1-dong (Buk-gu).

High foot traffic alone was not the answer. Matching the business idea and target customers to the right commercial-area type mattered most for a stable start. The team presented these results at the graduate school's summer workshop in August 2025.

## Final deliverable: a three-year survival map

To close the task, the team brought the analysis together in dashboards at two scales (the DatoryLab final poster). At the district scale, a commercial-area dashboard lets users pick and compare the population and spending data of Busan's 205 administrative dongs; at the scale of 100 m hexagons, a model predicts whether a store survives three years or more.

- **Three-year survival**: an XGBoost classifier trained on data from about 50,000 actual stores predicts whether a store stays open for three years or more. Its ROC-AUC was 0.832: the probability that, for one surviving and one closed store picked at random, the model gives the surviving store the higher probability (Hanley & McNeil, 1982). The predicted probability became a "survival index" feature linked to the dashboard.
- **Hexagon grid**: in QGIS, Busan was divided into 90,000 hexagons of 100 m, with 18 features computed for each; the competition features were computed separately for each business type.
- **Data**: monthly averages for 2019–2024 from the national public data portal, the Busan Big Data Innovation Center and V-World: residential, working and visiting population and the number and amount of transactions by sex, time of day and age group; location (official land price, slope, building coverage and floor area ratios, large stores, established commercial areas); the commercial environment (stores of the same type, past closures); transport (distance to roads and bus stops, parking spaces, public parking within 300 m); and demand (nearby housing prices per unit area, large apartment complexes, schools, office clusters).

The dashboard maps the survival probability by hexagon and business type and shows each hexagon's location features and survival index.

## For product & planning teams

Potential Gap turns the difference between prediction and reality into an opportunity signal. It surfaces districts that have the conditions but have not yet earned accordingly, so founders and support agencies can use it directly to narrow down candidates. For each of the four types in the table above, suitable businesses were also suggested: delivery kitchens in residential areas, bars and late-night food in nightlife areas, differentiated health food and traditional cuisine in middle-aged areas, and commuter pickup and grab-and-go in residential and transit hubs. The team also built a Streamlit dashboard prototype that takes a business type and budget and maps expected sales and recommended districts.

## My role

In a team of four, I:

- **Data exploration**: explored the floating-population, consumer-spending and restaurant data.
- **Data engineering**: did the data engineering that prepared the data for the analysis.

The derived features, clustering, sales-prediction models, Streamlit dashboard and report were the team's work.

## What I learned

- **Check representativeness first.** The sales data may not fully represent all businesses, and external shocks such as COVID-19 were not controlled.
- **A snapshot misses change.** To follow urban development and shifting commercial areas, the model has to grow into a monthly or quarterly time-series model.
- **People matter as much as places.** Adding founder experience, capital and training would turn this into a multilevel "founder × location" model, and interviews with successful founders are needed to check the story behind the numbers.

## Follow-up: BUSAN DATA WEEK 2025 entry

I also took part in team "Busanhan Busan", which entered the topic in the BUSAN DATA WEEK 2025 data-use competition as "A clustering-based recommender for start-up locations in Busan". It is a separate analysis from the DatoryLab track: six variables built from 13 public datasets (the floating-to-resident population ratio, the share of young floating population, floating population at 17:00–20:00, Naver DataLab local search interest, the distance to the nearest subway station, and store density) group Busan's 205 administrative dongs into four commercial-area types with k-means (108, 10, 10 and 77 dongs). The number of clusters was chosen with the elbow method and silhouette scores.
