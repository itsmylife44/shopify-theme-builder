# Changelog

All notable changes to the shopify-theme-builder skill are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). How to cut a release is in [CONTRIBUTING.md](CONTRIBUTING.md#releasing).

## [Unreleased]

### Added

- Add to cart on the product page and the featured product section opens a cart drawer instead of the cart page, and so does the header's cart icon. The drawer shows the cart page's `main-cart` section, where quantity changes and removals apply at once, and the header's cart count follows. A Cart type theme setting (drawer, the default, or page) keeps the cart page instead; without JavaScript, add to cart still goes to the cart page.
- Before delivery, the agent runs Lighthouse on the preview's home, product and collection pages, on mobile and desktop, against the Theme Store's bars (performance 60, accessibility 90), reports the scores and fixes the accessibility failures the Theme causes.
- The Studio lists the header and footer groups' sections with the page's, and edits them like a page's section: click one in the list or the preview to change its color scheme, settings (like the footer's newsletter and menus) and blocks, saved to `sections/header-group.json` and `sections/footer-group.json`.
- An image gallery section shows a grid of images, each with an optional caption and link, with a column count; Shopify's image placeholder shows until an image is picked.
- A blog posts section shows the latest articles of a blog, each with its image, title, date and excerpt, with a post count and a column count; Shopify's image placeholder shows until a blog is picked.
- A video section plays a YouTube, Vimeo or Shopify-hosted video under an optional heading. With a cover image, the video loads only when a customer presses play; YouTube videos use the privacy-enhanced mode. Shopify's placeholder shows until a video is picked.
- A multicolumn section shows columns, each with an icon or image, a heading and text, for benefits or steps, with a column count and text alignment; Shopify's image placeholder shows until an image is picked.
- A slideshow section shows full-width slides, each with an image, heading, text and button, that customers step through with previous and next buttons, the arrow keys or a swipe. Autoplay is off by default; when on, customers can pause it, and it stops on hover and focus and doesn't play under reduced motion. Shopify's placeholders show until images are picked.
- A featured product section shows one product picked in the Theme Editor on any page, with its image, price, a variant picker, quantity and add to cart, optional dynamic checkout buttons, and app blocks; Shopify's product placeholder until a product is picked.
- A collection list section shows a grid of collections picked in the Theme Editor, each with its image and title, and Shopify's collection placeholders until some are picked.
- An announcement bar above the header shows short messages, like free shipping or a sale, each with an optional link; several messages rotate (with previous and next buttons, pausing on hover and focus, and not rotating on their own under reduced motion) or stack. New Themes have it in the header group.
- A shop in a right-to-left language, like Arabic or Hebrew, renders right to left: the page direction follows the locale, and the Base Theme and Section Catalog styles use logical properties, so layouts and text alignment mirror.
- Every page describes the shop to search engines as an Organization (name, logo, social links), and product, collection, article and page templates show breadcrumbs with their BreadcrumbList structured data, with a theme setting to hide them.
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
