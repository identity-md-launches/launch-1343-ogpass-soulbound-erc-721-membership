# OG Club · ogclub.online

A static Vite, React and TypeScript site using viem for the deployed Ethereum OGPass. The production website is in **`dist/`**; frontend source, a package manifest and the exact npm lockfile are in **`web/`**. The existing contracts and Foundry configuration are unchanged. Nothing was deployed or published by this task. The network submission step stages and commits the deliverable; this revision does not modify Git metadata.

## Install, preview, rebuild and publish

Use Node 22.12+ and npm 10+:

```sh
cd web
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

Vite prints the preview URL. `npm run dev` serves the source during development. The build writes the repository-root `dist/`, including the ABI handoff, local favicon, social image and runtime configuration. `base: './'`, relative application assets and fragment navigation make the export work at a static gateway subpath without server rewrites. The Open Graph image uses the canonical `https://ogclub.online/social-card.png` URL for social crawlers; the same image is included in the export.

Publish the **contents of `dist/`** to the configured static host/IPFS publisher after review. Keep all its files together and point ogclub.online at that export. Do not publish `web/`, source dependencies or build caches. No backend is needed for the membership interface. No publishing command was run here. The network publisher handles hosting after submission.

The production build requires no network once dependencies are installed. `npm ci --offline` also works when npm's cache already contains the lockfile's packages; a clean installation otherwise needs registry access. No npm registry, archive or dependency directory is shipped. The `uuid` override pins its patched 11.1.1 release for OpenZeppelin's transitive dependency. All founder proof checks still pass.

## Deployment and data integrity

| Item | Value |
| --- | --- |
| Chain | Ethereum mainnet, chain ID 1 |
| OGPass | `0xca9dc9064ffc695d979ea7da9a35130376bb3217` |
| OG payment token | `0xce7eb1ad9e2e1c784ea05f7ea4a0fe625923d10a`, 18 decimals |
| First scanned block | `26171777` |
| Source commit | `4527ed978e9f295e70dfc044f180f1aa23e96852` |
| Canonical ABI keccak | `211817dd318c091b7a4dbb938fec0c9367e3c0529bae286e042c4ee6f7bc1767` |
| Observed deployed runtime keccak | `0901651cd27b1cf9ed973827dff02506558c4febbeacc2358c735947f09a51e6` |

`web/public/imd-deployment.json`, copied verbatim to `dist/imd-deployment.json` by Vite, preserves the pinned handoff and adds the ABI derived from `src/OGPass.sol`, the observed deployed runtime hash and the PoolManager address from the network handoff. The application fetches this file rather than duplicating the pass address or ABI in its code. The OG address comes from its constructor arguments.

With the repository's existing Foundry installation, run `cd web && npm run verify:handoff`. It derives the ABI with `forge inspect OGPass abi --json`, recursively sorts object keys while retaining array order, hashes the canonical JSON with Keccak-256 and compares it with the supplied `abiHash`. The browser performs the ABI check too. It verifies Ethereum chain ID, runtime code hash, `OG()` and token decimals before enabling transactions. The runtime hash pins code observed at the supplied deployment; it is not a new independent audit of that code.

Contract reads use the requested public RPCs in order: Tenderly mainnet gateway, MEV Blocker and dRPC. viem batches up to 40 calls, retries rate limits/5xx twice with exponential backoff starting at one second and honors numeric `Retry-After`, then falls back to the next provider. Each request has a 12-second timeout. State reads use a single block number; visible data refreshes every 30 seconds. Read errors or data older than 90 seconds disable transactions.

**Every complete history and membership scan begins at block 26171777.** Log requests use non-overlapping 5,000-block chunks, shrink on range rejection, and fail the whole result if the full window cannot be read. No partial burn total is shown. Each refresh recomputes the full history, so recent reorganizations do not leave stale cached events. This can become slower as the contract ages. The activity list includes the last 20 `Buy`/`Sell` events; total burns include `Sell.burned` and `ReserveBurned.amount`.

## Membership interactions

- **Wallet:** EIP-6963 injected-wallet discovery with a legacy injected fallback. No account access before a visitor chooses a wallet. Account/network changes invalidate the current review; disconnecting the site invalidates any pending next step even if the extension still exposes the same account. The header shows the short address, OG balance and FOUNDER/PUBLIC badge; the wallet dialog exposes the full address.
- **Membership discovery:** `isMember(address)` is checked first. Mint `Transfer` logs to that address are compared with burn logs, and the remaining token is checked with `ownerOf` and `isFounder`. No enumerable extension or token-ID guess is used.
- **Buy:** review the full disclaimer and quote, approve **exactly** that OG amount, wait for the approval receipt, verify the allowance and quote again, then simulate and submit `buy(quote, now + 600 seconds)`. Price changes require a new quote, acknowledgement and exact approval. No unlimited approval is requested. A completed approval can remain after cancellation or failure; use the wallet's allowance controls to revoke it if desired. New buys are disabled for members, paused buys, wrong network, unverified/stale state or a full cap.
- **Cap:** `publicSupply + founderOutstanding + reservedFounderSlots() >= MAX_SUPPLY` is sold out. Reserved founder slots are included before the deadline.
- **Public sell:** `currentSellPrice()` is already the **net 92.5% payout**. The interface shows that amount and the separate 7.5% burn; it calls `sell(tokenId, payout, now + 600 seconds)` after confirmation. It never deducts the fee twice.
- **Founder claim:** all 49 supplied address bytes are preserved in `web/src/founders.ts`; case is normalized for matching. `StandardMerkleTree.of(addresses.map(a => [a]), ['address'])` reproduces the on-chain root. A mismatch hides Claim and displays an error. Claimed wallets, existing members, non-founders and expired claims cannot claim through the interface.
- **Founder sale:** `sellFounder(tokenId)` pays the fixed 100,000 OG from the separately funded reserve. Its button stays disabled below the required reserve. The reserve is always read on chain; it is never assumed funded. Both the sell card and confirmation show this fixed payout and explicitly state **“you lose membership and can never claim again.”** The public curve section retains the public sell quote.
- **Member area:** Alpha, Launch digests and Tools are honest placeholders. The Swarm map is linked and Auction tools has a clearly marked placeholder. **Static content is not secret.** Client-side membership checks control presentation; anyone can fetch site files. Do not put confidential content in the export.

All amounts submitted to contracts remain bigint values. Number conversion is limited to chart coordinates and display formatting. Wallet transactions are simulated before submission and their receipts checked; no private keys are used. One confirmation is displayed as confirmed, not finalized.

## Optional OG/ETH estimate

`web/public/site-config.json` is public runtime configuration. `ogEthPool` is `null` because the handoff does not supply a verified OG/native-ETH pool identity. Accordingly **ETH estimates are hidden**, as permitted by the brief; no price or pool ID is invented.

If the operator later verifies that pool, set `ogEthPool` to an object containing its actual `id` (bytes32), `currency0` and `currency1` addresses. One currency must be the OG address and the other native ETH's legitimate zero-address currency identifier; both have 18 decimals. This is not a WETH pool adapter. The site reads PoolManager `extsload(keccak256(abi.encode(poolId, uint256(6))))`, extracts the low 160-bit `sqrtPriceX96`, and orients the spot ratio into ETH per OG. Uninitialized pools, invalid pairs or unavailable reads hide the estimate. The estimate is a spot conversion, not an executable swap quote or a prediction. Storage layout follows [Uniswap's StateLibrary](https://github.com/Uniswap/v4-core/blob/main/src/libraries/StateLibrary.sol).

## Telegram backend contract

The configurable public `telegramEndpoint` defaults to `/api/tg-invite`; use an HTTPS URL for a separately hosted backend, or `null` to leave invites unavailable. Never put bot tokens, RPC credentials or other secrets in this configuration. Rebuild after changing `web/public/site-config.json`; the publisher may instead replace the identical public JSON in its export.

The frontend performs this handshake on the visitor's explicit action:

1. `GET <endpoint>?action=nonce` (or append `&action=nonce` if there is already a query). Return JSON `{ "nonce": "server-generated-alphanumeric-nonce" }`. Use at least 128 bits of cryptographic entropy, 8–128 alphanumeric characters, five-minute validity, and bind it to a server-side challenge/session. The browser includes credentials and bypasses cache.
2. The wallet signs an [EIP-4361 SIWE message](https://eips.ethereum.org/EIPS/eip-4361) with domain `ogclub.online`, URI `https://ogclub.online`, chain ID 1, the connected account, the server nonce, issue time and an expiration exactly five minutes later. Signing is not a transaction.
3. `POST <endpoint>` with JSON **`{ "message": "...", "signature": "0x..." }`**. The backend must parse SIWE, verify the signature (including ERC-1271 if supporting contract wallets), exact domain/URI/chain, freshness and expiry, and atomically consume the issued nonce. Check the session/origin and prevent replay. A client-supplied nonce alone is not sufficient.
4. After signature verification, read `isMember(address)` on Ethereum from the deployed OGPass. Reject non-members even if an earlier request or the page claimed membership. Do not trust a client token ID or badge.
5. A backend-only Telegram bot, with invite permissions, calls [`createChatInviteLink`](https://core.telegram.org/bots/api#createchatinvitelink) with `member_limit=1` and a short `expire_date`. Return JSON `{ "inviteUrl": "https://t.me/+actualInviteCode" }`. Issue one invite per successful challenge and rate-limit retries. The browser accepts only HTTPS `t.me/+...` or `t.me/joinchat/...` invitation URLs and presents a user-operated link.

The returned invite remains usable across immediate, manual and 30-second same-account refreshes. Changing or disconnecting the wallet, or a confirmed loss of membership, clears it. A late response from an earlier wallet session is discarded. The invite is held only in page memory.

Keep the bot token and chat ID only on the backend. For cross-origin hosting, configure an explicit allowed origin and credentialed CORS/session behavior; do not use `*` with credentials. Do not treat the user's signature as approval to transact. Missing endpoints (404/405/501/503 or a static HTML fallback) display **coming soon** and never request a signature. Other errors offer retry. No Telegram backend or bot credentials were supplied or implemented in this static-site assignment.

## Checks and limitations

The revision reproduced and fixed all six reported findings. `npm run typecheck`, `npm test` (**47 tests**) and `npm run build` passed. The production export passed five viewport checks and **11 wallet scenarios**, including successful Telegram link retention/opening and funded/unfunded founder quotes. Zero axe violations were reported in the checked states. See the current revision section in `docs/VALIDATION.md` for the exact commands, evidence and limits.

Actual commands, six-domain design review, findings, viewport measurements and evidence are recorded in [docs/VALIDATION.md](docs/VALIDATION.md). [DESIGN.md](DESIGN.md) documents the final tokens and components. The original contract documentation is preserved in [docs/CONTRACT.md](docs/CONTRACT.md).

Additional checks (from `web/`):

```sh
npm run verify:handoff
OGCLUB_RPC=http://127.0.0.1:35547/rpc/1 node scripts/browser-check.mjs
node scripts/wallet-check.mjs
node scripts/live-check.mjs
npm audit --omit=dev
```

The browser scripts use the contributor machine's installed headless Chromium; set `OGCLUB_CHROMIUM` or adapt the executable path on another machine. They manage their preview and browser inside one bounded command and close both. `browser-check.mjs` serves the real `dist/` at `/preview/` and relays reads to `OGCLUB_RPC` (use the endpoint supplied for your run); `wallet-check.mjs` uses entirely synthetic test RPC and wallet responses, rejecting writes. `live-check.mjs` uses the read-only relay `http://127.0.0.1:42601/rpc/1`, which is local to this worker. This relay is absent from the production export. These scripts do not broadcast transactions. The browser wallet suite returns a synthetic signature only for its successful Telegram scenario; its invite destination is intercepted locally.

The built-in browser connector returned `Transport closed`, so rendered validation used the installed Playwright/Chromium directly. No physical phone, real extension wallet, hardware wallet, live signed transaction, deployed Telegram bot, native browser zoom or screen-reader session was tested. Public production endpoint availability can change; local live checks used the mandated relay. These limitations do not imply those checks passed. The production build warns that its main JavaScript chunk exceeds 500 kB before compression (about 206 kB gzip); the complete export remains small enough for the submission budget.

No analytics, trackers, remote fonts or embedded third-party media are included. Ordinary RPC providers can see the reads sent to them. The only optional API request is the Telegram flow. Better Interface and Impeccable design-reference attributions and licenses are retained in [docs/DESIGN-LICENSE.txt](docs/DESIGN-LICENSE.txt).

## Required membership disclaimer

OG Club passes are non-transferable membership passes that give access to a community, content and tools only. They are not an investment, and there is no promise of profit or of any price. The buy-back price follows a fixed public formula and can go down; 7.5% of every sale is burned. Julio Bravo is the largest OG holder and the contract owner. Smart contracts can have bugs; only use OG you can afford to lose. Not available where prohibited.
