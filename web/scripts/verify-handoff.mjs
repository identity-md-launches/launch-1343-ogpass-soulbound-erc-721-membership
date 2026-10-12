// Retain the frozen package manifest's command alias, now checking the redirect export.
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const destination = 'https://og-club-members-only-priced-by-t.sites.imd.fun/';
assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=${destination}">`));
assert.ok(html.includes(`<a href="${destination}">Go to OG Club</a>`));
assert.ok(!/<script\b|\bon\w+\s*=|javascript:/i.test(html));
assert.deepEqual(readdirSync(root).sort(), ['favicon.svg', 'index.html', 'social-card.png']);
console.log('Redirect export verified: exact destination, native link, no scripts, no legacy assets.');
