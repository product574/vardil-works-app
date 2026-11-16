# Design rules

These rules come from Aodhan's design tips document (November 2026) and apply to every screen
in this repository. Read this file before adding or changing any interface. If a rule and a
quick fix disagree, the rule wins.

The short version: this is a working back office for a construction firm. It should look like
a tool somebody built on purpose, with real content on every screen, and nothing decorative
that a construction manager would not miss if it were gone.

## 1. Never do

| Do not | Do instead |
|---|---|
| Gradients of any kind, gradient text, glowing orbs, glass blur | Flat surfaces and the single accent colour |
| Emojis anywhere, sparkle icons for "AI" | Plain words. An AI draft is labelled "Drafted for you" |
| A second accent colour, rainbow icon tiles | One accent (`--accent`). Green, amber and red are reserved for status |
| Em dashes or en dashes in any text | Commas, colons, full stops, brackets. Ranges use a hyphen (20-30) |
| Filler badges, badges above headings, "New" pills | A badge only when it states a status that changes |
| A label that repeats what the content already says | Delete the label |
| Three identical feature cards in a row, empty tile grids | Tables, lists and grouped rows with real content |
| Italic or coloured single words inside a heading | One weight, one colour per heading |
| Monospace text for decoration | The body font with tabular numbers. Mono is not used in this app |
| The default grey box shadow | The two tinted shadows in `styles.css` (`shadow-pop`, `shadow-dock`), used only on things that float |
| Spinners | Data is local and instant. Only the sign-in button has a busy state. Ask AI, the one thing that waits on a server, says "Reading the records" and then writes its answer in as it arrives |
| Vague buttons ("Submit", "OK", "Continue") | Say what happens: "Approve variation", "Send to site" |
| Raw error text | A plain sentence saying what happened and what to do next |
| An empty first screen | Every screen opens with sample data. Empty states say what to do |
| "It's not X, it's Y" copy, buzzwords | Describe the thing plainly, in a contractor's words |
| Fade-in on scroll, cursor effects, bounce | Motion only in answer to a click (see section 5) |
| Fake testimonials, invented proof | The demo makes no claims. Sample data is clearly a sample company |

## 2. Layout and spacing

- Dense, not airy. Page padding is 20px, table cells 8px by 12px. If a screen needs scrolling to
  show ten rows on a laptop, it has too much padding.
- Group with spacing before reaching for a border or a card. A card is for a thing that can be
  picked up and moved; a section of a page is not a card.
- Spacing comes from the 4px scale only (4, 8, 12, 16, 20, 24, 32). No one-off values.
- One primary (filled) button per view. Everything else is the quiet outline or text style.
- The main thing on a screen is the biggest thing on it. Supporting numbers stay small.
- Nested corners: inner radius = outer radius minus the padding between them. Controls are 6px,
  panels 8px, the department bar 14px with 8px tiles inside 6px padding.
- Headings wrap with `text-wrap: balance`. Align icons and text by eye, not only by box.

## 3. Type and colour

- Barlow for text, Barlow Semi Condensed for headings. No third family.
- Base size 15px. Nothing below 13px, anywhere. Buttons and inputs are at least 36px tall on
  desktop and 44px in the site phone view.
- All sizes are in rem so browser zoom and text scaling work to 200% without clipping.
- Numbers use tabular figures (set globally) and right-align in tables.
- Text contrast: body text is `--ink`, supporting text is `--muted`, and `--faint` is only for
  placeholders. Never lower contrast with opacity.
- Light and dark mode both ship, and every colour comes from a token so neither can drift.
  Any new colour needs a light and a dark value, and both must be checked by eye.

## 4. Icons

- One icon family: Phosphor (`@phosphor-icons/react`), regular weight, 18px in lists, 22px in the
  department bar. The active department uses the fill weight.
- Icons appear where they help someone find a thing (the department bar, file types, status).
  They do not sit beside every label and heading.

## 5. Motion

Motion answers an action and shows what changed. Nothing moves on its own.

- Press: buttons and tiles scale to 0.97 while held (`.press`).
- Menus and popovers: open from 0.95 scale at the trigger in 180ms ease-out, close in 140ms
  (exits are about 20% shorter).
- Dialogs: fade and rise 8px in 200ms ease-out.
- Lists: a new or changed row may flash the accent tint once. Rows do not animate in on load.
- Success: one short pulse on the thing that changed (an approved row, a saved field).
- No bounce, no spring overshoot, no looping animation.
- `prefers-reduced-motion` turns all of it off (handled globally in `styles.css`).

## 6. Forms and behaviour

- Forms ask only for what is needed, with sensible defaults filled in.
- Every form works from the keyboard: Enter submits, Escape closes a dialog, focus is visible.
- Inputs carry the right `autocomplete`, `inputmode` and `type` so phones show the right keyboard
  and password managers work.
- A button that saves ignores a second press while the first is in flight (`useOnce` in `src/ui`).
- In the site phone view, the action bar stays above the on-screen keyboard.
- Preferences (theme, branding, last role) are stored separately from the sample data, so
  resetting the demo or shipping an update never wipes them. See `src/data/store.ts`.

## 7. Where texture is allowed

Flat is right for working screens. The one place with a background treatment is the sign-in
page, which uses a blueprint grid in the accent colour: it belongs to construction drawings,
and it is drawn with CSS, not an image. Do not add textures to working screens.
