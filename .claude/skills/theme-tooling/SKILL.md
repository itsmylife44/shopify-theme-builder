---
name: theme-tooling
description: This repo's theme workflow and Section Catalog rules. Use when validating a theme with Theme Check, previewing with `shopify theme dev`, or writing or reviewing a Section Catalog section.
---

# Theme tooling

Two folders form every Theme: `base-theme/` (Shopify's Skeleton, vendored under its own `LICENSE.md`; provenance in `base-theme/PROVENANCE.md`) and `catalog/` (the Section Catalog, laid out like a theme: `catalog/sections/<name>.liquid`). An example Theme is `base-theme/` with `catalog/` copied on top.

## Validate

Run `npm run check:theme`. It assembles the example Theme in a temp folder, runs Theme Check (`@shopify/theme-check-node`, `theme-check:recommended` from `base-theme/.theme-check.yml`) and prints one line per offense as `file:line severity check: message`. Done means **0 errors**; CI runs the same script on every PR. Treat warnings as work to fix before you finish.

`node scripts/check-theme.mjs <dir>` checks `base-theme/` plus `<dir>` in place of `catalog/`, handy for a scratch section.

## Preview with `theme dev`

`shopify theme dev` needs the Shopify CLI (Node ≥ 22.12), a login, and a store (a free development store works). It serves the theme from a folder and hot-reloads its files.

1. Assemble a Theme folder: `mkdir -p <dir> && cp -R base-theme/. catalog/. <dir>`
2. Run `shopify theme dev --path <dir> --store <shop>.myshopify.com` and open the printed `http://127.0.0.1:9292` link.
3. Edit the section in `catalog/`, then copy that file into `<dir>` again: the folder is a copy, and edits made there stay there.

## Section Catalog conventions

Every catalog section follows all of these:

- **Self-contained.** One file in `catalog/sections/`, depending only on what `base-theme/` ships. Themes copy sections once; afterwards the copy belongs to the Theme.
- **Per-section color scheme.** The schema has `{"type": "color_scheme", "id": "color_scheme", "label": "Color scheme", "default": "scheme-1"}` and the outer element carries `class="color-{{ section.settings.color_scheme }}"`. The setting needs a `color_scheme_group` in `base-theme/config/settings_schema.json`, which the Brand work adds. Theme Check does **not** flag a missing group; the upload to Shopify fails instead.
- **Native placeholders.** When an image, video, product or collection is blank, render Shopify's placeholder: `{{ 'image' | placeholder_svg_tag: 'placeholder' }}`, `'product-1'` to `'product-6'` for product cards, `'collection-1'` to `'collection-6'` for collections, `'lifestyle-1'`/`'lifestyle-2'` for hero media. An empty development store should still look like a shop.
- **Presets.** Give the schema a `presets` entry, so the section can be added to templates.
- **Shopify limits.** A template holds at most 25 sections; a section at most 50 blocks (keep `max_blocks` ≤ 50); a Liquid file at most 256 KB.
