# The brief

The brief is what the three Directions are derived from. Without it the agent falls back on the category default: "an elegant olive-oil shop" becomes cream, a classic serif and a gold accent, whatever the shop is. Every font, color strategy and section order in a Direction needs a reason that comes from here.

## What to gather

Ask one question at a time, in the Creator's language. Take what a reference already answers (below), say what you took, and ask only about the rest.

| Item | Ask for | A good answer | Not enough |
| --- | --- | --- | --- |
| **World** | What the brand makes, where, from what, and for whom | "Cold-pressed oil from one grove of Coratina trees in Puglia, sold to people who cook every day" | "Premium olive oil" |
| **Scene** | Where the shopper is when they buy: who, where, under what light, doing what | "On a phone at the market, comparing it with the bottle in their hand" | "Busy professionals" |
| **Three emotions** | How the shopper should feel, in three words | "Trust, appetite, patience" | "Modern, clean, premium" (those describe a look, not a feeling) |
| **References** | Two or three brands, places or objects from *outside* the shop's category, and what each lends | "A seed catalogue from the 1950s (dense, honest labels); a train timetable (order)" | Another olive-oil shop |
| **Rejects** | What the brand refuses to look or sound like | "No rustic kitsch, no gold foil, no 'artisanal'" | Nothing |
| **Photos** | What the product photos really are: cut-outs on white or lifestyle scenes, how many per product, their quality and light | "One cut-out per product on white, good; three phone photos of the grove" | "Nice photos" |

Then ask for the photos themselves: a folder, files or links, sorted as far as the Creator can into hero or lifestyle scenes, products, and details or the workshop; or "none yet". Download links into your scratchpad, never into the Theme. Look at each photo and write one line on what it shows and whether it's a cut-out or a scene, like `grove.jpg: lifestyle, the Coratina trees at dawn, landscape`. The Directions place them in step 4 from this list; with "none yet", every Direction stands on type and color alone.

Also ask whether the Brand is **pinned**: colors, fonts or a logo the brand already uses and must keep. What is pinned stays the same in all three Directions; what is open, each Direction decides.

## Buying facts

The facts a shopper needs before they buy, which the Theme shows next to the buy button, in the cart and in the product page's shipping and returns. Extra costs found late are the first reason carts are abandoned, and a shop never shows a policy the Creator didn't give. Ask them in the store decisions of step 1 (SKILL.md), all in one question, each with a default the Creator mostly confirms: take the defaults from their website when they named one, else propose ones common for the category and the market, marked as proposals.

| Fact | Ask for | Where it shows |
| --- | --- | --- |
| **Shipping costs** | What shipping costs, and the order total from which it's free, if there is one | The `free_shipping_threshold` theme setting (`PUT /api/style`, a number in the store currency): the cart page and drawer show "€X to free shipping" or "Free shipping" with a progress bar, and the shipping note shows "Free shipping on orders over €X". Its amount matches the store's shipping rates (Shopify admin › Settings › Shipping and delivery), which the checkout charges |
| **Delivery times** | How long an order takes to arrive, per market | The shipping note's `text` and the "Shipping and returns" collapsible block |
| **Returns** | The returns window and who pays the return | The shipping note's `text` and the "Shipping and returns" collapsible block |
| **Sizing** | For clothing, shoes or anything sized: how it fits, and the shop page with its size chart, if there is one | The `size-guide` block after the variant picker, which opens the size chart page in a dialog, and how it fits in a collapsible block on the product page |
| **Reviews** | Whether the shop uses a reviews app, and which | Its app block on the product page, and the rating on detailed product cards |

Write only what the Creator confirmed. A fact they don't know yet stays out of the text, and goes in the hand-off's list of what's missing; never a placeholder, and never the catalog's example text (the checker reports it as `default-text`).

## Reading a reference

- **A website of the brand's own**: open it. Read the colors (background, text, buttons, accent) and font families from its CSS, the logo file, the photos (cut-out or lifestyle, light, crop) and the copy's voice. Ask whether those colors and fonts are pinned or open to change.
- **A screenshot or moodboard**: read the palette, the font mood and the photo style. They are open unless the Creator says otherwise.
- **A competitor's site**: it tells you the category default, which is what the Directions must not become. Never copy it.

A reference answers the Brand and the photos, rarely the world, the scene or the emotions: ask those.

## Reading a brand's world

Before writing Directions, list about seven concrete things from the brand's world: artifacts, places, materials, rituals, tools, printed matter. Spread them over at least three material families (paper, metal, glass, textile, wood, stone, screen, food …). For the olive-oil shop: the tin can of the harvest, the mill's hand-painted signs, the press cloths, the grove's dry-stone walls, the tasting glass, the harvest date stamped on the label, the market crate.

Then name the page this category always ships (for olive oil: cream, a classic serif, gold, a sunset grove hero) and its predictable opposite (black, a big grotesk, one acid color). Both are off the list. The Directions come from the seven things, not from the category.

## The brief wins

A look the Creator names is followed exactly, even when it is on the tell list (`tells.md`). Say once what it risks, then do it well. The Direction then records it under **Pinned** as the Creator's choice.

## Where it goes

The brief is the `## Brief` part of `<theme>/DIRECTION.md` (`direction-template.md`), written in step 4 when the Theme exists.

## Reading it back

Before writing the Directions, read the brief back to the Creator in a few lines and have them confirm it: the six items as you understood them, the seven things from the brand's world, the category default and its opposite you will steer clear of, and what each reference lends. Ask it as one question with the brief shown in it (like Claude Code's `AskUserQuestion` with the brief in an option's preview), so the Creator can confirm or correct it in one answer.

Do it every time, even when the Creator's first message gave every item. The read-back doesn't collect missing facts: it checks your *interpretation*, which a complete brief leaves unchecked. How you read "contemporary, not classic" or what a reference lends decides all three Directions, and here the Creator catches a wrong reading before they are built on it. A complete first message is not a confirmation. Only a Creator who said not to ask and to just build it skips the read-back.
