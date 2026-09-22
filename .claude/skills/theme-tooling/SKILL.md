---
name: theme-tooling
description: Theme Check, `theme dev` and Section Catalog conventions for this repo. Use when validating a theme with Theme Check, previewing with `shopify theme dev`, or writing or reviewing a Section Catalog section.
---

# Theme tooling

Two folders form every Theme: `base-theme/` (Shopify's Skeleton, vendored under its own `LICENSE.md`; provenance in `base-theme/PROVENANCE.md`) and `catalog/` (the Section Catalog, laid out like a theme: `catalog/sections/<name>.liquid`). An example Theme is `base-theme/` with `catalog/` copied on top.

## Validate

Run `npm run check:theme` (Theme Check on the example Theme, one line per offense as `file:line severity check: message`). Done means it exits 0: **zero errors**, the same gate CI applies. To check a scratch section, pass a folder laid out like `catalog/`: `node scripts/check-theme.mjs <dir>`.

## Preview with `theme dev`

`shopify theme dev` needs the Shopify CLI (Node ≥ 22.12), a login, and a store (a free development store works). It serves the theme from a folder and hot-reloads files you save there (unverified for files written by another process).

1. Assemble a Theme folder: `mkdir -p <dir> && cp -R base-theme/. catalog/. <dir>`
2. Run `shopify theme dev --path <dir> --store <shop>.myshopify.com` and open the printed `http://127.0.0.1:9292` link.
3. Edit the section in `catalog/`, then copy that file into `<dir>` again: the folder is a copy, and edits made there stay there.

## Section Catalog conventions

Every catalog section follows all of these:

- **Self-contained.** One file in `catalog/sections/`, depending only on what `base-theme/` ships. Themes copy sections once; afterwards the copy belongs to the Theme.
- **Brand only through settings.** Use the Base Theme's Brand, never hardcoded colors or fonts: the `color_schemes` group in `config/settings_schema.json` and the CSS variables `snippets/css-variables.liquid` sets from it (`--color-background`, `--color-foreground`, `--color-button`, `--color-button-label`, `--font-heading--*`, `--font-body--*`). Headings pick up the heading font from `assets/critical.css`.
- **Per-section color scheme.** The schema has `{"type": "color_scheme", "id": "color_scheme", "label": "Color scheme", "default": "scheme-1"}` and the outer element carries `class="color-{{ section.settings.color_scheme }}"`, which sets the scheme's background, text color and color variables.
- **Native placeholders.** When an image, video, product or collection is blank, render Shopify's placeholder: `{{ 'image' | placeholder_svg_tag: 'placeholder' }}`, `'product-1'` to `'product-6'` for product cards, `'collection-1'` to `'collection-6'` for collections, `'lifestyle-1'`/`'lifestyle-2'` for hero media. An empty development store should still look like a shop.
- **Presets.** Give the schema a `presets` entry, so the Creator can add the section in the Theme Editor.
- **Shopify limits.** A template holds at most 25 sections; a section at most 50 blocks (keep `max_blocks` ≤ 50); a Liquid file at most 256 KB.
