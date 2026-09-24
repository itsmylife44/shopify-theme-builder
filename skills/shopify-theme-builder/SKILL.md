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

`<skill-dir>` below is the folder holding this `SKILL.md`. It holds `base-theme/`, `catalog/sections/`, `studio/`, `scripts/` (the Direction checker) and `references/` (the design method, read when a step names a file). The Theme lives in its own folder outside it; the Theme's files never go in `<skill-dir>`.

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

Once you have the store address, ask in the same step for its storefront password, under Password protection at `https://admin.shopify.com/store/<shop>/online_store/preferences`: development stores always have one, and a Merchant's store may too. A store whose storefront is open needs none. Without it, `theme dev` stops at the password prompt and the Creator sees no preview while the Directions are written.

A development store can't be transferred to a Merchant; for a Merchant's shop, use the Merchant's store with a collaborator account. Give each Theme its own store: the Shopify CLI keeps one development theme per store per machine, so two Themes previewed on one store overwrite each other.

When a `shopify` command asks to log in, have the Creator run `shopify auth login` in their own terminal, then check again.

Recommend, without requiring it, Shopify's AI Toolkit (https://github.com/Shopify/Shopify-AI-Toolkit) for later Liquid work. Its `shopify-liquid` skill sends prompts and code to Shopify unless the Creator opts out: create `~/.config/shopify-ai-toolkit/opt-out` or set `OPT_OUT_INSTRUMENTATION=true`.

**Done** when every check passes and you have the store address, and its storefront password unless the storefront is open.

## 2. Brief and Brand capture

Gather the **brief** the Theme's design comes from, the **Brand** the shop already has (colors, fonts, logo), the **shop languages**, the **shop name**, and the **author** (the Creator's name or business, shown as the Theme's author).

1. Ask for a reference first: the Creator's current website, a screenshot, or a moodboard. Read it as `<skill-dir>/references/design/brief.md` says, and tell the Creator what you took from it.
2. Gather the brief as `brief.md` says, asking only what the reference left open, one question at a time: the brand's **world**, the shopper's **scene**, **three emotions**, **references** from outside the shop's category, what the brand **rejects**, and what the product **photos** really are, then the photos themselves: a folder, files or links, or "none yet". Download links into your scratchpad and list what each photo shows, as `brief.md` says. Ask which colors and fonts are **pinned** (the brand keeps them); the others each Direction picks in step 4.
3. Turn the answers into Brand values, in this form for the pinned values now and for each Direction later:
   - **Color schemes.** Each scheme has six hex colors (`#RRGGBB`): `background`, `text`, `button`, `button_label`, `accent` (links in running text, sale prices and badges) and `border` (inputs, dividers and bordered cards), and an optional `background_gradient` (a CSS gradient like `linear-gradient(180deg, #FAF7F2, #EFE6D8)`, or `""` to clear it). Make `scheme-1` the main scheme and `scheme-2` its inverse; add `scheme-3` for a section in the accent color when there is one. Keep text-on-background, label-on-button and accent-on-background contrast at 4.5:1 or more, and border-on-background at 3:1 or more (inputs show only their border). The Studio's Brand tab flags any pair below that.
   - **Fonts.** A heading font, a body font and optionally an accent font (labels and prices; it defaults to Work Sans), each a handle from `<skill-dir>/studio/server/shopify-fonts.json` (Shopify's font library), like `work_sans_n4` (`n4` is regular 400, `n7` bold, `i4` italic). Its `families` is a list of `{ "family": "Archivo", "handles": ["archivo_n4", …] }`; `node -e "console.log(require('<skill-dir>/studio/server/shopify-fonts.json').families.map(f => f.family).join(', '))"` prints the family names. When a pinned font isn't there, pick the closest family and tell the Creator.
   - **Logo.** A PNG, JPEG, WebP or SVG file, at most 2 MB. Take the file the Creator gives, or download it from their website when that site is their own brand. None is fine: the header shows the shop name.
   - **Shop languages**: every language the shop sells in, each as the ISO code Shopify admin › Settings › Languages shows (`it`, `de`, `pt-BR`), and which of them is the shop's **default language** (the one customers see first). Ask whether it sells in more than one.
4. Read the brief back to the Creator in a few lines and have them confirm it.

**Done** when the Creator has confirmed the brief's six items, you have the photos with a line on what each shows (or "none yet"), the pinned colors and fonts have concrete values (or none is pinned), and the logo (or "no logo"), shop languages, shop name and author are known.

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

## 4. Open the Studio, write three Directions, compose the pages

1. Start the Studio as a background process that keeps running after your command returns, with its output going to a log file outside the Theme folder:

   ```sh
   node <skill-dir>/studio/bin/studio.mjs --theme <theme> --store <shop>.myshopify.com --store-password <password> > <log-file> 2>&1
   ```

   Leave out `--store-password <password>` only when the storefront is open (step 1).

   To stop this Studio and its `theme dev`, run `pkill -f "studio.mjs --theme <theme> "`, with `<theme>` exactly as in the start command and the trailing space kept. It matches only this Theme's Studio, so Studios and `theme dev` runs of other projects on the machine keep running.

   Read the Studio's URL from the log (`Local: http://localhost:5173/`); the port may differ. The Studio also starts `shopify theme dev` for the preview, and its output goes to the same log. While sections are being added, that log may show failed uploads (a template naming a section file not uploaded yet); they resolve within seconds, so judge by `GET /api/preview` and `validation` instead.
2. Write the Brand and compose the pages through the Studio's API at that URL. It checks every value, copies catalog sections into the Theme with the locale keys they need, and runs Theme Check after each write. Every call returns the Theme's state as JSON (the pages, their section ids, the Brand and `validation`); an error returns `{ "error": "…" }` saying what to fix.

   | Call | Body |
   | --- | --- |
   | `PUT /api/brand` | `{"colorSchemes": {"scheme-1": {"background": "#FFFFFF", "text": "#1A1A1A", "button": "#1A1A1A", "button_label": "#FFFFFF", "accent": "#8C2F1B", "border": "#8A8A8A"}}, "headingFont": "<handle>", "bodyFont": "<handle>", "accentFont": "<handle>"}` |
   | `PUT /api/style` | `{"<setting id>": <value>}`, any of the global style settings `GET /api/theme` lists under `style`, grouped as Type, Shape, Buttons, Spacing, Cards, Media and Motion, each as `{"id", "type", "label", "value"}` with a range's `min`, `max` and `step` or a select's `options`; like `{"type_heading_case": "uppercase", "shape_family": "round", "density": "airy", "motion": "subtle"}`. A `color` (the media tint) takes a hex color, or `""` for none. Settings you leave out keep their value |
   | `PUT /api/directions/<name>` | `{"settings": {"<setting id>": <value>}, "template": {"sections": {"hero": {"type": "hero", "settings": {}}}, "order": ["hero"]}}`; writes a Direction (one or two words, under 30 characters, at most three per Theme) as a preset in `config/settings_data.json`: the Theme's current settings with the given style settings, one left out taking its default, and `template` as its home page in `listings/<name in kebab case>/templates/index.json`, copying the catalog sections it names into the Theme. Its sections' and blocks' `image_picker` settings take `"shopify://shop_images/<filename>"` or `""`, as in `PATCH /api/<page>/sections/<id>`. Writing the chosen Direction again also rewrites `templates/index.json` |
   | `PUT /api/directions/current` | `{"name": "<Direction>"}`; switches the preview to it as Shopify applies a preset: `current` names it, the settings that aren't presentational (logo, texts, links) keep their value, and its listing becomes `templates/index.json` |
   | `PUT /api/directions/chosen` | `{"name": "<Direction>"}`; what the Studio's Choose button sends: switches to it as `current` does, unless the preview shows it already, and marks it on the `Chosen: <name>` line under the title of `<theme>/DIRECTION.md`, writing the file if the Theme has none |
   | `PUT /api/brand/logo` | the image file, with its `Content-Type` (`image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`) |
   | `POST /api/<page>/sections` | `{"type": "<catalog section>", "preset": "<preset name>"}`; the section starts with the named preset's settings and blocks (one of its `presets` under `catalog.<page>` in `GET /api/theme`, by its `name`, like `Hero: split`, or its `key`), or its first preset without `preset`; `<page>` is `home`, `product`, `collection`, `page`, `contact` (the `page.contact` template), `cart`, `search`, `blog`, `article`, `404` or `collections` (the collections list) |
   | `DELETE /api/<page>/sections/<id>` | none |
   | `GET /api/<page>/sections/<id>` | none; the section's `name`, `colorScheme`, `settings` and `blocks`, each setting as `{"id", "type", "label", "value"}`, the image and video settings under `media` (the section's and each block's) as `{"id", "type", "label", "set", "value"}`, `value` being like `"shopify://shop_images/cover.jpg"` or `null` when empty, and the `blockTypes` it can add, up to `maxBlocks` blocks |
   | `PATCH /api/<page>/sections/<id>` | any of `{"colorScheme": "scheme-2", "settings": {"<setting id>": <value>}, "blocks": {"<block id>": {"<setting id>": <value>}}}`; settings are the ones `GET` lists under `settings`, and the `image_picker` ones under `media`, which take an image in the shop's Files as `"shopify://shop_images/<filename>"` (the `image` `POST /api/files` answers), or `""` or `null` to clear it. Videos are picked in the Theme Editor |
   | `POST /api/<page>/sections/<id>/blocks` | `{"type": "<block type>"}`, one of the section's `blockTypes`; the block goes at the end, with its schema's defaults |
   | `DELETE /api/<page>/sections/<id>/blocks/<block id>` | none |
   | `PUT /api/<page>/sections/<id>/order` | `{"order": ["<block id>", …]}`, every block id of the section exactly once |
   | `GET /api/store` | none; the store's `collections`, `products` and `menus`, each as `{"handle", "title"}`; a collection also has `products`, its number of products |
   | `POST /api/files` | `{"path": "<absolute path of a local image>"}`, a jpg, png, webp or gif of at most 20 MB; puts it into the shop's Files and answers `{"image": "shopify://shop_images/<filename>", "url": "<cdn url>"}`, `image` being the value an `image_picker` setting takes. It takes a few seconds, and answers 409 with the `shopify store auth` command when the store isn't authenticated with `write_files` |
   | `PUT /api/<page>/order` | `{"order": ["<id>", …]}`, every section id of the page exactly once; a new section is added at the end, so move it with this |
   | `GET /api/theme` | none; the current state, with the header and footer groups' sections under `header` and `footer`, the catalog sections each page can take under `catalog` (each `{"type", "presets"}`, a preset `{"name", "key", "settings", "blocks"}`: its layout variants, like `Hero: split` or `Hero: full screen`, `key` its name as the schema writes it), the Custom Sections under `custom`, the global style settings under `style`, the Directions under `directions` (each `{"name", "thesis", "choices", "showing", "chosen"}`: the thesis is the first paragraph and the choices the list under its `## <name>` heading in `DIRECTION.md`, up to a subheading; `showing` while the preview shows its preset untuned), and under `history` whether `undo` and `redo` have a step |
   | `POST /api/undo` | none; puts back the files the latest Studio write changed (at most 50 steps, kept until the Studio stops). It refuses, naming the file, when that file changed outside the Studio since, and never undoes those edits |
   | `POST /api/redo` | none; writes again what `POST /api/undo` put back, until a new write |

   The calls on `/api/<page>/sections/<id>` (`GET`, `PATCH` and the block calls) also take `header` or `footer` as `<page>`, for the sections of the header and footer groups every page shares, like the footer's newsletter and menus.

   For example: `curl -X PUT <studio>/api/brand/logo -H 'Content-Type: image/png' --data-binary @logo.png`.

   With no logo, the header and footer show the store's name from Shopify admin, not the shop name from step 2. Compare the two: the store's name is the display name in `shopify store info --store <shop>.myshopify.com --json`, or the name in the preview's header once it runs. When they differ, tell the Creator to change it in Shopify admin › Settings › General › Store name.
3. Write three **Directions**, as `<skill-dir>/references/design/directions.md` says: derive three cards from the brief, check each with the swap test and against `<skill-dir>/references/design/tells.md`, and make sure they differ on at least three axes. Then write them:
   1. Upload the logo (`PUT /api/brand/logo`) when there is one; it stays in every Direction. Upload each photo of the brief with `POST /api/files`, and add its `image` value to its line in your list of what each photo shows. When it answers 409, run the `shopify store auth` command it names as a background process, give the Creator the login link it prints, and upload again once they approve.
   2. For each Direction: `PUT /api/brand` with its color schemes and fonts (the pinned ones are the same in all three), then `PUT /api/directions/<name>` with its style settings and its home template: 6 to 8 sections from `catalog.home` in `GET /api/theme`, its signature section and at least one moving element among them (a slideshow, a marquee, a testimonials or collection list carousel, product cards with a second image or a zoom on hover: the list is in `directions.md`), in the order its sketch shows, alternating dense and airy, image-led and type-led (never two type-only sections next to each other), neighbours on different color schemes. The three Directions don't all use `motion: subtle`: at least one uses `expressive` when its thesis allows. Give each section the shop's text, in the default language, in its `settings` and `blocks`; start a section from the preset whose layout fits the sketch, its `settings` and `blocks` from `catalog.home` (the blocks a section like testimonials starts with are there too); the other setting ids are in the schema of `<skill-dir>/catalog/sections/<type>.liquid`. Place the photos in the sections that show one (the hero or the slides, image with text, editorial split, process steps, lookbook, image gallery, multicolumn with images): set each `image` setting, the section's or its blocks', to the `image` value of a photo whose content fits the Direction's thesis and the section's job, like the workshop in process steps and a scene in the hero. Without photos, a Direction stands on type and color: pick sections and layouts that need no image (type banner, rich text, marquee, spec tiles, testimonials, timeline, a collection list's `text_list`, multicolumn `numbered`, a newsletter that isn't `split`), with a featured collection's product cards as the image-led sections between them, and leave out the hero, slideshow, image with text, editorial split, lookbook and process steps (it has no no-image form: multicolumn `numbered` or timeline tell the steps). Never leave an image setting blank where the layout shows it: the storefront draws a placeholder there, full width on mobile, and the checker reports it as `placeholder`. Then run `node <skill-dir>/scripts/check-direction.mjs <theme>`: it checks the color schemes the Theme has now, the Direction just written, so fix its `contrast` findings (text 4.5:1, borders 3:1) with `PUT /api/brand`, write the Direction again, and check again before the next one. Its other findings wait for the review in sub-step 9.
   3. `PUT /api/directions/current` with the first Direction, so the preview shows it.
   4. Write `<theme>/DIRECTION.md` from `<skill-dir>/references/design/direction-template.md`: the brief, then the three cards in the order the Studio lists them, with no `Chosen:` line (the Studio writes it).
4. Hand the choice to the Creator. When `GET /api/preview` is `running` (sub-step 8), give them the Studio's URL, to open in Google Chrome, and each Direction's thesis in one line: in the Directions tab they switch the preview between the three and choose one. Don't choose for them. When they ask for changes or a mix of two, check the changed card again, rewrite that Direction as in sub-step 3.2 and its card, and switch the preview to it (`PUT /api/directions/current`). Once `directions` in `GET /api/theme` shows one `chosen`, add its `### Rules` to `DIRECTION.md`, do/don't pairs with their reasons, as `directions.md` says. The chosen Direction's home is now the Theme's home page.
5. Compose the other pages. A page keeps at least one section, so add the new sections before removing the Base Theme's `main`:
   - **product**: add `main-product` and `related-products`, then remove `main`. Set the main product's `gallery_layout` (grid, stacked, thumbnails or carousel) to suit the Direction.
   - **collection**: add `main-collection`, then remove `main`.
   - **page**, **contact**, **cart**, **search**, **blog**, **article**, **404** and **collections** already hold their catalog main section from step 3 (`contact-form`, `main-cart` …; the plain page keeps the Base Theme's `page`). Leave them as they are, unless the Creator wants more on one: then add sections from `catalog.<page>`, like a `rich-text` on the 404 page.
   - **contact** shows the `contact-form` alone: its title is the Contact page's title from Shopify admin (the `heading` setting overrides it), and the page's content shows as an intro above the form. Set its `layout` to suit the Direction: `centered` (the default), `details` (the shop's email, phone number, address and opening hours, in its `details` setting, beside the form; only facts the Creator confirmed, as step 4.6 says) or `image` (an image beside the form: a photo from the brief, set as step 4.6 says; without one, not this layout).

   Every choice follows the chosen Direction's rules in `DIRECTION.md`.

   Point the sections at the store: a `collection` setting (like the featured collection's) takes a collection's handle, `product` a product's, `link_list` a menu's, and `collection_list` or `product_list` a list of handles like `["summer-sale"]`. Pick them from `GET /api/store`. Give every `collection` setting a collection whose `products` is above 0, even on the home page: Shopify's `frontpage` ("Home page") collection is often empty, and an empty collection shows example product cards. When the store has products, no product section stays on example cards. A `url` setting (a button link) takes a store path like `/collections/summer-sale`, an `https://` link, or `shopify://collections/<handle>`. An empty value clears a setting. Layout options take their own values: a `checkbox` `true` or `false`, a `range` a number within its `min`, `max` and `step`, a `number` a number (`null` clears it), a `select` or `radio` one of its `options`' values; `GET` the section to see them. When `GET /api/store` answers an error, run `shopify store auth --store <shop>.myshopify.com --scopes read_products,read_online_store_navigation,write_files` as a background process and give the Creator the login link it prints; the Studio lists the store once they approve.
6. Write the text of every section you added, and the headings, text and button labels of the other pages' main sections (like the 404 page's), in the shop's default language: the catalog's defaults are English placeholders ("Welcome to our store"). For each section, `GET` it and `PATCH` its `settings` and `blocks` with text written for the shop, from the brief and in the Direction's voice; check the home page's text the same way. Sections with blocks (testimonials, FAQ) start with three: add or remove blocks so their number fits what the shop has to say. A `text` or `inline_richtext` value is a line of text; a `richtext` value is HTML paragraphs (`<p>…</p>`). Write the footer too (`PATCH /api/footer/sections/footer`): its `text` block gets the brand's one line in the Direction's voice as its `text`, with the contact facts the Creator gave (address, opening hours, email) below it; the `menu` block's `menu` takes a menu from `GET /api/store` (menus are store content: their links are edited in Shopify admin › Online Store › Navigation, not in the Theme); the `social` block shows the theme's social media settings as icons, which the Studio doesn't write: put the full `https://` links the Creator gave in `social_instagram`, `social_facebook`, `social_tiktok`, `social_x`, `social_youtube` or `social_pinterest` in `config/settings_data.json`, under `current` (when `current` is a Direction's name, in that preset under `presets`), and remove the `social` block when there are none. Place the brief's photos on the other pages the same way as on the home page (sub-step 3.2): `PATCH` each image setting a section's layout shows with a photo that fits, and without one pick a layout or section that needs none. Leave product and collection names to Shopify. Never put a to-do or a bracketed placeholder ("[Shipping times to come]", TODO) in text shoppers see: when a fact is missing (shipping times, return terms, an address), ask the Creator, write only what they confirmed, or leave the block out, and list what's missing in the hand-off (step 5). Shopify shows this text in every language until it's translated; the other shop languages get it through Translate & Adapt (the hand-off, step 5).
7. Check `GET /api/theme`: `validation` must hold no offense with `"severity": "error"`. Fix any error in the file and line it names, then check again.
8. Check `GET /api/preview`: `{"status": "running", "url": …}` gives the preview link. `login-required` means the Shopify CLI printed a login link in the log: give it to the Creator and check again after they log in. `reconnecting` means the Studio is restarting `theme dev` because the store's storefront session expired; it is `running` again within seconds. `error` carries a message saying what to fix. When it still asks for the store password (it changed, or the storefront was open in step 1), ask the Creator for the storefront password, under Password protection at `https://admin.shopify.com/store/<shop>/online_store/preferences` (development stores always have one), stop the Studio, and start it again with `--store-password <password>` added.
9. Review the Theme before the hand-off, as `<skill-dir>/references/design/review.md` says: run `node <skill-dir>/scripts/check-direction.mjs <theme>` and fix its findings, screenshot the home, product and collection pages at 1440 and 390 pixels wide with whatever browser tool you have, and review them against `DIRECTION.md`, `<skill-dir>/references/design/tells.md` and `<skill-dir>/references/design/quality-floor.md`. The verdict is PASS or HOLD; a HOLD gets at most one fix round and one confirming round, then tell the Creator the verdict and anything left.
10. Commit the Theme in `<theme>` (`git add -A && git commit -m "Create the Theme"`).

**Done** when the Creator has chosen one of three Directions and `DIRECTION.md` holds the brief, the three cards and the chosen one's rules; the product and collection pages, every page's text and their collections and links are written; `validation` has zero errors, the preview is `running`, the review has its verdict and the Creator has it, and the Theme is committed.

## 5. Hand-off

Tell the Creator, in a few lines:

1. Open the Studio at its URL, in Google Chrome. It shows the real Theme in the middle and refreshes it after each change. Pick a page (home, product, cart, blog, 404 …) in the top bar. Click a section there, or in the list on the left (the header and footer included), to change its colors, text, layout options, collections, products, menus and links on the right; a page's sections can also be moved or removed; add sections from the list; the Brand tab holds colors, fonts and logo, the Directions tab compares the Directions, switching the preview between them, and chooses one, and the Style tab the type scale, shape, buttons, spacing, product cards, media and motion.
2. The photos from the brief, when there are any, are in the shop's Files (Shopify admin › Content › Files) and placed in the sections. Other images and videos are picked in Shopify's Theme Editor: the selected section in the Studio shows each image and video setting, whether it's set (with a set image's file name), and a "Choose in the Theme Editor" link that opens the page in the Theme Editor on the preview's development theme, where they select that section. Products and menus are edited in the Shopify admin. For a contact page, the Merchant picks the `contact` template for their Contact page in Shopify admin › Online Store › Pages.
3. The Theme lives in `<theme>`, with its own Git history. `DIRECTION.md` there holds the chosen Direction's rules and why, for anyone who changes the Theme later. You can keep changing it: the Studio picks up your edits while it runs.
4. To stop the Studio, ask me; to start it again, run the command from step 4.1 (with `--store-password` when the storefront has a password).
5. When the shop sells in more than one language: the Theme's own text (buttons, labels, messages) comes in each language from its locale files, and the page text is written in the default language. Translate the page text into the other languages with Shopify's free Translate & Adapt app: install it from the Shopify App Store, make sure each language is added in Shopify admin › Settings › Languages, then in the app pick the language and the theme and translate its sections' text (Auto-translate fills it in to review). Translations belong to one theme on the store, so translate the theme delivered in step 8; text changed later in the Studio or Theme Editor needs translating again.
6. Only when there is no logo and the store's name differs from the shop name (step 4.2): the header and footer show the store's name, so change it in Shopify admin › Settings › General › Store name.
7. Only when a fact was missing in step 4.6: what you left out of the text or wrote generically (shipping times, return terms, an address), and where to add it in the Studio.
8. Ask you for a section the catalog doesn't have (step 6), to bring a newer catalog's fixes into the Theme's sections (step 7), and to deliver the Theme to the store when it's ready (step 8).

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
5. Write its text in the shop's default language (`PATCH`, like step 4.6), and ask the Creator to check it in the Studio; its images are edited in the Theme Editor. Then commit it in `<theme>`.

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

      It keeps the Creator's edits (settings, text, custom CSS) and adds the catalog's. It exits with the number of conflicts, each between `<<<<<<< theme` and `>>>>>>> catalog` in the file: resolve each by hand, keeping what the Creator meant and the catalog's fix. The footer shows the social links only through its `social` block: when a Theme's footer gains it and a `social_*` theme setting is set, add a `social` block to its `sections/footer-group.json`.
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
