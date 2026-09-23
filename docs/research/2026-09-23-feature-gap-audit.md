# Feature gap audit: what Shopify offers, what we ship

Date: 2026-09-23, on `main` at `d136e99`. Sources: shopify.dev (the [Theme Store requirements](https://shopify.dev/docs/storefronts/themes/store/requirements), the changelog), Horizon 4.2.0's file listing, the [Agent Skills spec](https://agentskills.io/specification), GitHub's [community profile](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories) docs, and an inventory of this repo. It builds on [`2026-09-22-reference-repo-and-shopify-themes.md`](2026-09-22-reference-repo-and-shopify-themes.md).

## Yardstick

A Theme is a Creator's own shop's theme, not a Theme Store listing: Skeleton's license and the Theme Store's own rules (demo stores, presets, support duties) rule that out. The Theme Store requirements are still the best public definition of "a complete theme", so this audit uses them as the quality bar and marks each gap:

- **TS**: on the Theme Store requirements page.
- **Expected**: not required there, but in Horizon or most modern themes.

Effort: **S** under 2 hours, **M** about half a day, **L** one to two days.

## P0: a real shop notices these on day one

| Gap | Today | Why it matters | Mark | Effort |
| --- | --- | --- | --- | --- |
| Contact page | No `page.contact` template and no `{% form 'contact' %}` anywhere. The demo header's "Contact" link opens an empty page | Every shop needs a way to be reached | TS | S |
| App blocks in the product page | No section accepts `@app` blocks | Reviews, subscriptions, size charts and upsell apps can't place their blocks on the product page | TS | S |
| Cart checkout basics | The cart page (Skeleton's) has no accelerated checkout buttons (`additional_checkout_buttons`), no cart note and no discount lines | Shop Pay and Apple Pay in the cart convert, notes are a common Merchant need, discounts must show | TS | M |
| Search in the header | No search link or form in the header; the search page is only reachable by URL | Customers can't search | TS (predictive) | S, then M for predictive search |
| Country, currency and language selector | No `{% form 'localization' %}` | Shops selling in more than one market or language can't let customers switch | TS | M |
| Multi-level and mobile menus | The header shows top-level links only; no dropdowns, and on mobile the links wrap under the logo | Menus with more than about 5 links, or nested ones, break | TS (multi-level) | M |
| Accessibility basics | No skip link; visible focus styles only inside `.basic-page` | Keyboard users; the Theme Store's Lighthouse accessibility bar is 90 | TS | S |
| Unit price | Not shown on product, collection or cart | Legally required for some products in the EU | TS | S |

## P1: product and merchandising features

| Gap | Mark | Effort |
| --- | --- | --- |
| Product page blocks Shopify requires: vendor, pickup availability, Shop Pay Installments banner, gift card recipient fields, selling plans (subscriptions) | TS | M |
| Color and image swatches (`swatch.color`, `swatch.image`) in the variant picker | TS | M |
| Product media: 3D models (`model-viewer`), YouTube and Vimeo | TS | M |
| Complementary product recommendations next to related ones | TS | S |
| Collection filters that also run on the search page | TS | M |
| Custom Liquid section and blocks ("sections everywhere") | TS | S |
| Cart drawer or notification, and quick add from product cards | Expected | L |
| More catalog sections: announcement bar (header group), collection list, featured product, slideshow or image banner, multicolumn, video, blog posts, contact form, image gallery | Expected | S to M each |
| Structured data beyond the product: Organization and BreadcrumbList JSON-LD; breadcrumbs | Expected (TS asks for rich product snippets, already there) | S |
| Combined listings (sibling products as options) | Expected | M |
| Right-to-left languages: `<html dir>` from the locale | Expected | S |

## Studio gaps

The Studio edits only `text`, `inline_richtext` and `richtext` settings and color schemes, on three pages.

| Gap | Effect today | Effort |
| --- | --- | --- |
| Resource pickers: collection, product, link | "Featured collection" shows placeholder cards until the Merchant picks a collection in the Theme Editor; buttons link nowhere | M |
| Images and video | Every hero and image-with-text shows a placeholder until the Theme Editor | L (upload through the Admin API, or `shopify://` file picker) |
| Checkbox, range and select settings | Columns, counts, image position and toggles need the Theme Editor | M |
| Add and remove blocks | Testimonials and FAQ keep their 3 default blocks | M |
| Header and footer | Menus, newsletter toggle and colors need the Theme Editor | M |
| Other pages (page, blog, article, cart, search, 404) | Fixed Skeleton layouts, only color scheme | L |
| Undo | A wrong edit is fixed by hand, or with Git in the Theme folder | M |

## Skill workflow gaps

| Gap | Effort |
| --- | --- |
| A performance and accessibility check (Lighthouse) before delivery, against the Theme Store's 60 and 90 bars | M |
| More than one shop language (today: one language besides English) | S |
| A way to bring catalog fixes into an existing Theme (sections are copied once, so a Theme keeps old bugs, like the double newsletter of #19) | M |

## Repository

| Item | State | Directories require it? | Effort |
| --- | --- | --- | --- |
| `SKILL.md` `name` and `description` | Valid: `name` matches the folder, description 335 characters, file 173 lines | Yes, and it passes | none |
| `license` and `metadata` (`version`, `author`) in the frontmatter | Missing | No, rewarded | S |
| Semver releases, tags and a CHANGELOG | None; both `package.json` files are `0.0.0` | No, but expected of a tool people install | S |
| `SECURITY.md`, `CODE_OF_CONDUCT.md` | Missing | No; count toward GitHub's community profile | S |
| Issue and pull request templates | Missing | No; same | S |
| GitHub Discussions | Off | No | S |
| Listing on skills.sh | Automatic: skills.sh has no submission gate and lists repos installed through `npx skills add` | n/a | none |

## Not gaps, on purpose

- **`customers/*` templates.** Legacy customer accounts are deprecated (2026-02-26). The header's `<shopify-account>` is what the Theme Store requires since 2026-07-30, and we already ship it.
- **`robots.txt.liquid`.** The Theme Store forbids it.
- **Cookie banner.** Shopify's own banner, or a consent app's app embed, handles consent. App embeds reach the page through `content_for_header`, which the layout already renders.
- **Dynamic sources.** The Theme Editor lets the Merchant connect settings to metafields and metaobjects with no theme code.
- **Wishlists, countdown timers, fake urgency.** The Theme Store bans them, and they need an app anyway.

## Suggested order

1. The P0 table, one issue each: all S or M, and each one visible to the shop's customers.
2. The Studio's resource pickers and checkbox/range/select settings, so the demo store stops showing placeholders.
3. The repository items: first release `v0.1.0` with a CHANGELOG, then the community files, before announcing the project.
4. P1, starting with the product page's required blocks and the announcement bar.
