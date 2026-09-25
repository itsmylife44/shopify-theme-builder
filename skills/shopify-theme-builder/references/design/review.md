# The review

Before the hand-off, the composed Theme is reviewed against its `DIRECTION.md`, the tells (`tells.md`) and the quality floor (`quality-floor.md`), and ends on one verdict: **PASS** or **HOLD**. It runs in bounded rounds, never in a loop: one review, at most one fix round, and at most one confirming round.

## 1. Run the checker

```sh
node <skill-dir>/scripts/check-direction.mjs <theme>
```

It reads the Theme's files, prints one line per finding (`<file> <check>: <message>`) and exits 1 when there is any:

| Check | What it finds | The fix |
| --- | --- | --- |
| `contrast` | A color scheme's text, muted text, button label or accent (the sale badge's text on it too) below 4.5:1, text or muted text below 4.5:1 on a stop of its background gradient, or its border or button against the background below 3:1 | Change the color with `PUT /api/brand` |
| `fonts` | A heading, body or accent font with no `<handle>, because <reason>` in the chosen Direction's part of `DIRECTION.md` | Write the reason from the brief (for a pinned font, `because the Creator pinned it`), or pick a font that has one (`PUT /api/brand`) |
| `radius` | A `border-radius` of its own in a section, block, snippet or stylesheet | Use the shape family's `var(--style-border-radius-*)` |
| `repeated-section` | A section type twice on one page | Remove one, or replace it with another section |
| `cta-labels` | One link with two or more button labels on a page | Give every button to that link the same label |
| `eyebrows` | Small labels above the heading on more than one section in three | Clear the label on the others |
| `image-ratios` | Images in more than two ratios on one page | Set `image_ratio` to `card` on the sections the finding names (`PATCH`), change the card ratio (`PUT /api/style`), or replace a section |
| `placeholder` | An image left blank on the home page in a section whose layout shows one (the hero, a slide, image with text, editorial split, lookbook, a split newsletter, a split or over-image call to action, process steps, image gallery, logo list, multicolumn except numbered), which the storefront shows as a placeholder drawing | Set a photo from the brief (`POST /api/files`, then `PATCH`), or, without photos, replace the section with one that needs none, or pick its no-image layout |
| `movement` | A home page, the Theme's or a Direction's in `listings/<name>/templates/index.json`, where nothing moves on a phone: no slideshow, marquee, testimonials or collection list carousel, and `motion` isn't `expressive`. Card hover doesn't count: phones can't hover | Add the moving section the Direction's card names (`directions.md`, Movement), or set `motion` to `expressive` (`PUT /api/style`) when the thesis allows |
| `section-count` | A home page with fewer than 6 sections | Add the sections the home sketch is missing, alternating image-led and type-led, up to 6 to 8 |
| `type-only` | Two or more type-only sections in a row on a home page: rich text, type banner, newsletter, spec tiles or call to action, with no image set | Put an image-led section between them, give the newsletter or call to action its split layout with a photo, or remove one |
| `copy` | Filler words ("elevate", "curated", "seamless" …), vague headlines, "Welcome to", em dashes, in text written or left at its default | Rewrite the text for the shop (`PATCH` the section) |
| `default-text` | A product-page block, or a header or footer section or block, showing the catalog's default running text, like an example shipping or returns policy, as if it were the shop's; in the header and footer, also a heading or button label left at the catalog's English default when the shop's default language (the `Languages:` line of `DIRECTION.md`'s brief) isn't English | Write the shop's buying facts the Creator confirmed (`brief.md`, Buying facts), or clear the text; write the header's and footer's text in the shop's language (`PATCH /api/header/sections/<id>`, `/api/footer/sections/footer`) |
| `todo` | A to-do in text shoppers see: bracketed text ("[Da completare: …]"), TODO, TBD, lorem ipsum, "to be completed" | Write the fact the Creator confirmed, or remove the block, and list what's missing in the hand-off |
| `hierarchy` | A Direction (a preset) whose display size is under 3× its body size: the timid hierarchy of `tells.md` | Raise `type_display_size` to at least 3× `type_body_size` (`PUT /api/directions/<name>`, or `PUT /api/style` for the chosen one); a deliberately flat scale stays only with its reason in `DIRECTION.md` |
| `media` | A Direction with framed product media on a dark `media_tint` (brightness 150 or under): only a light tint blends with a cut-out photo, so on a dark one the photo's white box shows | Set a light `media_tint`, or `media_treatment` to `full_bleed` (`PUT /api/directions/<name>`, or `PUT /api/style` for the chosen one) |
| `distinct` | Two Directions that differ in kind on fewer than 3 axes: type, color, shape, spacing, cards, media and motion from their style settings (a number counts when one is a quarter or more above the other, so 56px against 60px doesn't), composition when their homes open on different sections; or every Direction on `subtle` motion | Rewrite one of the two on the axes it shares with the other, in kind (`directions.md`), or give one Direction `expressive` motion when its thesis allows |
| `strategy` | A Direction whose `Color:` line in `DIRECTION.md` is committed or full, with no section of its home on an accent scheme (one beyond `scheme-1` and `scheme-2`): the color owns no region, so the accents scatter | Put the sections the color owns on `scheme-3` (`PATCH` their `color_scheme`), or make the card's strategy match the Theme |
| `centered-hero` | A hero with its `content_position` at `middle_center`, the hero preset's: the centered hero of `tells.md` | Set the position the home sketch gives it, like `bottom_left` (`PATCH`) |
| `merchandise` | A home, the Theme's or a Direction's, with no featured collection, collection list or featured product among its first three sections: shoppers tell what a shop sells from the top of its home | Move one up, or add one pointing at a collection with products |
| `h1` | A page, a Direction's home included, without exactly one h1 (WCAG 1.3.1), counting the h1 of each section and theme block (the main sections, the product title block) and the heading of a hero, slideshow, type banner, image with text, editorial split, lookbook or collection list when it opens the page | With none, open the page with one of those; with more, remove the section that adds the second, or move it down |
| `label-in-name` | A storefront locale file's accessible label (a key ending in `_label`, like `quick_add.add_label`) that doesn't contain the visible text of its control (the key beside it without `_label`, `quick_add.add`), case and spacing aside: voice control users say the visible text to press the button (WCAG 2.5.3) | Rewrite the label in `locales/<code>.json` to start with the visible text, like "Hinzufügen: {{ product }}" for "Hinzufügen" |

Fix each finding. A finding stays only when `DIRECTION.md` gives it a reason (the Creator pinned it, or a Rule asks for it): note it with that reason for the verdict.

## 2. Take the screenshots

Screenshot three pages of the preview (`url` in `GET /api/preview`), each at 1440 and at 390 pixels wide, full page, six in all: the home page `<url>/`, a product `<url>/products/<handle>` and a collection `<url>/collections/<handle>`, with a product and a collection from `GET /api/store`. Then two hover captures of the home page at 1440: a product card and a button, since a full page shows neither state. Save them outside the Theme folder.

Take them with the screenshot script, one call per width, all three pages in one Chrome session (no shell loop around it):

```sh
node <skill-dir>/scripts/screenshot.mjs <url> <dir> --pages / /products/<handle> /collections/<handle> --parts
node <skill-dir>/scripts/screenshot.mjs <url> <dir> --pages / /products/<handle> /collections/<handle> --mobile --parts
```

`--pages` writes each page to `<dir>/<page>-<width>.png`: `home-1440.png`, `products-<handle>-1440.png`, `collections-<handle>-390.png`. `node <skill-dir>/scripts/screenshot.mjs <page> <file>.png` still captures a single page.

And the two hover captures:

```sh
node <skill-dir>/scripts/screenshot.mjs <url>/ card-hover.png --hover .product-card
node <skill-dir>/scripts/screenshot.mjs <url>/ button-hover.png --hover .button
```

`--hover <selector>` moves the mouse over the first visible element the selector matches, and captures the viewport around it instead of the full page; under reduced motion the state shows at once, without its transition.

The script drives the system's Google Chrome (or Chromium, or Microsoft Edge) headless, captures the full page with reduced motion, so every section shows (the reveal on scroll would leave sections below the fold blank), and ends within a minute, 20 seconds more for each other page. With `--parts` it also writes each page top to bottom in parts twice the viewport tall, `home-1440-1.png`, `home-1440-2.png`, …, and prints their paths (`--part-height <px>` sets another height). Don't crop or split the captures yourself. Don't use Chrome's own `--screenshot` flag: it hangs on the preview, whose hot reload never goes idle, and can't lay out 390 pixels wide. It prints each page's `scrollWidth`: when it's wider than the viewport, something overflows sideways, a finding for the floor. When it finds no browser, ask the Creator to install Google Chrome (or set `CHROME_PATH` to one), or use another browser tool you have. Wait until the preview has synced the last write (the Studio's log shows it) before taking them. When nothing can take a screenshot, say so in the verdict: the review then rests on the checker and the files alone.

Then check the same three pages for accessibility, at both widths (the menu drawer shows at 390):

```sh
node <skill-dir>/scripts/check-a11y.mjs <page>
node <skill-dir>/scripts/check-a11y.mjs <page> --mobile
```

It runs axe-core's WCAG 2.2 A and AA rules on the page, then a keyboard pass through the menu drawer, the cart drawer and quick add, each where the page shows it: Tab reaches the control, Enter opens its dialog with focus inside, Tab keeps focus in the dialog, Escape closes it, and focus returns to the control ([the APG modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)). It prints one line per finding, `axe <rule> (<impact>): <what>: <elements>` or `keyboard <control>: <what failed>`, and which controls it pressed, and exits 1 when there is any. Each finding breaks the floor: fix it in the Theme (a Brand color that fails contrast with `PUT /api/brand`, after telling the Creator), and check that page again. It uses the same browser as the screenshots and ends within 90 seconds.

## 3. Review them

Look at each screenshot: the full capture for the page's overall rhythm (the order of the sections, dense and airy, the color schemes alternating), the parts for everything you read (type, text, spacing, images, details), since a full page is shrunk too small to judge them. Then write down each finding as `[<page> <width>] what is wrong → the change that fixes it`, like `[home 390] the hero heading wraps "oil" onto its own line → shorten the heading to "Pressed the day it was picked"`. A finding without a concrete change isn't one yet. Check, in this order:

1. **The Direction.** Read `DIRECTION.md` again: does the page carry its thesis, and each line of the chosen card (type, color strategy, shape, spacing, cards, media, motion, the signature section)? Does it break a Rule?
2. **The swap test.** Put another shop of the same category on it. Where the page would still work, name the part that is generic and what of this shop's world replaces it.
3. **The tells.** Read `tells.md` against the screenshots: the Shopify formula, a centered hero, three identical cards, scattered accents, eyebrows everywhere. In the hover captures, the card and the button each show a state that fits the Direction's motion (Motion in `tells.md`: no state at all, or the same lift on everything, is a finding).
4. **The floor.** Read `quality-floor.md` line by line against the screenshots at both widths. Every line `check-a11y.mjs` printed is a finding for the floor.

## 4. The verdict

- **PASS**: no finding breaks the floor, a Rule of `DIRECTION.md` or the swap test, the checker prints none (or only ones `DIRECTION.md` gives a reason for), and `check-a11y.mjs` prints none.
- **HOLD**: any of those remains. List each with its change. Never soften a HOLD into a PASS with notes.

On a HOLD, make every change in one fix round, through the Studio's API as in step 4, and check `validation` again. Then one confirming round: run the checker again, and take new screenshots and run `check-a11y.mjs` again on the pages and widths the changes touched. That round's verdict is final: when it is still HOLD, stop, and tell the Creator what is left and why, so they decide; don't start a third round.

Tell the Creator the verdict in a few lines: PASS or HOLD, what the review changed, and each finding kept with its reason.
