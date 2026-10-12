# OG Club validation and Better Interface review

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
