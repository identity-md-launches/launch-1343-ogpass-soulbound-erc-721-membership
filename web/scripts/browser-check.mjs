import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = path.resolve(import.meta.dirname, '../../dist');
const docs = path.resolve(import.meta.dirname, '../../docs');
const destination = 'https://og-club-members-only-priced-by-t.sites.imd.fun/';
const refresh = `<meta http-equiv="refresh" content="0; url=${destination}">`;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.equal(html.split(refresh).length, 2);
assert.deepEqual(fs.readdirSync(root), ['index.html']);
fs.mkdirSync(path.join(docs, 'screenshots'), { recursive: true });
fs.mkdirSync(path.join(docs, 'checks'), { recursive: true });
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const name = url.pathname.replace(/^\/preview\//, '') || 'index.html';
  if (!url.pathname.startsWith('/preview/') || name !== 'index.html') {
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(fs.readFileSync(path.join(root, name)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
let browser;
const results = { browser: '', automaticRedirect: [], viewports: [], navigation: [], limitations: [
  'The destination is intercepted locally to test the exact navigation without loading the new site.',
  'Fallback layout and manual-link tests remove only the refresh meta tag from the served response so the page can remain visible.',
  'No native screen-reader, physical-device, native browser zoom, Safari/Firefox or social-crawler session was run.',
] };
const luminance = color => {
  const c = color.match(/[\d.]+/g).slice(0, 3).map(n => Number(n) / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
};
const contrast = (a, b) => {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
};
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.OGCLUB_CHROMIUM || '/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell',
  });
  results.browser = `Chromium ${browser.version()}`;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled });
    const page = await context.newPage();
    const requests = [];
    await context.route('**/*', async route => {
      const request = route.request();
      requests.push({ url: request.url(), type: request.resourceType(), method: request.method() });
      if (request.url() === destination) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Navigation intercepted by test</title>' });
      assert.ok(request.url().startsWith(base), `Unexpected request: ${request.url()}`);
      return route.continue();
    });
    const navigated = page.waitForURL(destination);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await navigated;
    assert.equal(page.url(), destination);
    assert.ok(requests.every(r => r.method === 'GET' && !['script', 'fetch', 'xhr', 'websocket'].includes(r.type)));
    results.automaticRedirect.push({ javaScriptEnabled, destination: page.url(), requests });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const requests = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push(request.url()));
  await context.route('**/*', async route => {
    const request = route.request();
    requests.push({ url: request.url(), type: request.resourceType(), method: request.method() });
    if (request.url() === destination) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Navigation intercepted by test</title>' });
    assert.ok(request.url().startsWith(base), `Unexpected request: ${request.url()}`);
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html.replace(refresh, '') });
    return route.continue();
  });
  await page.goto(base);
  const measure = () => page.evaluate(() => {
    const heading = document.querySelector('h1');
    const action = document.querySelector('a');
    const hs = getComputedStyle(heading);
    const as = getComputedStyle(action);
    return {
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      heading: heading.getBoundingClientRect().toJSON(), action: action.getBoundingClientRect().toJSON(),
      colors: { background: getComputedStyle(document.documentElement).backgroundColor, heading: hs.color, action: as.color, fill: as.backgroundColor, outline: as.outlineColor },
      typography: { heading: hs.fontSize, action: as.fontSize, headingWeight: hs.fontWeight, actionWeight: as.fontWeight },
      motion: { animation: as.animationName, transition: as.transitionDuration },
    };
  });
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const layout = await measure();
    assert.ok(layout.scrollWidth <= width, `Overflow at ${width}`);
    assert.ok(layout.heading.top >= 0 && layout.action.bottom <= height, `Primary content outside first screen at ${width}`);
    assert.ok(layout.action.width >= 44 && layout.action.height >= 44);
    assert.deepEqual(layout.motion, { animation: 'none', transition: '0s' });
    const ratios = { heading: contrast(layout.colors.heading, layout.colors.background), action: contrast(layout.colors.action, layout.colors.fill) };
    assert.ok(ratios.heading >= 4.5 && ratios.action >= 4.5);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations));
    const screenshot = `screenshots/redirect-${width}.png`;
    await page.screenshot({ path: path.join(docs, screenshot), fullPage: true });
    results.viewports.push({ width, height, layout, ratios, axeViolations: [], screenshot });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const link = page.getByRole('link', { name: 'Go to OG Club', exact: true });
  await page.keyboard.press('Tab');
  assert.equal(await link.evaluate(el => el === document.activeElement), true);
  results.focus = await link.evaluate(el => ({ visible: el.matches(':focus-visible'), width: getComputedStyle(el).outlineWidth, offset: getComputedStyle(el).outlineOffset, color: getComputedStyle(el).outlineColor }));
  assert.equal(results.focus.visible, true);
  assert.equal(results.focus.width, '2px');
  results.focus.contrast = contrast(results.focus.color, (await measure()).colors.background);
  assert.ok(results.focus.contrast >= 3);
  await page.screenshot({ path: path.join(docs, 'screenshots/redirect-focus.png') });
  let navigation = page.waitForURL(destination);
  await page.keyboard.press('Enter'); await navigation;
  results.navigation.push({ action: 'Tab then Enter', destination: page.url() });
  await page.goto(base);
  await link.hover();
  const hovered = await measure();
  results.hoverContrast = contrast(hovered.colors.action, hovered.colors.fill);
  assert.ok(results.hoverContrast >= 4.5);
  navigation = page.waitForURL(destination);
  await link.click(); await navigation;
  results.navigation.push({ action: 'Pointer click', destination: page.url() });
  await page.goto(base);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  results.enlargedText = await measure();
  assert.ok(results.enlargedText.scrollWidth <= 390);
  assert.ok(results.enlargedText.action.bottom <= 844);
  await page.screenshot({ path: path.join(docs, 'screenshots/redirect-text-200.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.keyboard.press('Tab');
  results.forcedColors = await measure();
  assert.equal(await link.evaluate(el => el.matches(':focus-visible')), true);
  await page.screenshot({ path: path.join(docs, 'screenshots/redirect-forced-colors.png') });
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  results.accessibilityTree = await page.locator('body').ariaSnapshot();
  assert.ok(requests.every(r => r.method === 'GET' && !['script', 'fetch', 'xhr', 'websocket'].includes(r.type)));
  assert.deepEqual(consoleErrors, []); assert.deepEqual(failedRequests, []);
  results.consoleErrors = consoleErrors; results.failedRequests = failedRequests;
  results.runtimeScriptOrRpcRequests = 0;
  await context.close();
  fs.writeFileSync(path.join(docs, 'checks/redirect-browser.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ automaticRedirect: results.automaticRedirect.length, viewports: results.viewports.length, manualNavigations: results.navigation.length, consoleErrors, failedRequests, runtimeScriptOrRpcRequests: 0, report: 'docs/checks/redirect-browser.json' }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
