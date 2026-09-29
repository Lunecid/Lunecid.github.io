# Lunecid.github.io

Portfolio of **백성은 · Seongeun Baek**, game data analyst and researcher — M.S. student at DataLab, Graduate School of Data Science, Pusan National University (advisor Prof. Joonho Kwon).

- Site (Korean): https://lunecid.github.io/
- Site (English): https://lunecid.github.io/en/
- Contact: todtjddms104204@pusan.ac.kr · GitHub [Lunecid](https://github.com/Lunecid)

## What is on the site

| Page | Path |
|---|---|
| Chooser: pick the game version or the general data-analyst version (remembered for the next visit) | `/` |
| Home: HUD hero, main menu, featured projects, research highlight, patch notes, profile | `/game/` |
| Research: publications, ongoing work, and the IEEE CoG 2026 paper page (abstract) | `/game/research/` |
| Projects: three case studies and two project cards with a tag filter, plus public repositories | `/game/projects/` |
| Records & CV: education, awards, certifications, skills, a job-requirements fit table, résumé PDFs (each version lists its own two résumés and the shared academic CV; five PDFs in all) | `/game/records/` |
| Player log: favorite games and site achievements | `/game/player-log/` |
| General version: the same home, research, projects and records pages without the game modules | `/data/`, `/data/research/`, `/data/projects/`, `/data/records/` |
| Visitor stats (GoatCounter, no cookies), privacy policy, credits | `/stats/`, `/privacy/`, `/credits/` |

Every page exists in Korean (`/…/`) and English (`/en/…/`, e.g. `/en/game/`, `/en/data/`) with the same sections and links. Old game URLs (`/records/` …) redirect to their `/game/` pages.

## Stack

Astro 7 static site with React 19 islands; content collections (Markdown + YAML validated by zod schemas in `src/content/schemas.ts`); OG images rendered at build time with satori + resvg; résumé PDFs printed from the `/print/*` routes with Playwright; GitHub Actions builds, tests and deploys to GitHub Pages.

## Local development (Windows)

Requirements: Node ≥ 22.18 (24 recommended), npm, and Google Chrome (local Playwright runs use it through `PW_CHANNEL=chrome`). Run npm from PowerShell; in Git Bash type `npm.cmd`. Where `npx` is unavailable, use `npm exec -- <bin>`.

```powershell
npm ci                                        # install dependencies
npm run dev                                   # http://localhost:4321/
npm run check                                 # astro check (types, .astro files, tests)
npm test                                      # vitest: unit, component and content tests
npm run build                                 # static site in dist/
$env:PW_CHANNEL='chrome'; npm run build:pdf   # dist/cv/*.pdf (run after every build)
npm run test:ops                              # dist leak scan, image metadata, PDF checks
$env:PW_CHANNEL='chrome'; npm run test:e2e    # Playwright + axe against astro preview on port 4329
npm run test:links                            # internal links, CSS URLs and #fragments in dist
$env:PW_CHANNEL='chrome'; npm run verify      # all of the above in order
```

Lighthouse budgets (performance ≥ 0.90, accessibility ≥ 0.95, mobile and desktop) run in CI with `npm run test:lh` (`lighthouserc.json`, `lighthouserc.desktop.json`).

## Content

- Project case studies: `src/content/projects/{ko,en}/*.md`
- Research: `src/content/publications/`, `src/content/research/{ko,en}/`, `src/data/research-page.ts`, `src/data/research/cog-2026.ts`
- Patch notes: `src/content/news/*.md` (dates are quoted `'YYYY-MM-DD'` strings)
- Résumé data for the site and all five PDFs: `src/data/resume.yaml`; job-fit tables `src/data/jobfit.<id>.yaml` (one per version: `jobfit.game.yaml`; `jobfit.data.yaml` once the P3 survey lands); awards, favorites and achievements in `src/data/*.yaml`
- UI strings: `src/i18n/ui.ts` (Korean and English keys must match; a test checks it)
- Images: converted once into `src/assets/**` by `npm run assets` (sharp, WebP, metadata stripped) from a staging folder outside the repository (`ASSET_STAGING`, `LOL_ROOT`)

## Build-time data, secrets and deploy

`.github/workflows/deploy.yml` runs on every push to `main`, on demand, and daily at 03:30 KST: fetch GitHub/GoatCounter data → type check → unit tests → build → PDFs → ops tests → e2e → links → Lighthouse → deploy to GitHub Pages.

- Fetched JSON goes to `src/data/generated/` and is never committed; missing, failed or stale data hides its section instead of breaking the build, and the browser hides sections whose data passed its maximum age.
- Repository secrets (Settings → Secrets and variables → Actions): `GOATCOUNTER_TOKEN` (GoatCounter API key with "Read statistics" only), optional `GH_PROFILE_TOKEN` (fine-grained token, public repositories read-only) and optional `PII_DENYLIST` (literal values the dist scan must never find, separated by `|`). The GoatCounter site code is public and lives in `src/config.ts` (`null` = statistics off).
- A 401/403 during the build-time fetch turns the run red in the `fetch-health` job after the deploy.
- gitleaks scans the full history on every run.

## Credits

Sources and rights notices for images, research data, music and fonts are listed at https://lunecid.github.io/credits/. Game-related images, where shown, are fan content and not affiliated with their rights holders.
