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
- gitleaks scans the pushed commits on every push and the full history on the daily and manual runs.
- Game account cards (Player Log): the `fetch-accounts` job runs before the build with Node built-ins only (no `npm ci`) in the `account-fetch` environment, whose environment secret `STEAM_API_KEY` is the only secret it reads. The account values come from repository variables (`ACCOUNT_*`); variable values are printed in the public run logs, so they are public by design. With no `ACCOUNT_*` variable set the job makes no request. Setup: see "연동 켜기" below.

## 연동 켜기

플레이 로그의 게임 계정 카드를 켜는 사이트 주인용 절차입니다. 순서대로 해 주세요.

- 키, 토큰, client secret, 비밀번호는 채팅, 이슈, 커밋, 파일 어디에도 붙여 넣지 마세요. 비밀값을 넣는 곳은 GitHub의 **Add environment secret** 양식(3단계)과 `npm run setup`의 숨김 입력(10단계) 두 곳뿐입니다.
- "(문구 미확인)", "(경로 미확인)"이라고 적은 화면 이름은 실제 화면과 다를 수 있습니다. 다르면 화면을 따르고 이 README를 고쳐 주세요.
- 이 저장소 주인 계정의 다른 저장소에서는 GitHub Pages를 켜지 마세요. `lunecid.github.io/<저장소>/`는 이 사이트와 같은 출처가 되어, 그 페이지의 스크립트가 관리 화면의 로그인을 가로챌 수 있습니다.

**릴리스 전에**

1. **Environment `account-fetch`.** 저장소 **Settings** → **Environments** → **New environment** → 이름 `account-fetch` → **Configure environment** → "Deployment branches and tags"에서 **Selected branches and tags** → **Add deployment branch or tag rule** → `main` → **Add rule**(문구 미확인). 같은 목록의 `github-pages`도 `main`만 허용하는지 확인해 주세요. 없는 환경을 쓰는 잡은 첫 실행 때 규칙 없는 환경을 만들 수 있으므로 릴리스 전에 해 주세요.
2. **Branches.** 저장소의 **Branches** 화면에서 `main` 말고 다른 브랜치가 없는지 확인해 주세요.

**릴리스 뒤에**

3. **Steam key.** https://steamcommunity.com/dev/apikey 에서 Steam에 로그인하고, 도메인 `lunecid.github.io`를 넣고 약관에 동의해 키를 등록한 뒤 복사해 주세요(화면 미확인). 그다음 **Settings** → **Environments** → `account-fetch` → **Environment secrets** → **Add environment secret** → 이름 `STEAM_API_KEY`, 키는 이 양식에만 붙여 넣고 **Add secret**(문구 미확인). 저장소 전체의 Secrets 화면이 아니라 환경 비밀이어야 `main` 규칙으로 보호됩니다.
4. **Steam privacy.** Steam 프로필 → **Edit Profile** → **Privacy Settings**에서 "My profile"과 "Game details"를 공개로 두고 "Always keep my total playtime private"를 해제해 주세요(메뉴 이름과 이 항목의 효과 미확인). 사이트에 보이면 안 되는 게임은 앱 ID로 `src/lib/account-config.ts`의 `STEAM_GAME_FILTER`에 넣고, 그 뒤 `STEAM_SHOW_GAMES`를 `true`로 바꿔 주세요.
5. **Game showcases.** 원신과 젠레스 존 제로에서 캐릭터 쇼케이스를 공개로 설정해 주세요. 14단계에서 [Enka.Network에서 확인]이 캐릭터가 보이는 페이지를 열면 됩니다.
6. **Cloudflare account.** 사이트 주인의 Cloudflare 계정을 써 주세요. 7단계 전에 2단계 인증을 켜 주세요: 프로필 아이콘 → **My Profile** → **Authentication** → **Two-Factor Authentication**(경로 미확인). 그다음 **Workers & Pages** → **Subdomain** → **Change**(경로 미확인)에서 `workers.dev` 하위 도메인을 확인해 주세요. 이메일 주소의 앞부분, 실명, 게임 이름이 들어 있으면 지금 중립적인 이름으로 바꿔 주세요. 이 이름은 모든 페이지의 CSP와 JS에 공개되고, 콜백 URL, CSP, 개인정보 처리방침 문장이 모두 이 이름을 쓰므로 한 번 정하면 바꾸지 마세요.
7. **First Worker deploy.** 주인 PC에서 Node 22 이상이 필요합니다(`node -v`로 확인). Windows PowerShell에 아래 명령을 **한 줄씩** 붙여 넣고 Enter를 눌러 주세요. 여러 줄을 한 번에 붙여 넣으면 입력 창이 다음 줄을 삼킬 수 있습니다.
   1. 저장소 폴더에서 `git switch main`
   2. `git pull`
   3. `cd workers/account-relay`
   4. `npm ci`
   5. `npx wrangler login` → 브라우저가 열리면 사이트 주인의 Cloudflare 계정으로 로그인 → **Allow**
   6. `npx wrangler deploy` → 하위 도메인 등록을 물으면(미확인) 6단계의 이름을 넣어 주세요. 출력된 `https://account-relay.<하위도메인>.workers.dev` 주소를 그대로 복사해 두세요. 중계 서버 주소는 이 출력에서만 얻습니다. 아직 비밀이 없어 Worker는 닫혀 있습니다. 이 창은 10단계까지 열어 두세요.
8. **GitHub App.** https://github.com/settings/apps/new 를 열어 주세요.
   - **GitHub App name**: 게임 이름이 없는 이름. **Homepage URL**: `https://lunecid.github.io`
   - **Callback URL**: 하나만, 7단계 주소 + `/gh/callback`(예: `https://account-relay.<하위도메인>.workers.dev/gh/callback`). 글자 하나까지 같아야 합니다.
   - **Expire user authorization tokens**: 켠 채로 둡니다. **Request user authorization (OAuth) during installation**: 끔. **Enable Device Flow**: 끔. **Webhook** → **Active**: 끔.
   - **Repository permissions**: **Actions: Read and write**, **Variables: Read and write**, 나머지는 "No access"(Metadata 읽기 권한은 자동으로 붙습니다, 문구 미확인). **Account permissions**: 없음.
   - **Where can this GitHub App be installed?**: **Only on this account** → **Create GitHub App**
   - **Client ID**를 적어 두세요. client secret은 아직 만들지 마세요(10단계). **Generate a private key**는 누르지 마세요. 키가 없어 설치가 거부되면(미확인) 키를 만들고 내려받은 `.pem` 파일을 바로 지운 뒤 어디에도 올리지 마세요.
9. **Install.** 앱 설정 → **Install App** → 저장소 주인 계정 옆의 **Install** → **Only select repositories** → `Lunecid.github.io` → **Install**
10. **Worker secrets.** 7단계의 터미널을 닫았거나 `npx wrangler logout`을 했다면 `workers/account-relay` 폴더에서 `npx wrangler login`부터 다시 해 주세요(`wrangler secret put`에 로그인이 필요합니다). 앱 설정 → **Generate a new client secret** → 복사(한 번만 보입니다). 곧바로 그 터미널에서:
    1. `npm run setup`
    2. "GitHub App의 Client ID를 붙여 넣고 Enter를 눌러 주세요:"가 나오면 Client ID를 붙여 넣고 Enter
    3. "GitHub App의 client secret을 붙여 넣고 Enter를 눌러 주세요(입력한 글자는 보이지 않습니다):"가 나오면 client secret을 이 입력에만 붙여 넣고 Enter. 아무것도 보이지 않는 것이 정상입니다.
    4. "비밀 세 개를 넣었습니다."가 나오면 끝입니다. 세 번째 비밀(`SEAL_KEY`)은 스크립트가 만들고 화면에 내보내지 않습니다.
    5. `npx wrangler logout`(저장된 로그인 정보를 지우는지는 미확인)

    client secret의 사본은 메모장, 채팅 어디에도 남기지 마세요.
11. **Check.** 7단계 주소 + `/health`를 브라우저로 열어 주세요. `"configured":true`면 준비가 끝났고, `false`면 10단계를 다시 해 주세요.
12. **Send the address and wait.** 7단계 주소(공개 URL, 그 밖에는 아무것도 아님)를 `src/config.ts`의 `ACCOUNT_ADMIN.relay`에 넣는 커밋 하나로 반영해 주세요. 이 커밋은 CSP와 개인정보 처리방침의 중계 서버 문장도 함께 바꿉니다. 배포가 끝나면 `/game/player-log/?manage`에 [GitHub로 로그인]이 보이고 "중계 서버 주소가 아직 설정되지 않았습니다."가 사라져야 합니다. 그 전에 로그인하면 CSP가 중계 서버를 막아 Worker가 고장 난 것처럼 보입니다.
13. **First login.** `/game/player-log/?manage` → "연동 관리" → [GitHub로 로그인] → 팝업에서 GitHub 로그인 → 승인 화면(앱 이름, Actions·Variables 권한; 문구 미확인) → **Authorize**. 로그아웃이 승인을 지우므로 로그인할 때마다 이 화면이 다시 나옵니다. 팝업이 닫히고 "GitHub 로그인됨"과 "Variables 읽기: 가능 · Actions 읽기: 가능"이 보이면 됩니다. 팝업이 막히면 팝업을 허용하거나 [같은 창에서 로그인]을 써 주세요. `no-access`가 나오면 9단계를, `config`가 나오면 10단계를 다시 해 주세요.
14. **Per game.** [Sign in through Steam] → 팝업에서 Steam 로그인 → "프로필: 공개"인지 확인해 주세요. 원신·젠레스 존 제로: UID를 넣고 [Enka.Network에서 확인] → 새 탭에서 닉네임을 읽고 그대로 넣어 주세요. 리그 오브 레전드·TFT: 자신의 Riot ID를 두 번 넣고 [op.gg에서 확인], [lolchess.gg에서 확인]으로 확인해 주세요.
15. **Save and rebuild.** [저장] → [다시 빌드] → 약 20분 기다려 주세요. 첫 [다시 빌드]가 실행을 만드는지 확인해 주세요(GitHub App 사용자 토큰의 실행 요청, 미확인).
16. **Check and log out.** 게임별 결과를 확인한 뒤 [로그아웃]을 눌러 주세요. 문제가 생기면 아래 비상 절차를, 중계 서버가 멈췄으면 관리 화면의 "로그인 없이 하기"를 써 주세요.

### Worker 코드를 고치면 다시 배포

`workers/account-relay/` 아래나 Worker가 함께 묶어 배포하는 `src/lib/account-ids.ts`를 고친 뒤에는 7단계의 1–6을 다시 하고 `npx wrangler logout`을 해 주세요. Worker 비밀은 그대로 남습니다. 가끔 앱 설정의 **Private keys** 목록이 비어 있는지도 확인해 주세요(아래 7).

### 비상 절차(범위가 좁은 것부터)

1. 사이트에서 [로그아웃]: Worker가 승인(grant)을 지웁니다. Worker가 정상일 때만 믿을 수 있습니다.
2. GitHub **Settings** → **Applications** → **Authorized GitHub Apps** → 앱 → **Revoke**. 화면에서 폐기하면 이미 발급된 토큰이 바로 죽는지는 문서에 없습니다(미확인). 확실히 하려면 API `DELETE /applications/{client_id}/grant`를 써 주세요. 승인을 지우면 그 사용자의 앱 토큰이 모두 지워집니다.
3. Worker 비밀 `SEAL_KEY`를 새 값으로 바꿔 주세요(`npm run setup`을 다시 실행). 모든 로그인 핸들, 티켓, 진행 중인 로그인이 바로 무효가 됩니다.
4. GitHub App에서 client secret을 새로 만들고(새것을 만든 뒤 옛것을 지움) Worker 비밀 `GH_CLIENT_SECRET`을 바꿔 주세요(`npm run setup`).
5. 앱 설치를 중지하거나 지워 주세요(저장소 **Settings** → **GitHub Apps**, 또는 계정 **Settings** → **Applications** → **Installed GitHub Apps**, 문구 미확인). 또는 Cloudflare에서 Worker를 지워 주세요. 이때도 사이트는 방문자에게 그대로 동작하고, 관리는 "로그인 없이 하기"로 할 수 있습니다.
6. **Cloudflare 계정 탈취가 의심되면** 바뀐 Worker가 새로 고침 토큰과 client secret을 쥐었을 수 있으므로 **2(승인 삭제)와 4(client secret 다시 만들기)를 반드시 한 쌍으로** 해 주세요. 하나만 하면 남은 쪽으로 토큰을 다시 받을 수 있습니다. 그 뒤 Cloudflare 비밀번호와 2단계 인증을 바꾸고 3과 5도 해 주세요. 그 사이 바뀌었을 수 있는 `ACCOUNT_*` 변수를 GitHub 설정 화면에서 확인해 주세요.
7. **개인 키 점검**(정기적으로, 그리고 의심될 때): 앱 설정 → **Private keys**. 키가 하나도 없어야 정상입니다. 한 번이라도 만들었거나 내려받았다면 새 키를 만들고(마지막 키는 새 키를 만들어야 지울 수 있습니다) 옛 키를 지운 뒤, 새로 받은 것과 옛것을 포함해 모든 `.pem` 파일을 PC(다운로드 폴더 포함)에서 지워 주세요. GitHub는 키의 공개 부분만 보관하므로 그러면 개인 부분은 어디에도 남지 않습니다.

## Credits

Sources and rights notices for images, research data, music and fonts are listed at https://lunecid.github.io/credits/. Game-related images, where shown, are fan content and not affiliated with their rights holders.
