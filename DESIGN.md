# OG Club design system

## Overview

OG Club is a membership interface for visitors and existing public/founder pass holders. Its dark charcoal surfaces and gold accent extend the OG Swarm map's visual direction. A short product introduction sits beside an actionable membership card on desktop and above it on mobile. Contract facts, risks and the primary action take precedence over decoration.

The source of truth is `web/src/styles.css`, with page composition and components in `web/src/App.tsx`. The implementation is a single fragment-navigated page; there is no page transition, carousel, theme switch or custom icon font. The hero headline has five words. There are no tracked uppercase eyebrow headings.

## Colors

The implemented semantic tokens use sRGB hex values; reuse these variables rather than introducing a second palette.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#090b10` | Page and inset controls |
| `--surface` | `#12151c` | Panels, dialogs and notices |
| `--surface-raised` | `#1b1e25` | Selected segmented control, hover and disabled fills |
| `--text` | `#f2f0e9` | Primary text |
| `--muted` | `#b2b2b9` | Secondary text and captions |
| `--gold` | `#ffd166` | Primary action fill, chart, links and club decoration; matches the Swarm map's gold |
| `--gold-ink` | `#231a08` | Text on gold primary buttons and selection |
| `--border` | `#363943` | Control/panel structure and chart grid |
| `--success` | `#9ed8b5` | Ethereum indicator and Buy event label |
| `--error` | `#ffb4ac` | Errors and consequential sale warnings |
| `--error-surface` | `#281b1e` | Error notices and sale-button hover |
| `--focus` | `#ffe4a4` | Two-pixel keyboard outline with four-pixel offset |

The pass and founder panels use restrained warm gradients (`#222017` / `#211e16` into `--surface`) and `#635334` borders. The risk notice uses `#171710` with a `#3d3927` border. The gold primary hover is `#ffdd8d`. These are surface-specific values, not additional text tokens. Gold decoration never stands alone as an interaction cue: controls have a shape or underline; statuses have text.

Measured rendered pairs: secondary text on the page 9.34:1; primary-button ink on gold 11.91:1; primary text on a normal panel 16.02:1. Measurements and coverage limits are in `docs/VALIDATION.md`. The product intentionally has only the requested dark theme; forced-colors overrides preserve native system focus colors.

## Typography

Six text-size tokens live at the top of `styles.css`:

| Token | Size at the default root | Use |
| --- | --- | --- |
| `--text-sm` | `.875rem` / 14px | UI controls, supporting copy, chart labels and captions |
| `--text-base` | `1rem` / 16px | Body copy, small-screen introduction |
| `--text-lg` | `1.25rem` / 20px | Subheadings, desktop introduction and brand |
| `--text-xl` | `1.5rem` / 24px | Mobile section headings, card headings, dialog headings |
| `--text-display` | `2.25rem` / 36px | Prices, desktop section headings and narrow hero |
| `--text-hero` | `3.75rem` / 60px | Wide-screen hero |

The main stack is `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. No Inter file or remote font is requested: Inter is used only if installed, otherwise the platform supplies the system face. The italic word in the hero uses `Georgia, "Times New Roman", serif`. The decorative pass seal uses Georgia/serif. There are no bundled webfonts.

Body line-height is 1.6; captions are 1.5; short headings are 1.15 (hero 1.08). Heading weights are 500/600; controls use 600; regular copy uses 400. The brand requests 650. Heading tracking ranges from −.02em to −.055em. Long copy remains regular-weight and readable. Headings balance; prose uses pretty wrapping. Prices, counters, timestamps and table values use tabular figures.

Chart axis labels are HTML using the caption token, so their text does not shrink with the SVG. The diagram's accessible name includes its range, current supply and selected price. Wallet addresses are shortened in dense areas, with the complete connected address in its dialog and event addresses linked to their full explorer pages.

## Layout

Spacing follows a four-pixel base with 8/12/16px within groups, 20/24/28/32px panel padding, and 40/48/64/72px between major groups. The header is at most 1280px wide; main content is at most 1200px including its gutters. Both center in the viewport.

- Wide layout: 40px page gutters, a `1.2fr 1fr` hero with a 72px gap, a `1.7fr 1fr` chart/supply grid, three reserve metrics and three member tiles. The founder panel uses `1fr 1.45fr` columns. Major sections begin 64px apart.
- At `68rem`: 24px gutters, smaller hero type and spacing, a simplified brand subtitle and wrapping wallet controls.
- At `50rem`: header section navigation is hidden (all sections remain in normal document flow); the chart/supply section becomes one column. Member and Telegram content can wrap.
- At `38rem`: 16px gutters; hero, founder panel, reserve metrics and member tiles stack. Sections use 44px separation. The connected header gets a second row for OG balance and the membership badge. Its main connect/account button stays at the top.

All content remains in document flow; no sticky toolbar obscures small screens. The activity table alone scrolls horizontally inside a named, keyboard-focusable region. The page itself has no horizontal overflow at tested widths of 320, 375, 390, 768 and 1440px, or with 200% text enlargement at 390px. The main connect-to-join button ends at about y=664px at 390×844 and y=728px at 375×812. These are measured initial visitor states, not a guarantee about every future translation or wallet label.

## Elevation & Depth

Ordinary panels are flat with a one-pixel structural border. The pass card uses `0 16px 48px #0004`; its seal has two subtle inset rings. The selected segment uses `0 1px 3px #0006`. Dialogs use `0 24px 80px #0009` with a `#000b` native backdrop. There is no blur, parallax, image background or autoplay.

## Shapes

Buttons, small notices and the segmented control use 8px corners; the selected segment uses 6px. Ordinary panels and risk notices use 12px; founder panels and dialogs use 16px. The large pass card uses 20px, reduced to 16px on mobile. Badges use 6px; event labels use 4px. The pass seal and Ethereum status marker are circular.

## Components

| Component / source | Intended use and behavior |
| --- | --- |
| `.button`, `.primary`, `.danger`, `.subtle` in `styles.css` | Border-only secondary actions; gold primary purchase/connection; explicit sale warnings; quiet refresh. Main controls have at least 44–46px height. Native disabled state has adjacent explanatory copy. Hover is gated to hover-capable pointers. |
| `Modal` in `App.tsx` | Native `dialog.showModal()` makes background content inert. Close button, Escape, explicit Tab boundary cycling and browser focus restoration keep the flow keyboard-usable. Long review content scrolls within a viewport-bounded dialog. |
| `Curve({ prices, supply })` in `App.tsx` | Contract-read prices, SVG line/fill and a dashed current-supply marker. Native range input with a bound label supports pointer/keyboard exploration. HTML endpoints/current-supply text and a live selected-value output supplement the drawing. Empty reads have explanatory copy. |
| `Metric({ label, value, note })` in `App.tsx` | Definition-list group using a `dt` followed by value/note `dd`s. Supports changing numeric values and truthful unavailable states. |
| `.pass-card`, `.segment`, `.quote` | Fixed membership identity above the Buy/Sell controls. Quote and call-to-action remain central; optional ETH estimates appear only with a verified configured pool and a successful read. |
| `.founder-section`, `.countdown` | Countdown, eligibility, root mismatch, reserve funding and founder exit consequences. Claim actions disappear for ineligible/claimed/member/expired states. The reserve status remains factual. |
| `External` and `Arrow` in `App.tsx` | Consistent descriptive external links with an arrow and screen-reader new-tab note; decorative arrows are hidden from assistive technology. |
| `.notice`, `.error`, `.transaction-status` | Persistent errors with recovery, a stable polite live region for progress, and transaction explorer links. Color always accompanies readable text. |
| `.member-grid`, `.member-locked`, `.telegram-row` | Honest content placeholders, a locked visitor state, and a signature-based invite action. Missing backend becomes coming soon without a signature prompt. |

Transitions are limited to border color and scale at 120ms, and link color at 120ms, only under `prefers-reduced-motion: no-preference`. Press scale is .96. Button fills change immediately to avoid transient contrast failures when a disabled action becomes available. There is no page-load animation. Reduced-motion mode removes these transitions.

## Do's and Don'ts

- Start additional content with `.section` and `.section-heading`; reuse the existing grids and panel padding. Preserve one page `h1` and a descending heading hierarchy.
- Use the gold filled action for the local primary flow; keep supporting links and secondary actions quieter. Repeat the exact consequence in sale confirmations.
- Render unavailable blockchain facts as unavailable, never as fabricated zero values. Preserve the bigint transaction boundary.
- Keep action labels explicit, warnings readable and static content's lack of secrecy visible. Do not imply a price forecast, guaranteed profit or funded reserve without a chain read.
- Use native controls and existing focus, error and motion treatments. Do not reintroduce tiny labels inside a scaled SVG.
- Keep runtime assets local and links relative where they are part of the export. Do not add remote fonts, trackers, fake content or another type/color system.

Design guidance: Better Interface by Jakub Krehel, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT). Documentation method: Impeccable by Paul Bakaus, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). Full notices and licenses are retained in `docs/DESIGN-LICENSE.txt`.
