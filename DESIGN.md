# OG Club redirect design

## Overview

A single static redirect page for visitors arriving at the old OG Club URL. `web/index.html` is the source of truth for markup, tokens and CSS. It contains one centered heading and one prominent native navigation link. The dark background and warm gold action retain the old site's visual identity. The headline is exactly “OG Club has moved”; the action is “Go to OG Club”. Immediate HTML navigation is the normal state; the visible composition is its fallback.

## Colors

All tokens are defined in `web/index.html:15` and use the existing sRGB hex notation.

| Token | Value | Implemented role |
| --- | --- | --- |
| `--bg` | `#090b10` | Page background |
| `--text` | `#f2f0e9` | Heading |
| `--accent` | `#ffd166` | Primary link fill |
| `--accent-hover` | `#ffdd8d` | Fill on hover-capable pointers |
| `--accent-ink` | `#231a08` | Primary link label |
| `--focus` | `#ffe4a4` | Keyboard focus outline |

Measured from computed browser colors: heading/background 17.26:1; action label/fill 11.91:1; label/hover fill 13.07:1; focus/background 15.83:1. The focus outline is separated from the fill by a 4px background gap. In forced-colors mode the browser supplies the palette, the link gets a `LinkText` border, and its outline uses `Highlight`. The only authored theme is dark; forced colors are a system accessibility mode.

## Typography

`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; no font downloads. Two size tokens: `--text-heading: 2rem` (32px with a 16px root) and `--text-body: 1rem` (16px). Both elements request weight 600 from the system font. Heading line-height is 1.4, tracking −0.02em, with balanced wrapping. The action line-height is 1.5 with normal tracking. Text stays selectable and may wrap; there is no truncation, all-caps label, or fixed text-container height. Font appearance may vary by OS.

## Layout

The body uses a centered grid with `min-block-size: 100vh`, enhanced to `100svh`, and `2rem` vertical / `1.5rem` horizontal padding. Content has `inline-size: 100%` and `max-inline-size: 32rem`. The heading's bottom margin is `1.5rem`; the action uses `0.75rem 1.5rem` padding and a `3rem` minimum block size. At the default root it measures about 161×50px.

No viewport breakpoints are needed. The main column contracts with its container and the heading wraps naturally at 320px. In measured 390×844 fallback rendering, the one-line heading and action are both on the first screen. Checked 320, 390, 768 and 1440px widths without horizontal overflow. At 390px and 200% root text size, the heading and link wrap and remain visible. Text containers can grow and the document can scroll on shorter screens. See the review for the distinction between text enlargement and unperformed native browser zoom.

## Elevation & Depth

A flat page with no panels, shadows, gradients, overlays, or decoration. The action fill establishes its interaction affordance. The border is transparent in the authored theme and becomes visible in forced-colors mode.

## Shapes

The action has a `0.5rem` corner radius and a 1px border. Focus adds a 2px solid outline with 4px offset. No favicon or sharing image is included: the published site is exactly one `index.html`, as explicitly requested.

## Components

| Pattern | Source | Behavior |
| --- | --- | --- |
| Redirect metadata | `web/index.html:13` | Zero-delay refresh to the exact new site URL; no script required |
| Main landmark and heading | `web/index.html:91` | Single semantic `main` and `h1`, centered and responsive |
| Primary navigation link | `web/index.html:57`, `web/index.html:93` | Native anchor styled as a button; same-tab navigation, standard keyboard and modified-click support |
| Focus, hover, press | `web/index.html:73` | Visible keyboard outline; lighter pointer-hover fill; underline while active; instant state changes |

There are no animations, loading/error states, forms, dialogs, application components, or runtime scripts. Tooling under `web/scripts/` and `web/tests/` is only for building/checking and is never copied to `dist/`.

## Do's and Don'ts

Keep the destination identical in the refresh and native link. Reuse the existing tokens when adjusting the fallback. Preserve semantic HTML, wrapping and focus. Keep all runtime markup and styling in `index.html`, with no separate assets. This assignment is a single-page redirect: additional pages or application flows would require a new request.

Guidance adapted from Jakub Krehel's Better Interface at commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT). Documentation method adapted from Paul Bakaus's Impeccable at commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). Existing notices and licenses are retained in `docs/DESIGN-LICENSE.txt`.
