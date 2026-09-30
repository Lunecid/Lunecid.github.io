---
title: 'KickKick Park'
summary: 'Five-person capstone: the team trained a parking-judgment model for return photos; I did the topic, preprocessing, district (gu) Tableau visuals and website.'
period:
  start: '2024-01'
  end: '2024-03'
org: 'Multicampus · K-Digital Training bootcamp, Data Analysis & Engineering (Python), cohort 31'
type: 'Bootcamp capstone'
team: '5-person team'
role: 'Handled topic selection and preprocessing, made Tableau visualizations of Seoul district (gu) data and built the website.' # owner 2026-09-30
tools: ['Python', 'Tableau', 'Django', 'MySQL']
teamTools: ['YOLOv8', 'PyTorch'] # D-9: the team's tools (the judgment model is not part of my role)
tags: ['Computer vision', 'Web app', 'Gamification', 'Visualization']
award:
  name: 'Top Excellence Award'
  org: 'Multicampus'
  date: '2024-03-12'
  certificate: 'multicampus-grand-award'
cover:
  src: '../../../assets/projects/kickick-park/parking-stand-detection.webp'
  alt: 'A return photo taken at night. The model boxes the parking zone as "parking" and two upright scooters as "stand".'
  label: 'PARKING DETECTION'
  # P-07 F-042: the alt's second sentence, word for word (no new fact).
  caption:
    ko: '모델이 주차구역을 parking으로, 서 있는 킥보드 두 대를 stand로 찾아 상자로 표시했습니다.'
    en: 'The model boxes the parking zone as "parking" and two upright scooters as "stand".'
figures:
  - src: '../../../assets/projects/kickick-park/dong-ranking.webp'
    alt: 'Horizontal bar chart of Gangnam-gu administrative dongs ranked by the dashboard total (합계). The horizontal axis is that total as exported from Tableau (M = million). Top five in red; rank 9 Yeoksam 2-dong in yellow.'
    caption: 'Gangnam-gu administrative dongs ranked by the dashboard total (합계). The horizontal axis is that total as exported from Tableau (M = million). Top five in red; rank 9 Yeoksam 2-dong in yellow (Tableau).'
    inlineAfter: 'Figures 1 and 2'
    # P-06 F-007 step 2: the ranking as the figure prints it (rank and dong); the figure prints no values, only bars.
    table:
      columns:
        - { ko: 순위, en: Rank }
        - { ko: 행정동(강남구), en: Administrative dong (Gangnam-gu) }
      rows:
        - ['1', 'Yeoksam 1-dong']
        - ['2', 'Daechi 4-dong']
        - ['3', 'Nonhyeon 1-dong']
        - ['4', 'Samseong 2-dong']
        - ['5', 'Nonhyeon 2-dong']
        - ['6', 'Cheongdam-dong']
        - ['7', 'Apgujeong-dong']
        - ['8', 'Sinsa-dong']
        - ['9', 'Yeoksam 2-dong']
        - ['10', 'Daechi 2-dong']
        - ['11', 'Gaepo 4-dong']
        - ['12', 'Irwon 1-dong']
        - ['13', 'Samseong 1-dong']
        - ['14', 'Daechi 1-dong']
        - ['15', 'Dogok 2-dong']
        - ['16', 'Dogok 1-dong']
        - ['17', 'Gaepo 2-dong']
        - ['18', 'Irwonbon-dong']
        - ['19', 'Gaepo 1-dong']
        - ['20', 'Segok-dong']
        - ['21', 'Suseo-dong']
        - ['22', 'Gaepo 3-dong']
  - src: '../../../assets/projects/kickick-park/selected-dongs.webp'
    alt: 'Choropleth map of Gangnam-gu with top-total districts in shades of red (darker = higher total), a yellow highlighted district, and the rest in gray'
    caption: 'Top-total districts on the map. Red shades show the total (darker = higher); the yellow district is the ranking highlight; gray districts are the rest (Tableau).'
    inlineAfter: 'Figures 1 and 2'
  - src: '../../../assets/projects/kickick-park/segmentation-v5.webp'
    alt: 'A scooter parking photo with the parking zone, the scooter and its wheel each shaded in a translucent color'
    caption: 'Model v5 segments the parking zone, scooter and wheel at the pixel level to tell whether the wheels are inside the zone.'
    inlineAfter: 'Figure 3'
links:
  github: 'https://github.com/Lunecid/MultiCamp_Final'
audience:
  game: 'Using points and rankings to encourage good behavior is the same structure as a game''s reward design.'
  research: 'After ranking Seoul districts for parking locations with public data, the team reframed the problem as judging parking from a single return photo. For the judgment model, the decisive change the team saw was the labeling unit (the scooter and the parking zone in one box), more than the model upgrade.'
status: 'published'
---

## Question

Shared personal-mobility services grew quickly in Korea, but public opinion of them is poor, mostly because of speed and scooters left anywhere. The goal was to bring order to parking without lowering usage.

The first question was where to add parking spaces. While designing a location model, the team decided that more spaces would not change the habit of leaving scooters anywhere, and changed the question: did the rider park properly, and how can we get riders to park properly?

## Data

- **Location analysis**: personal-mobility accidents and towing records, e-scooter parking zones, floating population, subway ridership, bus stops, commercial foot traffic and public-bike (Ttareungyi) rentals from Seoul Open Data Plaza, the national public data portal and TAAS. Scooter usage data are split across operators and were not available, so public-bike rentals served as a proxy: it is also a shared service, and earlier studies linked it to foot traffic.
- **Parking judgment**: the team started from public Roboflow datasets, then switched to photos we took and labeled ourselves in Labelme. After augmentation, 1,429 images were used for training.

## Method

1. **Location priority.** Districts of Seoul were ranked by towing counts, transit ridership, parking zones per core user (ages 10–39), number of universities and commercial density. Gangnam-gu came first, and the analysis then narrowed down its administrative districts (Figures 1 and 2).
2. **Parking judgment model.** After the pivot, the team judged parking from the photo riders take when returning a scooter. Over six rounds of label design we tried YOLOv5, YOLOv8 and Mask R-CNN; the final version finds the parking zone, the scooter and its wheels, then decides whether the scooter is inside the zone and upright (Figure 3).
3. **Scoring rule.** Points come from a parking-fit score (0–100) and whether the scooter is standing. The better the parking inside the zone, the higher the score (up to 20 points); at the same fit, standing earns 2 more points; outside the zone earns only the minimum.
4. **Web service.** A Django app with sign-up, photo upload on return, a cumulative-score ranking, a personal page with upload history, a current-location map and a chatbot. For the final presentation it ran on an Nginx and uWSGI web server with a separate MySQL database server.

## Result

The team trained the judgment model, built the photo-upload and ranking web service, and designed a scoring rule to link the two, implemented in a local prototype. The project won the Top Excellence Award in the Multicampus industry-problem project.

What the team saw as the decisive change was the labeling unit, more than the model upgrade. With the scooter and the parking zone in separate boxes, the model did not learn how the two relate; once they were labeled as one box, it began to separate inside from outside.

The web service in the public repository adds a fixed number of points per uploaded photo. The team's model training and the scoring rule above live in a separate local prototype (training/ in the repository).

## For product & planning teams

The reward principle was kept simple: better behavior earns more, and parking outside the zone earns only the minimum. We did not measure whether the rewards actually changed parking habits. If I did it again, I would first check the effect with an A/B test: randomly split riders into a points-on group and a points-off group over the same period and compare their parking quality.

## My role

In a team of five, I:

- **Topic and preprocessing**: handled the project's topic selection and the data preprocessing.
- **Exploratory visualization**: visualized in Tableau the data used to rank Seoul's districts (gu) in the location analysis.
- **Web development**: built the screens and features of the Django service.

## What I learned

- **Changing the question mattered more than fixing the model.** Had we stayed with location analysis, we would never have designed a service aimed at how riders park.
- **Label design decided performance.** The model and the amount of data also changed, but deciding what counts as one unit changed the results the most.
- **Design rewards together with a way to measure them.** We designed the reward structure but not the experiment that would show whether it worked.
