---
title: Privacy Policy
lang: en
updated: '2026-10-04'
---

This site (https://lunecid.github.io) is a static website that Seongeun Baek runs as a personal portfolio. It has no sign-up, login, or comments, and there is nowhere for visitors to enter a name or contact details. The Player Log has an account-link management screen that only the site owner uses. When the owner signs in with GitHub and Steam and saves game account IDs, those values and the sign-in information go from the owner's browser through a Cloudflare Worker (relay server) to GitHub and Steam only. Visitors' browsers never connect to this relay server.

## Visitor statistics

The site uses [GoatCounter](https://www.goatcounter.com) to count visits. GoatCounter does not use cookies, localStorage, or any other browser storage.

GoatCounter stores the following. Each item is kept only as totals per day or per hour, and the items cannot be linked to one another.

- The page visited and the referrer (the previous page's address)
- Browser and operating system name and version
- Screen width
- Country, estimated from the IP address (region for the US, Russia and China)

GoatCounter does not store IP addresses, the full User-Agent string, or any ID that identifies a visitor. To count a reload by the same person as one visit, it keeps a site + IP + User-Agent combination in server memory for up to eight hours, but it never writes this to its database. This site does not turn on the optional collection of individual pageviews.

The aggregated statistics are public on the [Visitor stats](/stats/) page. GoatCounter data is stored on Hetzner servers in Finland and Germany. See the [GoatCounter privacy policy](https://www.goatcounter.com/privacy) for details.

## Hosting

This site is served by GitHub Pages. GitHub logs and stores the IP address of visitors to GitHub Pages sites for security purposes. See the [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) for details.

## Settings stored in your browser

The following settings are stored only in your browser (localStorage and sessionStorage) and are never sent to a server. Clearing your browser's site data removes them.

- Sound on/off and reduced motion
- Site achievements you have unlocked
- Which of the four menu sections and which languages you have opened (for achievements)
- Whether you have already seen the start-screen effect (CRT intro) and the home text entrance in this visit
- The background-music position so it continues on the next page (sessionStorage; cleared when the tab closes, ignored after 30 minutes)
- The portfolio version you last chose (game or general)

## Game account data

The account cards on the Player Log show only the site owner's own game accounts. The site does not collect visitors' account data.

- Sources: Genshin Impact and Zenless Zone Zero data comes from Enka.Network, and Steam data from the Steam Web API. For League of Legends and TFT the site only links to op.gg and lolchess.gg and fetches no data. When you follow those links, that site's privacy policy applies.
- What is stored: only the public profile information shown on the cards. For Steam: the SteamID used for the profile link, the nickname, avatar and level, and only when the owner turns it on, the number of owned games, playtime and the top games left after the owner's filter. Real name, country, account creation date and groups are never stored.
- Where: the data is created in GitHub Actions when the site is built and served by GitHub Pages (GitHub, Inc., United States). It is not committed to the repository.
- Retention: the account-data artifact is kept for 1 day, the build screenshot artifact for up to 14 days, the failed-test report for 7 days, and the build image cache until the cache evicts it. The owner's game account IDs and nicknames appear in the public build run logs and stay there for the repository's log retention period.
- Refresh: daily at 03:30 KST and whenever the owner rebuilds the site. A card that has not been refreshed for 7 days is hidden.
- Your browser never contacts the game services. The card images are served from this site.
- Steam data is provided "as is" under the Steam Web API terms, without any guarantee of accuracy.

Dungeon & Fighter is not linked.

The site never collects visitors' game account information.

## External services and links

- Fonts, music, images, and the visitor-count script are all served from this site. Visit data is sent only to GoatCounter's servers.
- The numbers on the Visitor stats page are aggregates fetched from the GoatCounter API (read-only key) when the site is built. Only the running total is loaded by your browser directly from GoatCounter's public counter.
- The list of GitHub repositories and the contribution graph are fetched from the GitHub API when the site is built. Visitors' browsers do not call the GitHub API or the relay server.
- When you follow an external link, such as GitHub or IEEE Xplore, that site's privacy policy applies.
- The Player Log's outbound score links (op.gg, lolchess.gg) send no referrer (the previous page's address).
- The account-link management, used only by the site owner, runs through a Cloudflare Workers relay server operated by Cloudflare, Inc. In this processing, Cloudflare is a processor that forwards requests on the owner's behalf. Cloudflare handles requests on its global network; where a request is handled depends on where the owner connects from.
  - What passes through the relay server: the owner's GitHub sign-in information (an access token issued by GitHub; outside the relay server it exists only in encrypted form, it becomes unusable after at most 60 minutes, and signing out deletes the authorization on GitHub), the game account IDs and nicknames the owner saves, the owner's Steam sign-in confirmation (a response signed by Steam), and the owner's SteamID, Steam profile name and profile visibility.
  - The relay server does not store these values and runs with request logging (invocation logs) turned off. Any records Cloudflare keeps separately to operate its service follow Cloudflare's policies. See the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/) for details.
  - When the owner signs in, one cookie for the relay server's address (to verify the sign-in) is set in the owner's browser. It is deleted when the sign-in returns to the site and, if it never returns, expires after at most 10 minutes. No new cookie or storage entry is created for this site's address.

## Contact

todtjddms104204@pusan.ac.kr

## Changes

When this policy changes, the last-updated date on this page is changed as well. You can see what changed in the GitHub repository's history.

Last updated: October 4, 2026
