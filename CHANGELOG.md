# Changelog

All notable changes to the shopify-theme-builder skill are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). How to cut a release is in [CONTRIBUTING.md](CONTRIBUTING.md#releasing).

## [Unreleased]

### Added

- The product page of a gift card lets the customer send it to a recipient: email, optional name, message and send date, checked in the browser before it goes to the cart. The cart shows each line's properties, like the recipient.
- The product page's variant picker supports combined listings: choosing an option value, text pill or swatch, that belongs to a sibling product opens that product.
- A Custom Liquid section for any page and a Custom Liquid block for the product page, where the Merchant pastes their own Liquid or HTML, like an app snippet, a tracking code or an embed.
- The header's search icon opens a search box that suggests queries, products, collections and pages as the customer types, with arrow-key navigation; without JavaScript it searches on the search page. New Themes get it.
- The search page has the collection page's filters and sorting, and shows products, articles and pages in a grid; new Themes use it.
- The related products section can show complementary products (set in the Search & Discovery app) instead, and has a "Complementary products" preset; it shows nothing on the storefront when there are none.
- The product page shows 3D models in Shopify's model viewer, with its zoom and fullscreen controls, and plays YouTube and Vimeo videos.
- The product page's variant picker shows an option value's color or image swatch, with the value's name as its accessible label, and the text pill when it has none.
- The product page offers a product's subscriptions (selling plans) next to one-time purchase, prices it with the chosen plan and adds it to the cart with that plan; the cart shows each line's plan.
- The product page shows the vendor (with a setting to hide it), pickup availability at local pickup locations for the selected variant, and the Shop Pay Installments banner.

## [0.1.0] - 2026-09-23

The first release.

### Added

- The `shopify-theme-builder` agent skill, installed with `npx skills add itsmylife44/shopify-theme-builder`: it checks the prerequisites, can create a development store with demo data, and builds a Theme from Shopify's Skeleton theme in its own Git repository.
- The Brand in Shopify's native theme settings: color schemes, fonts from Shopify's font library, the logo and social links, so the Merchant keeps editing them in the Theme Editor.
- The Section Catalog: header with dropdowns, a mobile menu drawer, a search link and country and language pickers; footer; hero, featured collection, image with text, rich text, testimonials, logo list, FAQ and newsletter for the home page; product page with app blocks, unit prices and related products; collection page; contact page with a contact form; cart page with accelerated checkout, a note and discounts. Its Theme Editor text is translated through locale keys.
- Custom Sections, written by the agent with the Section Catalog's conventions and checked with Theme Check.
- The Studio, a local 3-panel editor next to the live `shopify theme dev` preview: edit the Brand, add, remove and reorder sections and blocks, edit text, color schemes, toggles, sliders, options, and pick collections, products, menus and links, on the home, product and collection pages, in desktop and mobile previews, with a Theme Check status.
- Delivery: upload the Theme to the store unpublished, package it as a zip, or connect Shopify's GitHub integration. The skill never publishes a theme.

[Unreleased]: https://github.com/itsmylife44/shopify-theme-builder/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itsmylife44/shopify-theme-builder/releases/tag/v0.1.0
