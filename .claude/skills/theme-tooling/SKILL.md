---
name: theme-tooling
description: Theme Check, `theme dev` and Section Catalog conventions for this repo. Use when validating a theme with Theme Check, previewing with `shopify theme dev`, or writing or reviewing a Section Catalog section.
---

# Theme tooling

Two folders form every Theme: `base-theme/` (Shopify's Skeleton, vendored under its own `LICENSE.md`; provenance in `base-theme/PROVENANCE.md`) and `catalog/` (the Section Catalog, laid out like a theme: `catalog/sections/<name>.liquid`). An example Theme is `base-theme/` with `catalog/` copied on top.

The Studio composes only the home, product and collection pages. Every other JSON template (cart, page, blog, article, search, 404, password, collections list) uses the Base Theme's own section, a basic layout built from the `.basic-page` classes in `base-theme/assets/critical.css` with a color scheme setting, so it follows the Brand. There are no `customers/*` templates: the header links to Shopify's new customer accounts, which need none, so a shop still on classic customer accounts gets no account pages.

## Validate

Run `npm run check:theme` (Theme Check on the example Theme, one line per offense as `file:line severity check: message`). Done means it exits 0: **zero errors**, the same gate CI applies. To check a scratch section, pass a folder laid out like `catalog/`: `node scripts/check-theme.mjs <dir>`.

## Preview with `theme dev`

`shopify theme dev` needs the Shopify CLI (Node ≥ 22.12), a login, and a store (a free development store works). It serves the theme from a folder and hot-reloads files saved there by any process: CLI 4.8.0 watches the folder with chokidar, which reports OS file events whoever writes the file (checked on 2026-09-22 with CLI 4.8.0 against a development store: a file written by another process was synced within a second, `Synced » update sections/hello-world.liquid`, and the rendered page showed it). A write by the Studio or an agent reaches the preview the same way as a save in an editor.

The Studio runs `theme dev` itself (`studio --theme <dir> --store <shop>.myshopify.com --store-password <password>`) and shows its status and link. `--store` is required, so `theme dev` never falls back to the store the CLI used last (`shopify store create dev` makes a free development store). Development stores always have a storefront password (Shopify admin › Online Store › Preferences), and `theme dev` can't ask for it from the Studio; the Studio passes it through `SHOPIFY_FLAG_STORE_PASSWORD`. Give each Theme its own store: the CLI keeps one development theme per store per machine, so two `theme dev` runs on one store overwrite each other. The Studio reads its status and link from the CLI's output (`studio/server/preview.mjs`), so it needs Shopify CLI 4.8.0 or newer (the version that output was checked against). On first run the CLI prints a login link in the Studio's terminal and waits; the Studio shows "Login required" until the preview starts. With `CI` set the CLI can't log in and stops: run `shopify auth login`, then start the Studio again.

1. Assemble a Theme folder: `mkdir -p <dir> && cp -R base-theme/. catalog/. <dir>`
2. Run `shopify theme dev --path <dir> --store <shop>.myshopify.com` and open the printed `http://127.0.0.1:9292` link.
3. Edit the section in `catalog/`, then copy that file into `<dir>` again: the folder is a copy, and edits made there stay there.

## Shop language

A Theme ships English as its default locale: `locales/en.default.json` (storefront text) and `locales/en.default.schema.json` (Theme Editor labels). When the shop's language isn't English, the product skill adds `locales/<code>.json` and `locales/<code>.schema.json` (the convention is in the root `SKILL.md`, step 3.4). Theme Check's `MatchingTranslations` fails on a key missing from, or added to, the shop's language file.

When the Studio copies a catalog section into a Theme that lacks some Base Theme keys, it adds them in English to every locale file, so Theme Check keeps passing; translate them afterwards. In this repo, add new keys only to `base-theme/locales/en.default.json`.

## Section Catalog conventions

Every catalog section follows all of these:

- **Self-contained.** One file in `catalog/sections/`, depending only on what `base-theme/` ships. Themes copy sections once; afterwards the copy belongs to the Theme.
- **Brand only through settings.** Use the Base Theme's Brand, never hardcoded colors or fonts: the `color_schemes` group in `config/settings_schema.json` and the CSS variables `snippets/css-variables.liquid` sets from it (`--color-background`, `--color-foreground`, `--color-button`, `--color-button-label`, `--font-heading--*`, `--font-body--*`). Headings pick up the heading font from `assets/critical.css`.
- **Per-section color scheme.** The schema has `{"type": "color_scheme", "id": "color_scheme", "label": "t:labels.color_scheme", "default": "scheme-1"}` and the outer element carries `class="color-{{ section.settings.color_scheme }}"`, which sets the scheme's background, text color and color variables.
- **Native placeholders.** When an image, video, product or collection is blank, render Shopify's placeholder: `{{ 'image' | placeholder_svg_tag: 'placeholder' }}`, `'product-1'` to `'product-6'` for product cards, `'collection-1'` to `'collection-6'` for collections, `'lifestyle-1'`/`'lifestyle-2'` for hero media. An empty development store should still look like a shop.
- **Presets.** Give the schema a `presets` entry, so the Creator can add the section in the Theme Editor.
- **Group sections.** A section that belongs in a section group, like `header` and `footer`, sets `"enabled_on": {"groups": ["header"]}` (or `["footer"]`), so the Studio leaves it out of the sections it adds to pages. A section a page shows once, like the header, also sets `"limit": 1`: its preset lets the Merchant add it back after removing it, and the limit stops a second copy in the group. The group file places it (`sections/header-group.json`, `sections/footer-group.json`); when the Base Theme's group file sets settings or blocks the catalog section doesn't have, ship a replacement group file next to it in `catalog/sections/` (the footer does).
- **Page sections.** A section that needs a page's object, like `product` for the main product and related products or `collection` for the collection product grid, sets `"enabled_on": {"templates": ["product"]}` (or `["collection"]`), so the Studio offers it only for that page. A section a page shows once, like the main product or the collection product grid, sets `"limit": 1`; the Studio refuses to add more than the limit.
- **Storefront text.** Text the Creator writes is a section setting with a default (headings, button labels). Fixed text like accessible labels and form messages uses `{{ 'key' | t }}` with its key added to `base-theme/locales/en.default.json`. When the Studio copies a catalog section into a Theme, it also adds any Base Theme locale keys (in English, to every locale file) and theme settings the Theme lacks, so a Theme made from an older Base Theme still passes Theme Check.
- **Theme Editor text.** Every `name`, `label`, `info` and `content` in the schema is a `t:` key in `base-theme/locales/en.default.schema.json`, never literal text, so the shop's language can translate the Theme Editor. Reuse an existing key when the English text matches; otherwise add one in the Base Theme's groups: `general.<text>` for section, block, preset and header names, `labels.<text>` for setting labels, `options.<setting>.<value>` for select options, `info.<section>_<setting>` for help text. Theme Check's `ValidSchemaTranslations` fails on a key the locale lacks. Setting defaults (headings, button labels) stay literal: they are the Creator's content.
- **Shopify limits.** A template holds at most 25 sections; a section at most 50 blocks (keep `max_blocks` ≤ 50); a Liquid file at most 256 KB.
