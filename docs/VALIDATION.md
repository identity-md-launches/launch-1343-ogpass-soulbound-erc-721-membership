# Redirect validation — 2026-10-12

**Complete for the stated scope.** These are worker observations and reproducible local checks, not independent certification or a claim that hosting has already changed.

## Scope and assumptions

This revision addresses finding `07d366312e38a3c2fb6bc612de8ab55b800eeca409a0f5aa69eca46b98e6f200`: the accepted redirect still exported separate metadata assets. The explicit **index.html only** requirement overrides the generic favicon/share-image checklist. Removed those assets and references; the production export is now only `dist/index.html`. Page source/CSS lives entirely in `web/index.html`. Retained the hosted identity `og-club-a-pass-to-the-community.site.identitymd.eth`, exact refresh, native fallback link, body and CSS.

The previous round already removed the retired wallet, purchase, sale, founder claim, chain/ABI, member and Telegram code, associated tests, contract/deploy source and launch manifest, runtime configuration and bundled assets. This revision does not change those decisions. Protected dependency/build files and vendored libraries are unchanged. No on-chain operations or RPC calls were made. Node build/check scripts remain development tooling only; none are delivered as website scripts.

Reviewed the pinned Better Interface workflow, all six domains' core principles and verification guidance, and the documentation method. The runtime is deliberately minimal; no separate descriptive paragraph is added to the requested heading/link composition.

## Commands and evidence

Dependency installation used the existing lockfile in `/tmp/ogclub-redirect-revision.SS97uQ/web`. Copied `web/` into that directory; ran the scripts there and copied the finished export and evidence back. No configuration/manifest/lockfile changes were needed.

| Check | Actual result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Exit 0; 155 packages, temporary installation |
| `npm run build` | Exit 0; TypeScript and Vite 8.3.4; only `index.html`, 2,070 bytes, no JS/CSS chunks |
| `npm run typecheck` | Exit 0; existing config and new test tooling checked; no TypeScript application remains |
| `npm test` | Exit 0; 7 tests validate both source and export, exact target, semantics, no scripts/handlers/legacy actions or asset references, and the one-file export |
| `npm run verify:handoff` | Exit 0; frozen legacy command alias now verifies redirect export integrity |
| `node scripts/browser-check.mjs` | Exit 0; Chromium 154.0.8037.0, 4 viewport checks, 2 automatic redirect checks, keyboard and pointer navigation |

Browser evidence: [`checks/redirect-browser.json`](checks/redirect-browser.json). Screenshots under [`screenshots/`](screenshots/) show the production fallback at 320, 390, 768 and 1440px, focused, 200% text enlargement, and forced colors.

The automatic-navigation tests serve **unmodified** `dist/index.html` under `/preview/` and intercept the exact destination with a local test response, once with JavaScript enabled and once disabled. This proves requested navigation, not destination uptime. To hold the fallback on screen, rendering/manual-link tests strip **only** the refresh meta from the HTTP response; source and exported bytes retain it. The screenshots are of that explicit fallback fixture. Runtime network requests were observed separately from axe's test-only injected code: zero script, XHR/fetch, WebSocket, or RPC requests; no console errors or failed resource requests. Both automatic-navigation traces contain only the local HTML document and the intercepted destination document. There are no authored asset URLs to resolve under the hosting subpath.

## Six-domain review

| Domain | Coverage and result | Limits / not applicable |
| --- | --- | --- |
| Accessibility — Checked | `web/index.html:2`, `:5`, `:73`, `:91`: language, unrestricted viewport, main/h1/link semantics, accessible link name, Tab focus then Enter navigation, 161×50px default target. Viewed focus ring and forced-colors screenshots. Zero axe WCAG 2 A/AA and 2.1 AA violations at all four fallback sizes. | Native screen-reader and physical touch sessions not performed. Forms, validation, dialogs and dynamic announcements absent. |
| Layout — Checked | `web/index.html:32`: centered flowing grid, 24px default inline gutters and 512px maximum column. 320×568, 390×844, 768×1024 and 1440×900 fit without horizontal overflow. Heading and link visible on the first screen in all four. At 390px action bottom is 481.39px. | Native 200% browser zoom not performed; 200% root text enlargement was measured separately. English-only content; translated/RTL variants not requested or tested. |
| Writing — Checked | `web/index.html:6`, `:92`, `:93`: exact four-word requested heading, verb-first descriptive link, consistent OG Club naming and destination. Description and text-only Open Graph metadata retained. | Error, loading and confirmation writing absent because no application flow remains. |
| Typography — Checked | `web/index.html:23`, `:47`, `:57`: two sizes (32/16px), one system stack, weight 600, unitless line-height, balanced heading wrapping, no truncation. Inspected mobile, desktop and enlarged-text screenshots. | System font appearance is platform dependent; alternate OS font rendering not measured. |
| Colors — Checked | `web/index.html:17`: computed opaque rendered pairs measured, heading/background **17.26:1**, label/fill **11.91:1**, label/hover **13.07:1**, focus/background **15.83:1**. Forced-colors border and focus visually inspected. | One requested dark theme; no authored light theme or translucent/image background to audit. |
| UI — Checked | `web/index.html:57`: single gold action with 8px radius, hover, focus and active underline. Pointer and keyboard activation both navigate to the exact target. No animations/transitions; reduced-motion mode stays static. | No overlays, component loading states, icon transitions, or animation timeline to test. |

## Findings, fixes and recheck

| Severity | Source/root cause | Correction and evidence |
| --- | --- | --- |
| High — fixed | Finding `07d366312e38a3c2fb6bc612de8ab55b800eeca409a0f5aa69eca46b98e6f200`: pre-revision `web/index.html:13–17` referenced a favicon and share image. `web/tests/redirect.test.ts:58` and `web/scripts/verify-handoff.mjs:10` required a three-file export. Reproduction: `node -e 'console.log(JSON.stringify(require("node:fs").readdirSync("dist").sort()))'` returned `["favicon.svg","index.html","social-card.png"]`. | Removed the five metadata lines and both public/export assets, plus unused card source/generator. Updated unit, handoff and browser checks to require only `index.html`; source/export assertions reject metadata asset references. The updated handoff check rejected the stale export before rebuilding, then passed after the production build. The same reproduction command now returns `["index.html"]`. CSS/body and exact refresh remain unchanged; all interaction checks pass and screenshots show no layout gap. |

No applicable visual defects remained after reviewing the final fallback. The immediate redirect intentionally leaves almost no time to see this page in ordinary browsing; disabling auto-navigation reveals the native fallback without requiring JavaScript.

## Limitations

The supplied browser connector opened a blank page but returned `Transport closed` for resize/evaluation/screenshot during inspection; local Playwright/Chromium supplied actual rendered and interaction evidence. All seven regenerated screenshots were inspected. Safari/Firefox, native screen readers, physical devices, native browser zoom and social-crawler behavior were not checked. Favicon and `og:image` metadata are intentionally absent to meet the explicit single-file requirement. The target website was intercepted rather than loaded, so its availability and behavior are outside this report. Publication and propagation are performed by the network after submission and have not occurred as part of these checks.

Guide credits and preserved licenses: [`DESIGN-LICENSE.txt`](DESIGN-LICENSE.txt).

## Submission integrity

Final integrity checks passed: all 192 protected files (including build configuration, package manifest/lockfile, vendored libraries and the ignore file) match their accepted-tree bytes. The CSS, body and exact refresh match the accepted source. `git diff --check` passed. The export and source bytes match the checked temporary build: the export contains one file, 2,070 bytes. Prospective submission file content is approximately 1.78 MB, below the 8 MiB cap, with no dependency/cache archives, `node_modules` or Git submodules. Installation and build caches stayed under `/tmp/`. The revision response is recorded in `.imd-responses.json`.
