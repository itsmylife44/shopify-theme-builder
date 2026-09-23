---
name: shopify-theme-builder
description: Builds a Creator's own Shopify theme from Shopify's Skeleton theme and a catalog of prebuilt sections, styled with their brand, and opens a local Studio with a live preview. Use when someone wants a new Shopify theme, a custom Shopify store design, or to restyle a Shopify shop from their website, screenshot or moodboard.
license: MIT, see LICENSE. base-theme/ is under Shopify's Skeleton theme license, see base-theme/LICENSE.md.
metadata:
  version: "0.1.0"
  author: itsmylife44
---

# Shopify Theme Builder

You build a **Theme** for one Shopify shop with the **Creator** (the person you're talking to). The Theme starts from the **Base Theme** (Shopify's Skeleton), adds sections from the **Section Catalog**, and carries the **Brand** (colors, fonts, logo) in Shopify's native theme settings, so the Merchant can keep editing it in Shopify's Theme Editor. The **Studio** is a local app where the Creator adjusts the Brand and composes pages while `shopify theme dev` shows the real rendered Theme.

`<skill-dir>` below is the folder holding this `SKILL.md`. It holds `base-theme/`, `catalog/sections/` and `studio/`. The Theme lives in its own folder outside it; the Theme's files never go in `<skill-dir>`.

Talk with the Creator in their language. Work through steps 1 to 5 in order; steps 6 to 8 run when the Creator asks. Each ends on its **done** line.

Never publish a theme: no `shopify theme publish`, no `--publish`, `--live` or `--allow-live` flag, no Publish button in the admin. Publishing changes the Merchant's live shop, and only the Merchant decides that.

## 1. Prerequisites

Check each; when one fails, tell the Creator the fix and wait until it passes.

| Check | Passes when | Fix |
| --- | --- | --- |
| `node --version` | 22.12 or newer | Install the current LTS from https://nodejs.org (or `nvm install --lts`). |
| `git --version` | 2.28 or newer | Install from https://git-scm.com. |
| `shopify version` | 4.8.0 or newer | `npm install -g @shopify/cli@latest` (or `brew install shopify-cli`). |
| Studio dependencies | `<skill-dir>/node_modules` exists | Run `npm ci --omit=dev` in `<skill-dir>`; again after updating the skill. |
| Store access | `shopify theme list --store <shop>.myshopify.com` lists themes | See below. |

**Store access.** The preview renders on a real store, so the Creator needs one where they are the owner, or have a staff or collaborator account with theme permissions. Ask for its `<shop>.myshopify.com` address. Without one, offer to create a free **development store** for them:

1. Ask for the store's name (like the shop's name).
2. Run `shopify organization list --json` for the Creator's organizations; when it lists more than one, ask which to use.
3. Run the command below, allowing it up to 10 minutes: it waits until the store is ready, then prints its `<shop>.myshopify.com` address. Without a terminal the CLI needs all of `--name`, `--organization-id` and `--plan`, even with a single organization; `--demo-data` adds sample products so the preview looks like a shop.

   ```sh
   shopify store create dev --name "<name>" --organization-id <id> --plan basic --demo-data --json
   ```

The Creator can also create one in Shopify's Dev Dashboard (https://dev.shopify.com) › Stores › Create store.

A development store can't be transferred to a Merchant; for a Merchant's shop, use the Merchant's store with a collaborator account. Give each Theme its own store: the Shopify CLI keeps one development theme per store per machine, so two Themes previewed on one store overwrite each other.

When a `shopify` command asks to log in, have the Creator run `shopify auth login` in their own terminal, then check again.

Recommend, without requiring it, Shopify's AI Toolkit (https://github.com/Shopify/Shopify-AI-Toolkit) for later Liquid work. Its `shopify-liquid` skill sends prompts and code to Shopify unless the Creator opts out: create `~/.config/shopify-ai-toolkit/opt-out` or set `OPT_OUT_INSTRUMENTATION=true`.

**Done** when every check passes and you have the store address.

## 2. Brand capture

Gather seven things: **colors**, **fonts**, **logo**, **style**, **shop languages**, the **shop name**, and the **author** (the Creator's name or business, shown as the Theme's author).

1. Ask for a reference first: the Creator's current website, a screenshot, or a moodboard.
   - A website: open it and read the colors (background, text, buttons, accent), font families and logo file from its pages and CSS.
   - An image: derive the palette and the font mood from it.
2. Tell the Creator what you took from the reference, then ask only about what it left open. Ask one question at a time. Without a reference, ask about all seven.
3. Turn the answers into Brand values:
   - **Color schemes.** Each scheme has four hex colors (`#RRGGBB`): `background`, `text`, `button`, `button_label`. Make `scheme-1` the main light scheme and `scheme-2` its dark inverse; add `scheme-3` for an accent color when the Brand has one. Keep text-on-background and label-on-button contrast at 4.5:1 or more.
   - **Fonts.** A heading font and a body font, each a handle from `<skill-dir>/studio/server/shopify-fonts.json` (Shopify's font library), like `work_sans_n4` (`n4` is regular 400, `n7` bold, `i4` italic). When the reference's font isn't there, pick the closest family and tell the Creator.
   - **Logo.** A PNG, JPEG, WebP or SVG file, at most 2 MB. Take the file the Creator gives, or download it from their website when that site is their own brand. None is fine: the header shows the shop name.
   - **Style** (like minimal, bold, playful, luxurious) guides the fonts, the schemes and which home sections you pick in step 4.
   - **Shop languages**: every language the shop sells in, each as the ISO code Shopify admin › Settings › Languages shows (`it`, `de`, `pt-BR`), and which of them is the shop's **default language** (the one customers see first). Ask whether it sells in more than one.

**Done** when every Brand value above has a concrete value (or "no logo") and the Creator has confirmed them.

## 3. Create the Theme

1. Ask where the Theme goes. Default: a new folder named after the shop (like `acme-theme`) in the Creator's current directory. It must be outside `<skill-dir>`, and must not exist yet or be empty; pick another name rather than write into a folder with files.
2. Create it with the skill's `create-theme` command:

   ```sh
   node <skill-dir>/studio/bin/create-theme.mjs <theme> --name "<shop name>" --author "<author>"
   ```

   It copies the Base Theme with its dotfiles and the catalog files every Theme starts with: the header, header group (with the `announcement-bar` above the header), footer and footer group, the header's `predictive-search` and `quick-add` sections, and the contact, cart, search, blog, article, 404 and collections list pages, each a template with its catalog main section. It leaves out the Base Theme's `PROVENANCE.md` (it describes the skill's own copy of Skeleton), sets the first entry of `config/settings_schema.json`'s `theme_name` to the shop's name (at most 50 characters) and `theme_author` to the author, and runs `git init -b main`, so the Creator can connect the Theme to Shopify's GitHub integration later. It refuses a folder that has files or is inside `<skill-dir>`, and prints why. The Theme keeps Shopify's folder layout at its root (`layout/`, `sections/`, `templates/` …), which Shopify's GitHub integration requires, and has no build step. `LICENSE.md` is Skeleton's license and stays with the Theme. The other catalog sections are added through the Studio in step 4, which copies only the ones the Theme uses.
3. Add the locale files of each shop language other than English:
   1. Copy `locales/en.default.json` to `locales/<code>.json` and translate every value. Keep every key, and keep `{{ variables }}` and the HTML of `_html` keys as they are. Plural keys (`one`, `other`) get the forms the language needs (`zero`, `two`, `few`, `many`).
   2. Copy `locales/en.default.schema.json` to `locales/<code>.schema.json` and translate it the same way, so the Merchant sees the Theme Editor in that language.
   3. Keep `en.default.json` as is: English stays the Theme's default locale, and the storefront shows `<code>.json` to customers reading that language once the shop publishes it.

**Done** when `create-theme` has created `<theme>` and it holds both locale files of every shop language other than English.

## 4. Open the Studio, write the Brand, compose the pages

1. Start the Studio as a background process that keeps running after your command returns, with its output going to a log file outside the Theme folder:

   ```sh
   node <skill-dir>/studio/bin/studio.mjs --theme <theme> --store <shop>.myshopify.com > <log-file> 2>&1
   ```

   To stop this Studio and its `theme dev`, run `pkill -f "studio.mjs --theme <theme> "`, with `<theme>` exactly as in the start command and the trailing space kept. It matches only this Theme's Studio, so Studios and `theme dev` runs of other projects on the machine keep running.

   Read the Studio's URL from the log (`Local: http://localhost:5173/`); the port may differ. The Studio also starts `shopify theme dev` for the preview, and its output goes to the same log. While sections are being added, that log may show failed uploads (a template naming a section file not uploaded yet); they resolve within seconds, so judge by `GET /api/preview` and `validation` instead.
2. Write the Brand and compose the pages through the Studio's API at that URL. It checks every value, copies catalog sections into the Theme with the locale keys they need, and runs Theme Check after each write. Every call returns the Theme's state as JSON (the pages, their section ids, the Brand and `validation`); an error returns `{ "error": "…" }` saying what to fix.

   | Call | Body |
   | --- | --- |
   | `PUT /api/brand` | `{"colorSchemes": {"scheme-1": {"background": "#FFFFFF", "text": "#1A1A1A", "button": "#1A1A1A", "button_label": "#FFFFFF"}}, "headingFont": "<handle>", "bodyFont": "<handle>"}` |
   | `PUT /api/brand/logo` | the image file, with its `Content-Type` (`image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`) |
   | `POST /api/<page>/sections` | `{"type": "<catalog section>"}`; `<page>` is `home`, `product`, `collection`, `page`, `contact` (the `page.contact` template), `cart`, `search`, `blog`, `article`, `404` or `collections` (the collections list) |
   | `DELETE /api/<page>/sections/<id>` | none |
   | `GET /api/<page>/sections/<id>` | none; the section's `name`, `colorScheme`, `settings` and `blocks`, each setting as `{"id", "type", "label", "value"}`, the image and video settings under `media` (the section's and each block's) as `{"id", "type", "label", "set"}`, which the Studio doesn't write, and the `blockTypes` it can add, up to `maxBlocks` blocks |
   | `PATCH /api/<page>/sections/<id>` | any of `{"colorScheme": "scheme-2", "settings": {"<setting id>": <value>}, "blocks": {"<block id>": {"<setting id>": <value>}}}`; settings are the ones `GET` lists |
   | `POST /api/<page>/sections/<id>/blocks` | `{"type": "<block type>"}`, one of the section's `blockTypes`; the block goes at the end, with its schema's defaults |
   | `DELETE /api/<page>/sections/<id>/blocks/<block id>` | none |
   | `PUT /api/<page>/sections/<id>/order` | `{"order": ["<block id>", …]}`, every block id of the section exactly once |
   | `GET /api/store` | none; the store's `collections`, `products` and `menus`, each as `{"handle", "title"}` |
   | `PUT /api/<page>/order` | `{"order": ["<id>", …]}`, every section id of the page exactly once; a new section is added at the end, so move it with this |
   | `GET /api/theme` | none; the current state, with the header and footer groups' sections under `header` and `footer`, the catalog sections each page can take under `catalog`, the Custom Sections under `custom`, and under `history` whether `undo` and `redo` have a step |
   | `POST /api/undo` | none; puts back the files the latest Studio write changed (at most 50 steps, kept until the Studio stops). It refuses, naming the file, when that file changed outside the Studio since, and never undoes those edits |
   | `POST /api/redo` | none; writes again what `POST /api/undo` put back, until a new write |

   The calls on `/api/<page>/sections/<id>` (`GET`, `PATCH` and the block calls) also take `header` or `footer` as `<page>`, for the sections of the header and footer groups every page shares, like the footer's newsletter and menus.

   For example: `curl -X PUT <studio>/api/brand/logo -H 'Content-Type: image/png' --data-binary @logo.png`.

   With no logo, the header and footer show the store's name from Shopify admin, not the shop name from step 2. Compare the two: the store's name is the display name in `shopify store info --store <shop>.myshopify.com --json`, or the name in the preview's header once it runs. When they differ, tell the Creator to change it in Shopify admin › Settings › General › Store name.
3. Compose the pages. A page keeps at least one section, so add the new sections before removing the Base Theme's `main`:
   - **home**: pick 4 to 6 sections that fit the style from `catalog.home` in `GET /api/theme`. Start with `hero`. Then remove `main`.
   - **product**: add `main-product` and `related-products`, then remove `main`.
   - **collection**: add `main-collection`, then remove `main`.
   - **page**, **contact**, **cart**, **search**, **blog**, **article**, **404** and **collections** already hold their catalog main section from step 3 (`contact-form`, `main-cart` …; the plain page keeps the Base Theme's `page`). Leave them as they are, unless the Creator wants more on one: then add sections from `catalog.<page>`, like a `rich-text` on the 404 page.

   Alternate the color schemes down the home page (`PATCH`) so neighbouring sections don't share one background.

   Point the sections at the store: a `collection` setting (like the featured collection's) takes a collection's handle, `product` a product's, `link_list` a menu's, and `collection_list` or `product_list` a list of handles like `["summer-sale"]`. Pick them from `GET /api/store`. A `url` setting (a button link) takes a store path like `/collections/summer-sale`, an `https://` link, or `shopify://collections/<handle>`. An empty value clears a setting. Layout options take their own values: a `checkbox` `true` or `false`, a `range` a number within its `min`, `max` and `step`, a `number` a number (`null` clears it), a `select` or `radio` one of its `options`' values; `GET` the section to see them. When `GET /api/store` answers an error, run `shopify store auth --store <shop>.myshopify.com --scopes read_products,read_online_store_navigation` as a background process and give the Creator the login link it prints; the Studio lists the store once they approve.
4. Write the text of every section you added, and the headings, text and button labels of the other pages' main sections (like the 404 page's), in the shop's default language: the catalog's defaults are English placeholders ("Welcome to our store"). For each section, `GET` it and `PATCH` its `settings` and `blocks` with text written for the shop, from what you learned in step 2. Sections with blocks (testimonials, FAQ) start with three: add or remove blocks so their number fits what the shop has to say. A `text` or `inline_richtext` value is a line of text; a `richtext` value is HTML paragraphs (`<p>…</p>`). Leave product and collection names to Shopify. Shopify shows this text in every language until it's translated; the other shop languages get it through Translate & Adapt (the hand-off, step 5).
5. Check `GET /api/theme`: `validation` must hold no offense with `"severity": "error"`. Fix any error in the file and line it names, then check again.
6. Check `GET /api/preview`: `{"status": "running", "url": …}` gives the preview link. `login-required` means the Shopify CLI printed a login link in the log: give it to the Creator and check again after they log in. `reconnecting` means the Studio is restarting `theme dev` because the store's storefront session expired; it is `running` again within seconds. `error` carries a message saying what to fix. When it asks for the store password, ask the Creator for the storefront password, under Password protection at `https://admin.shopify.com/store/<shop>/online_store/preferences` (development stores always have one), stop the Studio, and start it again with `--store-password <password>` added.
7. Commit the Theme in `<theme>` (`git add -A && git commit -m "Create the Theme"`).

**Done** when the Brand, the home, product and collection pages, every page's text and their collections and links are written, `validation` has zero errors, the preview is `running`, and the Theme is committed.

## 5. Hand-off

Tell the Creator, in a few lines:

1. Open the Studio at its URL, in Google Chrome. It shows the real Theme in the middle and refreshes it after each change. Pick a page (home, product, cart, blog, 404 …) in the top bar. Click a section there, or in the list on the left (the header and footer included), to change its colors, text, layout options, collections, products, menus and links on the right; a page's sections can also be moved or removed; add sections from the list; the Brand tab holds colors, fonts and logo.
2. Images and videos are picked in Shopify's Theme Editor: the selected section in the Studio shows each image and video setting, whether it's set, and a "Choose in the Theme Editor" link that opens the page in the Theme Editor on the preview's development theme, where they select that section. Products and menus are edited in the Shopify admin. For a contact page, the Merchant picks the `contact` template for their Contact page in Shopify admin › Online Store › Pages.
3. The Theme lives in `<theme>`, with its own Git history. You can keep changing it: the Studio picks up your edits while it runs.
4. To stop the Studio, ask me; to start it again, run the command from step 4.1 (with `--store-password` if you added it).
5. When the shop sells in more than one language: the Theme's own text (buttons, labels, messages) comes in each language from its locale files, and the page text is written in the default language. Translate the page text into the other languages with Shopify's free Translate & Adapt app: install it from the Shopify App Store, make sure each language is added in Shopify admin › Settings › Languages, then in the app pick the language and the theme and translate its sections' text (Auto-translate fills it in to review). Translations belong to one theme on the store, so translate the theme delivered in step 8; text changed later in the Studio or Theme Editor needs translating again.
6. Only when there is no logo and the store's name differs from the shop name (step 4.2): the header and footer show the store's name, so change it in Shopify admin › Settings › General › Store name.
7. Ask you for a section the catalog doesn't have (step 6), to bring a newer catalog's fixes into the Theme's sections (step 7), and to deliver the Theme to the store when it's ready (step 8).

## 6. Custom Sections

When the Creator wants something no catalog section does, write a **Custom Section**: a section file in the Theme only, never in `<skill-dir>`.

1. Pick a kebab-case name (like `size-guide`) that no file in `<theme>/sections/`, `<skill-dir>/base-theme/sections/` or `<skill-dir>/catalog/sections/` has, and write `<theme>/sections/<name>.liquid`. Start it with a one-sentence description the Studio shows in its section picker: `{% comment %}A size table for the product page.{% endcomment %}`.
2. Follow the conventions of the catalog sections; open one in `<skill-dir>/catalog/sections/` (like `image-with-text.liquid`) as the model:
   - **Brand only through settings.** No hardcoded colors or fonts: use the CSS variables the Theme sets from the Brand (`--color-background`, `--color-foreground`, `--color-button`, `--color-button-label`, `--font-heading--*`, `--font-body--*`, `--font-accent--*`); a price takes the class `price`, which gives it the accent font. No font sizes or line heights either: a heading takes its size from its level, and a class `text-display`, `text-h1` to `text-h6`, `text-body`, `text-small` or `text-label` gives any element another step of the Theme's type scale. Spacing, widths and borders come from the Theme's variables too: `--space-2xs` to `--space-2xl` for padding, margins and gaps, `--section-spacing` above and below the section, `--grid-gap` between the items of a grid (`--grid-row-gap` between rows of cards with text), which follow the Theme's density setting, `--width-narrow`, `--width-text` or `--width-prose` for a column's width, `min-inline-size` and `min-block-size` of `var(--target-size)` (44px) on an icon button or option picker and `var(--target-size-min)` (24px) on any other small control, `var(--border-width) solid var(--color-border)` for a border, `var(--style-border-radius-cards)`, `var(--style-border-radius-media)`, `var(--style-border-radius-inputs)` or `var(--style-border-radius-badges)` for corners, which follow the Theme's shape setting (never a radius of their own), and for a contained image `background-color: var(--media-background)` on its box with `padding: var(--media-inset)`, `object-fit: var(--media-fit)` and `mix-blend-mode: var(--media-blend)` on the image, which follow the Theme's media settings, `var(--opacity-muted)` for muted text. The focus ring, the `visually-hidden` class and placeholder colors (with the `placeholder` class) are already shared, and layouts switch at `@media (min-width: 750px)`. Buttons, and links styled as buttons, take the shared `button` or `button--secondary` class and no colors, padding or shape of their own. No entrance animations: the Theme already fades sections in on scroll, following its motion setting; a hover transition takes `var(--motion-duration) var(--motion-easing)` inside `@media (prefers-reduced-motion: no-preference)`.
   - **Color scheme.** The schema has `{"type": "color_scheme", "id": "color_scheme", "label": "t:labels.color_scheme", "default": "scheme-1"}` and the outer element carries `class="color-{{ section.settings.color_scheme }}"`.
   - **Placeholders.** A blank image, product or collection renders Shopify's placeholder (`{{ 'image' | placeholder_svg_tag: 'placeholder' }}`, `'product-1'` to `'product-6'`, `'collection-1'` to `'collection-6'`, `'lifestyle-1'`/`'lifestyle-2'` for large media), so an empty store still looks like a shop.
   - **Direction.** Logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline-start`, `text-align: start`), never `left` or `right`, so the layout mirrors in right-to-left languages like Arabic and Hebrew.
   - **Presets.** The schema has a `presets` entry, so the Merchant can add the section in the Theme Editor.
   - **Pages.** A section that needs the product or collection sets `"enabled_on": {"templates": ["product"]}` (or `["collection"]`); `"limit": 1` when a page shows it once.
   - **Text.** Text the Creator writes is a setting with a default. Fixed storefront text uses `{{ 'key' | t }}`, and every `name`, `label`, `info` and `content` in the schema is a `t:` key. Add each new key to `locales/en.default.json` (or `locales/en.default.schema.json`) and, translated, to each shop language's files.
   - **Limits.** At most 50 blocks (`max_blocks`) and 256 KB per file.
3. Check Theme Check: `validation` in `GET /api/theme` (or `shopify theme check --path <theme>` when the Studio isn't running) must hold no error. Fix each one and check again. Don't tell the Creator the section is done before this passes.
4. When the Creator said which page it goes on, add it with `POST /api/<page>/sections` and `{"type": "<name>"}`. Either way, the Studio lists it under Custom Sections in the section picker of each page it can go on, where the Creator can add it.
5. Write its text in the shop's default language (`PATCH`, like step 4.4), and ask the Creator to check it in the Studio; its images are edited in the Theme Editor. Then commit it in `<theme>`.

**Done** when the section file passes Theme Check with zero errors, shows in the Studio, and is committed.

## 7. Update the catalog sections

When the Creator asks to update their Theme's sections, bring the catalog's fixes into a Theme made earlier, keeping the Creator's own edits. Only a Theme section with a catalog counterpart changes; Custom Sections are never touched.

1. Stop the Studio when it runs (the `pkill` of step 4.1), and commit any open change in `<theme>`, so the update is one commit the Creator can revert.
2. Pull the latest skill: `npx skills update -p` in the project that installed it (`npx skills update -g` for a global install). It replaces `<skill-dir>`: read this `SKILL.md` again and go on with this step as it now reads, and reinstall the Studio's dependencies as in step 1.
3. Go through each `<theme>/sections/<name>.liquid` that has a `<skill-dir>/catalog/sections/<name>.liquid`; the Theme's templates and `sections/*-group.json` hold the Creator's content and stay as they are:
   1. Find the version the Theme started from: the file as the commit that added it holds it, `git -C <theme> show $(git -C <theme> log --diff-filter=A --format=%H -- sections/<name>.liquid | tail -1):sections/<name>.liquid`, saved to a file outside the Theme. When its schema's `name` differs from the catalog file's, it is a Custom Section that shares the name by chance: skip it and tell the Creator.
   2. When the Theme's file equals the catalog's, it is up to date. Otherwise merge the catalog's changes into it:

      ```sh
      git merge-file -L theme -L original -L catalog <theme>/sections/<name>.liquid <original-file> <skill-dir>/catalog/sections/<name>.liquid
      ```

      It keeps the Creator's edits (settings, text, custom CSS) and adds the catalog's. It exits with the number of conflicts, each between `<<<<<<< theme` and `>>>>>>> catalog` in the file: resolve each by hand, keeping what the Creator meant and the catalog's fix.
4. Add what the merged sections need the way the Studio does when it copies a catalog section: every key of `<skill-dir>/base-theme/locales/en.default.json` and `en.default.schema.json` that the Theme's locale files lack, at any depth, never changing a value the Theme has (in each other shop language's files, translated as in step 3.3); every `<skill-dir>/base-theme/blocks/` and `<skill-dir>/base-theme/snippets/` file the Theme lacks; and every setting of `<skill-dir>/base-theme/config/settings_schema.json` whose `id` the Theme's lacks, in the group of the same name.
5. Run `shopify theme check --path <theme>`: it must exit 0. Fix each error and run it again.
6. Tell the Creator what changed, section by section: what the catalog fixed or added, each conflict and how you resolved it, and each section you skipped. Then commit in `<theme>` (`git add -A && git commit -m "Update the catalog sections"`), and start the Studio again as in step 4.1 when it ran.

**Done** when every catalog section of the Theme holds the catalog's changes and the Creator's edits, Theme Check passes, the Creator has the list of changes, and the update is committed.

## 8. Delivery

When the Creator says the Theme is ready, deliver it. Delivery uploads a copy; it never publishes.

1. Check speed and accessibility with Lighthouse, against the Theme Store's bars: performance 60 and accessibility 90, each averaged over the home, product and collection pages. Run it on the preview: `GET /api/preview` gives its `url` (start the Studio as in step 4.1 when it isn't running). Test `<url>/`, `<url>/products/<handle>` and `<url>/collections/<handle>`, with a product and a collection from `GET /api/store`, each on mobile and on desktop, writing the reports outside the Theme folder:

   ```sh
   npx lighthouse <page> --only-categories=performance,accessibility --output=json --output-path=<report>.json --quiet --chrome-flags="--headless=new"
   npx lighthouse <page> --preset=desktop --only-categories=performance,accessibility --output=json --output-path=<report>.json --quiet --chrome-flags="--headless=new"
   ```

   Lighthouse needs Google Chrome; when it can't find it, ask the Creator to install it. A report's `categories.performance.score` and `categories.accessibility.score` run from 0 to 1 (0.9 is 90). An audit in `audits` with a `score` under 0.9 failed, and its `details.items` name the elements.
   - **Accessibility.** Fix every failing accessibility audit in the Theme (like missing alt text, labels, contrast or heading order), then run Lighthouse again on that page. When a color that fails contrast comes from the Brand, change it with `PUT /api/brand` after telling the Creator.
   - **Performance.** Fix what the Theme causes (like images without `width`, `height` or `loading="lazy"`, or render-blocking scripts). The local preview adds theme dev's own script, so it scores a little lower than the live shop; the store's own images and apps count too.

   Tell the Creator the scores, page by page for mobile and desktop, and what you fixed. When an average stays under its bar, say what holds it back; the Theme still ships, since only the Theme Store requires the bars.
2. Run `shopify theme check --path <theme>`. It must exit 0 (zero errors); fix every error first, including any the Lighthouse fixes brought. Deliver nothing until it passes.
3. Commit any open change in `<theme>`.
4. Deliver it one way; the first is the default:
   - **Push unpublished** (default), to the Merchant's store. When the preview ran on a development store (step 1), ask for the Merchant's `<shop>.myshopify.com` and check access to it the same way; a development store can't be handed to a Merchant. `<theme name>` is the `theme_name` from step 3.2:

     ```sh
     shopify theme push --path <theme> --store <shop>.myshopify.com --unpublished --theme "<theme name>" --json
     ```

     It creates a new unpublished theme, and its output holds the theme's id and its preview and editor links; give both links to the Creator. When it reports files that failed to upload, fix them and push again with `--theme <id>` in place of `--unpublished --theme "<theme name>"`, so no second copy is created.
   - **Zip**, when the Creator can't push to the Merchant's store. Run `shopify theme package --path <theme>`: it writes `<theme_name>-<theme_version>.zip` (both from `config/settings_schema.json`) into `<theme>`. Move it next to the Theme folder, so Git doesn't track it. The Merchant uploads it in Shopify admin › Online Store › Themes › Add theme › Upload zip file, and it arrives unpublished.
   - **GitHub integration**, when the Creator deploys from Git. Tell them to:
     1. Create an empty GitHub repository, then in `<theme>` run `git remote add origin <repo-url>` and `git push -u origin main`.
     2. In Shopify admin › Online Store › Themes › Add theme › Connect from GitHub, log in to GitHub, and pick the repository and the `main` branch. The theme arrives unpublished.
     3. From then on each push to `main` updates that theme, and changes saved in the Theme Editor are committed back to `main`: run `git pull` before editing locally.
5. Tell the Creator that the Merchant publishes the theme in Shopify admin › Online Store › Themes, after reviewing it.

**Done** when the Creator has the Lighthouse scores with every accessibility failure the Theme causes fixed, Theme Check passed, and the theme is on the store unpublished, the zip is ready, or the Creator has the GitHub steps, and nothing was published.
