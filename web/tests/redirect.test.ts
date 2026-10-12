import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const destination = 'https://og-club-members-only-priced-by-t.sites.imd.fun/';
const root = resolve(import.meta.dirname, '..');

for (const [label, directory] of [['source', root], ['production export', resolve(root, '../dist')]]) {
  describe(label, () => {
    const html = readFileSync(resolve(directory, 'index.html'), 'utf8');
    const document = new DOMParser().parseFromString(html, 'text/html');

    it('redirects immediately to the exact destination and provides the same native fallback link', () => {
      const refresh = document.querySelectorAll('meta[http-equiv="refresh"]');
      expect(refresh).toHaveLength(1);
      expect(refresh[0].getAttribute('content')).toBe(`0; url=${destination}`);
      const links = document.querySelectorAll('a');
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute('href')).toBe(destination);
      expect(links[0].textContent?.trim()).toBe('Go to OG Club');
      expect(links[0].hasAttribute('target')).toBe(false);
      expect(document.querySelector('main > h1')?.textContent).toBe('OG Club has moved');
    });

    it('contains no application, transaction, script or network-loading code', () => {
      expect(document.querySelectorAll('script, iframe, object, embed, form, input, button')).toHaveLength(0);
      for (const element of document.querySelectorAll('*')) {
        expect(element.getAttributeNames().filter(name => /^on/i.test(name))).toEqual([]);
      }
      expect(document.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="modulepreload"]')).toHaveLength(0);
      expect(html).not.toMatch(/javascript:|@import|\bfetch\s*\(|\bethers\b|\bviem\b|\bwallet\b|\bclaim\b|\bsell\b|\bbuy\b|\b0x[0-9a-f]{40}\b/i);
    });

    it('provides accessible document structure without separate metadata assets', () => {
      expect(document.documentElement.lang).toBe('en');
      expect(document.title).toBe('OG Club has moved');
      expect(document.querySelectorAll('h1')).toHaveLength(1);
      expect(document.querySelectorAll('main')).toHaveLength(1);
      expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe('width=device-width, initial-scale=1.0');
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('OG Club has moved');
      expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('OG Club has moved');
      expect(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')).toBe('OG Club');
      expect(document.querySelectorAll('link, meta[property^="og:image"], [src], [srcset]')).toHaveLength(0);
      expect(html).not.toMatch(/url\s*\(/i);
    });
  });
}

it('ships only index.html', () => {
  expect(readdirSync(resolve(root, '../dist'))).toEqual(['index.html']);
});
