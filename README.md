# OG Club redirect

The old OG Club site now serves one minimal HTML page: **OG Club has moved**, a **Go to OG Club** link, and an immediate HTML meta refresh to:

https://og-club-members-only-priced-by-t.sites.imd.fun/

The hosted site name remains **og-club-a-pass-to-the-community.site.identitymd.eth**. The network should publish this export as the next version of that existing site, preserving its old URL.

## Files and behavior

- `web/index.html` is the entire page source, including its CSS. The same exact destination appears in the native link and zero-delay meta refresh.
- `dist/index.html` is the entire production export: one file, with inline CSS and no asset references. The explicit **index.html only** requirement takes precedence over the generic favicon/share-image checklist; favicon and `og:image` metadata are intentionally absent. Title, description and `og:title` remain.
- There are no runtime scripts, external fonts, wallet connections, transaction controls, RPC requests, contract addresses, or application state. The heading and native link remain usable when automatic redirects are disabled.
- The former application modules, client/contract tests, deployment scripts, task-owned contract source, launch manifest, deployment handoff, and stale documentation/screenshots have been removed. This repository change makes no on-chain change.
- Existing package manifests, lockfile, Vite/TypeScript configuration, Foundry configuration, remappings, and vendored dependencies are protected by the assignment and remain byte-for-byte unchanged. Legacy JavaScript dependencies are unused by the page and produce no runtime bundle. The frozen `verify:handoff` command now checks the redirect export.

## Install and rebuild

Requires Node.js 22 and npm. Install the exact `web/package-lock.json`; no dependency updates are necessary. To keep generated dependencies outside the submission, work in a temporary build directory. Run from the repository root:

```sh
task_site_build=$(mktemp -d /tmp/ogclub-site.XXXXXX)
cp -R web "$task_site_build/web"
npm ci --prefix "$task_site_build/web" --no-audit --no-fund
npm --prefix "$task_site_build/web" run build
npm --prefix "$task_site_build/web" run typecheck
npm --prefix "$task_site_build/web" test
npm --prefix "$task_site_build/web" run verify:handoff
cp "$task_site_build/dist/index.html" dist/index.html
node web/scripts/verify-handoff.mjs
```

The build runs `tsc --noEmit` and `vite build`, with `base: "./"` and the export at `../dist`. TypeScript covers the check tooling and unchanged configuration; the page itself is plain HTML/CSS. Once dependencies are installed, the build and all checks operate without network access. Keep npm caches and `node_modules` outside the submitted tree. No ignore files were changed.

## Preview and interaction checks

Preview the finished export from the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4173/`. The page immediately navigates away, as requested. Stop the foreground preview with Ctrl+C. To inspect the fallback without navigating, use the reproducible browser check:

```sh
cd "$task_site_build/web"
OGCLUB_CHROMIUM=/path/to/chromium node scripts/browser-check.mjs
```

The script runs and closes its own local preview and browser, writes evidence to the temporary project's `docs/`, and intercepts the destination locally. It tests the unmodified production export's automatic redirect with JavaScript both enabled and disabled. For fallback screenshots, keyboard navigation and layout checks, it removes only the refresh tag from the served response. That interception never changes the source or delivered HTML.

## Actual validation

On 2026-10-12, reproduced revision finding `07d366312e38a3c2fb6bc612de8ab55b800eeca409a0f5aa69eca46b98e6f200`: the export contained three files. Removed the favicon/share image, their metadata and unused generation tooling; updated export assertions to require only `index.html`. The page's CSS, body, exact refresh and hosted site identity are unchanged. Installed the frozen lockfile in `/tmp/`, copied the site into the temporary build tree, and ran:

| Command | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed; 155 packages installed outside the repository |
| `npm run build` | Passed; TypeScript and Vite 8.3.4; only `index.html`, 2,070 bytes |
| `npm run typecheck` | Passed |
| `npm test` | Passed; 7 tests across source, export, and single-file integrity |
| `npm run verify:handoff` | Passed; exact redirect/link and only expected export files |
| `node scripts/browser-check.mjs` | Passed in Chromium 154.0.8037.0; 4 viewport checks, 2 automatic and 2 manual navigations |

At 390×844 the heading and action fit in the first screen; the button ends at y=481.39px. Checked 320×568, 768×1024, 1440×900, 200% text enlargement, keyboard focus, forced colors and reduced-motion mode. The browser recorded zero console errors, failed requests, script/RPC requests, and axe WCAG A/AA violations in the fallback states. Actual screenshots were inspected. These are worker checks, not independent certification.

See [DESIGN.md](DESIGN.md), [the six-domain review](docs/VALIDATION.md), and [browser results](docs/checks/redirect-browser.json). The supplied browser connector returned `Transport closed` during inspection; local Playwright/Chromium provided the rendered checks instead. The installed browser was `/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell`. The new site's availability, social-crawler behavior, Safari/Firefox, physical devices, native screen readers and native browser zoom were not verified.

## Publish

The delivery is the repository-root `dist/` export alongside its source and existing lockfile. Submit those files through this job's normal commit/upload flow. The network publisher pins that export and updates **og-club-a-pass-to-the-community.site.identitymd.eth**; use the existing site record. This task does not run a publishing command, create a new site name, or deploy a contract. Hosting becomes updated when the network completes publication.
