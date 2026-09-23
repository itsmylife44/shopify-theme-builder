# Research: theme styles, presets and global design settings

Date: 2026-09-23. Question: how do premium Shopify themes let a merchant pick a design and then tune it, so we can design our own "design direction" system for the Brand and the Studio?

Primary sources only. Repo snapshots: `Shopify/horizon@5acd1b6` (Horizon 4.2.0, 2026-09-21) and `Shopify/dawn@258f00f` (Dawn 16.0.0). Premium theme code is not public, so for Prestige, Impact, Symmetry and Be Yours the evidence is (a) their Theme Store listing pages and (b) the CSS custom properties and section markup that their live demo stores render. Those values come straight from each demo's `settings_data.json` and templates. Anything inferred is marked **inferred**.

## TL;DR

1. **A "theme style" (preset) is just a named copy of global setting values, plus optional template JSON.** `config/settings_data.json` has `current` and `presets`. Picking a preset copies that preset's values into `current`, but only for *presentational* input types (checkbox, color, color_background, color_palette, color_scheme, color_scheme_group, font_picker, number, radio, range, select). Text, images, URLs and resources are left alone. Limits: 5 presets, 1.5 MB file ([settings_data.json](https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json)).
2. **Since May 2025, a preset can also bring its own templates and section groups** from `listings/<preset-kebab>/templates/*.json` and `listings/<preset-kebab>/sections/*.json`. These files override the base `/templates` and `/sections` JSON on install. Before that, only the first preset could be installed ([changelog 2025-05-26](https://shopify.dev/changelog/theme-files-are-now-installable-at-the-preset-level-on-the-shopify-theme-store), [requirements §18](https://shopify.dev/docs/storefronts/themes/store/requirements), [zip structure](https://shopify.dev/docs/storefronts/themes/store/success/updates)).
3. **In practice, styles of one theme share all of their code. They differ in about 15 to 25 global values plus the home-page composition.** The values: heading and body fonts and weights, heading case and tracking, button case, tracking and font, radii (sharp, rounded or pill), palette, base text size and type scale, section vertical spacing, container width, card hover effect and icon stroke. The home pages are built from the same section catalog in a different order and mix. This holds for Prestige, Impact, Symmetry and Shopify's own Horizon family (Horizon, Tinker, Savor, Atelier). The measured diffs are in §4.
4. **Horizon's global design model is the one to copy.** It has 5 layers:
   - **Palette.** One `color_palette` of named colors, which Horizon switched to in 4.0.0 from color schemes. Component colors default to palette references.
   - **Four font roles.** Body, subheading, heading and accent.
   - **Seven type presets.** Paragraph and H1 to H6. Each preset sets its font role, a size from a fixed scale, line-height, letter-spacing and case. Blocks then pick a preset instead of raw sizes.
   - **Per-component shape tokens.** Radius and border width for buttons, inputs, popovers, pills, badges, cards, swatches and variant buttons.
   - **A few enums.** Page width, card hover effect and icon stroke.

   Layout variety lives in sections and blocks (flex direction, gap, width, height and padding), not in global settings.
5. **Horizon's license lets us read it and learn from it, but not copy it into this repo.** Dawn's license is looser, but it is still "Shopify-only", not MIT. §6 has the details.

---

## 1. How theme styles and presets work technically

### 1.1 `settings_data.json`

Source: [settings_data.json](https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json).

| Object | Meaning |
| --- | --- |
| `current` | The setting values currently saved in the theme editor. Required. |
| `presets` | One object per theme preset, each "in the same format as `current`". Required. |
| `platform_customizations` | Platform-owned values, such as theme-level custom CSS. Themes must not write it. |

- "Presets enable you to create up to five pre-configured designs from the same theme code base. Each preset includes a combination of layout options, color palettes, typography, and other visual elements."
- "Selecting a theme preset updates the `current` object to use the associated theme preset values. However, only values from presentational settings are updated."
- The presentational types, whose values are overwritten when the style changes, are `checkbox`, `color`, `color_background`, `color_palette`, `color_scheme`, `color_scheme_group`, `font_picker`, `number`, `radio`, `range` and `select`. Everything else keeps the merchant's value (for example `text`, `image_picker`, `url`, `link_list` and resource pickers).
- Limits: the file is at most 1.5 MB, and a theme has at most five presets.
- A preset can hold a `current`-style object that includes `sections` and `content_for_index` (Horizon's `current` has `"content_for_index": []`). The docs describe the switch in terms of presentational setting values only. Per the Help Center, "When you apply a theme style to your theme, you change your current settings, such as colors and typography" ([Help Center: theme settings](https://help.shopify.com/en/manual/online-store/themes/customizing-themes/theme-editor/theme-settings)). **Inferred:** switching a style in the editor does not rewrite templates. Preset templates only take effect at install time (see §1.2).

Real example: Horizon 4.2.0 ships exactly one preset, `"Default"`, whose values equal `current` (`config/settings_data.json`). The Theme Store "styles" of Horizon are separate themes (§4.4).

### 1.2 The `listings/` folder

Source: [Theme Store requirements §18](https://shopify.dev/docs/storefronts/themes/store/requirements), [Updating your theme: best practices on structuring your theme zip](https://shopify.dev/docs/storefronts/themes/store/success/updates).

```text
listings/
  <preset-name-kebab>/
    templates/*.json      # overrides the base /templates/*.json of the same name
    sections/*.json       # optional: preset-specific section groups (header-group.json, footer-group.json)
```

- The folder is needed only when a theme has more than one preset. Each preset needs "a unique set of templates showcasing each preset", "similar to the demo store it is associated with".
- The root `/templates` and `/sections` hold "the complete base set". Preset folders hold only the files that differ, and they don't need the same number of files. Folder names are kebab-case, since they are used in URLs.
- Preset names are 1 to 2 words and under 30 characters, and one preset must carry the theme's name. The key in `settings_data.json` `presets` is the display name (for example `"Canine Gourmand"`), and its folder is `listings/canine-gourmand`.
- Install parity: "On install, the theme should match the demo store's look and expectations … Layout and color/typography settings must match the demo … Demo imagery doesn't transfer on install."
- Shipped on 2025-05-26: "Installation of individual presets will now match the expectations set by the demo stores in a theme. Previously, only the first preset was installable" ([changelog](https://shopify.dev/changelog/theme-files-are-now-installable-at-the-preset-level-on-the-shopify-theme-store)). Before this, vendors worked around it by hand. Be Yours: "If you click Try theme, a theme with the default homepage (Beauty preset's homepage) is downloaded no matter which preset you choose … contact our team" ([RoarTheme, 2025-04-16](https://roartheme.co/blogs/be-yours/be-yours-theme-presets-and-updates-notices)).

### 1.3 What a preset can change

| Can change | How |
| --- | --- |
| Colors (palette, schemes, individual colors) | `color_palette` / `color_scheme_group` / `color` values in the preset |
| Fonts | `font_picker` values (must be Shopify-library fonts, [requirements §15](https://shopify.dev/docs/storefronts/themes/store/requirements)) |
| Type scale, line height, tracking, case | `select`/`range` values (Horizon: `type_size_h1` …) |
| Button, input, card, badge, popover and swatch styles | `range`/`select`/`checkbox` values (radius, border width, case, hover effect) |
| Page width, animations, cart type, icon stroke | `select`/`checkbox` values |
| Home page and other templates, header/footer groups | `listings/<preset>/templates` and `listings/<preset>/sections` (install time) |
| Logo, social links, text, images | **No.** These are non-presentational types and are kept. |
| Liquid, CSS or JS code | **No.** Every preset shares the same code. |

### 1.4 Color: palette vs schemes

- `color_palette` ([input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings#color_palette)):
  - A theme has one palette, defined in `settings_schema.json`, with 2 to 20 named hex colors. Keys use letters, digits and `_`, and alpha isn't allowed.
  - `color` and `color_background` settings can default to `{{ settings.<id>.<key> }}`, and a change to the palette propagates to them.
  - When a theme update adds keys, they appear in the merchant's palette, and merchant values win.
  - When a merchant deletes a color, it is stored as a reference to its chosen replacement.
- Shopify's [color system best practices](https://shopify.dev/docs/storefronts/themes/best-practices/design/color-system) recommend a small palette plus "local color overrides": a `color` setting with no default that returns `blank` and falls back to the palette.
- Horizon 4.0.0 (2026-06-15) "Removed global color scheme settings and replaced it with color palette settings", and "Added … numerous text and background color settings across blocks and sections" (Horizon `release-notes.md` at `95ca657102`).
- Dawn 16 and our Skeleton-based base theme still use `color_scheme_group`. Dawn's scheme roles are `background`, `background_gradient`, `text`, `button`, `button_label`, `secondary_button_label` and `shadow`.
- Theme Store rules: at least 4 colors, and every background color has a matching foreground ([requirements §16](https://shopify.dev/docs/storefronts/themes/store/requirements)).

---

## 2. Horizon's global design settings (`config/settings_schema.json`, v4.2.0)

Source: [Shopify/horizon config/settings_schema.json](https://github.com/Shopify/horizon/blob/main/config/settings_schema.json). Every setting is listed. Labels are translation keys, so they are paraphrased here. "palette.X" means the default is `{{ settings.color_palette.X }}`.

### 2.1 Logo, colors, page layout, animations, icons

| id | type | default | range / options |
| --- | --- | --- | --- |
| `logo`, `logo_inverse`, `favicon` | image_picker | – | – |
| `logo_height` / `logo_height_mobile` | range | 36 / 28 | 12–100 px, step 1 |
| `color_palette` | color_palette | `{background:#fff, foreground:#000}` (the Default preset adds `color1` #333, `color2` #EEF1EA, `color3` #DFDFDF) | 2–20 colors |
| `page_background_color` | color | palette.background | – |
| `page_width` | select | `narrow` | narrow (90rem) · normal (120rem) · wide (150rem) |
| `page_transition_enabled` | checkbox | true | – |
| `transition_to_main_product` | checkbox | true | – |
| `add_to_cart_animation` | checkbox | true | – |
| `card_hover_effect` | select | `lift` | none · lift · scale · subtle-zoom |
| `icon_stroke` | select | `default` | thin (1px) · default (1.5px) · heavy (2px) |

`page_width` and `card_hover_effect` become body classes (`page-width-{{…}} card-hover-effect-{{…}}` in `layout/theme.liquid`). `icon_stroke` becomes `--icon-stroke-width`.

### 2.2 Typography

| id | type | default | range / options |
| --- | --- | --- | --- |
| `page_text_color` | color | palette.foreground | – |
| `type_body_font` | font_picker | work_sans_n4 | – |
| `type_subheading_font` | font_picker | work_sans_n5 | – |
| `type_heading_font` | font_picker | anonymous_pro_n4 | – |
| `type_accent_font` | font_picker | anonymous_pro_n4 | – |
| `type_size_paragraph` | select | 14 | 10 · 12 · 14 · 16 · 18 |
| `type_line_height_paragraph` | select | body-normal | body-tight · body-normal · body-loose |
| `type_font_h1`, `type_font_h2` | select | heading | heading · accent |
| `type_font_h3` … `type_font_h6` | select | heading (h3), subheading (h4–h6) | heading · accent · subheading · body |
| `type_size_h1` … `type_size_h6` | select | 72 · 48 · 32 · 24 · 18 · 16 | 10 · 12 · 14 · 16 · 18 · 20 · 24 · 32 · 40 · 48 · 56 · 72 · 88 · 120 · 152 · 184 |
| `type_line_height_h1` … `h6` | select | display-normal | display-tight · display-normal · display-loose |
| `type_letter_spacing_h1` … `h6` | select | heading-normal | heading-tight · heading-normal · heading-loose |
| `type_case_h1` … `h6` | select | none | none · uppercase |

The Horizon Default preset overrides these to Inter n4/n5/n7/n7, paragraph 14 body-loose, and sizes h1 56, h2 48, h3 32, h4 24, h5 14, h6 12.

### 2.3 Badges, buttons, pills

| id | type | default | range / options |
| --- | --- | --- | --- |
| `badge_position` | select | top-left | bottom-left · top-left · top-right |
| `badge_corner_radius` | range | 40 | 0–100 px, step 2 |
| `badge_sale_background_color` / `badge_sale_text_color` | color | palette.foreground / – | – |
| `badge_sold_out_background_color` / `badge_sold_out_text_color` | color | palette.background / palette.foreground | – |
| `badge_font_family` | select | body | body · subheading · heading · accent |
| `badge_text_transform` | select | none | none · uppercase |
| `palette_primary_button_background` / `_text` / `_border` | color | palette.foreground / background / background | – |
| `primary_button_border_width` | range | 0 | 0–4 px |
| `button_border_radius_primary` | range | 100 | 0–100 px |
| `type_font_button_primary` | select | body | body · accent |
| `button_text_case_primary` | select | default | default · uppercase |
| `palette_secondary_button_background` / `_text` / `_border` | color | palette.background / foreground / foreground | – |
| `secondary_button_border_width` | range | 1 | 0–4 px |
| `button_border_radius_secondary` | range | 100 | 0–100 px |
| `type_font_button_secondary` | select | body | body · accent |
| `button_text_case_secondary` | select | default | default · uppercase |
| `pills_border_radius` | range | 40 | 0–40 px |

### 2.4 Cart, drawers, inputs, popovers, prices

| id | type | default | range / options |
| --- | --- | --- | --- |
| `cart_type` | select | page | page · drawer |
| `product_title_case` | select | default | default · uppercase |
| `cart_price_font` | select | subheading | body · subheading · heading · accent |
| `auto_open_cart_drawer` | checkbox | false | visible if drawer |
| `show_cart_note`, `cart_note_open_by_default`, `show_add_discount_code`, `show_installments`, `show_accelerated_checkout_buttons` | checkbox | false, false, true, true, true | – |
| `empty_cart_button_link` | url | /collections/all | – |
| `cart_thumbnail_border` | select | none | none · solid |
| `cart_thumbnail_border_width` / `_opacity` / `_radius` | range | 1 / 50 / 0 | 0–10 px / 0–100 % / 0–100 px |
| `drawer_background_color` / `drawer_text_color` / `drawer_border_color` | color | palette.background / foreground / foreground | – |
| `palette_input_background` / `_text` / `_border` | color | palette.background / foreground / foreground | – |
| `input_border_width` | range | 1 | 0–4 px |
| `inputs_border_radius` | range | 8 | 0–32 px |
| `type_preset` (inputs) | select | paragraph | "" · paragraph · h1–h6 |
| `popover_background_color` / `popover_text_color` | color | palette.background / foreground | – |
| `popover_border_radius` | range | 8 | 0–16 px |
| `popover_border_color` / `popover_border_width` | color / range | palette.foreground / 0 | 0–10 px |
| `popover_drop_shadow` / `popover_shadow_color` | checkbox / color | true / palette.foreground | – |
| `currency_code_enabled_product_pages` / `_product_cards` / `_cart_items` / `_cart_total` | checkbox | true | – |

### 2.5 Product cards, search, swatches, variant pickers

| id | type | default | range / options |
| --- | --- | --- | --- |
| `quick_add` / `mobile_quick_add` | checkbox | true / false | – |
| `quick_add_background` / `quick_add_text` | color | palette.background / foreground | – |
| `show_second_image_on_hover` / `product_card_carousel` | checkbox | true / true | – |
| `empty_state_collection` | collection | – | – |
| `product_corner_radius` | range | 0 | 0–32 px |
| `card_corner_radius` | range | 0 | 0–16 px |
| `card_title_case` | select | default | default · uppercase |
| `show_variant_image` | checkbox | false | – |
| `variant_swatch_width` / `_height` | range | 30 / 30 | 16–100 px |
| `variant_swatch_radius` | range | 100 | 0–100 px |
| `variant_swatch_border_style` | select | solid | none · solid |
| `variant_swatch_border_width` / `_opacity` | range | 1 / 10 | 0–10 px step 0.5 / 0–100 % |
| `palette_variant_background` / `_text` / `_border` | color | palette.background / foreground / foreground | – |
| `palette_selected_variant_background` / `_text` / `_border` | color | palette.foreground / background / foreground | – |
| `variant_button_border_width` | range | 1 | 0–4 px |
| `variant_button_radius` | range | 8 | 0–100 px |
| `variant_button_width` | select | equal-width-buttons | default-width-buttons · equal-width-buttons |

### 2.6 What Horizon does *not* expose globally

- It has no global shadow controls. Dawn has 5 shadow ranges per component (§2.7). Horizon keeps only a popover drop-shadow toggle, and `--shadow-button` is hard-coded.
- It has no global spacing or density slider. Spacing tokens are hard-coded (`--padding-xs` … `--padding-6xl`, `--gap-*`, `--margin-*`), and every section and block has its own padding and gap ranges.
- Animation speeds and easings are hard-coded CSS variables. Only on/off toggles and the hover-effect enum are settings.
- Section heights (`--section-height-small|medium|large`) are hard-coded responsive values in `svh`.

All of this is in [`snippets/theme-styles-variables.liquid`](https://github.com/Shopify/horizon/blob/main/snippets/theme-styles-variables.liquid).

### 2.7 For comparison: Dawn 16.0.0 global settings (condensed)

Source: [Shopify/dawn config/settings_schema.json](https://github.com/Shopify/dawn/blob/main/config/settings_schema.json). Dawn ships one preset, `"Dawn"`.

| Group | Settings (id: type, default, range) |
| --- | --- |
| Colors | `color_schemes`: color_scheme_group (roles background, background_gradient, text, button, button_label, secondary_button_label, shadow) |
| Typography | `type_header_font` font_picker assistant_n4; `heading_scale` range 100, 100–150 % step 5; `type_body_font` assistant_n4; `body_scale` range 100, 100–130 % step 5 |
| Layout | `page_width` range 1200, 1000–1600 px step 100; `spacing_sections` 0, 0–100 px step 4; `spacing_grid_horizontal` / `_vertical` 8, 4–40 px step 4 |
| Animations | `animations_reveal_on_scroll` checkbox true; `animations_hover_elements` select default · vertical-lift · 3d-lift |
| Buttons, variant pills, inputs | each: `*_border_thickness` 0–12, `*_border_opacity` 0–100 %, `*_radius` 0–40, `*_shadow_opacity`, `*_shadow_horizontal_offset` / `_vertical_offset` −12–12, `*_shadow_blur` 0–20 |
| Product cards, collection cards, blog cards | each: `*_style` standard · card, `*_image_padding` 0–20, `*_text_alignment` left · center · right, `*_color_scheme`, border thickness/opacity, `*_corner_radius` 0–40, 4 shadow ranges (−40–40, blur 0–40) |
| Content containers, media, popups, drawers | border thickness/opacity, radius (not drawers), 4 shadow ranges each |
| Badges | `badge_position` 4 corners; `badge_corner_radius` 0–40; sale / sold-out badge color schemes |
| Cart | `cart_type` drawer · page · notification; `cart_color_scheme`; vendor, note, drawer collection |

The contrast matters for our design:
- **Dawn** exposes one type-scale multiplier per font (`heading_scale`, `body_scale`), plus about 100 border and shadow knobs.
- **Horizon** swaps both for explicit per-level presets and a handful of radius and border values.

---

## 3. How Horizon makes layouts vary and keeps the type scale consistent

### 3.1 Sections are generic flex containers with presets

- Horizon has 42 section files and 95 block files. The generic [`sections/section.liquid`](https://github.com/Shopify/horizon/blob/main/sections/section.liquid) accepts `@theme`, `@app` and `_divider` blocks.
- It ships 13 **section presets**: custom section, rich text, FAQ, video, pull quote, contact form, email signup, icons with text, split showcase, image with text, multicolumn, image compare and large logo. Each preset is the same section with different block trees and settings.
- Its settings are the layout vocabulary reused by `group` blocks and most sections:

| Group | Settings |
| --- | --- |
| Layout | `content_direction` column · row; `vertical_on_mobile`; `horizontal_alignment` flex-start · center · flex-end · space-between; `vertical_alignment`; `align_baseline`; column-direction variants of both alignments; `gap` 0–100 px |
| Size | `section_width` page-width · full-width; `section_height` "" · small · medium · large · full-screen · custom; `section_height_custom` 0–100 % |
| Appearance | `background_media` none · image · video; `background_color`; video/image + position; `toggle_overlay`, `overlay_color`, `overlay_style` solid · gradient, `gradient_direction` |
| Borders | `border` none · solid; `border_width`, `border_opacity`, `border_color`, `border_radius` |
| Padding | `padding-block-start`, `padding-block-end` 0–100 px |

- [`blocks/group.liquid`](https://github.com/Shopify/horizon/blob/main/blocks/group.liquid) repeats the same layout, appearance and border settings. It adds `width` / `width_mobile` (fit-content · fill · custom %), `height` (fit · fill · custom %), four-side padding and a link. Nesting groups is how Horizon builds arbitrary layouts from one vocabulary.
- Named layout variants are presets of one section, not separate sections:
  - [`sections/product-list.liquid`](https://github.com/Shopify/horizon/blob/main/sections/product-list.liquid) has `layout_type` grid · carousel · editorial, `columns` 1–8, `mobile_columns`, `columns_gap` / `rows_gap`, and carousel icon style and shape. Its presets are "Products grid", "Products carousel" and "Products editorial".
  - [`sections/hero.liquid`](https://github.com/Shopify/horizon/blob/main/sections/hero.liquid) has presets hero, hero marquee and hero bottom-aligned.
- Buttons don't carry style settings of their own. [`blocks/button.liquid`](https://github.com/Shopify/horizon/blob/main/blocks/button.liquid) picks `style_class` button (primary) · button-secondary · button-unstyled (link) · button-custom. Only `button-custom` exposes per-block colors, and those default to palette references.
- Cards work the same way. [`blocks/product-card.liquid`](https://github.com/Shopify/horizon/blob/main/blocks/product-card.liquid) has only structural settings (gap, width, background, border, radius 0–32, padding) and a block list (gallery, title, price, swatches, review, …).

### 3.2 The type-preset mechanism

1. **Globals define 7 presets**: `paragraph` and `h1` to `h6` (§2.2). Each has font role, size, line-height token, letter-spacing token and case. Paragraph has no case or tracking and always uses the body font at weight 400.
2. **`theme-styles-variables.liquid` compiles them into CSS variables**: `--font-h2--family|style|weight|size|line-height|letter-spacing|case`.
   - Line-height and tracking are **named tokens**, not free numbers:

     | Token | tight | normal | loose |
     | --- | --- | --- | --- |
     | `--line-height--display-*` | 1 | 1.1 | 1.2 |
     | `--line-height--heading-*` | 1.15 | 1.25 | 1.35 |
     | `--line-height--body-*` | 1.2 | 1.4 | 1.6 |
     | `--letter-spacing--*-*` | −0.03em | 0 | 0.03em |

   - **Fluid sizes are derived, not set.** Every preset of 48px or more becomes `clamp(min, size×0.1vw, size)`. The minimum is the next smaller preset's size, plus 4px when that one is under the 48px cutoff, so on mobile the levels never swap order. Smaller presets are fixed `rem`.
3. **Blocks pick a preset**, never raw values. [`blocks/text.liquid`](https://github.com/Shopify/horizon/blob/main/blocks/text.liquid) has `type_preset`: rte · paragraph · h1–h6 · custom. `custom` reveals `font` (one of the 4 font-role variables), `font_size` (a fixed list of 0.625–11.5rem), `line_height` and `letter_spacing` (tight · normal · loose), `case` and `wrap`.
   - The text block renders the preset name as a class (`text-block h2`). `assets/base.css` maps `.text-block.h2` and `h2` to the `--font-h2--*` variables.
   - [`snippets/typography-style.liquid`](https://github.com/Shopify/horizon/blob/main/snippets/typography-style.liquid) handles `custom`. It decides whether the size is "display", "heading" or "body" and picks the matching line-height and tracking token family, so even custom text stays on the token grid.
4. **Section presets ship with presets set.** For example, "Pull quote" is a text block with `type_preset: h2`, `max_width: narrow`, `alignment: center`, plus an unstyled button, with gap 16 and padding 64/64. Counted across Horizon's sections, blocks and templates, `type_preset` is set to `rte` 38 times, `h2` and `h3` 16 each, `paragraph` and `h6` 14 each, `h4` 12 times, `h5` 8 times, `h1` twice and `custom` twice.

The result: changing one global (for example `type_size_h2` or `type_font_h4`) restyles every block that uses that preset. A theme style can therefore change the whole type personality through about 40 select values.

---

## 4. How premium themes offer multiple styles: what actually differs

Method: each preset's Theme Store page links a demo store. I fetched each demo's home page and compared (a) `Shopify.theme` (same `schema_name` and version means the same code), (b) the `:root` CSS custom properties that the theme prints from its settings, and (c) the ordered list of home-page section types (`shopify-section--<type>` classes). Fetched 2026-09-23.

### 4.1 Prestige (Maestrooo, v11.4.1, $400)

Current presets: Prestige (demo `prestige-theme-allure`, the former "Allure" style), Couture ("Designed for premium fashion collections"), Vogue ("Refined styling tailored to beauty and wellness brands"), Strass ("Designed for premium jewelry brands") and Signature ("Designed for premium shoe brands") ([Theme Store](https://themes.shopify.com/themes/prestige/presets/prestige)). All five demos report `schema_name: Prestige, schema_version: 11.4.1`, so they run the same code.

The only differing root variables (24 of 79 differ, and 2 of those are asset URLs):

| Variable | Allure/Prestige | Couture | Vogue | Strass | Signature |
| --- | --- | --- | --- | --- | --- |
| heading font | Instrument Sans 400 | Jost 400 | Jost 400 | Red Rose 400 | Geist 600 |
| body font | Nunito | Poppins | Jost | Geist | Geist |
| heading / button letter-spacing | 0.18em / 0.18em | 0.18em / 0.18em | 0.18em / 0.18em | 0.05em / 0.02em | 0 / 0 |
| button font | body | body | body | heading | heading |
| `--text-base` | 14px | 13px | 14px | 13px | 13px |
| heading size factor | 1 | 1 | 1 | 0.9 | 0.9 |
| section vertical spacing | 3rem | 2.5rem | 2rem | 4rem | 4rem |
| section stack gap | 2.5rem | 2.25rem | 1.5rem | 2.5rem | 2.5rem |
| custom badge / modal colors | light | dark | dark | dark | dark |
| sticky announcement bar | – | 0 | 0 | 1 | 0 |

Unchanged across all five: uppercase headings and buttons, button and input radius 0, container widths and shadows. The home pages use one catalog in different mixes:
- **Allure** has 22 sections, including slideshow, featured-collections, image-with-text-overlay, rich-text, media-grid, scrolling-content, video, shop-the-look, countdown, before-after-image, timeline, testimonials and newsletter.
- **Signature** has 12, and is the only one that uses `dynamic-grid`.
- **Strass** opens with rich-text.

Maestrooo's own docs don't describe the differences. The [changelog](https://support.maestrooo.com/article/789-prestige-theme-changelog) says only "update the preset of Vogue to match the updated demo store" (4.9.3, 2020-08-24).

### 4.2 Impact (Maestrooo, v7.2.0, $400)

Current presets: Impact (demo `impact-theme-sound`, the former "Sound"), Cocoon ("A serene, design-forward layout for modern home brands"; demo `impact-theme-home`) and Balance ("A dynamic, editorial style for fashion and wellness stores"; demo `impact-theme-shape`) ([Theme Store](https://themes.shopify.com/themes/impact/presets/impact)). All run schema 7.2.0.

| Variable | Impact (Sound) | Cocoon (Home) | Balance (Shape) |
| --- | --- | --- | --- |
| heading font | Barlow 700, −0.025em | Jost 700, −0.015em | Fraunces 300, −0.01em |
| body font | Barlow | Jost | Muli |
| radii: button / input / block / sm | 3.75rem (pill) / 0.5 / 1.5 / 0.375 | **all 0** | 3.75rem / 0.5 / 1.25 / 0.3125 |
| heading sizes h0–h4 | 3 · 2.5 · 2 · 1.5 · 1.375rem | same | 2.75 · 2 · 1.75 · 1.375 · 1.125rem |
| container max width | 1600px | 1600px | 1520px |
| section outer spacing | spacing-12 | spacing-12 | spacing-10 |
| block shadow | 0 18px 50px | 0 0 50px | 0 0 50px |
| palette | grey bg #F0F0F0, yellow secondary button, purple badge | white, blue secondary | white, teal text #2A555A, salmon secondary |

50 of 125 root variables differ, most of them colors. The home pages use the same catalog again: slideshow, image-link-blocks, scrolling-text, impact-text, media-grid, hot-spots, before-after-image, press and so on, in different orders.

### 4.3 Symmetry (Clean Canvas, v8.3.1, $420) and Be Yours (RoarTheme, v9.5.1, $350)

- **Symmetry** presets are Symmetry (demo `chantilly`), Amara, Beatnik, Duke and Salt Yard. All five demos run `symmetry-v8.3.1`.
  - They differ in base font and weight (Montserrat 300, Cabin, Archivo, Inter), base size (14 to 16px), heading font, weight (200 to 700), tracking and case, and logo and nav fonts.
  - Buttons differ in radius (0 or 3px), case (uppercase or none), tracking and text size. Page container width ranges from 1380 to 1600px.
  - Colors differ in the color schemes and in product-label styles and colors (transparent vs filled badges), and the swatch image size ranges from 40 to 70px.
  - The type-scale steps come in two sets: "larger" 28/34 and "super large" 49/60.

  Source: the demo stores linked from [themes.shopify.com/themes/symmetry](https://themes.shopify.com/themes/symmetry/presets/symmetry).
- **Be Yours** presets are Be Yours, Harmony ("Optimized for focused single or limited product catalogs"), Peace ("Everything you need for higher conversions built right in") and Sheen ("Effortless style meets smart design to elevate fashion-focused stores") ([Theme Store](https://themes.shopify.com/themes/be-yours/presets/be-yours)). Its demos run different theme versions (8.3.1 to 9.5.1), so their CSS diffs mix style changes with version drift and aren't used as evidence. One visible pattern: the Harmony demo is a dark palette (background 0,0,0, text 250,250,250). RoarTheme renamed presets over time ("Default" became "Peace", "Fashion" became "Sweet", per [RoarTheme](https://roartheme.co/blogs/be-yours/be-yours-theme-presets-and-updates-notices)).

### 4.4 Shopify's own Horizon family

The Theme Store's ["Horizon themes" collection](https://themes.shopify.com/collections/horizon-themes) lists Horizon, Atelier, Dwell, Fabric, Heritage, Pitch, Ritual, Savor, Tinker and Vessel. Each is a separate Theme Store theme with its own `theme_store_id` and `schema_name` (Horizon 2481, Atelier 3621, Savor 3626, Tinker 3627), on the Horizon 3.x code. Diffing the demos (Horizon 3.2.0, Tinker, Savor and Atelier 3.4.0) on Horizon's own variables:

| Setting (as rendered) | Horizon | Tinker | Savor | Atelier |
| --- | --- | --- | --- | --- |
| heading / body / accent font | Inter 700 / Inter / Bricolage Grotesque | Instrument Serif 400 / Instrument Sans / Instrument Serif | Barlow Condensed 600 / Inter / Barlow Condensed | Newsreader 200 / Red Hat Text / Red Hat Text |
| h1 font role | accent | heading | heading | heading |
| h1 size (fluid) | ≤3.5rem (56) | ≤4.5rem (72) | ≤4.5rem (72) | ≤7.5rem (120) |
| h2 / h3 | 48 / 32 | 48 / 32 | 48 / 32 | 72 / 48 (fluid) |
| h5 / h6 / paragraph | 14 / 12 / 14 | 18 / 16 / 14 | 18 / 16 / 14 | 12 / 12 / 12 |
| heading case | none | none | **uppercase h1–h6** | uppercase h5–h6 |
| h4 role | heading | subheading | subheading | subheading |
| button radius primary/secondary | 14 / 14 | 100 / 100 (pill) | 0 / 0 | 0 / 0 |
| input / popover radius | 4 / 14 | 8 / 8 | 0 / 0 | 0 / 0 |
| button case | default | default | uppercase + accent font | uppercase |
| card hover effect | none | lift | subtle-zoom | lift |
| icon stroke | 1.5px | 1.5px | 1.5px | 1px |
| page width | narrow | narrow | narrow | narrow |

Home pages are again compositions of the same sections (`hero`, `product_list`, `section`, `media_with_content`, `collection_list`, `collection_links`, `featured_product`). For a design-direction system this is the key evidence: **Shopify's own "different themes" are Horizon's type presets, a font pairing, a radius family, button case, a hover effect and a palette, plus different template JSON.**

### 4.5 Summary: the anatomy of a style

| Dimension | Varies between styles? | Typical range seen |
| --- | --- | --- |
| Font pairing (heading, body, accent) | Always | sans + sans, serif + sans, condensed display |
| Heading weight | Often | 200 to 700 |
| Heading case and tracking | Often | none or uppercase; −0.04em to +0.18em |
| Type scale (h1 size, base size) | Often | h1 56 to 120px; base 12 to 16px |
| Button shape | Often | 0, small (3 to 14px) or pill |
| Button case, tracking and font | Often | uppercase + tracking, or sentence case |
| Input, popover and card radius | Follows button shape | 0 to 14px |
| Palette | Always | light neutral, warm, dark or brand accent |
| Section vertical rhythm | Sometimes | 2 to 4rem |
| Container width | Sometimes | 1380 to 1600px |
| Hover effect, icon stroke | Sometimes | none, lift, zoom; 1 to 1.5px |
| Home page and template composition | Always | same catalog, different mix and order |
| Code (Liquid, CSS, JS) | Never | – |

---

## 5. Implications for our design-direction system

This is a proposal, not a decision. It needs an ADR if adopted.

1. **Model a Design Direction as a partial `settings_data` preset plus template JSON.** Concretely:
   - A named set of presentational global values (fonts, type presets, radii, button case, palette, spacing, hover effect).
   - Optional home and other template JSON built from the Section Catalog.

   This is exactly what Shopify's `presets` and `listings/` express. It also lets the generated Theme carry up to 5 directions in `settings_data.json` `presets`, so the Merchant can switch in the Theme Editor.

   **Unverified:** whether the "Change style" UI is offered for themes uploaded outside the Theme Store.
2. **Copy Horizon's setting model, not its code:**
   - a small `color_palette` with component colors defaulting to palette references (or keep Skeleton's `color_scheme_group` and add role colors);
   - 4 font roles;
   - 7 type presets, each with font role, size from a fixed scale, a line-height token, a tracking token and case;
   - fluid clamps derived from the scale, so levels never invert;
   - radius and border-width per component (primary and secondary button, input, popover, badge, card, media);
   - enums for page width, card hover effect and icon stroke.
3. **Catalog sections expose a `type_preset` select instead of font sizes.** They also share one layout vocabulary: direction, alignment, gap, width, height and padding. Section "variants" become section presets or data, not new files.
4. **Skip Dawn-style per-component shadows and global density sliders.** Horizon dropped them, and none of the measured styles relied on them. Spacing variation between styles is a single section-rhythm value.
5. **Our base theme today** (`skills/shopify-theme-builder/base-theme/config/settings_schema.json`) exposes only heading and body `font_picker`, `max_page_width`, `min_page_margin`, `color_schemes` and `input_corner_radius`. That is the gap to close.

## 6. Licenses: learning vs copying

- **Horizon** ([LICENSE.md](https://github.com/Shopify/horizon/blob/main/LICENSE.md), "Copyright (c) 2025-present Shopify Inc.", GitHub reports `NOASSERTION`):
  - Rights may be exercised "only … to develop themes that integrate or interoperate with Shopify software or services".
  - "You may not submit, list, market, sell, distribute, or otherwise make available any theme that is based on, derived from, or incorporates any portion of the Software (a 'Derived Theme') via the Shopify Theme Store, any other Shopify-operated channel, or any off-platform channel (including your own website or third-party marketplaces) … You may not circumvent this restriction by making insubstantial changes, reformatting or reorganizing code".
  - The only carve-out is delivering a Derived Theme "directly to merchants as part of services engagements, solely for those merchants' own use", not "as a general-purpose product".
  - **Verdict:** reading Horizon to learn its setting model, naming and structure is fine. Vendoring or porting its Liquid, CSS or JS into this open-source skill (which distributes theme code) is not. Write our own implementation, and don't mechanically translate files such as `theme-styles-variables.liquid`.
- **Dawn** ([LICENSE.md](https://github.com/Shopify/dawn/blob/main/LICENSE.md), "Copyright (c) 2021-present Shopify Inc."):
  - It allows use, copying, modification, distribution and sale, but only "to develop themes that integrate or interoperate with Shopify software or services, and, if applicable, to distribute … via the Shopify Theme Store".
  - Copies must keep the notice. It is not MIT, so copied files couldn't be relicensed MIT (this matches [our earlier research](2026-09-22-reference-repo-and-shopify-themes.md)).
  - The Theme Store rejects themes "built on or derived from Dawn or Horizon". Skeleton is "the only approved codebase" ([requirements §2](https://shopify.dev/docs/storefronts/themes/store/requirements)).
- **Theme Store originality rule, relevant to "styles":** "Cosmetic or additive alterations are insufficient. For example: spacing tweaks, color or typography swaps …". The Theme Store itself treats a style as a cosmetic layer over one architecture, which matches the evidence in §4.

## Sources

- S1: shopify.dev, settings_data.json. https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json
- S2: shopify.dev, Input settings (`color_palette`, presentational types). https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings
- S3: shopify.dev, Theme Store requirements (§2 originality, §15 fonts, §16 colors, §18 naming and presets, `/listings`, preset parity). https://shopify.dev/docs/storefronts/themes/store/requirements
- S4: shopify.dev, Updating your theme: best practices on structuring your theme zip. https://shopify.dev/docs/storefronts/themes/store/success/updates
- S5: shopify.dev changelog, "Theme files are now installable at the preset level" (2025-05-26). https://shopify.dev/changelog/theme-files-are-now-installable-at-the-preset-level-on-the-shopify-theme-store
- S6: shopify.dev, Color system best practices. https://shopify.dev/docs/storefronts/themes/best-practices/design/color-system
- S7: Shopify Help Center, Theme settings / theme styles. https://help.shopify.com/en/manual/online-store/themes/customizing-themes/theme-editor/theme-settings
- S8: Shopify/horizon@5acd1b6: `config/settings_schema.json`, `config/settings_data.json`, `snippets/theme-styles-variables.liquid`, `snippets/typography-style.liquid`, `sections/section.liquid`, `sections/hero.liquid`, `sections/product-list.liquid`, `blocks/text.liquid`, `blocks/group.liquid`, `blocks/button.liquid`, `blocks/product-card.liquid`, `layout/theme.liquid`, `release-notes.md` (4.2.0 and, at `95ca657102`, 4.0.0), `LICENSE.md`. https://github.com/Shopify/horizon
- S9: Shopify/dawn@258f00f: `config/settings_schema.json`, `config/settings_data.json`, `LICENSE.md`. https://github.com/Shopify/dawn
- S10: Theme Store preset pages (taglines, versions, demo links), fetched 2026-09-23: https://themes.shopify.com/themes/prestige/presets/prestige, …/impact/presets/impact, …/symmetry/presets/symmetry, …/be-yours/presets/be-yours, and each sibling preset; https://themes.shopify.com/collections/horizon-themes
- S11: Demo store home pages (rendered `:root` variables, `Shopify.theme`, section classes), fetched 2026-09-23: prestige-theme-{allure,couture,vogue,strass2,signature}.myshopify.com; impact-theme-{sound,home,shape}.myshopify.com; chantilly, symmetry-amara, beatnik-5, duke-16 and salt-yard .myshopify.com; beyours-theme{,-beauty,-clothing,-tech}.myshopify.com; theme-horizon-demo, theme-tinker-demo, savor-theme-demo and theme-atelier-demo .myshopify.com
- S12: Maestrooo, Prestige changelog. https://support.maestrooo.com/article/789-prestige-theme-changelog; Prestige demo store reference. https://support.maestrooo.com/article/769-prestige-demo-store-reference
- S13: RoarTheme, "Be Yours theme presets and updates notices" (2025-04-16). https://roartheme.co/blogs/be-yours/be-yours-theme-presets-and-updates-notices
