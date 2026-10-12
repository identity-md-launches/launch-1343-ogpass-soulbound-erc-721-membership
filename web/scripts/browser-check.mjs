import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const root = path.resolve("../dist");
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  if (!pathname.startsWith("/preview/")) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const file = path.resolve(
    root,
    pathname.slice("/preview/".length) || "index.html",
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const bytes = fs.readFileSync(file);
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
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({
  executablePath:
    process.env.OGCLUB_CHROMIUM ||
    "/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
const failures = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) =>
  failures.push({ url: r.url(), error: r.failure() }),
);
try {
  await page.route(
    /https:\/\/(mainnet.gateway.tenderly.co|rpc.mevblocker.io|eth.drpc.org)\/?/,
    async (route) => {
      try {
        const response = await fetch("http://127.0.0.1:42601/rpc/1", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: route.request().postData(),
        });
        await route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: await response.text(),
        });
      } catch (e) {
        await route.abort();
      }
    },
  );
  await page.goto(base);
  await page
    .getByText("State at block", { exact: false })
    .waitFor({ timeout: 30000 });
  await page
    .getByText("Explore pass", { exact: false })
    .waitFor({ timeout: 30000 });
  fs.mkdirSync("../docs/screenshots", { recursive: true });
  const results = [];
  for (const [width, height] of [
    [390, 844],
    [375, 812],
    [320, 812],
    [768, 1024],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heading: document.querySelector("h1")?.getBoundingClientRect().toJSON(),
      primary: document
        .querySelector(".pass-card .primary")
        ?.getBoundingClientRect()
        .toJSON(),
    }));
    assert.ok(
      layout.scrollWidth <= width,
      `Overflow at ${width}: ${layout.scrollWidth}`,
    );
    if (width === 390 || width === 375)
      assert.ok(
        layout.primary.bottom <= height,
        `Primary action below first screen at ${width}`,
      );
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    results.push({
      width,
      height,
      layout,
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `../docs/screenshots/${width === 390 ? "mobile" : "desktop"}.jpg`,
        fullPage: true,
        type: "jpeg",
        quality: 80,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByText("State at block", { exact: false }).waitFor();
  await page.keyboard.press("Tab");
  assert.ok(
    await page
      .locator(".skip-link")
      .evaluate((el) => document.activeElement === el),
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.ok(
    await page
      .locator(".wallet-button")
      .evaluate((el) => document.activeElement === el),
  );
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.screenshot({
    path: "../docs/screenshots/keyboard-focus.jpg",
    type: "jpeg",
    quality: 80,
  });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    assert.ok(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.contains(document.activeElement)),
      "Modal traps keyboard focus",
    );
  }
  await page.keyboard.press("Escape");
  assert.ok(
    await page
      .locator(".wallet-button")
      .evaluate((el) => document.activeElement === el),
    "Keyboard-opened dialog returns focus",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Connect wallet to join" }).click();
  await page.getByRole("dialog").waitFor();
  assert.ok(await page.getByText("No injected wallet found.").isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  const focusReturned = await page
    .getByRole("button", { name: "Connect wallet to join" })
    .evaluate((el) => document.activeElement === el);
  assert.ok(focusReturned, "Dialog focus returned to trigger");
  await page.getByRole("button", { name: "Sell a pass", exact: true }).click();
  assert.ok(
    await page
      .getByRole("button", { name: "Connect wallet to view your pass" })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Buy a pass", exact: true }).click();
  const range = page.getByRole("slider", { name: "Explore pass" });
  await range.focus();
  await page.keyboard.press("End");
  assert.equal(await range.inputValue(), await range.getAttribute("max"));
  await page.keyboard.press("Home");
  assert.equal(await range.inputValue(), "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".wallet-button")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  const enlarged = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(enlarged.scrollWidth <= 390, "200% text enlargement overflow");
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  const colors = await page.evaluate(() => {
    const lum = (rgb) => {
      const a = rgb
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((n) => {
          const v = n / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    };
    return [".hero-description", ".button.primary", ".caption", ".panel"].map(
      (selector) => {
        const el = document.querySelector(selector);
        const style = getComputedStyle(el);
        let bg = style.backgroundColor;
        let parent = el;
        while (bg === "rgba(0, 0, 0, 0)" && parent.parentElement) {
          parent = parent.parentElement;
          bg = getComputedStyle(parent).backgroundColor;
        }
        const a = lum(style.color),
          b = lum(bg);
        return {
          selector,
          foreground: style.color,
          background: bg,
          contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      },
    );
  });
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto(base + "social-card.png");
  assert.deepEqual(
    await page
      .locator("img")
      .evaluate((el) => [el.naturalWidth, el.naturalHeight]),
    [1200, 630],
  );
  const report = {
    checkedAt: new Date().toISOString(),
    preview: "Production dist served under /preview/",
    rpc: "Read-only requests relayed to worker RPC. No wallet writes.",
    results,
    keyboard:
      "Tab order, native modal focus trap, Escape and focus return, range keyboard controls; focused dialog screenshot inspected.",
    focusReturned,
    enlarged,
    colors,
    errors,
    failures,
  };
  fs.writeFileSync(
    "../artifacts/browser-check.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  assert.equal(errors.length, 0, "Page JavaScript errors");
  assert.equal(failures.length, 0, "Failed requests");
  assert.equal(
    results.flatMap((r) => r.violations).length,
    0,
    "Accessibility violations",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
