# Proposal: Design Directions instead of stock sections

Date: 2026-09-23. Status: **proposal, waiting for the maintainer's decision**. It builds on four research docs from the same day:

- [`shopify-theme-design-inspection`](2026-09-23-shopify-theme-design-inspection.md): 15 top Theme Store themes measured, desktop and mobile, 8 archetypes.
- [`anti-slop-design-method`](2026-09-23-anti-slop-design-method.md): the tells of generic AI design, and how other skills avoid them.
- [`ecommerce-ux-rules`](2026-09-23-ecommerce-ux-rules.md): about 150 evidence-graded UX rules by page.
- [`theme-styles-and-presets`](2026-09-23-theme-styles-and-presets.md): how Horizon and premium themes expose styles and presets.

## The problem

Every Theme looks like the same stock theme with other colors. Three findings say why.

1. **We only have cosmetic levers.** The Brand is color schemes, two fonts, a logo, page width and one input radius. Type scale, spacing, button shape, card style, image ratios, header layout and motion are hardcoded in every section:
   - `padding-block: 3rem` appears 20 times.
   - There are about 14 separate button copies and 4 copies of the product card.
   - There is no type scale, no shadows, no transitions.
   - The hero has one layout.

   Shopify's Theme Store says color and typography swaps are "insufficient" to make a theme distinct.
2. **The agent falls into the category default.** In the 2026-09-23 dogfood, "an elegant olive-oil shop" became cream, a Cormorant serif and a gold accent. Anthropic's own 2026 design guidance now lists exactly that combination as an AI tell. The skill asks for one "style" adjective and nothing that would push the agent away from the average.
3. **A fixed ban list only moves the default.** Anthropic's 2025 skill banned the obvious tells, and its favourite replacements became the next tells. A lookup database (tested: `ui-ux-pro-max`) returns the category average.

## What the best themes do

Measured across 15 themes:

- **A style is settings plus a home template, not new code.** Prestige's 5 styles share the same code and differ in 24 of 79 CSS values. Horizon's family (Horizon, Tinker, Atelier, Dwell…) is Horizon's code with different settings and templates.
- **What differs between styles:**
  - the font pairing and heading weight
  - heading case and tracking
  - the display-to-body ratio (4× to 13.5×)
  - one shape family (square, soft or pill) used everywhere
  - palette strategy
  - section spacing (80–105px desktop, halved on mobile)
  - card anatomy and hover
  - image treatment (cut-out on a tinted page, or full-bleed lifestyle)
  - a motion character
  - 2–3 signature sections
- **Horizon's model:**
  - a small palette;
  - 4 font roles;
  - 7 type presets that blocks pick from instead of raw sizes;
  - radius and border per component family;
  - a few global choices;
  - layout variety through section and block settings.

  Dawn's ~100 per-component shadow settings were dropped, and no style depended on them.

## The proposal in one paragraph

Add a **Direction**: the design decisions that sit on top of the Brand. It covers the type system, shape, spacing, imagery, motion, layout variants and signature sections. A Direction is recorded in two forms:

- as the Theme's own settings, a Shopify preset of about 30 values plus a home template, so the Merchant keeps editing it in the Theme Editor;
- as a short written contract, `DIRECTION.md` in the Theme, that says why each choice was made.

The agent never picks from a menu of skins. From a real brand brief it writes three different Directions. The Creator previews each one live in the Studio and picks one. A review gate then checks the result for slop and against a UX quality floor before hand-off.

## Four layers

### Layer 0: the quality floor (every Direction, never optional)

These are the grade-A and required rules from the UX research, built into the catalog sections and checked by tests where they can be:

- **Loading and layout stability:**
  - the LCP image is an `<img>` with `fetchpriority="high"` and is never lazy-loaded;
  - every image has a ratio box;
  - grids hold mixed image ratios.
- **Product page:**
  - shipping and returns summary next to the buy button;
  - thumbnails on the mobile gallery;
  - description in vertical accordions, never tabs;
  - options as buttons, not drop-downs.
- **Collection and cart:**
  - "Load more" in pages of 15–30 on mobile;
  - filter chips;
  - full costs in the cart.
- **Accessibility:** menus work by keyboard with a hover delay; touch targets at least 24px (44px for primary controls); text measure about 70ch; contrast 4.5:1 and 3:1.

### Layer 1: the style system (global settings, Horizon's model, our own code)

First, a refactor: shared component CSS in `critical.css` for the button, product card, section heading and text styles. Every section uses it, so no raw sizes are left in sections. Then these settings, each a CSS variable in `css-variables.liquid`:

| Group | Settings |
| --- | --- |
| Palette | The color schemes, plus an accent and a border color |
| Fonts | Heading, body, accent (labels, prices) |
| Type | Scale ratio (1.2 to 1.6), body size (14–18px), display size, heading weight, heading case (none or uppercase), heading tracking (tight, normal, wide) |
| Shape | One family: square, soft (small radius) or round (pill buttons, larger card and media radius); border width |
| Buttons | Filled or outline primary, case, weight |
| Spacing | Density: compact, normal or airy (section spacing about 48, 80 or 112px on desktop, halved on mobile); page width |
| Cards | Image ratio (1:1, 4:5, 2:3), style (plain, bordered, on a surface), text alignment, hover (none, second image, zoom) |
| Media | Treatment: full-bleed or framed; page tint behind cut-out product photos |
| Motion | None, subtle (0.25s fades) or expressive (1s rises, slow image zoom), always off under reduced motion |
| Header | Logo left or centered, sticky or not, logo height |

### Layer 2: layout variants per section

Each variant is a section setting or preset, not a new file:

- **Hero:** height (small to full), content position (9 spots), bare text, boxed text or split with the image.
- **Header:** 3 layouts.
- **Product card:** 3 anatomies (minimal, detailed with vendor and swatches, editorial with a large title).
- **Product page:** gallery as stacked, thumbnails or carousel, and the order of the product info.
- **Collection grid:** density and columns.

### Layer 3: signature sections

New catalog sections that carry a Direction's character, with 2–3 chosen per Direction:

- oversized type banner
- editorial split with a long text column
- scrolling text or badge marquee
- spec or material tiles
- lookbook with product hotspots
- story timeline
- ingredient or process steps with real imagery
- comparison table
- press quotes wall

## The workflow in the skill

This replaces SKILL.md's single "style" question.

1. **Brief.** The agent gathers:
   - the brand's world (what it makes, where, for whom);
   - the scene the shopper is in;
   - three emotions;
   - two or three references from *outside* the category;
   - what the brand rejects;
   - what the product photos really are (cut-outs or lifestyle, how many, what quality).
2. **Three Directions.** The agent writes three Direction cards. Each card has:
   - a name and a one-sentence thesis;
   - the type system with a reason for each font;
   - the color strategy (restrained, committed, full or drenched) with 4–6 named hex values;
   - shape, density, card and media choices;
   - a motion character;
   - an ASCII sketch of the home page;
   - one signature element;
   - what it rejects.

   The three must differ on at least three axes. Each passes the **swap test**: put another shop's name on it, and it must stop working. Each is checked against the tell list. The 8 archetypes from the inspection are *grammars to reason from*, never presets to copy.
3. **Preview and pick.**
   - The Studio gets a Directions tab. The three Directions are written as up to three Shopify presets in `settings_data.json`, each with its home template in `listings/<preset>/`.
   - The Creator switches between them and the preview updates.
   - The Creator picks one and can tune any setting.
   - Shopify's native preset mechanism means the Merchant can later switch in the Theme Editor too.
4. **Apply.** The chosen Direction becomes the current preset. The contract goes to `<theme>/DIRECTION.md`: the thesis, each rule as a do/don't pair, and the reasons. Later work, by the agent or a freelancer, follows it.
5. **Review gate.**
   - A checker script counts: repeated section types, eyebrow labels, CTA labels per intent, banned copy words ("elevate", "curated", "seamless" …), fonts without a written reason, one radius family used, contrast and image ratio consistency.
   - The agent then screenshots home, product and collection at 1440 and 390 and reviews them against the contract.
   - The result is PASS or HOLD, with at most one fix round and one confirming round.

## Skills to create

- **In the product skill** (what Creators install), following progressive disclosure so SKILL.md stays short:
  - `references/design/brief.md`: the questions and how to read a brand's world.
  - `references/design/directions.md`: the method, the axes, the 8 archetype grammars with their measured values, the swap test.
  - `references/design/tells.md`: the slop tells, described as patterns rather than a ban list, and refreshed from the research.
  - `references/design/quality-floor.md`: the Layer 0 rules condensed.
  - `references/design/review.md`: the gate, the screenshots, the checker.
  - `scripts/check-direction.mjs`: the checker.
- **In the repo** (for contributors): extend the `theme-tooling` conventions with "no raw design values in sections; use the style system's variables", enforced by a test that greps catalog stylesheets for raw `rem`, `px` and `clamp` sizes outside an allowed list.

## Order and size

| Phase | What | Size |
| --- | --- | --- |
| 1 | Refactor: shared buttons, product card snippet, headings, text styles; variables for the repeated values | L (2–3 days) |
| 2 | Layer 1 settings and Studio controls for them | L |
| 3 | Layer 0 gaps in the existing sections (accordions, mobile thumbnails, shipping note, load more, filter chips) | M each |
| 4 | Direction workflow: brief, three cards, presets plus `listings/`, Studio Directions tab, `DIRECTION.md`, review gate and checker | L |
| 5 | Layer 2 variants (hero, header, card, product page) | M each |
| 6 | Layer 3 signature sections | S–M each |

Phase 1 comes first: without it every new setting has to be wired into 14 button copies and 4 card copies.

## Decisions for the maintainer

1. **The name.** "Direction" (proposed); CONTEXT.md forbids "design tokens" and "style guide" for the Brand. The alternative is "Style", which is Shopify's word for presets but clashes with the Brand's "overall style".
2. **How many Directions to show.** Three (proposed), or two.
3. **Diversity.** Should the agent vary its choices deliberately between Creators, for example by never reusing the last Direction's font pairing? This needs a memory outside the Theme.
4. **The number of settings.** About 30 global settings (Horizon has more). Too many clutters the Theme Editor; too few brings back the cosmetic-swap problem.
5. **Scope of the first release.** Phases 1, 2 and 4 make Directions real. Phases 3, 5 and 6 can follow.
