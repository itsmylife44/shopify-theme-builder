# The quality floor

The floor is what every Theme meets, whatever its Direction: the rules shoppers and the Theme Store expect, measured rather than a matter of taste. A Direction never trades one away for its look. The catalog sections are built to it, and the Section Catalog tests check most of it, so a Theme made only of catalog sections starts on the floor; composing, writing text and Custom Sections can still break it. The review (`review.md`) checks each line below on the screenshots and in the Theme's files.

## Loading

- The first viewport's image (the hero, the first slide, the product's main image) shows at once: no entrance animation, no blank box while it loads.
- Every image sits in a box of its own ratio, so nothing jumps as images load, and a grid keeps even rows when the store's photos have mixed ratios.
- A page shows images in two ratios at most, the product card's ratio among them (`check-direction.mjs` counts them): a section's `image_ratio` on `card`, its default, shows the card's.

## Product page

- The price, the options and the buy button are in the first viewport on desktop, and right under the gallery on mobile, where the main product's sticky buy bar keeps add to cart in reach once they scroll away.
- Options (size, color) are buttons, not drop-downs, and each option's name shows its selected value, like "Color: Sage", since a swatch alone doesn't name the color.
- Products that come in sizes have a size guide right after the options (the `size-guide` block, opening the shop's size chart page), not only a line in the description.
- Shipping and returns sit next to the buy button, not only in the announcement bar, written from the shop's buying facts: never an example policy the Creator didn't give (`check-direction.mjs` reports the catalog's default text).
- The mobile gallery shows thumbnails, not dots only.
- A product image opens full screen on a click or tap, large enough to see the detail, with pinch to zoom on touch (`image_zoom: lightbox`).
- The description, materials and care are stacked sections that open in place (open on desktop, collapsed on mobile), never tabs.
- The product template's text holds only facts true of every product (shipping, returns, shop-wide care); materials, fit and other per-product facts come from a product metafield connected as a dynamic source, or stay empty, never one product's facts shown on all.

## Collection and cart

- Product cards show the full title and the price, and cards in one row line up.
- Filters and sorting are there on the collection page, and applied filters show as chips that clear. The product count sits above the grid, and choosing a filter updates the results in place without reloading the page; on mobile the filters open from one "Filter and sort" button in a drawer that closes with "Show N results" (`main-collection`, `main-search`).
- The cart shows the full cost before checkout.
- With a free-shipping threshold, the cart shows how far the shopper is from it, or that shipping is free (`free_shipping_threshold`).
- The cart and the product price say whether taxes (and duties) are included and what checkout adds, with shipping linked to the shipping policy (the Base Theme's `tax-note` snippet).

## Accessibility

- Text reaches 4.5:1 contrast on its background (every stop of a background gradient too), and borders of inputs and buttons against the page 3:1, in every color scheme (`check-direction.mjs` checks the schemes; check text on images in the screenshots). Muted text takes `--color-foreground-muted`, which the Theme keeps at 4.5:1, never an opacity.
- Buttons, menu and close icons, and variant options are at least 44px square on mobile; any other control at least 24px.
- Running text stays under about 70 characters a line.
- Headings go in order (one `h1` per page, no skipped levels), and every image the Creator placed has alt text.
- The menu opens with the keyboard, and the focus ring shows on every control. The menu drawer, cart drawer and quick add open with Enter, take focus inside, close with Escape and give focus back (`check-a11y.mjs`).
- Every input, select and textarea has an `id` and a `<label for>` it, visually hidden (`visually-hidden`) where the design shows none, never only a placeholder or an `aria-label`; an email field takes `autocomplete="email"` (the newsletter forms).
- No select submits or navigates on change, which an arrow key would trigger (WCAG F37): the country and language selectors open a list whose every choice is a button.
- Content a script swaps is announced (WCAG 4.1.3): a visually hidden `role="status"` region says the new price and availability after a variant change, and "Cart updated, subtotal X" after a cart change.
- Anything that moves or changes on its own (the announcement bar's rotation, a slideshow on autoplay, a marquee) has a pause button, not only a pause on hover.

## Content

- Every text on the page is the shop's, in its default language: no catalog placeholder left ("Welcome to our store", "Image with text", "Talk about your brand").
- No invented proof: no reviews, customer counts, press quotes, prices or stock counts the shop didn't give. Leave the section out instead.
- One label per action: the same link has the same button label everywhere on a page.
- Images are the store's photos or Shopify's placeholders, never stock people or AI illustration.
- The footer shows Shop's Follow on Shop button (`show_follow_on_shop`, on by default; it appears once the store has Shop Pay), in Shop's own colors: a Direction never restyles it.

## Craft

- No heading wraps to leave one word alone on its last line, at 1440px or at 390px.
- Nothing overflows the screen sideways at 390px, and no text sits on an image where it can't be read.
- Spacing between sections follows one rhythm (the Theme's density, each section's `spacing` setting around it), with no section doubled up or squeezed: two neighbours on one color scheme share one gap by themselves.
- Empty states read well: an empty cart, a search with no results (search tips and a collection's products or the shop's collections under a heading, `main-search`), a collection with no products.
- One radius family everywhere: the Theme's shape setting (`check-direction.mjs` finds a radius of its own).
- Buttons never snap: every button, and every link styled as one, takes the shared `button` or `button--secondary` class, which gives it a hover and a pressed state from the color scheme and the motion setting; a Custom Section's button gets none of its own.
