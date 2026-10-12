// The wallet and RPC in this file are test doubles. No transaction or signature leaves this process.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeEventTopics,
  erc20Abi,
  keccak256,
  parseAbiItem,
  toHex,
  zeroAddress,
} from "viem";
const deployment = JSON.parse(
  fs.readFileSync("public/imd-deployment.json", "utf8"),
);
const pass = deployment.contracts[0],
  abi = pass.abi,
  og = deployment.manifest.contracts[0].constructorArgs[0];
const address = "0x23ad4067af541ee28c7f5c69eff348139beb7bd8";
const transfer = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);
const root = path.resolve("../dist");
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (!pathname.startsWith("/preview/")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const file = path.resolve(root, pathname.slice(9) || "index.html");
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    res.writeHead(200, {
      "Content-Type":
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".svg": "image/svg+xml",
          ".png": "image/png",
        }[path.extname(file)] || "application/octet-stream",
    });
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath:
    process.env.OGCLUB_CHROMIUM ||
    "/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox"],
  headless: true,
});
const results = [];
const pageErrors = [];
async function scenario(kind, check) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  if (kind === "telegram") await page.clock.install();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const block = 26174760n,
    stamp = BigInt(Math.floor(Date.now() / 1000));
  const member = ["public", "founder", "unfunded", "claimed", "telegram"].includes(kind),
    founder = ["founder", "unfunded", "claimed"].includes(kind);
  const state = {
    currentBuyPrice: 1010000n * 10n ** 18n,
    currentSellPrice: 925000n * 10n ** 18n,
    publicSupply: kind === "soldout" ? 951n : 1n,
    founderClaimed: founder ? 1n : 0n,
    founderOutstanding: founder ? 1n : 0n,
    reservedFounderSlots: kind === "soldout" ? 49n : founder ? 48n : 49n,
    curveReserve: 1000000n * 10n ** 18n,
    founderReserve: kind === "unfunded" ? 0n : 4900000n * 10n ** 18n,
    MAX_SUPPLY: 1000n,
    FOUNDER_BUYBACK: 100000n * 10n ** 18n,
    founderCount: 49n,
    founderRoot:
      kind === "badroot"
        ? `0x${"ab".repeat(32)}`
        : deployment.manifest.contracts[0].constructorArgs[1],
    claimDeadline: kind === "expired" ? stamp - 1n : stamp + 86400n,
    buysPaused: kind === "paused",
    OG: og,
    isMember: member,
    hasClaimedFounder: kind === "claimed",
    isFounder: founder,
    ownerOf: address,
    balanceOf: 2000000n * 10n ** 18n,
    decimals: 18,
    approve: true,
    buy: 8n,
    claimFounder: 8n,
    sell: 925000n * 10n ** 18n,
    sellFounder: 100000n * 10n ** 18n,
    allowance: 0n,
  };
  const requests = [];
  await page.route("**/imd-deployment.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...deployment,
        contracts: [{ ...pass, runtimeCodeHash: keccak256("0x6000") }],
      }),
    }),
  );
  await page.route(
    /https:\/\/(mainnet.gateway.tenderly.co|rpc.mevblocker.io|eth.drpc.org)\/?/,
    async (route) => {
      const input = JSON.parse(route.request().postData());
      const respond = (q) => {
        requests.push(q);
        let result;
        if (q.method === "eth_chainId") result = "0x1";
        else if (q.method === "eth_getCode") result = "0x6000";
        else if (q.method === "eth_blockNumber") result = toHex(block);
        else if (q.method === "eth_getBlockByNumber")
          result = {
            number: toHex(block),
            hash: `0x${"aa".repeat(32)}`,
            parentHash: `0x${"bb".repeat(32)}`,
            nonce: "0x0000000000000000",
            sha3Uncles: `0x${"cc".repeat(32)}`,
            logsBloom: `0x${"00".repeat(256)}`,
            transactionsRoot: `0x${"dd".repeat(32)}`,
            stateRoot: `0x${"ee".repeat(32)}`,
            receiptsRoot: `0x${"ff".repeat(32)}`,
            miner: address,
            difficulty: "0x0",
            totalDifficulty: "0x0",
            extraData: "0x",
            size: "0x0",
            gasLimit: "0x1c9c380",
            gasUsed: "0x0",
            timestamp: toHex(stamp),
            transactions: [],
            uncles: [],
            baseFeePerGas: "0x1",
          };
        else if (q.method === "eth_call") {
          const a =
            q.params[0].to.toLowerCase() === og.toLowerCase() ? erc20Abi : abi;
          const decoded = decodeFunctionData({
            abi: a,
            data: q.params[0].data,
          });
          const value =
            decoded.functionName === "priceOf"
              ? (1000000n + 10000n * (decoded.args[0] - 1n)) * 10n ** 18n
              : state[decoded.functionName];
          result = encodeFunctionResult({
            abi: a,
            functionName: decoded.functionName,
            result: value,
          });
        } else if (q.method === "eth_getLogs") {
          assert.ok(
            BigInt(q.params[0].fromBlock) >= 26171777n,
            "No scans before deployment",
          );
          const filter = q.params[0];
          const isTransfer =
            filter.topics[0] ===
            encodeEventTopics({ abi: [transfer], eventName: "Transfer" })[0];
          const mint =
            isTransfer &&
            filter.topics[1]?.toLowerCase() === `0x${"0".repeat(64)}`;
          const make = (id, burn) => ({
            address: pass.address,
            topics: encodeEventTopics({
              abi: [transfer],
              eventName: "Transfer",
              args: {
                from: burn ? address : zeroAddress,
                to: burn ? zeroAddress : address,
                tokenId: id,
              },
            }),
            data: "0x",
            blockNumber: toHex(26171778n),
            blockHash: `0x${"aa".repeat(32)}`,
            transactionHash: `0x${"12".repeat(32)}`,
            transactionIndex: "0x0",
            logIndex: toHex(id),
            removed: false,
          });
          result =
            isTransfer && member
              ? mint
                ? [make(1n, false), make(7n, false)]
                : [make(1n, true)]
              : [];
        } else throw new Error(`Unhandled mock RPC ${q.method}`);
        return { jsonrpc: "2.0", id: q.id, result };
      };
      try {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(
            Array.isArray(input) ? input.map(respond) : respond(input),
          ),
        });
      } catch (e) {
        console.error(e);
        await route.abort();
      }
    },
  );
  await page.addInitScript(
    ({ address, wrong, telegram }) => {
      const events = new Map();
      let account = address,
        chain = wrong ? "0xa" : "0x1";
      window.__walletRequests = [];
      const provider = {
        request: async ({ method, params }) => {
          window.__walletRequests.push({ method, params });
          if (method === "eth_accounts" || method === "eth_requestAccounts")
            return account ? [account] : [];
          if (method === "eth_chainId") return chain;
          if (method === "wallet_switchEthereumChain") {
            chain = "0x1";
            events.get("chainChanged")?.forEach((fn) => fn(chain));
            return null;
          }
          if (method === "personal_sign" && telegram)
            return `0x${"11".repeat(65)}`;
          if (method === "eth_sendTransaction" || method === "personal_sign")
            throw { code: 4001, message: "User rejected the request." };
          throw new Error(`Unhandled wallet ${method}`);
        },
        on: (name, fn) => {
          if (!events.has(name)) events.set(name, new Set());
          events.get(name).add(fn);
        },
        removeListener: (name, fn) => events.get(name)?.delete(fn),
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "test-wallet",
                name: "Test wallet",
                rdns: "test.ogclub",
              },
              provider,
            },
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      window.__changeAccount = () => {
        account = undefined;
        events.get("accountsChanged")?.forEach((fn) => fn([]));
      };
    },
    { address, wrong: kind === "wrong", telegram: kind === "telegram" },
  );
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/preview/`);
    await page.getByText("State at block", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Connect wallet to join" }).click();
    await page.getByRole("button", { name: "Test wallet" }).click();
    await page.locator(".wallet-balance").waitFor();
    const connectedWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    assert.ok(connectedWidth <= 390, "Connected header fits mobile");
    await check(page, state, requests);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.equal(
      axe.violations.length,
      0,
      `${kind} accessibility: ${JSON.stringify(axe.violations.map((v) => ({ id: v.id, target: v.nodes.map((n) => n.target), nodes: v.nodes.map((n) => n.failureSummary) })))}`,
    );
    const walletRequests = await page.evaluate(() => window.__walletRequests);
    results.push({
      scenario: kind,
      passed: true,
      rpcRequests: requests.length,
      walletMethods: walletRequests.map((q) => q.method),
      accessibilityViolations: axe.violations.length,
    });
  } finally {
    await context.close();
  }
}
try {
  await scenario("guest", async (page) => {
    await page
      .getByRole("button", { name: "Review membership purchase" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByText("Julio Bravo is the largest OG holder", { exact: false })
      .waitFor();
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Approve exact OG & buy" })
      .click();
    await dialog
      .getByText("Request declined in your wallet.", { exact: false })
      .waitFor();
    const requests = await page.evaluate(() => window.__walletRequests);
    const tx = requests.find((q) => q.method === "eth_sendTransaction")
      .params[0];
    const d = decodeFunctionData({ abi: erc20Abi, data: tx.data });
    assert.equal(d.functionName, "approve");
    assert.equal(d.args[0].toLowerCase(), pass.address.toLowerCase());
    assert.equal(d.args[1], 1010000n * 10n ** 18n);
    assert.equal(
      requests.filter((q) => q.method === "eth_sendTransaction").length,
      1,
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Claim founder pass", exact: true })
      .click();
    await page
      .getByText("Request declined in your wallet.", { exact: false })
      .waitFor();
  });
  await scenario("wrong", async (page) => {
    assert.ok(
      await page
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .first()
        .isVisible(),
    );
    assert.ok(
      await page
        .getByRole("button", { name: "Claim founder pass", exact: true })
        .isDisabled(),
    );
    await page
      .getByRole("button", { name: "Switch to Ethereum", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Review membership purchase" })
      .waitFor();
  });
  await scenario("public", async (page) => {
    assert.ok(
      await page.locator(".wallet-balance").getByText("PUBLIC").isVisible(),
    );
    assert.ok(
      await page
        .getByRole("heading", { name: "Alpha", exact: true })
        .isVisible(),
    );
    await page
      .getByRole("button", { name: "Sell a pass", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review sale", exact: true })
      .click();
    assert.ok(
      await page
        .getByRole("dialog")
        .getByText("Burned: 75,000 OG", { exact: false })
        .isVisible(),
    );
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Sell pass & end membership" })
      .click();
    await page
      .getByRole("dialog")
      .getByText("Request declined in your wallet.", { exact: false })
      .waitFor();
    const r = await page.evaluate(() => window.__walletRequests);
    const data = decodeFunctionData({
      abi,
      data: r.find((q) => q.method === "eth_sendTransaction").params[0].data,
    });
    assert.equal(data.functionName, "sell");
    assert.equal(data.args[0], 7n);
    assert.equal(data.args[1], 925000n * 10n ** 18n);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Join the members’ Telegram" })
      .click();
    await page
      .getByRole("button", { name: "Telegram · coming soon" })
      .waitFor();
    assert.equal(
      (await page.evaluate(() => window.__walletRequests)).filter(
        (r) => r.method === "personal_sign",
      ).length,
      0,
    );
    await page.evaluate(() => window.__changeAccount());
    await page
      .getByRole("button", { name: "Connect wallet to view your pass" })
      .waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "Alpha", exact: true }).count(),
      0,
    );
  });
  await scenario("founder", async (page) => {
    assert.ok(
      await page.locator(".wallet-balance").getByText("FOUNDER").isVisible(),
    );
    await page.getByRole("button", { name: "Sell a pass", exact: true }).click();
    const card = page.locator(".pass-card");
    assert.equal(await card.locator(".quote-value").innerText(), "100,000 OG");
    assert.ok(await card.getByText("Fixed founder buyback", { exact: true }).isVisible());
    assert.ok(await card.getByText("You lose membership and can never claim again.", { exact: true }).isVisible());
    assert.equal(await card.getByText("Public sale:", { exact: false }).count(), 0);
    assert.ok(await page.locator("#curve").getByText("925,000 OG", { exact: true }).isVisible());
    fs.mkdirSync("../docs/screenshots", { recursive: true });
    await card.screenshot({ path: "../docs/screenshots/founder-sell.jpg", type: "jpeg", quality: 80 });
    await card
      .getByRole("button", { name: "Review founder buyback", exact: true })
      .click();
    assert.ok(await page.getByRole("dialog").getByText("100,000 OG", { exact: true }).isVisible());
    assert.ok(
      await page
        .getByRole("dialog")
        .getByText("You lose membership and can never claim again.", {
          exact: false,
        })
        .isVisible(),
    );
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Sell founder pass permanently" })
      .click();
    await page
      .getByRole("dialog")
      .getByText("Request declined in your wallet.", { exact: false })
      .waitFor();
    const r = await page.evaluate(() => window.__walletRequests);
    const data = decodeFunctionData({
      abi,
      data: r.find((q) => q.method === "eth_sendTransaction").params[0].data,
    });
    assert.equal(data.functionName, "sellFounder");
    assert.deepEqual(data.args, [7n]);
  });
  await scenario("unfunded", async (page) => {
    await page.getByRole("button", { name: "Sell a pass", exact: true }).click();
    assert.equal(await page.locator(".pass-card .quote-value").innerText(), "100,000 OG");
    assert.ok(
      await page.locator(".pass-card")
        .getByRole("button", {
          name: "Buyback reserve not funded yet",
          exact: true,
        })
        .isDisabled(),
    );
  });
  await scenario("telegram", async (page, _state, rpcRequests) => {
    const inviteUrl = "https://t.me/+reviewSuccess123";
    const requests = [];
    await page.route("**/api/tg-invite**", (route) => {
      const request = route.request();
      requests.push({ method: request.method(), body: request.method() === "POST" ? request.postDataJSON() : null });
      return route.fulfill({ json: request.method() === "GET"
        ? { nonce: "0123456789abcdef0123456789abcdef" }
        : { inviteUrl } });
    });
    await page.getByRole("button", { name: "Join the members’ Telegram" }).click();
    await page.getByText("Your single-use Telegram invite is ready.", { exact: true }).waitFor();
    // Let run()'s immediate snapshot and membership refresh complete.
    await page.waitForTimeout(1000);
    const invite = page.getByRole("link", { name: "Open your single-use Telegram invite" });
    assert.ok(await invite.isVisible(), "Invite survives the action refresh");
    assert.equal(await invite.getAttribute("href"), inviteUrl);
    const snapshots = () => rpcRequests.filter((q) => q.method === "eth_getBlockByNumber").length;
    const beforeManual = snapshots();
    await page.getByRole("button", { name: "Refresh data", exact: true }).click();
    await page.waitForTimeout(1000);
    assert.ok(snapshots() > beforeManual, "Manual refresh read a new snapshot");
    assert.ok(await invite.isVisible(), "Invite survives a manual refresh");
    const beforePeriodic = snapshots();
    await page.clock.fastForward(30000);
    await page.waitForTimeout(1000);
    assert.ok(snapshots() > beforePeriodic, "The 30-second timer read a new snapshot");
    assert.ok(await invite.isVisible(), "Invite survives the periodic refresh");
    fs.mkdirSync("../docs/screenshots", { recursive: true });
    await page.locator(".telegram-row").screenshot({ path: "../docs/screenshots/telegram-invite.jpg", type: "jpeg", quality: 80 });
    assert.deepEqual(requests.map((q) => q.method), ["GET", "POST"]);
    assert.match(requests[1].body.message, /^ogclub.online wants you to sign in/);
    assert.equal(requests[1].body.signature, `0x${"11".repeat(65)}`);
    // Exercise the usable link without visiting Telegram or using a real invite.
    await page.context().route("https://t.me/**", (route) => route.fulfill({ contentType: "text/html", body: "Local invitation test" }));
    const popupPromise = page.waitForEvent("popup");
    await invite.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), inviteUrl);
    await popup.close();
    await page.evaluate(() => window.__changeAccount());
    await page.getByRole("heading", { name: "A pass opens the door." }).waitFor();
    assert.equal(await invite.count(), 0, "Disconnect clears the invite");
  });
  await scenario("badroot", async (page) => {
    assert.ok(
      await page
        .getByText("Founder list mismatch:", { exact: false })
        .isVisible(),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Claim founder pass", exact: true })
        .count(),
      0,
    );
  });
  await scenario("expired", async (page) => {
    assert.ok(
      await page.getByText("Claims closed", { exact: true }).isVisible(),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Claim founder pass", exact: true })
        .count(),
      0,
    );
  });
  await scenario("claimed", async (page) => {
    assert.ok(
      await page
        .getByText("This wallet has already claimed.", { exact: false })
        .isVisible(),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Claim founder pass", exact: true })
        .count(),
      0,
    );
  });
  await scenario("paused", async (page) => {
    assert.ok(
      await page
        .getByRole("button", { name: "New buys are paused" })
        .isDisabled(),
    );
  });
  await scenario("soldout", async (page) => {
    assert.ok(
      await page.getByRole("button", { name: "Sold out" }).isDisabled(),
    );
  });
  assert.equal(pageErrors.length, 0, JSON.stringify(pageErrors));
  const report = {
    checkedAt: new Date().toISOString(),
    mode: "Deterministic test doubles for RPC and EIP-6963 wallet. Wallet rejects every write. No live signatures or transactions.",
    results,
    pageErrors,
  };
  fs.writeFileSync(
    "../artifacts/wallet-check.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
