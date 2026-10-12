# Redirect validation — 2026-10-12

**Complete for the stated scope.** These are worker observations and reproducible local checks, not independent certification or a claim that hosting has already changed.

## Scope and assumptions

Replaced the previous OG Club application with one HTML redirect page and the two local metadata assets required by the website criteria. Page source/CSS lives entirely in `web/index.html`; the production export is `dist/`. Retained the hosted identity `og-club-a-pass-to-the-community.site.identitymd.eth`. The supplied destination is used verbatim for the meta refresh and native fallback link.

Removed the retired wallet, purchase, sale, founder claim, chain/ABI, member and Telegram code, associated tests, contract/deploy source and launch manifest, runtime configuration and bundled assets. Protected dependency/build files and vendored libraries are unchanged. No on-chain operations or public RPC calls were made. Node build/check scripts remain development tooling only; none are delivered as website scripts.

Reviewed the pinned Better Interface workflow, all six domains' core principles and verification guidance, and the documentation method. The runtime is deliberately minimal; no separate descriptive paragraph is added to the requested heading/link composition.

## Commands and evidence

Dependency installation used the existing lockfile in a temporary directory outside the repository. Copied `web/` into that directory; ran the scripts there and copied the finished export, regenerated source sharing PNG, and evidence back. No configuration/manifest/lockfile changes were needed.

| Check | Actual result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Exit 0; 155 packages, temporary installation |
| `OGCLUB_CHROMIUM=… node scripts/render-social.mjs` | Exit 0; actual 1200×630 PNG inspected |
| `npm run build` | Exit 0; TypeScript and Vite 8.3.4; HTML plus two public assets, no JS/CSS chunks |
| `npm run typecheck` | Exit 0; existing config and new test tooling checked; no TypeScript application remains |
| `npm test` | Exit 0; 7 tests validate both source and export, exact target, semantics, no scripts/handlers/legacy actions, metadata and asset identity |
| `npm run verify:handoff` | Exit 0; frozen legacy command alias now verifies redirect export integrity |
| `node scripts/browser-check.mjs` | Exit 0; Chromium 154.0.8037.0, 4 viewport checks, 2 automatic redirect checks, keyboard and pointer navigation |

Browser evidence: [`checks/redirect-browser.json`](checks/redirect-browser.json). Screenshots under [`screenshots/`](screenshots/) show the production fallback at 320, 390, 768 and 1440px, focused, 200% text enlargement, and forced colors.

The automatic-navigation tests serve **unmodified** `dist/index.html` under `/preview/` and intercept the exact destination with a local test response, once with JavaScript enabled and once disabled. This proves requested navigation, not destination uptime. To hold the fallback on screen, rendering/manual-link tests strip **only** the refresh meta from the HTTP response; source and exported bytes retain it. The screenshots are of that explicit fallback fixture. Runtime network requests were observed separately from axe's test-only injected code: zero script, XHR/fetch, WebSocket, or RPC requests; no console errors or failed resource requests. Relative favicon and sharing-image URLs returned HTTP 200 and the expected bytes under `/preview/`.

## Six-domain review

| Domain | Coverage and result | Limits / not applicable |
| --- | --- | --- |
| Accessibility — Checked | `web/index.html:2`, `:5`, `:78`, `:96`: language, unrestricted viewport, main/h1/link semantics, accessible link name, Tab focus then Enter navigation, 161×50px default target. Viewed focus ring and forced-colors screenshots. Zero axe WCAG 2 A/AA and 2.1 AA violations at all four fallback sizes. | Native screen-reader and physical touch sessions not performed. Forms, validation, dialogs and dynamic announcements absent. |
| Layout — Checked | `web/index.html:37`: centered flowing grid, 24px default inline gutters and 512px maximum column. 320×568, 390×844, 768×1024 and 1440×900 fit without horizontal overflow. Heading and link visible on the first screen in all four. At 390px action bottom is 481.39px. | Native 200% browser zoom not performed; 200% root text enlargement was measured separately. English-only content; translated/RTL variants not requested or tested. |
| Writing — Checked | `web/index.html:6`, `:97`, `:98`: exact four-word requested heading, verb-first descriptive link, consistent OG Club naming and destination. Updated description and sharing copy. | Error, loading and confirmation writing absent because no application flow remains. |
| Typography — Checked | `web/index.html:28`, `:52`, `:62`: two sizes (32/16px), one system stack, weight 600, unitless line-height, balanced heading wrapping, no truncation. Inspected mobile, desktop and enlarged-text screenshots. | System font appearance is platform dependent; alternate OS font rendering not measured. |
| Colors — Checked | `web/index.html:22`: computed opaque rendered pairs measured, heading/background **17.26:1**, label/fill **11.91:1**, label/hover **13.07:1**, focus/background **15.83:1**. Forced-colors border and focus visually inspected. | One requested dark theme; no authored light theme or translucent/image background to audit. |
| UI — Checked | `web/index.html:62`: single gold action with 8px radius, hover, focus and active underline. Pointer and keyboard activation both navigate to the exact target. No animations/transitions; reduced-motion mode stays static. | No overlays, component loading states, icon transitions, or animation timeline to test. |

## Findings, fixes and recheck

| Severity | Source/root cause | Correction and evidence |
| --- | --- | --- |
| High | Previous `web/index.html` loaded `web/src/main.tsx`; `web/src/App.tsx` and chain/wallet modules exposed the old member and transaction flows. Previous `dist/assets/` shipped that code. | Replaced with static heading/link at `web/index.html:96` and exact refresh at `:18`; removed old modules and exported bundles/configuration. Source/export checks pass; automatic navigation works with JS disabled; browser observes no RPC/script requests. |
| Medium | Previous `web/index.html` and sharing card advertised the retired membership interface and pointed sharing metadata to the old custom domain. | Updated metadata at `web/index.html:6` and local sharing card source. Relative favicon/image paths resolve under `/preview/`; PNG and source/export byte checks pass. Actual sharing card inspected. |
| Medium | Old `README.md`, `DESIGN.md`, `docs/VALIDATION.md`, screenshots and checks described actions that no longer exist. | Replaced documentation with final redirect behavior and actual check results; discarded obsolete evidence; regenerated and inspected current screenshots. |

No applicable visual defects remained after reviewing the final fallback. The immediate redirect intentionally leaves almost no time to see this page in ordinary browsing; disabling auto-navigation reveals the native fallback without requiring JavaScript.

## Limitations

The supplied browser connector returned `Transport closed`; local Playwright/Chromium supplied actual rendered and interaction evidence. Safari/Firefox, native screen readers, physical devices, native browser zoom and social-crawler unfurling were not checked. Relative Open Graph image URLs meet the static-subpath constraint, but some crawlers require absolute URLs; unfurling is not guaranteed. The target website was intercepted rather than loaded, so its availability and behavior are outside this report. Publication and propagation are performed by the network after submission and have not occurred as part of these checks.

Guide credits and preserved licenses: [`DESIGN-LICENSE.txt`](DESIGN-LICENSE.txt).

## Submission integrity

Final local integrity check passed: all 192 protected files (including build configuration, package manifest/lockfile, vendored libraries and the unchanged ignore file) match their original SHA-256 values. `git diff --check` passed. The export bytes match the checked production build. Its three files total 28,330 bytes. The prospective submission contains approximately 1.83 MB of file content, below the 8 MiB cap; no dependency/cache archives, `node_modules`, or Git submodules are included. Installation and build caches stayed under `/tmp/`; scratch-only records are excluded from submission.
