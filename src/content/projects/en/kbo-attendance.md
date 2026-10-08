---
title: 'KBO Team Performance and Attendance'
summary: 'A five-person course project that tested whether home attendance drops when a team slumps; I crawled and cleaned the KBO regular-season data.'
period:
  start: '2025-03'
  end: '2025-06'
org: 'Pusan National University Graduate School of Data Science'
type: 'Course project'
team: '5-person team' # owner 2026-10-08: the submitted slides and report list five members (group 4 was the group number)
role: 'Crawled KBO regular-season data from several sports statistics sites and cleaned it.'
tools: ['Python', 'Google Colab']
tags: ['Statistics', 'Data collection']
# owner 2026-10-08: card → page, from the team's submitted slides and report; Table 1 of the report is the source of
# every team number (see the Korean file). The originals are not linked.
cover:
  src: '../../../assets/projects/kbo-attendance/slump-attendance.webp'
  alt: 'Dot plot joining each team''s average attendance at slump home games and at other home games. KIA, Lotte and Hanwha drew significantly fewer fans in a slump, Kiwoom and SSG significantly more, and Doosan, KT, Samsung, LG and NC showed no significant difference.'
  label: 'SLUMP VS OTHER GAMES'
  fit: contain
figures:
  - src: '../../../assets/projects/kbo-attendance/slump-attendance.webp'
    alt: 'Dot plot joining each team''s average attendance at slump home games and at other home games. KIA, Lotte and Hanwha drew significantly fewer fans in a slump, Kiwoom and SSG significantly more, and Doosan, KT, Samsung, LG and NC showed no significant difference.'
    caption: 'Average attendance at slump home games (dark dot) and other home games (light dot) per team, 2018–2019 and 2022–2024 seasons combined. On the right, the Welch t-test p-value; an asterisk marks p < 0.05.'
    inlineAfter: 'Figure 1'
    table:
      columns:
        - { ko: 구단, en: Team }
        - { ko: 슬럼프 평균 관중, en: Slump mean attendance }
        - { ko: 그 외 평균 관중, en: Other mean attendance }
        - { ko: p-값, en: p-value }
      rows:
        - ['KIA', '10,862.3', '13,056.3', '0.0016']
        - ['Lotte', '11,195.6', '12,790.4', '0.0073']
        - ['Hanwha', '9,421.4', '10,959.3', '0.0039']
        - ['Doosan', '11,438.6', '12,827.2', '0.2200']
        - ['KT', '8,234.9', '9,342.8', '0.0834']
        - ['Samsung', '10,954.7', '12,001.2', '0.1327']
        - ['LG', '12,778.8', '13,780.6', '0.2957']
        - ['NC', '8,755.3', '8,965.6', '0.7191']
        - ['Kiwoom', '9,574.7', '8,023.5', '0.0298']
        - ['SSG', '15,123.2', '12,362.6', '0.0213']
links: {}
audience:
  game: 'This is the same structure as separating the players who leave during a losing streak from the ones who stay. Teams reacted differently, so churn responses should be designed per segment, not for the league average.'
  research: 'The team defined a slump home game as one played with a win rate of .400 or lower over the last 10 games and a losing streak of three or more, split the home attendance of the 2018–2019 and 2022–2024 seasons into slump and other games, and compared them with Welch''s t-test, the Mann–Whitney U test, a chi-squared test of independence and one-way ANOVA.'
status: 'published'
---

## Question

Baseball attendance is said to follow team performance. Yet in 2009 the Lotte Giants drew 1.38 million fans in a season they did not win. Something besides results keeps fans coming: fan loyalty.

The question was this: when a team slumps, does home attendance actually fall, and does that differ from team to team?

## Data

We gathered game-by-game records of the KBO regular season: the date, the opponent, home or away, the team's standing and recent record at that point, and the attendance on the day. The sources are the KBO's official records and the teams' own announcements.

- **Period**: the five seasons 2018, 2019, 2022, 2023 and 2024, leaving out 2020–2021, when COVID-19 meant empty or capped stands.
- **Exclusions**: games with no recorded attendance, such as rain-outs, were left out.
- **Team names**: renamed teams were treated as one (Nexen → Kiwoom, SK → SSG).

## Method

The team ran the analysis below.

1. **Slump definition.** A game counted as a slump game when, going into it, the team's win rate over the last 10 games was .400 or lower and it was on a losing streak of three or more; every other game was an "other" game.
2. **Comparing means.** Average attendance at slump home games and other home games was compared with Welch's t-test (a t-test that does not assume equal variances), for the whole league, by season and by team, at a significance level of 0.05.
3. **The same question, other tests.** The Mann–Whitney U test (rank-based, with no normality assumption), a chi-squared test of independence on high and low attendance, and one-way ANOVA on the differences between teams in slump games.

## Result

Across the league, slump home games drew fewer fans than other home games. Welch's t-test gave t = −4.8485, p < 0.0001, and median attendance was 9,279 at slump games against 10,229.5 at other games (Mann–Whitney U test, p < 0.0001). The chi-squared test of independence between slump and high or low attendance pointed the same way, χ² = 6.915, p = 0.0085. Seasons differed, though: the gap was significant in 2018 but not in 2019 (Welch's t-test p ≈ 0.88).

By team, the reactions split three ways (Figure 1).

<!-- row-headers -->
| Reaction | Teams |
|---|---|
| Significantly fewer fans in a slump | KIA, Lotte, Hanwha |
| Significantly more fans in a slump | Kiwoom, SSG |
| No significant difference | Doosan, KT, Samsung, LG, NC |

KIA fell the most, with an average of 10,862.3 at slump home games against 13,056.3 at other home games (p = 0.0016). SSG went the other way: 15,123.2 at slump home games, more than the 12,362.6 at other games (p = 0.0213). The team read the Kiwoom and SSG results as slumps that fell on weekend or event games, or as fans rallying in a crisis, but the comparison left out other factors such as the day of the week and the opponent, so this was not confirmed.

Poor results do cost fans, but by a different amount for each team, so the team concluded that fan loyalty should be read team by team, not as a league average.

## My role

In a team of five, I handled:

- **Data collection**: crawled KBO regular-season game records and attendance from several sports statistics sites.
- **Cleaning**: turned the crawled records into tables ready for analysis.

The slump definition, the statistical tests and their interpretation, the slides and the report were the team's work.

## What I learned

- **"Not significant" is not evidence of "no difference".** The team read the teams with p-values above 0.05 as teams with loyal fans, but failing to reject the null hypothesis only means this sample could not show a difference (Altman & Bland, 1995, "Absence of evidence is not evidence of absence"). The fewer slump games a team had, the bigger this trap.
- **Testing ten teams at once lets chance results in.** Ten tests at a significance level of 0.05 turn up 0.5 significant results on average even when there is no real difference at all. With a Bonferroni correction (0.05 ÷ 10 = 0.005), only KIA (p = 0.0016) and Hanwha (p = 0.0039) remain significant.
- **A comparison of two group means cannot separate causes.** When slumps coincide with the day of the week, the opponent or a ballpark event, there is no telling where the change in attendance came from. That question needs a regression model with those variables in it.
