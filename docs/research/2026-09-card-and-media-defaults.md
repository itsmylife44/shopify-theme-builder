# Card and media defaults: why they read as generic, and what to change

Date: 2026-09-24, on `main` at `f78c874`. Issue #143, under #131. In the from-scratch test, the product cards were grey rounded panels with the image inset and the name and price below, and the image with text had a rounded grey frame. The maintainer called the result banal. This compares the catalog's card and media defaults with the Theme Store themes measured in [`2026-09-23-shopify-theme-design-inspection.md`](2026-09-23-shopify-theme-design-inspection.md) (summed up in `references/design/directions.md`) and with five premium demo stores measured again for this note.

## Method

- **The catalog**: `snippets/product-card.liquid`, `.product-card` in `assets/critical.css`, the `--card-*` and `--media-*` variables in `snippets/css-variables.liquid`, the Product cards and Media theme settings, and `catalog/sections/image-with-text.liquid`.
- **The test**: the three Directions' presets in the test shop's `config/settings_data.json` (read only).
- **Five demo stores** at 1440×900 with `agent-browser`: Horizon, Atelier and Tinker (Shopify, Horizon family), Prestige (Allure preset) and Impact (Sound preset). On `/collections/all`, the first product card's image, its frame and every ancestor up to the card (`getComputedStyle`: background, radius, padding, border, `object-fit`), the card's text (size, weight, case, tracking, distance below the image) and its badges. On the home page, every image wider than 30% of the viewport outside a product card: its size, its distance from the viewport edges, its radius and its frame. Screenshots are in the session scratchpad, not the repo, as in the 2026-09-23 inspection.

## What the catalog does

| Setting | Default | What it does |
| --- | --- | --- |
| `card_style` | `plain` | `bordered` adds a border and `surface` a fill of 5% of the text color; both pad the card by `--space-sm` (12px) |
| `shape_family` | `soft` | One radius for cards and media: 0 (square), 0.5rem (soft) or 1rem (round). The card and its image each take it |
| `card_anatomy` | `minimal` | Image, title, price. `detailed` adds vendor, badge, rating and swatches in the flow; `editorial` a `text-h4` title |
| `card_hover` | `none` | `second_image` fades in the second image; `zoom` scales the image by 1.05 |
| `card_image_ratio` | `1 / 1` | Also 4 / 5 and 2 / 3 |
| `media_treatment` | `full_bleed` | `framed` sets `object-fit: contain` and a 5% inset |
| `media_tint` | none | A color behind the image, and `mix-blend-mode: multiply` on the image |

The card's title has no size of its own: it takes the body size (16px by default). The price takes the same size in the accent font.

The `--media-*` variables style every image in 19 catalog sections (image with text, editorial split, lookbook, multicolumn, blog posts, image gallery, newsletter, timeline, process steps, the header's menu images and more), not only product images.

The test's three Directions:

| Direction | Cards | Media | Shape |
| --- | --- | --- | --- |
| Forma | detailed, 1 / 1, plain, second image | framed on `#E9E8E5` | square |
| Banco | editorial, 4 / 5, plain, no hover | full-bleed, no tint | square |
| Sera | minimal, 4 / 5, surface, centered, zoom | framed on `#D9D8D5` | round |

The screenshot the maintainer saw is Sera.

## Why it reads as generic

In order of how much each one costs:

1. **Framing applies to every photo.** Sera's `framed` was meant for cut-out product shots, but it also shrank the image with text's lifestyle photo to 90% of its box, inset on grey with 1rem corners: the "rounded grey frame". And any tint multiplies every photo in those 19 sections with it, even under `full_bleed`, so photos go grey. No premium theme measured frames an editorial photo.
2. **A box in a box.** A `surface` card is a light grey panel (5% of the text color) with 12px padding. Inside it the image sits in its own box, with the same 1rem radius and a second, darker grey. Two tints, and two equal radii nested 12px apart, so the corners don't run parallel. `tells.md` names it: "cards inside cards". `bordered` nests the same way inside a line.
3. **Flat card type.** Title and price at the body size, one weight each, differing only by font. In a 4-column grid the card text is as large as the page's running text, and nothing tells the eye what to read first.
4. **Badges in the text.** The detailed card's "Sale" or "Sold out" badge is a line between the image and the vendor. A card with a badge pushes its title down, so titles in a row stop lining up.
5. **No hover by default.** `card_hover: none` is the default, and Banco kept it. `second_image` does nothing for a product with one image. `tells.md` lists "hovers that do nothing".

The shape, the image ratio and the grid gaps are not the problem: they sit inside the premium themes' range.

## What the premium themes do

Product cards (M, measured today):

| Theme | Page | Card box | Image | Title | Price | Text below the image | Badge |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Horizon | white | none | 4:5, `cover`, no radius, no background | 14px, 400 | 12px, 500 | 8px | none in view |
| Atelier | white | none | 4:5, `cover`, on white | 12px uppercase | 12px uppercase | 10px | none in view |
| Tinker | white | beige `#f1ede7`, radius 10px, no padding | 1:1, `cover`, **flush with the card's top and sides** | 14px | 14px | 24px, text inset 24px | yellow pill over the image, top left |
| Prestige | grey `#efefef` | none | 1:1, `contain`, cut-outs on the page grey | 12px uppercase, tracked 0.18em, centered | 12px, centered | 20px | red "Save" label |
| Impact | grey `#f0f0f0` | **white**, radius 6px, no padding | 1:1, `contain`, **flush with the card's top and sides**, top corners 6px | 16px, **700**, rating at the right | 16px, 400 | 26px, text inset 32px | pills over the image, top left ("Sold out" black, "New" purple) |

Hover, from the 2026-09-23 inspection: Horizon scales to 1.03 over 0.25s and shows swatches and quick add; Prestige and Broadcast fade in the second image; Impact zooms over 1.5s on an expo-out. None does nothing.

Editorial images (image with text, splits, collection tiles; M):

| Theme | What the photo does |
| --- | --- |
| Horizon | Hero at 1440px, edge to edge |
| Atelier | Split section: the photo takes the left half of the viewport (720px from x = 0), no radius |
| Tinker | Split section: the photo takes the left half of the viewport, no radius; collection tiles at 10px radius, `cover`, no frame |
| Prestige | Full-width bands, and a contained photo on the page grey, `cover`, no radius, no inset |
| Impact | Radius 12px on block images and 6px on the 3-up images, `cover`, no frame or tint |

What they do differently:

- **The image is the card.** No card box at all (Horizon, Atelier, Prestige), or a box the image fills to its top and sides, with only the text padded (Tinker, Impact). Nobody nests a framed, tinted image inside a padded, tinted panel.
- **A card box contrasts by being the lighter one**: white cards on a grey page (Impact), or one warm brand tint (Tinker), never 5% grey on white holding a second grey.
- **`contain` only for cut-outs**, and then on the page's own color (Prestige) or a white card (Impact). Editorial photos always `cover`, often to the viewport edge.
- **Small card text with a clear order.** 12 to 14px against a 16px body, and title and price told apart by size (Horizon), weight (Impact) or case and tracking (Atelier, Prestige).
- **Badges on the image corner**, as pills or labels, so the text below stays aligned.
- **Every card responds** to the pointer.

## Recommended changes, ranked

Each is a `ready-for-agent` sub-issue of #131.

1. **#144, framing and the tint only for product images.** `contain`, the inset, the tint and the multiply blend apply to product images (cards, product page, featured product, search results, quick add, collection images). Every other image covers its box, unblended. Fixes the grey frame directly, and stops tints greying lifestyle photos. P1.
2. **#145, one field instead of a box in a box.** `bordered` and `surface` cards: the image fills the card's top and sides, the card's radius is the only corner, only the text is padded, and a `surface` card takes the media tint when one is set. P1.
3. **#146, card text with a hierarchy.** A `card_text_style` setting: `quiet` (default: title small, price label size), `caps` (label size, uppercase, tracked) or `bold` (title 700, price muted). P2.
4. **#147, badges over the image corner.** The detailed card's badge moves onto the image's top start corner, still read by screen readers. P2.
5. **#148, hover by default.** `card_hover` defaults to `second_image`, a product with one image zooms instead, and the zoom drops from 1.05 to 1.03. P2.

Considered and left out:

- **The image with text at the viewport edge by default.** Atelier and Tinker do it, but the section already has a `full_bleed` layout that a Direction picks per section. With #144 fixed, the default split is no longer framed.
- **Card grid gaps and image ratios.** 16 to 32px gaps and 1:1, 4:5 and 2:3 cover the measured range (Prestige's 60px gaps are its own airy grammar).
