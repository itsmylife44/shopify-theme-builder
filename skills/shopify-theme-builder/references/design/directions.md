# Three Directions

A **Direction** is the design on top of the Brand: type system, color strategy, shape, spacing, cards, media, motion, the home page's composition and one signature element. You write three from the brief (`brief.md`), all three different, each one a Theme the shop could really ship. The Creator previews them live in the Studio and picks one.

Never pick from a menu of looks. The archetypes at the end are grammars to reason from, measured on top Theme Store themes; copied, they give the category average this method exists to avoid.

## The axes

A Direction decides each axis below. Three Directions must **differ on at least three axes**, and differ in kind, not by one step: square against round, airy against compact, a type-led home against a photo-led one, never 56px against 60px.

| Axis | What it decides | Where it's written |
| --- | --- | --- |
| Type | Heading, body and accent fonts; body size; scale ratio; display size; heading weight, case, tracking and line height | `headingFont`, `bodyFont`, `accentFont` in `PUT /api/brand`; `type_body_size` (14–18), `type_scale_ratio` (120–160), `type_display_size` (40–120), `type_display_size_mobile` (24–72, the display size on a 390px phone, growing to `type_display_size` at 1200px: pick one at which the longest word of a display heading fits a 358px line), `type_heading_weight`, `type_heading_case`, `type_heading_tracking` (tighter −0.04em, tight −0.02em, normal, wide 0.06em, wider 0.12em), `type_heading_line_height` (display and headings: tight 1.0 and 1.1, normal 1.1 and 1.2, loose 1.2 and 1.3) |
| Color | A strategy (below) and the color schemes that carry it | `colorSchemes` in `PUT /api/brand` |
| Shape | One family for buttons, inputs, cards, media and badges; border width; buttons | `shape_family` (square, soft, round), `border_width`, `button_primary_style`, `button_text_case` (uppercase buttons are tracked 0.06em), `button_font_weight` |
| Spacing | Section rhythm and container | `density` (compact, normal, airy: about 48, 80 or 112px between sections on desktop, halved on mobile), `page_width` |
| Cards | Product card anatomy (every anatomy shows Sold out, a sale's saving and crossed-out price, and "From" when prices vary; the anatomy only changes the look) | `card_anatomy` (minimal, detailed, editorial), `card_image_ratio` (1 / 1, 4 / 5, 2 / 3), `card_style` (plain, bordered, surface), `card_text_alignment`, `card_text_style` (quiet, caps, bold), `card_hover` (none, second_image, zoom) |
| Media | How product images sit on the page (other photos always fill their box) | `media_treatment` (full_bleed, or framed: contained on a tint, for cut-outs), `media_tint`; both apply to product and collection images only. Images multiply only with a light tint (brightness over 150), so a cut-out's white takes it; on a dark tint its white box shows, so a dark theme frames on a light tint or uses `full_bleed`. Every section with images has an `image_ratio` (`card`, the default, follows `card_image_ratio`; `portrait` 4 / 5, `square`, `landscape` 4 / 3, `natural`): keep a page to two ratios at most, so leave it on `card` and give one section at most a ratio of its own |
| Motion | A character, not decoration | `motion` (none; subtle: 0.2s hovers and 0.6s fades; expressive: 0.25s hovers, 0.8s rises, and the hero and slides slowly zooming to 1.06 over 8s). Sections enter with a hard deceleration and the items of a card grid follow each other by 60ms. Each section's `reveal` decides whether it fades in on scroll: on for image-led sections, off for type-led ones, so the page doesn't fade every band alike. Always off under reduced motion. The three Directions don't all use `subtle`: at least one uses `expressive` when its thesis allows |
| Composition | The home page: 6 to 8 sections, which ones, in what order, on which color schemes, and how the hero sits | The Direction's `template`; a `hero` or `slideshow` takes a `height` (small, medium, large, full_screen), and the hero or each slide a `content_position` (`top_left` to `bottom_right`) and `content_style` (bare text over the media with an `overlay_opacity`, boxed, or split beside the media) |
| Footer | How the footer closes every page, matched to the thesis: a type-led Direction can end on its wordmark, a quiet one on one row, one that sells by letter on the newsletter band | The footer's `layout`, set once a Direction is chosen (SKILL.md step 4.6): `columns` (the default, each column sized to its content), `wordmark` (the shop's name or logo large across the bottom), `split_menus` (brand and newsletter on one side, menus on the other), `menu_grid` (the same, menus 2 × 2), `newsletter_band` (the signup across the full width on `newsletter_color_scheme`, like `scheme-3`), `top_bar` (the name and social links above a line), `one_row` or `centered` (for a shop with little to say) |
| Signature | The one memorable element; everything around it stays quiet | A section in the `template`, like `type-banner`, `editorial-split`, `marquee`, `spec-tiles`, `lookbook`, `timeline`, `process-steps` or `comparison-table` |

`GET /api/theme` lists every style setting under `style` with its options and range. What the brief pins (colors, fonts) is the same in all three Directions; they differ on the other axes.

**Color strategies.** Pick one before any color:

- **Restrained**: neutrals and one accent, used rarely.
- **Committed**: one saturated color owns 30–60% of the surface, whole sections of it.
- **Full**: three or four named colors, each with its own job.
- **Drenched**: the page is the color.

Give each color a name and a job ("press-cloth linen: page background"), 4 to 6 in all, and map them onto schemes: `scheme-1` the main one, `scheme-2` its inverse, `scheme-3` the accent's section. A Committed or Full Direction puts at least one section of its home on `scheme-3`: that's the region the color owns. Contrast stays at 4.5:1 for text and 3:1 for borders in every Direction. Choose light or dark from the shopper's scene, never from the category.

**Type.** Pick the typefaces first; they carry the most character. Each font needs a reason from the brief that no other face in `<skill-dir>/studio/server/shopify-fonts.json` meets: "books earn a serif" or "tech earns a mono" is not a reason. The file's `families` is a list of `{ "family": "Archivo", "handles": ["archivo_n4", …] }`; `node -e "console.log(require('<skill-dir>/studio/server/shopify-fonts.json').families.map(f => f.family).join(', '))"` prints the family names. Build a real scale: premium themes pair a small body (14px) with a display 4 to 10 times larger; a flat scale (about 2×) reads as a catalog. Tracking follows weight and case: wide for light uppercase, tight for bold or large.

**Movement.** Each Direction's home has at least one section that moves, on a phone too, and it fits the thesis: a marquee of grove names, a carousel of models, a slideshow of harvests. Calm can be slow movement; it doesn't mean still. What the catalog offers:

- `slideshow`, its slides changing on their own with `autoplay`, or swiped
- `marquee`, a strip of short texts or badges (`item_style` text or badge) scrolling at a `speed`
- `testimonials` with the `carousel` layout
- `collection-list` with the `carousel` layout
- `motion: expressive`, rises on the sections that reveal and a slow zoom on the hero and slides

`card_hover` (the second image or a zoom on hover) doesn't count: phones can't hover. `subtle` motion doesn't count either.

**Selling from the top.** Shoppers tell what a shop sells from the top of its home, so a featured collection, a collection list or a featured product is among its first three sections. The hero's content sits where the sketch puts it, never `middle_center` (the hero preset's, the centered hero of `tells.md`), and the section that opens a page carries its one h1 and loads its image first: a hero, slideshow, type banner, image with text, editorial split, lookbook or collection list does so only as the first section, so a home can open on any of them.

**Size and rhythm.** A home has 6 to 8 sections, and alternates dense and airy (each section's `spacing`: `none` for a zero-gap gallery, `tight`, `theme` or `loose`, around the Theme's density), image-led and type-led, so it never reads as a stack of equal bands. Never put two type-only sections next to each other, or three bands of the same height and density in a row. Without the brief's photos, the product and collection images (a featured collection, a collection list with images) are the image-led sections.

**Asking for the next step.** When the home or a page ends on one ask (shop the new season, book a fitting, read the story), close it with a `call-to-action` rather than bending rich text or a small hero into one: a heading, a text and one or two buttons (`button_label_2`, the secondary one). Its `layout` picks the shape: `centered` (the default; its preset puts it on `scheme-2`, and a Committed or Full Direction on `scheme-3`, the accent's band), `split` (an image beside the text, image-led), `over_image` (the text over an image with an `overlay_opacity`, image-led, a banner, not a second hero), or `inline` (the heading on one side, the buttons on the other, a slim band with `spacing: tight`). One per page, after the sections that earn the ask; centered and inline are type-only sections.

**The people behind it.** When the brief sells the people who make the products (makers, a workshop, a founder), show them with a `team` section rather than an image with text per person: a heading, a text and a `person` block each (portrait, `name`, `role`, an optional `bio` line and a `link` on the name). Its `layout` picks the shape: `photo_cards` (the default: portrait photos three across in the `image_ratio`, image-led, for a few people with good photos), `round_portraits` (small portraits four across, centered, for a larger team), `inline_list` (a small portrait beside each name, three columns, a quiet band for a crew or credits) or `cards` (each person on a card with a small portrait). The small portraits take the badge shape, round with the rounded shape family. It goes on the home or an about page, once, after the products have made their case.

**Buying stays conventional.** Navigation, the product form, cart and checkout keep what shoppers expect in every Direction. The Direction speaks through type, color fields, imagery, composition and rhythm.

## The method

1. **Derive.** From the brief, list the seven things of the brand's world and name the category default and its predictable opposite (`brief.md`). Build each Direction from a different one of the seven things or references, so the three start apart.
2. **Draft three cards**, each the `## <Direction name>` part of `direction-template.md`: a thesis naming the default it refuses, one line per axis with its reason, a home sketch of 6 to 8 sections with its moving element, one signature element, what it rejects. The name is one or two words from the brand's world ("Press Cloth", "Harvest Date"), never a style word like "Minimal" or "Luxe".
3. **Check each card**, then revise the part that fails and say what you changed:
   - **The swap test.** Put another shop's name on it, a shop in the same category. If it still works, it isn't this shop's Direction yet: find the part that is generic and derive it again.
   - **The default test.** Work through a similar brief in your head. Where you land on the same choice, it is the default: keep it only with a reason from this brief.
   - **The tells.** Read `tells.md` against every line.
   - **Three axes.** Compare the three cards axis by axis; at least three axes differ in kind. The checker's `distinct` finding (`review.md`) compares the written presets the same way.
   - **Movement and rhythm.** Each home sketch has a moving section (or `motion: expressive`), no two type-only sections next to each other and no three bands alike in a row; not all three Directions use `subtle` motion.
4. **Write them** through the Studio (step 4 of SKILL.md), one at a time: `PUT /api/brand` with the Direction's colors and fonts, then `PUT /api/directions/<name>` with its style settings and home template. Write the brief and the three cards to `<theme>/DIRECTION.md`, in the order the Studio lists the Directions. Then `PUT /api/directions/current` to show the first.
5. **Hand the choice to the Creator** in the Studio's Directions tab. Explain each in one line (its thesis), and let them switch and choose. Don't choose for them. When they want a mix ("the type of one, the colors of another"), rewrite a Direction with the mix and check it again.
6. **Write the rules** of the chosen Direction (below).

A home sketch, for "Harvest Date", a Direction built on the olive harvest's calendar; its motion is `expressive`, slow rises for a slow craft. Each band says whether it's image-led or type-led, dense or airy, what moves, and its `spacing` (`none`, `tight`, `theme` or `loose`, the section's setting):

```text
+----------------------------------------------------------------+
| slideshow, full screen, autoplay: three harvests, heading      |
| bottom left              image-led, airy, moves, theme         |
+----------------------------------------------------------------+
| marquee, text, slow: grove names and press dates               |
|                          type-led, dense, moves, tight         |
+----------------------------------------------------------------+
| featured collection: four bottles on the press-cloth tint,     |
| second image on hover    image-led, dense, responds, theme     |
+----------------------------------------------------------------+
| timeline: from the grove to the bottle in four dates           |
|                          type-led, airy, loose                 |
+----------------------------------------------------------------+
| editorial split: the press, the photo on the left              |
|                          image-led, airy, loose                |
+----------------------------------------------------------------+
| testimonials, carousel: three chefs on the new oil             |
|                          type-led, dense, moves, tight         |
+----------------------------------------------------------------+
| newsletter, split: the harvest letter beside the grove at dusk |
|                          image-led, airy, theme                |
+----------------------------------------------------------------+
```

Choose a product row's `products_to_show` to fit both layouts: on desktop, a multiple of its `columns` (3 in 3 columns, 4 or 8 in 4), so the last row is never short; on mobile, the featured collection and related products swipe as one row, each card three quarters of the screen wide with the next one peeking in, so any count fits there.

## Writing the rules

Once `directions` in `GET /api/theme` shows one `chosen`, add `### Rules` under its part of `DIRECTION.md`: 5 to 10 do/don't pairs, each with its reason, as the template shows. A rule is a directive another agent or a freelancer can follow without asking you, and the reason lets them judge a case the rule doesn't name.

- Do: set headings in `bodoni_moda_n4` at weight 400 and tight tracking. Don't: bold them or set them in uppercase. Because: the harvest labels print the grove's name thin and tall.
- Do: put color on whole sections, the olive green on at most one section per page. Don't: color single words, icons or borders. Because: the Direction is Committed, and scattered accents make it Restrained again.
- Do: let one marquee of grove names and press dates scroll slowly under the hero. Don't: add a second strip or speed it up. Because: the harvest moves at its own pace, and one slow line says so.
- Do: show products framed on the press-cloth tint. Don't: use lifestyle photos in product cards. Because: the photos are cut-outs, and the tint keeps them from floating on white.

Keep the other two cards in `DIRECTION.md`: their presets stay in the Theme, and the Merchant can switch to them in the Theme Editor. When the Creator tunes the chosen Direction in the Style tab, update its card lines so the file matches the Theme.

## Archetype grammars

Measured on 15 Theme Store themes (desktop at 1440px unless marked). The fonts are what those themes use, not picks: several are on the tell list. Take a grammar's logic, never its values wholesale.

Their type values in the Type settings: display at line height 1.0 (Editorial Serif, Bold Showcase) is `type_heading_line_height` tight, the rest normal; tracking 0 is `type_heading_tracking` normal, −0.025em (Bold Showcase) tight, −0.04em and −0.05em (Maison Luxe's ultra-light, Technical Sport) tighter, and +0.18em caps (Maison Luxe) wider, the nearest.

1. **Quiet Minimal** (Dawn, Horizon, Fabric, Impulse). One neo-grotesk, headings 400–700, sentence case, tracking 0; body 14–16px, line height 1.5–1.8; display 48–72px. White, text black at 76–81%, black buttons, no accent (Restrained). Radius 0–2px, or 14px on controls. 4:5 cards in 4–5 columns with 16px gaps; sections 48–80px apart. Hover scale 1.03 over 0.25s. Signature: none, which is why it reads as a template without one.
2. **Editorial Serif** (Atelier, Dwell). A display serif at weight 200–300, 72–120px, line height 1.0–1.1, with italics; a small sans UI (12px uppercase nav and prices); display up to 10× the body. White with one earthy block color (brown `#7d5449`, sand `#e9e4e0`). Radius 0, underline inputs. Stacked full-bleed 4:5 gallery; sections about 80px apart. Minimal motion. Signature: a text-list category index, oversized type, a wordmark footer.
3. **Maison Luxe** (Prestige, Symmetry). Uppercase sans at weight 400 tracked +0.18em, or an ultra-light 200 with −0.04em; body 14px. A light-grey page (`#efefef`) under cut-out products, near-black `#1c1c1c`, no accent. Radius 0; 44px buttons in 13px tracked caps. Airy: sections 80–105px apart, grid gaps 60×64px, card text centered, second image on hover. Motion: an 8s slow image zoom, a 0.45s fill sweep on buttons. Signature: marquee rows of tracked caps.
4. **Warm Crafted** (Tinker). A condensed display serif at 32–48px with italic accents and a humanist sans at 14px. Four or five soft tints: cream `#faf9f1`, sage `#c3cca6`, sea green `#adc4c2`, beige `#f1ede7` (Full). Pill buttons and inputs, cards at 10px, media at 20px. 1:1 products in tinted rounded cards; hero text at the bottom left; a 2:1 then 1:2 mosaic. Signature: spec tiles on the product page.
5. **Bold Showcase** (Impact, Focal). A heavy grotesk or techno sans at 700 with −0.025em tracking, display 72–216px at line height 1.0, up to 13.5× the body; body 15–16px. A soft-grey page (`#f0f0f0`) with white cards and one vivid accent, or white with two saturated accents in color blocks (Committed). Pill 60px buttons with 6–12px card and media radii, or radius 0 with square badges. Sections 80–96px apart. Motion: a 1.5s expo image zoom, text reveals. Signature: a giant product-name statement, a marquee headline.
6. **Technical Sport** (Motion). One sans, uppercase with −0.05em tracking at every size; body 13px; display 40–80px. Off-white `#f8f8f6`, `#1a1a1a`, electric-blue CTAs `#3e71ea`, a safety-orange bar `#fb4401`. Radius 0; 2:3 cards on `#f4f4f4`. Motion: the richest set, 1s rise-ups on a strong ease-out, slow background zooms. Signature: an overlapping photo stack, countdown strips.
7. **Catalog Superstore** (Warehouse). One sans on a flat scale, 13–29px (display 1.8× the body), body 16px at line height 1.87. A light-grey page (`#f3f5f6`), white cells, navy `#1e2d7d`, a cyan CTA `#00badb`. Radius 2px, 1px cell dividers; sections about 30px apart. Cards carry vendor, stars and a stock count. Almost no motion. Signature: search first, and density of data.
8. **Lively DTC** (Palo Alto, Broadcast). A friendly bold sans for headings (500–700, sometimes caps), a neutral 16px body, and a monospace or caps label font (the accent font here). White or warm off-white with blush or sand section tints and one accent. 8px radius or pill buttons, rounded images. Card text centered. Motion: reveals, tickers, expo-out 0.3s. Signature: marquee badges, products inline in a headline.

What made the best of them read as premium rather than generic: one committed typographic move, high display-to-body contrast, a tinted page under cut-out products, one radius language everywhere, a consistent generous rhythm (or a deliberate zero-gap gallery), asymmetric home compositions, 2–3 signature sections, and motion with one clear character.
