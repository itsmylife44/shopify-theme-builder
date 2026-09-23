# E-commerce UX rules for theme sections

Date: 2026-09-23. Scope: evidence-backed UX rules that the Section Catalog (home, header, collection, product, cart, search, and global concerns) must get right, whatever the visual style. Sources are primary or high-trust only: Shopify (Theme Store requirements and theme best practices on shopify.dev), Baymard Institute (public articles and benchmark stats), Nielsen Norman Group, W3C WCAG 2.2, and Google (web.dev, Lighthouse). Every rule cites its source as [S#]. Most Baymard guidelines sit behind Baymard Premium. This doc uses only the public articles, so it covers a subset of Baymard's findings. A few claims come from search-engine excerpts of a page rather than the page itself. The source list marks them "(excerpt)".

## Evidence strength

- **R**: Required. A Shopify Theme Store requirement or a WCAG 2.2 AA success criterion. Failing it blocks Theme Store approval or conformance.
- **A**: Strong. Large-scale usability testing plus benchmark data (Baymard stats of the form "X% of sites don't"), or a Google Core Web Vitals threshold.
- **B**: Moderate. A qualitative usability study (NN/g, a single Baymard finding) or official vendor best-practice guidance (shopify.dev best practices, web.dev).
- **C**: Weak. A single observational study, expert opinion, or our own inference from the sources. It is labelled as such.

## TL;DR: the 15 highest-impact rules

1. Never lazy-load the LCP image. Give it `fetchpriority="high"`, render it as an `<img>` in HTML (not a CSS background, not injected by JS), and don't hide it behind an entrance animation. **A/B** [S2][S11]
2. Every `<img>` gets `width`/`height` (which `image_tag` adds) or a CSS `aspect-ratio` box, so CLS stays ≤ 0.1. **A** [S2][S10][S12]
3. Product grids and galleries must not break when image ratios are mixed. Use a fixed-ratio media container. **R** [S1]
4. Show shipping cost (or the free-shipping threshold, stated explicitly) and a returns summary or link next to the buy button, not only in a site-wide banner. **A** [S25][S26][S34]
5. The cart shows the full order cost up front. Extra costs cause 39% of checkout abandonments. **A** [S36]
6. Mobile product gallery: use visible thumbnails, not dots only (76% of mobile sites get this wrong), and signpost truncated thumbnails. **A** [S27][S28]
7. Product page content goes in vertically stacked sections: expanded on desktop, collapsed accordions on mobile. Never use horizontal tabs, because users overlook the content inside them. **A** [S32]
8. Size and other option values go on visible buttons, not in drop-downs (57% of sites don't do this). **A** [S25]
9. Collection sort offers at least Price, Best selling, Newest and (if reviews exist) Rating. Filters allow several values within one filter type and show an "applied filters" row that can be cleared. **A** [S18]
10. Collection: load about 15–30 products on mobile with a "Load more" button, not endless scroll. Pagination or lazy loading is required either way. **A/R** [S1][S20][S21]
11. Product cards give access to 3 or more images, show rating average plus rating count, show the full untruncated title, and combine variants into one card with swatches. **A/R** [S1][S18][S19][S24]
12. Desktop drop-down or mega menu: wait 300–500 ms after hover before opening, keep the menu open for about 0.5 s after the pointer leaves, make headers clickable, and support keyboard (Enter/Space/Esc, `aria-expanded`). **A/R** [S1][S3][S39][S40][S49]
13. Carousels: no autorotation on mobile. On desktop, show each slide for 5–7 s or longer, pause on hover, stop after any manual interaction, and provide a pause control if it moves for more than 5 s. **A/R** [S17][S41]
14. Touch targets are at least 24×24 CSS px (required). Primary controls (menu, close, variant buttons, add to cart, submit) are at least 44×44. **R/B** [S1][S3][S15]
15. Body text: 50–75 characters per line (max-width about 70ch), and line-height that survives the 1.5× text-spacing override. Text contrast is 4.5:1, or 3:1 for large text, icons and input borders. **A/R** [S3][S14][S47]

---

## 1. Home page (`hero`, `hero-banner`, `slideshow`, `featured-collection`, `collection-list`, `image-with-text`, `multicolumn`)

- Say who the store is and what it sells in a short tagline or value proposition near the top, and use the customer's words, not jargon. **B** [S53]
- Homepage imagery should show at least 40–50% of the catalog's product types. Users judge the catalog's breadth from the homepage, and 22% of sites mislead them. **A** [S42]
- On mobile, homepage content is often the only view of the catalog before the user opens the menu, so the category and collection tiles matter more there than on desktop. **A** [S42]
- Show specific example products or collections, not only umbrella category names. Avoid a homepage that is only seasonal promotion. **B** [S53]
- Link labels on mobile homepage tiles carry their full scope ("Women's New Arrivals", not "New Arrivals"). 59% of sites don't. **A** [S39]
- Keep ads and ad-like promos out of prime spots, and don't show pop-up overlays on load. 55% of sites have overly aggressive homepage ads. **A** [S39]
- Shopify also says to remove full-screen interstitials that cover the main content on page load. **B** [S2]
- Inspirational or lifestyle images link to the products shown in them. 70% of sites don't. **A** [S39]
- Each visual tile is a single hit area leading to one destination. On desktop, add hover, border or arrow cues so the hit areas are obvious. 51% of sites don't. **A** [S39]
- Hero image: `<img>`/`<picture>` in the HTML, eager, `fetchpriority="high"`, explicit `sizes`, and no CSS background image. Use `<picture>` for a different mobile crop, so only one image downloads. **B** [S2][S4][S11]
- Suggested hero `srcset` widths: `600, 900, 1200, 1600`. Mobile art-direction breakpoint: `(max-width: 749px)`. **B** [S4]
- Carousel (`slideshow`): 5 frames or fewer. **B** [S55]
- Carousel controls sit inside the carousel, contrast with the image, and appear on both sides. Show position (for example "2 / 5"), and don't rely on dots alone on mobile. **A/B** [S41][S55]
- Carousel rotation: none on mobile. On desktop, 5–7 s per slide (up to 10 s if text-heavy), pause on hover, and stop for good after manual navigation. **A** [S41]
- Anything that moves automatically for more than 5 s needs a pause/stop control. **R** (WCAG 2.2.2) [S17]
- A static hero is a legitimate alternative to a carousel. **A** [S39]

## 2. Header and navigation (`header`, `announcement-bar`, `predictive-search`)

- Multi-level drop-down menus must be supported. **R** [S1]
- The header needs an account entry point on both desktop and mobile. **R** [S1]
- Country/currency and language selectors must be supported. **R** [S1]
- Hover drop-downs are the dominant desktop pattern (74–88% of top sites, depending on the Baymard dataset). **A** [S39][S40]
- Hover delay: 300–500 ms before opening. 60–61% of sites have no delay, and the result is "flickering" menus that make users abandon. **A** [S39][S40]
- NN/g timing: wait for the pointer to rest 0.5 s, show the menu within 0.1 s, keep it open until the pointer has been outside both the trigger and the panel for 0.5 s, then hide it within 0.1 s. **B** [S49]
- For vertical fly-outs, use a mouse-path (diagonal-intent) tolerance so moving toward the submenu doesn't open a sibling. **B** [S40]
- Top-level and group headers in the menu are clickable links to real pages. 33% of sites don't do this, and NN/g also treats it as the accessibility fallback. **A** [S39][S49]
- Mega menu content is visible without scrolling, grouped into related sets, with each item shown once and the most-used groups at top-left. **B** [S49]
- Highlight the current top-level scope in the main navigation. 95% of sites don't. **A** [S39]
- Split categories into chunks of about 10. Users get overwhelmed by more than about 10 subcategory options. **A** [S39]
- Avoid categories 5–7 levels deep, and keep at least about 10 products at the deepest level. **A** [S39]
- On mobile, the top-level menu items are product categories, not "Shop / About / Blog". 33% of sites don't do this. **A** [S48]
- Offer a "View all" link at every level of the mobile menu. Only 24% of sites do it well. **A** [S48]
- A hidden (hamburger-only) nav is discovered far less: navigation use was 44% on a hidden-nav site vs 89% on a visible/combo-nav site. Expose the top 4–5 items or a labelled "Menu/Shop" button where possible. **B** [S50]
- Keyboard: Enter/Space opens a drop-down, Tab moves into it, and Esc closes it and returns focus. Toggles use `aria-expanded`/`aria-controls`. **R/B** [S1][S3]
- Menus sit in `<nav>`, the current page gets `aria-current`, and there is no `role="menu"`/`menuitem`. **B** [S3]
- Search: the more central and wide the field, the more people search. A top-right field or an icon-only search gets less attention and signals "browse". **B** [S43]
- Give the search field a visible submit button. 53% of tested sites lacked one, even though users prefer it. **A** [S45]
- Predictive search is required, and it must be able to return products, articles and pages. **R** [S1]
- Autocomplete: at most 10 suggestions on desktop and 4–8 on mobile, no inner scrollbar, and the untyped completion in bold (not the typed part). **A** [S44]
- Autocomplete keyboard behavior: ↑/↓ move through suggestions and loop, the focused suggestion is copied into the field, and Enter submits it. Only 19% of sites get every autocomplete detail right. **A** [S44]
- On mobile, autocomplete gets large rows with dividers and no sticky bars, chat bubbles or promos over it. The keyboard already takes about 50% of the screen. **A** [S44]
- Sticky header: opaque background, not translucent. Use partial persistence: hide on scroll down, show again on scroll up after a few pixels, with a 300–400 ms animation. **B** [S56]
- Sticky header, drawers and cookie banners must never fully cover the element that has keyboard focus. Use `scroll-padding-top` equal to the header height. **R** (WCAG 2.4.11) [S16]
- Announcement bar: a free-shipping claim there is not enough on its own. 27% of users miss banner-only free-shipping messages. **A** [S34]
- Don't render two full navigation trees (desktop plus mobile) in the DOM, because it doubles the DOM nodes. **B** [S4]

## 3. Collection and search results (`main-collection`, `main-search`, `featured-collection` cards)

### Grid and loading
- List products in a grid or list. The grid must not break when product image ratios differ. **R** [S1]
- Collection and search results need pagination or lazy loading. **R** [S1]
- Sorting is required. **R** [S1]
- An empty collection shows a message. **R** [S1]
- Search with no results shows a message. **R** [S1]
- Faceted filtering on collection and search pages: availability, price, product type, vendor and variant options. **R** [S1]
- Default batch size: 15–30 products on mobile. On desktop, 50–100 for spec-driven products and 100–150 for visual ones. 52% of desktop sites load too few or too many. **A** [S20]
- Use a "Load more" button combined with lazy loading, not endless scroll. Endless scroll made users skim more, focus less, and struggle to reach the footer. **A** [S20][S21]
- "Load more" gives natural breaks, and Back returns the user to the right position in the list. **A** [S21]
- Content added by "Load more" appears in response to a user action, so it doesn't count as layout shift. Never auto-insert content above what the user is viewing. **A** [S12]
- Eager-load only the first row of product images (Shopify's example uses `forloop.index <= 4` in above-the-fold sections). Lazy-load the rest with `sizes="auto"`. **B** [S4]

### Filters and sort
- Allow several values within the same filter type (OR). 14% of sites don't. **A** [S18]
- Five essential filter types: Price, Rating, Color, Size and Brand. 51% of sites lack at least one. Shopify's native filters don't include rating, so only offer it when a ratings metafield is exposed. **A**, with our note on rating [S18][S1]
- Every attribute shown in a list item should also be filterable. 38% of sites don't do this. **A** (excerpt) [S18]
- Show applied filters in an overview row above the list (a horizontally scrolling chip row on mobile), with a remove action on each chip and a "Clear all" link. 20% of sites don't. **A** [S18]
- Four essential sort types: Price, User rating, Best selling and Newest. 68–69% of sites lack at least one. **A** [S18]
- A horizontal filter toolbar only works with about 8 filter types or fewer. Otherwise users miss the "All filters" button. **A** [S18]
- Use visual filter values (swatches) for visual attributes such as color and finish. **A** [S18]
- Mobile filter UI: an overlay or tray. The result count stays visible while filtering. **B** [S54]
- Mobile filter UI buttons: a prominent, sticky "Apply" (ideally "Show 42 results") and a way to exit without applying. **A** [S45]
- Label the control "Filter" and "Sort" in text, not with an icon alone. **B** [S54]

### Product card anatomy
- Title, not truncated and linked to the product. Price, with `price_varies` shown as "From $X". At least one media item. **R** [S1]
- Unit price, where the product has one. **R** [S1]
- A sale badge, or the compare-at price. **R** [S1]
- Universal attributes on every card: thumbnail, title, price, variations and rating. **A** [S22]
- Show the same attributes in the same order on every card in a list. 64% of sites fail this, and inconsistency hurt almost as much as having no info. **A** [S22]
- Style each piece of card info distinctly (weight, size, color, spacing). 40% of sites fail this. **A** [S22]
- Give access to 3 or more images per card: the default image plus at least 2 more (5–15 for apparel). 80% of sites don't. **A** [S18][S19]
- Card images on desktop: hover can reveal a second image or dots. **A** [S19]
- Card images on mobile: indicators must be visible by default, because there is no hover. A "secondary image on hover" alone does not satisfy this rule on touch devices. **A** [S19]
- Combine a product's variants into one card, with swatches below the image. 42% of sites don't. **A** [S18]
- On mobile, all color swatches should be reachable. 57% of sites don't do this. **A** [S23]
- Swatch overflow: use a horizontally scrolling row with the last swatch visibly cut off, or "3 swatches + '+6 more'". Choosing a swatch should update the card's image. **A** [S23]
- Show the rating average together with the rating count ("4.5 ★ (57)"). An average without a count is untrustworthy, and nearly twice as many users prefer 4.5★/57 ratings over 5★/4. **A** [S24]
- Show the unit price next to the total price for products sold in different quantities. 67% of list pages don't. **A** [S18]
- Card image ratio: no source prescribes a ratio. The requirement is one consistent container ratio per grid, with images fitted inside (for example `object-fit: contain` or `cover` as a merchant setting), so mixed ratios never break rows. **R** for not breaking, **C** for the method [S1][S8]
- Shopify: "product cards should look clean and cohesive, even with inconsistent product images". **B** [S8]
- Suggested card `srcset` widths: `200, 300, 400, 600` for a 4-column grid and `300, 400, 600, 800` for 2 columns. Oversized images can mean downloading 4× the needed bytes. **B** [S4]
- Quick add: no primary source with evidence was found. If it's offered, it must follow the add-to-cart feedback rules in §5 and keep keyboard and focus handling (§8). **C**

## 4. Product page (`main-product`, `featured-product`, `related-products`)

### Required content (Theme Store)
- The product page shows: the title (not truncated), the variant price, the unit price, the compare-at price, the description, and option names and values. **R** [S1]
- Tax-included notice via `cart.taxes_included`. **R** [S1]
- All product media must be displayed and viewable, and different image ratios must not break the layout. **R** [S1]
- Selecting a variant shows its variant image. **R** [S1]
- Options are split into separate selectors. **R** [S1]
- A quantity selector. **R** [S1]
- An add-to-cart button that is disabled or relabelled for sold-out or nonexistent combinations. **R** [S1]
- The price, compare-at price and sold-out state update when the variant changes. **R** [S1]
- The first available variant loads by default. **R** [S1]
- Required features: product recommendations (related and complementary), rich media (video, 3D, YouTube/Vimeo), accelerated checkout buttons, pickup availability, the Shop Pay Installments banner, and swatch support (`swatch.color`/`swatch.image`). **R** [S1]
- Announce price changes to screen readers with `aria-live`. Mark sale and regular prices differently, both visually and for screen readers. **B** [S3]

### Gallery
- 56% of users start exploring images the moment they land on the product page. The gallery is the first thing they interact with. **A** [S29]
- On mobile, use thumbnails for additional images, not dots only. 76% of mobile sites don't. With indicators only, 50% of desktop users had trouble finding more images. **A** [S27]
- Thumbnails show what kinds of images exist ("information scent") and avoid mis-taps on tiny dots. **A** [S27]
- Swiping is the primary gesture on mobile. Thumbnails and indicators are the fallback. **A** [S27]
- If the thumbnail strip is cut off, make that obvious: arrows, a partial last thumbnail, or a "+N" thumbnail. 40% of sites cut it off without a clear cue, and this caused direct abandonments. **A** [S28]
- Provide zoom at a resolution high enough to read fine detail. 25% of sites fail on resolution or zoom. **A** [S29]
- On mobile, fetch a higher-resolution source when the user starts zooming. **A** [S29][S30]
- Support both pinch and double-tap to zoom on mobile. 40% of sites support neither. **A** [S30]
- Briefly hint that zoom gestures are supported, for example a hint that fades after a few seconds. **A** (excerpt) [S30]
- Include at least one in-scale image (the product next to a person or a known object). 42% of users try to judge size from the images, and 28–37% of sites have no in-scale image. **A** [S25][S26]
- For worn products (apparel, accessories, cosmetics), include images on a human model. 23% of sites don't. **A** [S25]
- Image types to support (merchant content, but the gallery must handle all of them): compatibility close-ups, lifestyle, customer photos, texture close-ups, size/proportion, usage, and "animate" (images with people or animals in them). **B** [S31]
- Give video, 3D and iframe media aspect-ratio boxes. Their controls must not fight the carousel's swipe. **B** [S7]
- Media never autoplays with sound. Video can be paused with Space. **B** [S3]
- Give every product image descriptive alt text. Decorative images get `alt=""`. **R/B** [S1][S3]
- The first gallery image is usually the LCP. Load it eagerly with `fetchpriority="high"`, and lazy-load the rest. **A/B** [S2][S11]

### Buy box (info order and placement)
- Put the title, price and buy button prominently at the top. Description and secondary info must stay easy to discover. **B** [S8]
- Must-haves: descriptive name, images with enlarged views, price including all charges, clear options, availability, add-to-cart with clear feedback, and a concise description. **B** [S52]
- Show availability per variant when stock differs by color or size. **B** [S52]
- Show size and other option values as visible buttons, not in a `<select>`. 57% of sites don't (28% on desktop only). **A** [S25][S26]
- Use `product_option_value.available` to grey out unavailable values. It gives a top-down, tree-like availability experience. **B** (excerpt) [S9]
- Give the primary button unique styling, prominence, consistent placement and descriptive copy, and keep it apart from secondary buttons. 48% of sites miss at least one of these. **A** [S45]
- Show the lowest shipping cost, or an estimate with conditions, near the buy button. 43% of sites show no shipping cost estimate on the product page, and 67% show no total-cost estimate. **A** [S25][S26]
- 64% of users start thinking about shipping cost while on the product page. **A** [S34]
- Show the free-shipping message and its threshold in the buy area, not only in a banner. 32% of sites put it only in a banner, and up to 27% of users miss it there. **A** [S34]
- Link to or summarize the return policy in the main product content. 60% of users look for it there, 44% of sites don't provide it, and 15% of users have abandoned over a return policy. **A** [S25][S38]
- Delivery date: Baymard's evidence for "Delivers Thursday" rather than "2–3 business days" (41% of sites get it wrong) comes from checkout. Using it on the product page is **C** (our extrapolation). [S35]
- Sticky buy box: on large screens, a sticky product summary (title, price, variant, Buy button) keeps the buy button within reach on long pages. **B** [S46]
- Sticky add-to-cart bar on mobile: no primary study found. Baymard warns that fixed content shrinks the usable viewport, so fix things only along an axis that has room to spare. **C** [S46]
- Use `aria-live` for the variant price. On change, update the gallery to the variant image. **B/R** [S1][S3]
- Show unit price where applicable (81% of product pages don't). **A** [S25]
- Save / wishlist (if offered) should work without an account. 89% of sites require one, and 21% of users rely on saving. **A** [S25]

### Description and content structure
- Structure the description with scannable highlights (bullets) at the top. 78% of sites don't. **A** [S26]
- Make the description complete but not fluffy, and explain unfamiliar terms. Users read the start of each paragraph and line. **B** [S52]
- Use no horizontal tabs for core content. Put it in vertical sections: expanded on desktop, collapsible accordions on mobile. 29% of sites still use tabs, and users overlooked tabbed content. **A** [S32]
- Tabs are acceptable only inside a single subsection (for example spec categories), and only without horizontal scrolling on mobile. **A** [S32]

### Reviews and trust
- 95% of users rely on reviews. 53% seek out negative reviews specifically. **A** [S33]
- Put a ratings distribution summary (bar chart) at the top of reviews. 43% of sites lack one. **A** [S26][S33]
- The distribution bars filter the reviews when clicked, with one star level at a time (radio logic), and the summary is expanded by default. 39% of sites that have the summary don't make it clickable. 90% of users who wanted specific ratings tried to click it. **A** [S26][S33]
- Allow photos in reviews (34% of sites don't), and let users step through reviewer images with arrows or swipe (63% don't). **A** [S25][S26]
- Style store replies to reviews differently from customer reviews, and reply to negative reviews (87–89% of sites don't). **A** [S25][S26]
- Differentiate positive and negative reviews, show reviewer context (use case, size worn), and show verification. **B** [S52]

### Recommendations
- Related and complementary product recommendations are required. **R** [S1]
- Cross-sell cards follow the same card rules as §3: full titles, price, rating with count, and consistent attributes. Truncated titles hurt comparison. **A** (excerpt) [S22]

## 5. Cart and cart drawer (`main-cart`, cart drawer / notification)

- Each line item shows its title, image, options with values, unit price, final price and quantity. **R** [S1]
- Every line's quantity can be changed, and all lines refresh when a quantity changes. **R** [S1]
- The cart total is visible, with a tax-included note via `cart.taxes_included`. **R** [S1]
- Show automatic discounts. **R** [S1]
- Support cart notes and selling plans. **R** [S1]
- An accelerated checkout button, on by default. **R** [S1]
- An empty cart shows a message. **R** [S1]
- Show the full order cost in the cart, including shipping and taxes or a clear estimate of them. Extra costs cause 39% of checkout abandonments, and extra costs being too high accounts for 40% of abandonment reasons. **A** [S36][S38]
- Put free-shipping progress inside the cart summary, dynamic and explicit ("Spend $35 more for free shipping"), with no asterisks. **A** [S34][S36]
- Put upsells or cross-sells in the cart or drawer only when they are complementary and compatible (accessories, required parts), with a clear reason label ("Frequently bought together"). **A** [S37]
- Avoid showing substitutes and a fixed number of recommendations, and never show financing promos on low-value carts. 52% of desktop sites show irrelevant cross-sells. **A** [S37]
- Keep promotions visually secondary to checkout, and don't force offer decisions. **A** [S36]
- Add-to-cart feedback must be conspicuous and persistent: users must not be left unsure whether the add worked. **B** [S52]
- An "Added to cart" overlay or drawer must show enough about the item just added (image, title, chosen variant, quantity, price) and key order info. Too little detail cuts user confidence. **A** (excerpt) [S58]
- A cart drawer is a modal dialog: `role="dialog"`, focus moves to its label on open, focus is trapped inside, Esc closes it, and focus returns to the trigger. **B** [S3]
- Announce cart updates and errors (for example quantity limits) with `aria-live`, and move focus to the error message. **B** [S3]

## 6. Mobile specifics (all sections)

- Touch targets: at least 24×24 CSS px (Theme Store and WCAG 2.5.8 AA). **R** [S1][S15]
- Shopify's accessibility guide asks for at least 44×44 on primary controls: main menu links, submit, menu and close buttons, and variant buttons. That matches WCAG 2.5.5 AAA. **B** [S3][S15]
- Shopify's performance guide says 48×48 on mobile. This conflicts with the 44 above. Treat 44 as the floor and 48 as the target. **B** [S2]
- NN/g: at least 1 cm × 1 cm per target. Primary CTAs should be larger (about 2 cm), and adjacent targets need spacing. Baymard: at least 7 mm × 7 mm. **B/A** [S45][S51]
- Grip: 49% of phone use is one-handed, 36% cradled and 15% two-handed, and users re-grip every few seconds. Don't hide important controls in hard corners, but don't assume a fixed "thumb zone" either. **C** (single observational study, n=1,333) [S57]
- Allow zoom: no `maximum-scale` or `user-scalable=no`. Pinch-zoom is always available. **B** [S3]
- No horizontal page scroll. Content fits the viewport width. **B** [S2]
- Don't show full-screen interstitials on load. **B** [S2]
- A multi-finger gesture must have a single-tap alternative. **B** [S3]
- In landscape, product images scale proportionally (52% of sites don't). **A** (excerpt) [S30]
- Collapsed sections (accordions) are the right pattern for long content on mobile. **A** [S32]
- Hover never carries essential information or controls. **B** [S3]
- Card image indicators must be visible without hover. **A** [S19]
- Autorotation off on mobile. **A** [S41]
- Themes must work in Mobile Safari (latest 2), Chrome Mobile (latest 3), Samsung Internet (latest 2), and in-app webviews for Instagram, Facebook and Pinterest. **R** [S1]

## 7. Typography and readability (global CSS, `rich-text`, `main-article`)

- Line length: 50–75 characters for body text. WCAG 1.4.8 (AAA) caps it at 80. Set it with `max-width: ~70ch` (or about 34em). Users avoid reading overly long lines. **A** [S47]
- Text spacing: the layout must not break when users apply line-height 1.5×, paragraph spacing 2×, letter spacing 0.12× and word spacing 0.16× the font size. No fixed-height text boxes. **R** (WCAG 1.4.12) [S14]
- Minimum size: Lighthouse flagged pages where 40% or more of the text is below 12 px, and the goal is at least 12 px on 60% or more of the text. That audit was removed in Lighthouse 13. Treat 12 px as an absolute floor for any text, not a target. **B** [S13]
- NN/g cites about 16 pt text in a mobile header context. **B** [S56]
- Contrast: 4.5:1 for text below 24 px regular or 18.5 px bold. 3:1 for larger text, icons and input borders. Color is never the only signal (for example a sale price or an out-of-stock swatch). **R** [S1][S3]
- Headings h1–h6 must look different from each other. **R** [S1]
- Headings follow in sequence, with one `h1` for the page topic. **R/B** [S1][S3]
- Keep fonts few, with a consistent pairing. Cards need a short-label style and promos a longer-text style, with a hierarchy that scales. **R/B** [S1][S8]
- Web fonts: self-host on the Shopify CDN or use system fonts. Use `size-adjust` or metric overrides to limit swap shift, and preload only critical fonts. **B** [S2][S12]

## 8. Accessibility (cross-cutting; Theme Store needs Lighthouse a11y ≥ 90)

- Average Lighthouse accessibility score of 90 or more across the home, product and collection pages, on both mobile and desktop, tested with real content. **R** [S1]
- Everything is keyboard-operable, including drop-downs. Focus is always visible. Focus order follows DOM order. **R** [S1]
- Only `tabindex` 0 or -1. **B** [S3]
- Put `lang` on `<html>`. Provide a skip link that becomes visible on focus. **B** [S3]
- Every form input has a unique `id` and a `<label for>`. Use `required` and `autocomplete`. **R/B** [S1][S3]
- Errors are linked to fields with `aria-describedby`, receive focus, and are announced. **B** [S3]
- Use `<a>` for navigation and `<button>` for actions. Link text makes sense on its own. Warn when a link opens a new window. **B** [S3]
- Drawers and modals: `role="dialog"`, focus moves in, stays trapped, and Esc closes. **B** [S3]
- Slideshows: provide pause/stop, plus previous/next buttons. **R/B** [S3][S17]
- Valid HTML. **R** [S1]
- Focused elements are never fully hidden behind sticky UI. **R** [S16]

## 9. Images (all media sections)

- Use a responsive image strategy everywhere (icons excepted), and load images only when needed. **R** [S1]
- Use `image_tag` with `widths` and `sizes`. `sizes="auto"` works only with `loading="lazy"`, so eager and LCP images need an explicit `sizes`. **B** [S4]
- Always set `width`/`height`, which `image_tag` adds, or use CSS `aspect-ratio`, to prevent CLS. **A/B** [S2][S12]
- Art direction: use `<picture>` when the mobile and desktop crops differ, not two `<img>` elements with one hidden. **B** [S2][S4]
- Support the image focal point setting (theme editor or Files page) so fixed-ratio crops keep the subject. **R** [S1]
- LCP image: never `loading="lazy"`. Use `fetchpriority="high"` on one or two images at most. Make it discoverable in the initial HTML, not as a CSS background or a JS-inserted image, and don't fade or slide it in. **A/B** [S2][S11]
- Preload at most 1–2 late-discovered critical resources (`image_tag: preload: true`). **B** [S2][S5]
- Every `img` has `alt`, and product images use `image.alt`. **R** [S1]
- Provide a `page_image` for social sharing. **R** [S1]
- No primary source prescribes a specific aspect ratio (1:1, 3:4, 4:5 and so on). Make the ratio a merchant setting, and adapt the default to the vertical (for example portrait for apparel). The only hard rule is "don't break with mixed ratios". **C** [S1]

## 10. Performance budgets

- Core Web Vitals at p75, mobile and desktop: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Poor starts above 4 s, 500 ms and 0.25. **A** [S10]
- LCP budget split, as a guideline: TTFB about 40%, resource load delay under 10%, resource load duration about 40%, render delay under 10%. **B** [S11]
- Theme Store: average Lighthouse performance score of 60 or more across the home, product and collection pages, on both mobile and desktop. **R** [S1]
- Theme Check `AssetSizeJavaScript` default: 10,000 bytes (compressed) per JS file. **B** [S6]
- Shopify's performance docs recommend a minified JS bundle of 16 KB or less. **B** (excerpt) [S2]
- Render essential content in Liquid/HTML, not JS. Load scripts with `defer`/`async`, and use dynamic `import()` on interaction for non-critical features such as quick add, zoom and model viewer. **B** [S2]
- Animate only `transform`/`opacity`. **B** [S2][S12]
- Reduce the number of stylesheet `<link>`s, and load critical CSS synchronously. **B** [S2]
- Liquid: avoid nested loops over products and variants, and move metafield access out of loops. Keep pagination under 25,000 objects. **B** [S2]
- Serve all assets from the theme's `/assets`, which goes through the Shopify CDN. **B** [S2]

---

## Conflicts and gaps found

- **Touch target size** varies by Shopify source: 24 px (Theme Store requirement, WCAG AA) [S1], 44 px (accessibility guide) [S3], 48 px (performance guide) [S2]. We treat 24 as the hard minimum and 44–48 for primary controls.
- **Hover-menu stats differ** across Baymard pages (74% vs 88% of sites use hover drop-downs, and 60% vs 61% lack a delay) [S39][S40]. They come from different benchmark years.
- **JS budget**: Theme Check allows 10 KB compressed per file [S6], while the performance docs say a 16 KB minified bundle [S2] (seen only in a search excerpt).
- **Lighthouse 12 px font-size audit** is gone in Lighthouse 13 [S13]. It no longer affects scores.
- **Mobile sticky add-to-cart, quick add, and the specific card or hero aspect ratio**: we found no public primary-source evidence. These are marked **C**.
- **Delivery-date messaging on the product page** is extrapolated from checkout research [S35].
- **Rating filter and sort** are in Baymard's essentials [S18], but Shopify's native filters don't provide them without a reviews app or metafield.
- Most Baymard product page and cart findings (110+ and 700+ guidelines) are behind Premium. Public articles give only a subset.

## Sources

- [S1] Shopify, Theme Store requirements. https://shopify.dev/docs/storefronts/themes/store/requirements. Also the UX rubric at https://shopify.dev/tutorials/rubric.
- [S2] Shopify, Performance best practices for themes. https://shopify.dev/docs/storefronts/themes/best-practices/performance
- [S3] Shopify, Accessibility best practices for themes. https://shopify.dev/docs/storefronts/themes/best-practices/accessibility
- [S4] Shopify, Build responsive layouts that perform well on mobile. https://shopify.dev/docs/storefronts/themes/best-practices/performance/implement-responsive-design
- [S5] Shopify, Platform performance. https://shopify.dev/docs/storefronts/themes/best-practices/performance/platform
- [S6] Shopify, Theme Check AssetSizeJavaScript. https://shopify.dev/docs/storefronts/themes/tools/theme-check/checks/asset-size-javascript
- [S7] Shopify, Support product media. https://shopify.dev/docs/storefronts/themes/product-merchandising/media/support-media
- [S8] Shopify, Designing Shopify themes. https://shopify.dev/docs/storefronts/themes/best-practices/design
- [S9] Shopify, Support high-variant products (excerpt). https://shopify.dev/docs/storefronts/themes/product-merchandising/variants/support-high-variant-products
- [S10] web.dev, Web Vitals. https://web.dev/articles/vitals
- [S11] web.dev, Optimize LCP. https://web.dev/articles/optimize-lcp
- [S12] web.dev, Optimize CLS. https://web.dev/articles/optimize-cls
- [S13] Chrome, Lighthouse font-size audit. https://developer.chrome.com/docs/lighthouse/seo/font-size
- [S14] W3C, WCAG 2.2 SC 1.4.12 Text Spacing. https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
- [S15] W3C, WCAG 2.2 SC 2.5.8 Target Size (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- [S16] W3C, WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- [S17] W3C, WCAG 2.2 SC 2.2.2 Pause, Stop, Hide. https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- [S18] Baymard, Product List UX Best Practices 2025. https://baymard.com/blog/current-state-product-list-and-filtering. The "filters for all list item info" point is from https://baymard.com/blog/have-filters-for-list-item-info (excerpt).
- [S19] Baymard, Product list thumbnails / secondary hover information. https://baymard.com/blog/secondary-hover-information
- [S20] Baymard, Number of products to load. https://baymard.com/blog/number-of-items-loaded-by-default
- [S21] Baymard, Load more vs pagination vs infinite scrolling (excerpt). https://baymard.com/blog/external-load-more-vs-pagination-vs-infinite-scrolling
- [S22] Baymard, 2 key design principles for product listing information. https://baymard.com/blog/list-item-design-ecommerce. Also the product-page suggestion attributes at https://baymard.com/blog/product-page-suggestions-information (excerpt).
- [S23] Baymard, All color swatches in mobile list items. https://baymard.com/blog/mobile-interactive-color-swatches
- [S24] Baymard, Always show the number of ratings. https://baymard.com/blog/user-perception-of-product-ratings
- [S25] Baymard, Product Page UX Best Practices 2026. https://baymard.com/blog/current-state-ecommerce-product-page-ux
- [S26] Baymard, Product page usability report and benchmark. https://baymard.com/blog/product-page-usability-report-and-benchmark
- [S27] Baymard, Always use thumbnails for additional images. https://baymard.com/blog/always-use-thumbnails-additional-images
- [S28] Baymard, Signpost hidden thumbnails (excerpt). https://baymard.com/blog/truncating-product-gallery-thumbnails
- [S29] Baymard, Ensure sufficient image resolution and zoom. https://baymard.com/blog/ensure-sufficient-image-resolution-and-zoom
- [S30] Baymard, Mobile image gestures (excerpt). https://baymard.com/blog/mobile-image-gestures. Also landscape scaling at https://baymard.com/blog/scale-mobile-product-images-in-landscape (excerpt).
- [S31] Baymard, 7 types of product images. https://baymard.com/blog/ux-product-image-categories
- [S32] Baymard, Avoid horizontal tabs. https://baymard.com/blog/avoid-horizontal-tabs
- [S33] Baymard, Ratings distribution summary (excerpt). https://baymard.com/blog/user-ratings-distribution-summary
- [S34] Baymard, Free shipping shouldn't be only in a banner. https://baymard.com/blog/avoid-banners-only-free-shipping
- [S35] Baymard, Delivery date vs shipping speed. https://baymard.com/blog/shipping-speed-vs-delivery-date
- [S36] Baymard, How to reduce cart abandonment. https://baymard.com/blog/reduce-cart-abandonment
- [S37] Baymard, Cross-sell relevance in the cart. https://baymard.com/blog/product-recommendations-cart
- [S38] Baymard, Returns and shipping links (excerpt). https://baymard.com/blog/footer-needs-return-shipping-links. Also https://baymard.com/lists/cart-abandonment-rate (excerpt).
- [S39] Baymard, Homepage and Navigation UX Best Practices 2025. https://baymard.com/blog/ecommerce-navigation-best-practice
- [S40] Baymard, Drop-down menu hover delay. https://baymard.com/blog/dropdown-menu-flickering-issue
- [S41] Baymard, Homepage carousels. https://baymard.com/blog/homepage-carousel
- [S42] Baymard, Inferring the catalog from the homepage. https://baymard.com/blog/inferring-product-catalog-from-homepage
- [S43] Baymard, Search field design. https://baymard.com/blog/search-field-design
- [S44] Baymard, Autocomplete design patterns. https://baymard.com/blog/autocomplete-design
- [S45] Baymard, Button design. https://baymard.com/blog/button-design
- [S46] Baymard, Responsive upscaling (sticky product summary). https://baymard.com/blog/responsive-upscaling
- [S47] Baymard, Line length readability. https://baymard.com/blog/line-length-readability
- [S48] Baymard, Mobile main navigation (excerpts). https://baymard.com/blog/main-navigation-product-categories and https://baymard.com/blog/mobile-main-nav-view-all
- [S49] NN/g, Mega menus work well. https://www.nngroup.com/articles/mega-menus-work-well/
- [S50] NN/g, Hamburger menus and hidden navigation. https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/
- [S51] NN/g, Touch target size. https://www.nngroup.com/articles/touch-target-size/
- [S52] NN/g, Ecommerce product pages. https://www.nngroup.com/articles/ecommerce-product-pages/
- [S53] NN/g, Homepage design principles. https://www.nngroup.com/articles/homepage-design-principles/
- [S54] NN/g, Mobile faceted search. https://www.nngroup.com/articles/mobile-faceted-search/
- [S55] NN/g, Designing effective carousels. https://www.nngroup.com/articles/designing-effective-carousels/
- [S56] NN/g, Sticky headers. https://www.nngroup.com/articles/sticky-headers/
- [S57] S. Hoober, How do users really hold mobile devices? (UXmatters, 2013). https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
- [S58] Baymard, Added-to-cart confirmation (excerpt). https://baymard.com/ecommerce-design-examples/added-to-cart-confirmation
