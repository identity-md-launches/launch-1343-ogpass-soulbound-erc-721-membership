# OG Club validation and Better Interface review

## Current revision · 2026-10-12

**Complete for the stated revision scope.** All six findings were reproduced against the original accepted `dist/` before editing production source. Changes are limited to invite lifecycle, founder sale presentation, the reported typography/surface/copy issues, regression checks, documentation and the rebuilt static export. The contracts, deployment handoff, build configuration, dependency manifests/lockfile and ignore files are unchanged. Git submission is left to the network worker; this revision does not modify Git metadata.

These are worker observations, not independent certification. The sections below “Initial implementation record” preserve historical results from the accepted implementation; they are not claims that every earlier check was rerun. This section and the revision JSON reports supersede earlier layout measurements. Screenshot links now show the revised export.

### Reproduction and fixes

[Before-fix evidence](checks/revision-before.json) records deterministic Chromium observations from the original export. Source references below identify the final corrected implementation.

| Finding ID prefix | Source | Reproduced behavior and correction | Recheck |
| --- | --- | --- | --- |
| `d4f00e57` · High | `web/src/App.tsx:343`, `:364`, `:1058` | A successful invite appeared at 847.4 ms and disappeared at 888.2 ms; the ready notice persisted with no link. Snapshot refreshes no longer clear invite state. Wallet address changes/disconnect and confirmed membership loss do clear it. A response from an invalidated wallet session is discarded. | Component checks cover immediate/manual/30-second refresh, another member account, disconnect/reconnect, membership loss/reacquisition and a pending invite during account change. Chromium retains the link after each refresh and opens its exact URL in an intercepted local popup. |
| `7579a819` · Medium | `web/src/App.tsx:403`, `:604`, `:690` | A founder's Sell card quoted 925,000 OG while confirmation offered 100,000 OG. The card now quotes `FOUNDER_BUYBACK`, labels it “Fixed founder buyback,” derives its optional ETH estimate from the same amount, and states the permanent membership/claim consequence. | Funded and unfunded founder component/browser checks show 100,000 OG; card/confirmation agree. Public sell remains 925,000 OG in the fixture, with the public fee caption; the curve retains its public quote. |
| `29993d04` · Medium | `web/src/styles.css:47`, `:168`, `:286` | Computed weights were 400/500/600/650/700 at mobile and desktop. Brand, default strong/b and h1 now use 600; explicit overrides and italic gold treatment remain. | All five tested widths report only 400/500/600. Hero, brand and warning emphasis are 600. |
| `24b4b12b` · Low | `web/src/styles.css:592` | Three 16px reserve units inherited -0.72px tracking at desktop. Reset unit letter spacing to 0. | All three units have natural spacing at five widths. The minified CSS/browser serializes zero as `normal`; numbers retain their display tracking. |
| `f0b435a8` · Low | `web/src/styles.css:322` | Pass surface had a 1px border plus a 48px blurred shadow. Removed its shadow only. | Computed pass shadow is `none`, border remains 1px. Screenshots retain the gold/gradient/seal treatment. |
| `85645e32` · Medium | `web/src/App.tsx:557` | The five-word headline omitted the product and purchase action; supporting copy used two sentences. Now “Buy your OG Club pass.” with one explanatory sentence. | Exact copy assertions and rendered mobile/desktop review pass. The primary action is above the fold at 390×844 and 375×812. |

Every full finding ID and verdict is recorded in repository-root `.imd-responses.json` for the worker response protocol.

### Commands and evidence

To honor the restriction on repository dependency directories, copied `web/` and `dist/` into `/tmp/ogclub-revision-bvj0jlw_` and ran the unchanged lockfile/configuration there. Source and public files were checked against the repository; only the generated `dist/` was copied back. No temporary packages, caches or scratch reproduction code are submitted. The permanent regression checks are `web/tests/app.test.tsx` and the expanded browser scripts.

Commands below ran in that temporary copy's `web/`:

| Command | Observed result |
| --- | --- |
| `npm ci --cache /tmp/ogclub-revision-npm-cache --no-audit --no-fund` | Exit 0, 155 packages installed from the unchanged lockfile. |
| `npm run typecheck` | Exit 0. A test-only unsupported `exact` option was corrected before this passing run. |
| `npm test` | Exit 0, **47 tests in 5 files**, including 8 new component regression cases. |
| `npm run build` | Exit 0, regenerated the root export. Existing >500 kB main-chunk warning remains (676.60 kB, 205.82 kB gzip). |
| `OGCLUB_RPC=http://127.0.0.1:35547/rpc/1 node scripts/browser-check.mjs` | Exit 0: real production export under `/preview/`, five viewports, first-screen action, type/spacing/surface assertions, keyboard/dialog/range checks, reduced motion, 200% text enlargement and social-image dimensions. Live reads used the supplied relay. Zero page exceptions, failed requests or axe violations. |
| `node scripts/wallet-check.mjs` | Exit 0: **11 deterministic wallet scenarios**, including successful SIWE invite POST/link retention/opening and founder sell-card quotes. Zero page exceptions and zero axe violations in checked states. |

The browser connector again returned `Transport closed`; all rendered checks used installed Playwright/Chromium with a foreground server/browser lifecycle. Wallet/RPC/Telegram tests use local doubles; the synthetic signature is not produced by a real wallet and the invitation popup is intercepted without visiting Telegram. The existing browser scenarios reject all transaction requests. No live signature, transaction, deployment or publication occurred.

Reports: [revision browser checks](checks/revision-browser-check.json), [revision wallet checks](checks/revision-wallet-check.json), [baseline reproduction](checks/revision-before.json). [Packaging checks](checks/revision-delivery.json) pass: approximately 3.53 MB of candidate source/export files and 1.20 MB as a gzip tar, below 8 MiB; `dist/` is 789,903 bytes. The six responses are consumed separately by the worker, as intended. The final export and current source are checked together, including relative entry assets, required metadata, unchanged handoff bytes and dependency/build paths, and the 8 MiB submission limit.

### Rendered results

| Viewport | Document width | Main action bottom | Axe violations |
| --- | --- | --- | --- |
| 390 × 844 | 390px | 703.7px | 0 |
| 375 × 812 | 375px | 703.7px | 0 |
| 320 × 812 | 320px | 774.0px | 0 |
| 768 × 1024 | 768px | 565.2px | 0 |
| 1440 × 1000 | 1440px | 565.5px | 0 |

At 390px with the root text size increased to 32px, the document remained 390px wide. This is text enlargement, not native browser zoom. Computed solid-pair contrast remains 9.34:1 for secondary text on page, 11.91:1 for primary-button ink on gold, and 16.02:1 for primary panel text. No new colors were added.

Opened and visually inspected the final [mobile page](screenshots/mobile.jpg), [desktop page](screenshots/desktop.jpg), [keyboard focus](screenshots/keyboard-focus.jpg), [founder Sell card](screenshots/founder-sell.jpg) and [retained Telegram link](screenshots/telegram-invite.jpg). The founder and invite screenshots use deterministic test data.

### Better Interface coverage for this revision

Read the pinned workflow and all six domains' core principles before implementing; applied the documentation section to update `DESIGN.md` from the final source. Scope is the changed surfaces and their affected shared styles, without redesigning unrelated components.

| Domain | Coverage | Limits |
| --- | --- | --- |
| Accessibility | **Checked:** native actionable invite link, buy/sell button states, labels, keyboard Tab/Enter/Escape and modal focus return, visible focused screenshot, range keyboard controls, reduced motion and automated axe scans. | No screen-reader session, physical-device or full conformance assessment. |
| Layout | **Checked:** five widths, member header, invite wrapping, founder card, first-screen action and enlarged text; no page overflow. | No native browser zoom, RTL or translation test; English/LTR only. |
| Writing | **Checked:** product-specific paid-action headline with one supporting sentence; founder quote/warning consistent with action and confirmation; ready invite notice now has a usable link; supplied disclaimer unchanged. | No independent legal review of supplied wording. |
| Typography | **Checked:** three rendered weights, original six sizes, hero/brand emphasis, local overrides, natural reserve-unit spacing and screenshot wrapping. | Other operating-system font substitution and physical mobile rendering untested. |
| Colors | **Checked:** existing semantic tokens preserved, solid computed contrast pairs remeasured, axe and focused screenshot inspected. | No exhaustive gradient-pixel/forced-colors testing. Additional themes are not applicable. |
| UI | **Checked:** border-only pass boundary, funded/unfunded founder actions, public/buy quote preservation, invite success/refresh/identity-loss behavior and existing empty/error/disconnected states. | No real extension wallet, live Telegram backend or animation-panel slow-motion replay. |

**Remaining limits:** WebKit was not rerun here. No live Telegram invite, real wallet signature, transaction, screen reader, native browser zoom or physical phone was tested. Optional ETH estimates remain hidden in production until a verified pool is supplied; founder ETH conversion was checked with a deterministic component fixture. No new required-flow defect remains from the scoped checks. Previous Foundry/static-analysis, ABI derivation, npm audit and comprehensive live-reader commands were not rerun because this revision changes no contracts, dependencies or data readers.

## Initial implementation record (historical)

Worker validation on 2026-10-12. **Implementation and validation are complete; the Git submission step remains pending because Git metadata is read-only**, with the specific limits below. These results are the worker's observations, not independent certification, a contract audit or proof that a future RPC/backend will remain available.

## Scope and assumptions

Reviewed the actual Vite production export served at `/preview/`, including wallet discovery, mainnet switching, purchase review, exact approval, public sale, founder claims/buybacks, curve exploration, member gating, event history and the optional Telegram flow. The design follows the requested dark club direction and the existing Swarm map's gold accent. The existing Solidity source, dependencies, deployment script and Foundry configuration remain unchanged.

The supplied handoff contains no verified OG/ETH pool ID. `ogEthPool: null` intentionally hides optional ETH estimates. The supplied static assignment contains no Telegram backend; the UI handles its absence as coming soon, and README defines the complete backend handshake. Member content and Auction tools are explicitly requested placeholders. They are not presented as completed private services.

## Commands and observed outcomes

Commands below run from `web/` unless otherwise noted:

| Command/check | Actual result |
| --- | --- |
| `npm ci --offline --cache /tmp/ogclub-npm-cache` | Passed from the populated cache, exit 0; clean lockfile installation |
| `npm run typecheck` | Passed, exit 0, strict TypeScript over source and tests |
| `npm test` | Passed, 39 tests across 4 files |
| `npm run build` | Passed, exit 0; generated repository-root `dist/index.html` and local assets |
| `npm run verify:handoff` | Passed; 102 ABI entries match pinned canonical keccak `211817dd…1767` |
| `node scripts/browser-check.mjs` | Passed: real production export at a subpath, five viewports, keyboard flow, modal focus, range interaction, reduced motion, 200% text enlargement and social PNG dimensions |
| `node scripts/wallet-check.mjs` | Passed: 10 deterministic EIP-6963/RPC scenarios; zero page exceptions and zero axe violations in checked states |
| `node scripts/live-check.mjs` | Passed: mainnet code/token/ABI verification, full history, all 101 curve points at the observed supply, founder root and real public-holder token discovery |
| `npm audit` | Passed: 0 vulnerabilities after the patched uuid override; recorded JSON includes the dependency inventory |

After the final application change, a fresh offline lockfile installation, typecheck, all 39 tests, production build and ABI check passed again. The rebuilt application/CSS asset hashes match the browser-reviewed export.

The final browser/interaction/live evidence is saved in [checks/browser-check.json](checks/browser-check.json), [checks/wallet-check.json](checks/wallet-check.json), [checks/live-check.json](checks/live-check.json) and [checks/npm-audit.json](checks/npm-audit.json). Build output includes a warning for the 676 kB uncompressed main JavaScript chunk (about 206 kB gzip); it is a size warning, not a build failure. Dependencies/caches are excluded from delivery by removing the generated dependency tree, without editing any ignore file.

At block **26174825**, live observations included: publicSupply=1, currentBuyPrice=1,010,000 OG, currentSellPrice=925,000 OG, curveReserve=1,000,000 OG, founderReserve=4,900,000 OG, founderClaimed=0, founderOutstanding=0, reservedFounderSlots=49 and buysPaused=false. The 49-address tree matched `founderRoot()` exactly. The existing public holder was resolved through Transfer logs to token #1 and `isFounder(1)=false`. These are timestamped observations, not defaults hardcoded into the UI.

## Useful interaction coverage

The 39 automated tests cover exact-amount approvals, the approval receipt before buy, a 10-minute deadline, requoting before and after approval, rejection/revert handling, refusing an unexpected allowance, wallet-account/session invalidation, currentSellPrice as net minOut, founder proofs for all 49 leaves, root/member/claimed/deadline guards, funded/unfunded founder exits, complete chunked log windows, range reduction without gaps, refusal of partial totals, minted/burned/reacquired IDs, isMember-before-log-scan behavior, cap reservation, latest-20 ordering, both burn event types, RPC 429 exponential backoff/fallback, SIWE domain/nonce/expiry and missing/malformed invite endpoints.

The browser wallet scenarios are: eligible guest; wrong chain and switch; public holder with an older burned mint and current token #7; funded founder; unfunded founder; mismatching root; expired claim; already claimed; buys paused; sold out including reserved slots. They check the actual rendered controls and encoded approve/sell/sellFounder wallet requests, rejected-signature/write recovery, member-area gating after disconnect, absent-API coming soon without signing, and the mobile connected header.

Successful transaction sequencing is tested through the action port. Browser wallet writes are deliberately rejected by the test double. **No wallet signed a real message or sent a mainnet transaction during validation.** The read-only browser check relayed the requested production RPC URLs to the supplied worker endpoint, as required for this machine. Deterministic fallback testing simulated a 429 from the first provider and verified retry spacing and the next provider's successful answer.

## Rendered layout and access

| Viewport | Document width | Main join action bottom | Axe WCAG A/AA findings |
| --- | --- | --- | --- |
| 390 × 844 | 390px | 663.8px | 0 |
| 375 × 812 | 375px | 728.3px | 0 |
| 320 × 812 | 320px | 773.0px | 0 |
| 768 × 1024 | 768px | 565.2px | 0 |
| 1440 × 1000 | 1440px | 565.5px | 0 |

The first screen at 390px and 375px includes the product description, current quote and primary action. There was no page overflow at any checked width; the activity table intentionally has its own horizontal scrolling region. Increasing the root text size from 16px to 32px at 390px produced a 390px document width. This is **text enlargement**, not native browser 200% zoom.

Keyboard validation entered from the skip link, traversed the header, opened the wallet dialog with Enter, cycled Tab inside it, closed with Escape and checked focus return. The chart range responded to End/Home. The focused close button's visible outline was inspected in the saved image. Reduced-motion mode had a computed transition duration of 0s. Final screenshots were opened and visually inspected:

- [Mobile production page](screenshots/mobile.jpg)
- [Desktop production page](screenshots/desktop.jpg)
- [Keyboard focus in the wallet dialog](screenshots/keyboard-focus.jpg)

## Six-domain Better Interface coverage

| Domain | Coverage and evidence | Explicit limits |
| --- | --- | --- |
| Accessibility | **Checked.** Native links/buttons/range/checkboxes; named landmarks and dialogs; keyboard trap, Escape and return; visible focus; reduced motion; enlarged text; zero axe violations in the listed live and wallet states. | No screen-reader session, physical device or full WCAG conformance assessment. |
| Layout | **Checked.** Five widths, connected mobile header, native dialog scrolling, table reflow, first-screen action measurements and 200% text enlargement. | Native browser zoom, RTL and translations were not tested; only English/LTR is implemented. |
| Writing | **Checked.** Explicit buy/sell/claim labels; exact supplied disclaimer before Buy and in the footer; price/cap/funding/claim warnings; truthful placeholders, coming soon and recoverable error messages. | No independent legal/compliance review of the requester-supplied wording. |
| Typography | **Checked.** Six-size scale, descending hierarchy, tabular amounts, HTML chart labels, complete address in dialog; final mobile/desktop wrapping inspected. | Physical iOS/Android rendering and font substitution on other operating systems remain unverified. No remote font is loaded. |
| Colors | **Checked.** Declared role tokens, actual computed solid-surface contrast pairs, axe contrast checks and final screenshots; focus visibly distinct. | Every gradient pixel and every OS forced-color palette were not separately measured; dark is the sole supported theme. |
| UI | **Checked.** Disconnected/loading/ready/error/empty/rejected/wrong-network/paused/sold-out/claimed/expired/root-mismatch/funded/unfunded states; confirmations and persistent feedback; restrained motion. | No live wallet extension, live signed purchase or deployed Telegram backend. Animation-panel replay at 10% was not performed; there is no staged animation. |

Measured solid-background ratios from the browser:

| Pair | Ratio |
| --- | --- |
| `#b2b2b9` secondary text on `#090b10` page | 9.34:1 |
| `#231a08` primary action text on `#ffd166` | 11.91:1 |
| `#f2f0e9` panel text on `#12151c` | 16.02:1 |

These identified pairs exceed 4.5:1. This table does not claim measurements for arbitrary gradients, disabled controls or untested host color adjustments.

## Findings, fixes and rechecks

Locations refer to the final implementation; each row describes the observed or source-established cause and its correction.

| Severity | Source | Finding and fix | Recheck |
| --- | --- | --- | --- |
| High | `web/src/App.tsx:219`, `web/src/styles.css:1323` | A metric note was a `span` directly inside a definition-list group. Axe reported a serious `definition-list` error. Changed the note to a styled second `dd`. | Zero definition-list findings at all five widths and wallet states. |
| Medium | `web/src/styles.css:148`, `web/src/styles.css:1098` | At 200% text enlargement the header extended to 415px in a 390px viewport. Allowed wrapping. Connected mobile balance/badge also receive their own header row instead of being hidden by a narrow-screen rule. | Document width 390px with enlarged text; connected wallet scenarios fit 390px and show the badge. |
| Medium | `web/src/styles.css:980` | A re-enabled gold button transitioned its background before its dark text was legible; axe captured 1.02:1 during the transition. Removed fill-color transitions; border/press feedback remains. | All ten wallet-state axe checks pass. |
| High | `web/src/App.tsx:47` | Native modal Tab traversal could leave the content for browser chrome at its boundary. Added explicit first/last control cycling while retaining native dialog behavior and inert background. | Six successive Tab checks stay in the modal; Escape and focus return pass; focused screenshot inspected. |
| Medium | `web/src/App.tsx:100`, `web/src/styles.css:1333` | Labels inside the fixed-viewBox chart shrank with the diagram on mobile. Moved endpoints/current-supply labels to ordinary caption-sized HTML. | Final mobile screenshot inspected; chart range and accessible description still pass. |
| High | `web/src/wallet.ts:141`, `web/src/App.tsx:429` | Source review found that provider account/chain checks alone did not invalidate a pending next step after disconnecting this site. Added a captured wallet-session version and rechecked it before signing/submitting. | Dedicated test confirms a still-exposed account cannot continue an invalidated action; full wallet suite re-passes. |

There are no known unresolved required-flow defects from these checks.

## Remaining limits and handoff

- The provided browser connector returned `Transport closed`. Equivalent rendered checks used the installed headless Chromium through Playwright with a foreground preview lifecycle. This is disclosed rather than treating the connector as successfully used.
- The optional ETH estimate remains hidden without a verified pool ID. The `extsload` reader is implemented, but an actual OG/ETH pool conversion was not tested because the identity was not supplied.
- The Telegram backend must be implemented and operated separately under the documented SIWE/on-chain-membership contract. Coming-soon behavior and the mocked successful protocol are tested.
- No real extension/hardware wallet, physical mobile device, native browser zoom, screen reader, published domain or live Telegram invitation was tested. The site was not published by this assignment.
- Latest-block reads and one-confirmation receipts are not finality guarantees. Every full refresh rescans from deployment; archive/provider availability and future scan performance depend on the endpoints.
- The operator should preserve `dist/imd-deployment.json`, the exact lockfile and public runtime assets. The production export contains no worker relay URL, keys, analytics or package caches. `DESIGN.md` records the final source choices, and README records build/publish/backend instructions.

## Final packaging check

The candidate source/export tree contains 250 files and 3,448,390 file bytes before this small report, below the 8,388,608-byte budget. Its gzip tar check was 1,156,892 bytes; the static export is 789,700 bytes. Required outputs, relative entry assets, handoff/source equality, local social-image dimensions, absence of worker relay URLs, unchanged protected baseline paths and absence of submodules/dependency caches were checked. The authoring social SVG stays under `web/design/`; only the required PNG is shipped in `dist/`.

**Git limitation:** `git add` failed with `Unable to create .git/index.lock: Read-only file system`. The assignment prohibits modifying Git metadata and provides no escalation. Therefore these changes could not be staged or committed by this agent. All useful source, lockfile, export and documentation files remain in the repository for the network's normal submission step. [checks/delivery.json](checks/delivery.json) records this explicitly; no commit is claimed.
