# The review

Before the hand-off, the composed Theme is reviewed against its `DIRECTION.md`, the tells (`tells.md`) and the quality floor (`quality-floor.md`), and ends on one verdict: **PASS** or **HOLD**. It runs in bounded rounds, never in a loop: one review, at most one fix round, and at most one confirming round.

## 1. Run the checker

```sh
node <skill-dir>/scripts/check-direction.mjs <theme>
```

It reads the Theme's files, prints one line per finding (`<file> <check>: <message>`) and exits 1 when there is any:

| Check | What it finds | The fix |
| --- | --- | --- |
| `contrast` | A color scheme's text, button label or accent below 4.5:1, or its border below 3:1 | Change the color with `PUT /api/brand` |
| `fonts` | A heading, body or accent font with no `<handle>, because <reason>` in the chosen Direction's part of `DIRECTION.md` | Write the reason from the brief (for a pinned font, `because the Creator pinned it`), or pick a font that has one (`PUT /api/brand`) |
| `radius` | A `border-radius` of its own in a section, block, snippet or stylesheet | Use the shape family's `var(--style-border-radius-*)` |
| `repeated-section` | A section type twice on one page | Remove one, or replace it with another section |
| `cta-labels` | One link with two or more button labels on a page | Give every button to that link the same label |
| `eyebrows` | Small labels above the heading on more than one section in three | Clear the label on the others |
| `image-ratios` | Images in more than two ratios on one page | Change the card ratio (`PUT /api/style`), or replace a section |
| `copy` | Filler words ("elevate", "curated", "seamless" …), vague headlines, "Welcome to", em dashes, in text written or left at its default | Rewrite the text for the shop (`PATCH` the section) |

Fix each finding. A finding stays only when `DIRECTION.md` gives it a reason (the Creator pinned it, or a Rule asks for it): note it with that reason for the verdict.

## 2. Take the screenshots

Screenshot three pages of the preview (`url` in `GET /api/preview`), each at 1440 and at 390 pixels wide, full page, six in all: the home page `<url>/`, a product `<url>/products/<handle>` and a collection `<url>/collections/<handle>`, with a product and a collection from `GET /api/store`. Save them outside the Theme folder.

Use whatever browser tool you have (a browser automation tool, Playwright, Puppeteer). Without one, Google Chrome takes them from the command line, one per page and width (a tall window gives a full page):

```sh
"<chrome>" --headless=new --hide-scrollbars --window-size=1440,6000 --screenshot=<file>.png <page>
```

`<chrome>` is Google Chrome's executable, like `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on macOS or `google-chrome` on Linux. Wait until the preview has synced the last write (the Studio's log shows it) before taking them. When no tool can take a screenshot, say so in the verdict: the review then rests on the checker and the files alone.

## 3. Review them

Look at each screenshot, then write down each finding as `[<page> <width>] what is wrong → the change that fixes it`, like `[home 390] the hero heading wraps "oil" onto its own line → shorten the heading to "Pressed the day it was picked"`. A finding without a concrete change isn't one yet. Check, in this order:

1. **The Direction.** Read `DIRECTION.md` again: does the page carry its thesis, and each line of the chosen card (type, color strategy, shape, spacing, cards, media, motion, the signature section)? Does it break a Rule?
2. **The swap test.** Put another shop of the same category on it. Where the page would still work, name the part that is generic and what of this shop's world replaces it.
3. **The tells.** Read `tells.md` against the screenshots: the Shopify formula, a centered hero, three identical cards, scattered accents, eyebrows everywhere.
4. **The floor.** Read `quality-floor.md` line by line against the screenshots at both widths.

## 4. The verdict

- **PASS**: no finding breaks the floor, a Rule of `DIRECTION.md` or the swap test, and the checker prints none (or only ones `DIRECTION.md` gives a reason for).
- **HOLD**: any of those remains. List each with its change. Never soften a HOLD into a PASS with notes.

On a HOLD, make every change in one fix round, through the Studio's API as in step 4, and check `validation` again. Then one confirming round: run the checker again and take new screenshots of the pages and widths the changes touched. That round's verdict is final: when it is still HOLD, stop, and tell the Creator what is left and why, so they decide; don't start a third round.

Tell the Creator the verdict in a few lines: PASS or HOLD, what the review changed, and each finding kept with its reason.
