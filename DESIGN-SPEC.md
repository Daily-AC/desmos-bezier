# Visual design spec — opencode.ai DNA (terminal/manpage aesthetic)

Reference system: opencode.ai (full DESIGN.md at
`~/.claude/skills/design-dna/library/awesome-design-md/design-md/opencode.ai/DESIGN.md`).
Read it if you need detail; the distilled rules for THIS page are below. The "Don't" rules at the end are hard constraints.

## Core identity

The page reads like a manpage/terminal tool, not a marketing site. One font family, monospaced, everywhere — every label, button, stat, slider caption, footer line.

- Font: single monospace stack for ALL text: `"Berkeley Mono", "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. No sans-serif anywhere. Weights 400/500/700 only. No italics.
- Canvas: warm cream `#fdfcfc` as the ONLY page background. No gray section bands, no gradients, no shadows anywhere.
- Ink: `#201d1d` for headings/labels/primary text; `#424245` body; `#646262` muted metadata (stats line); `#9a9898` disabled.
- Hairline borders: `1px solid rgba(15,0,0,0.12)` — the only separator vocabulary. Stronger divider `#646262` where needed (e.g. active tab underline).
- Radius: `4px` on every interactive element (buttons, inputs, slider thumbs OK), `0px` on every container/panel.

## Page layout

- Top toolbar (~56px, cream bg, 1px hairline bottom rule): wordmark left, controls center/right.
- Wordmark: "DESMOS BEZIER" (or "BEZIER") rendered as a block-pixel grid using inline SVG `<rect>` cells (square cells + gap — do NOT build it from █ characters; monospace char cells aren't square and it comes out squashed). Small, ~20px tall, fill `#201d1d`. Alternatively 700-weight mono text is acceptable if SVG pixel wordmark is too much — but SVG rect grid preferred, it's the brand's signature move.
- Controls in toolbar: file button = primary button style (bg `#201d1d`, text `#fdfcfc`, 4px radius, padding 4px 20px, ~36px tall, weight 500). "Render" same primary style. Sliders labeled in 14px mono `#646262` with the live value shown as text, e.g. `threshold [80]`, `tolerance [2.0]`, `max curves [3000]`.
- Stats line: caption style, 14px, `#646262`, with ASCII bracket markers as the only iconography:
  `[+] 4821 edge px   [+] 132 paths   [+] 641 curves   [t] 843ms` — brackets are text, not icons. On cap hit: `[!] capped at 3000` in `#ff9f0a`.
- Drag-and-drop hint / empty state: centered text block with `[+] drop an image anywhere` style ASCII marker, body color.
- Main area: the Desmos calculator, full remaining viewport, separated from the toolbar by the hairline rule only. The calculator's own chrome stays as-is (it's the "in-product" surface).
- Canvas preview (fallback/preview): if shown as a small panel, hairline border, 0px radius, cream bg, caption beneath in the style of the reference's chart tiles: `Fig 1. fitted curves` in 14px `#646262`.
- Error/notice (Desmos failed to load): plain text block prefixed `[x]` in `#ff3b30`, no toast/card chrome.

## Accent discipline

Chrome stays monochrome (ink on cream). The semantic ramp — accent `#007aff`, danger `#ff3b30`, warning `#ff9f0a`, success `#30d158` — is allowed ONLY for in-tool states: rendered curve color (Desmos default blue is fine and harmonizes), progress/success indicators, warnings, errors. Never on the toolbar buttons.

## Don't (hard constraints from the reference system)

- No sans-serif or display font anywhere. One mono family carries everything.
- No drop shadows, no gradients, no atmospheric backgrounds. Flat on cream.
- No SVG/emoji icons — ASCII brackets `[+] [-] [x] [!]` are the icon set.
- No rounded containers; 4px only on interactive elements.
- No gray/dark section bands on the page body; cream is the only background. (A dark surface is allowed for at most ONE mockup-like element if ever needed — not needed here.)
- Don't pad blocks generously — list/stat rows sit at 8px vertical; keep the toolbar dense and tool-like.
