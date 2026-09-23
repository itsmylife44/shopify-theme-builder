# Shopify theme design inspection: what top themes actually do

Date: 2026-09-23. Goal: measure how the best Shopify Theme Store themes are designed, so the builder can offer a small set of **design directions** a shop owner picks from, instead of one stock look.

## Method

- 15 official demo stores, found through their Theme Store listings (`themes.shopify.com/themes/<slug>`, the "View demo" link).
- For each: home, one collection page and one product page, at **1440×900** and **390×844**, with `agent-browser` driving Chrome.
- Values come from `getComputedStyle` and `getBoundingClientRect` in the live page, plus the theme's `:root` custom properties and the same-origin stylesheets (keyframes, transition durations, easings).
- **(M)** means measured in the browser. **(E)** means estimated from a screenshot or inferred. Values with no mark in the per-theme tables are measured.
- Screenshots (180 files, viewport and full page) are in the session scratchpad, not the repo: `…/scratchpad/design-research/<theme>-<page>-<width>.png` and `…-full.png`.

Caveats:

- A demo store shows one preset, not every setting the theme has. Presets change fonts and colors, but not the layout system.
- Several demos open a newsletter popup on load (Prestige, Impact, Symmetry, Impulse, Motion, Focal, Warehouse), so some screenshots show it.
- Some full-page screenshots have blank areas where scroll-reveal animations had not fired yet (Broadcast, Motion).
- Sizes come from the 1440 viewport unless marked "m" (mobile, 390). Themes that size type with `clamp()` or `vw` give other values at other widths.

## Themes inspected

| Theme | Developer | Demo inspected | Archetype (see the last section) |
| --- | --- | --- | --- |
| Dawn | Shopify | https://theme-dawn-demo.myshopify.com | Quiet Minimal |
| Horizon | Shopify | https://theme-horizon-demo.myshopify.com | Quiet Minimal |
| Fabric (Horizon family) | Shopify | https://theme-fabric-demo.myshopify.com | Quiet Minimal / gallery |
| Atelier (Horizon family) | Shopify | https://theme-atelier-demo.myshopify.com | Editorial Serif |
| Dwell (Horizon family) | Shopify | https://theme-dwell-demo.myshopify.com | Editorial Serif / home |
| Tinker (Horizon family) | Shopify | https://theme-tinker-demo.myshopify.com | Warm Crafted |
| Prestige (Allure preset) | Maestrooo | https://prestige-theme-allure.myshopify.com | Maison Luxe |
| Symmetry (Chantilly preset) | Clean Canvas | https://chantilly.myshopify.com | Maison Luxe (light-sans variant) |
| Impact (Sound preset) | Maestrooo | https://impact-theme-sound.myshopify.com | Bold Showcase |
| Focal (Carbon preset) | Maestrooo | https://focal-theme-carbon.myshopify.com | Bold Showcase (graphic variant) |
| Motion (Adventure preset) | Archetype Themes | https://motion-theme-adventure.myshopify.com | Technical Sport |
| Impulse (Fashion preset) | Archetype Themes | https://impulse-theme-fashion.myshopify.com | Quiet Minimal (fashion) |
| Warehouse (Metal preset) | Maestrooo | https://warehouse-theme-metal.myshopify.com | Catalog Superstore |
| Palo Alto (main) | Presidio | https://palo-alto-theme-main.myshopify.com | Lively DTC |
| Broadcast (main) | Presidio | https://broadcast-theme-main.myshopify.com | Lively DTC (warm variant) |

The Theme Store lists Prestige and Impact at $400 (from the listing page). Presets per listing: Prestige 5 (Prestige, Couture, Vogue, Strass, Signature), Symmetry 5, Palo Alto 5, Focal 4, Impulse 4, Impact 3, Motion 3, Warehouse 3. Be Yours was skipped: its listing has no demo link we could resolve.

---

## Per-theme findings

Each block lists tokens first, then what the layout and behaviour do.

### Dawn (Shopify, free)

| Token | Value |
| --- | --- |
| Fonts | Assistant only, headings and body both at weight 400 |
| Body | 16px/28.8px (1.8), letter-spacing 0.6px (0.0375em), color `rgba(18,18,18,.75)` |
| Type scale | 13 (card title) / 16 / 24 / 40 / 52 (hero h2); m: 12 / 15 / 20 / 30 / 40. The ratio is about 1.3 |
| Colors | White background, foreground `#121212`. Media placeholder `#f3f3f3`. No accent color |
| Container | `--page-width: 120rem`, so 1200px max. Grid gap 8px, 4px on mobile |
| Section rhythm | About 36–44px content inset per section, `--spacing-sections: 0` |
| Buttons | 47px tall, padding 0 30px, radius 0, 15px, tracking 1px, no uppercase. Primary is solid `#121212`, secondary is a 1px outline |
| Inputs | 45px, radius 0, 1px border |
| Variant pills | 36px, radius 40px (the only rounded element) |
| Badges | radius 40px (4rem), 12px |

- **Header (M+E):** announcement bar 39px, header 84px, not sticky. Logo at the left, as a letter-spaced text wordmark. Inline nav right of the logo, 14px at 75% opacity. Search, account and cart icons at the right. On mobile the logo is centered with a hamburger at the left.
- **Product card:** 1:1 image on a `#f3f3f3` background, `object-fit: cover`. Title 13px, price 16px, left aligned; the text starts 17px below the image. The "Sold out" badge is a dark pill at the bottom left of the image. 4 columns in the 1200px container.
- **Product page:** gallery on the left, about 60%: the first image is 713px square, then a 2-up grid of 352px images. The info column is 27% wide (385px) and sticky (`top: 30px`). Order: title h1 40px, price 18px, color pills, quantity stepper, **outline** Add to cart, **solid** Buy it now, description, then accordions (Materials, Shipping, Dimensions).
- **Motion:** `scroll-trigger animate--slide-in` on about 26 elements: they fade in and translate up about 2rem over 0.6s with `cubic-bezier(0,0,.3,1)`. Card images scale to 1.03 on hover. An optional "3D lift" card hover rotates the card 1deg. Durations are defined as tokens from `--duration-short: .1s` up to `--duration-extra-longer: .75s`.
- **Signature:** none, by design. Dawn is the "stock generic" baseline this project wants to move past. Its tracked body text (0.6px) and 1.8 line height are what make it look calm.

### Horizon (Shopify, free; the base for Atelier, Dwell, Tinker and Fabric)

| Token | Value |
| --- | --- |
| Fonts | Heading Bricolage Grotesque 700 (hero only), UI and body Inter 400/500/700 |
| Body | 14px/22.4px (1.6), color `rgba(0,0,0,.81)` |
| Type scale | 12 (price) / 14 / 24 / 32 (product h1) / 48 (collection h1) / 56 (hero); m: 36 collection h1, 48 hero |
| Colors | White, text black at 81%, headings 100%. Primary button black, hover `#333`. No accent |
| Container | `--normal-page-width: 120rem`, `--wide-page-width: 150rem`. The 1440 demo runs full width with 40px side margins (1368px max) |
| Section rhythm | 48px top, 80px bottom; m: 34 / 56 |
| Buttons | 52px tall, padding 16px 24px, **radius 14px**, 14px, no uppercase. Color transition 0.125s `cubic-bezier(.33,1,.68,1)` |
| Inputs | Newsletter input 56px, **radius 39px** (pill), 1px `#dfdfdf` border, background 78% white |
| Variant buttons | 46px, radius 14px, 1px border. Color and size values show as text buttons, 2 per row for colors |

- **Header:** 66px, `position: sticky`. Text logo at the left ("Horizon", Inter 600 16px), nav right after it, 3 icons at the right. No announcement bar in this demo. On mobile the logo is centered.
- **Hero:** full bleed, 519px (58vh), centered white 56px bold heading. The button is an outline with a rounded rectangle shape (E).
- **Product card:** 4:5 portrait image (259×324), edge to edge with no background. Title 14px, price 12px weight 500, left aligned, 8px below the image. Collection grid of 5 columns, gap 16px horizontal and 24px vertical; the home page shows 4 columns. Swatches and a quick add ("Add / Choose") appear on hover.
- **Product page:** **edge-to-edge 2-column image grid** (453×566, 4:5, 4px gutters, starting at x=0) takes the left two thirds; the info column is 32% and sticky at `top: 0`. Order: h1 32px bold, price 14px, divider, color buttons, size buttons, quantity stepper next to Add to cart (black, radius 14), then Shop Pay, then description.
- **Motion:** about 30 keyframes. It uses the View Transitions API (`slideInTopViewTransition`), `fadeInUp`, and thumbnail and cart-bubble slides. `--hover-scale-amount: 1.03` with `--hover-transition-duration: .25s`. Most transitions are 0.2–0.3s `ease-out` or `cubic-bezier(.4,0,.2,1)`.
- **Signature:** the gallery bleeds to the viewport edge while the text column keeps its margin, and product and filter controls use soft 14px radii.

### Atelier (Horizon family, free)

| Token | Value |
| --- | --- |
| Fonts | Display Newsreader **weight 200** (ultra-light serif), UI Red Hat Text 400 |
| Body | **12px**/19.2px, black |
| Type scale | 12 / 24 / 48 / 56 / **120** (hero h1, line height 1.0); m: 72 hero, 28 product h1. Display is 10× the body size |
| Colors | White and black, `#f2f2f2` product backdrops, black footer band. No accent |
| Buttons | 52px, radius 0, 12px uppercase, black |
| Inputs | Underline only: no border box, padding 12px 0 |
| Nav | 12px uppercase, color `#8e8e8e` over the hero |

- **Header:** transparent over a full-bleed hero (720px, 80vh), serif image logo centered, 4 uppercase links at the left, icons at the right. No announcement bar.
- **Home composition:** a centered two-line 120px serif hero ("The Elements / of Style"). A category index as a **large serif text list** at 56px weight 200, with superscript product counts in grey ("Shoulder Bags ¹²"), next to one image. A 50/50 split of a lifestyle image and a product shot. A before/after comparison slider. The footer carries a giant ATELIER wordmark (E).
- **Product card:** 4:5, title and price both 12px **uppercase** Red Hat Text on one line, left aligned. Swatches sit right-aligned on the same line on the home rail (E). 5 columns, gap 16px.
- **Product page:** the gallery is **one full-bleed column of 708×885 (4:5) images stacked vertically** in the left half. The right half is a centered narrow column: serif h1 48px weight 200, centered; price 12px; **Add to cart and Buy it now side by side**, 52px each; then Description, Care and Design accordions. Sticky at `top: 0`.
- **Signature:** an ultra-light 200-weight serif at huge sizes against a tiny 12px uppercase UI, a text-list category index, and a wordmark footer.

### Dwell (Horizon family, free)

| Token | Value |
| --- | --- |
| Fonts | Newsreader 300/400 **plus italic** for headings **and body**. Red Hat Display 500 for small uppercase labels and prices |
| Body | 14px/19.6px serif, black at 71% |
| Type scale | 12 (labels, uppercase, tracking 0.03em) / 14 / 24 / 40 / 72 (hero, 1.1); m: 44 hero, 40 product h1 |
| Colors | White, **warm brown `rgb(125,84,73)`** for the announcement bar and a promo block, sand `rgb(233,228,224)` footer, olive `rgb(62,69,57)` |
| Buttons | 52px, radius 0, **serif** 14px label (Newsreader), black |
| Inputs | Underline, 24px serif placeholder ("Email address") |

- **Header:** a classic **two-row centered** layout: search icon left, italic serif logo with a flower mark centered, account and cart right. Row 2 is a centered serif nav (Bedding · Bath · Decor · Sale · Inspiration). Brown announcement bar above.
- **Home:** italic 72px serif hero title over the image, an **italic serif statement paragraph** at 40px/44px, a lookbook image with **hotspot dots** (shop the look), a mosaic of collection tiles, circular-free square accessory tiles with uppercase captions, and a 2/3 brown text block next to a 1/3 image.
- **Product card:** 4:5, serif title 16px, price as a 12px uppercase sans. 3 columns next to a left filter sidebar.
- **Product page:** a single large image (837×1046, 4:5) in a carousel with prev/next arrows, **a vertical thumbnail strip between the image and the info column**, info 31% sticky. Size is a dropdown select, colors are square swatches, then quantity and Add to cart, full-width Buy it now, icon lines (Reliable shipping, Flexible returns), and a Details accordion.
- **Signature:** serif body text (rare in e-commerce), italic display, earth-tone blocks, and a centered two-row header.

### Tinker (Horizon family, free)

| Token | Value |
| --- | --- |
| Fonts | Display **Instrument Serif** 400 (condensed, with italic), UI Instrument Sans 400 |
| Body | 14px/19.6px |
| Type scale | 14 / 24 / 32 / 48 (h1 and section titles); price on the product page 24px |
| Colors | White, cream `rgb(250,249,241)`, yellow announcement `rgb(253,198,86)`, **sage button `rgb(195,204,166)` with black text**, sea-green footer `rgb(173,196,194)`, beige `rgb(241,237,231)` |
| Buttons | 52px, **pill (radius 100px)**, sage background, black text, 14px |
| Inputs | 52px pill, white on beige |
| Radius | Product card 10px, product media 20px |

- **Header:** logo at the left (bold wordmark), nav centered, icons at the right, transparent over the hero. Yellow announcement bar.
- **Home:** hero text sits **bottom-left** ("Introducing" in italic above "Our Newest Arrivals"), with the description at the bottom right. A 50/50 split of an image and a product on cream. A collection mosaic of 4 tiles in 2 rows with alternating widths (1:2 then 2:1).
- **Product card:** 1:1 image inside a `#f7f7f7` card with **radius 10px**; text inset 24px inside the card. 5 columns, gap 16px.
- **Product page:** main image 883×883 at **radius 20px**, then 2-up 436px images, then a full-width 1440×450 media band. Info 31% sticky: serif h1 48px, price 24px, quantity and pill Add to cart, pill Buy it now, description, then **spec tiles** (Width 4″, Height 2″, Length, Made in) as a 2-column grid of rounded boxes.
- **Signature:** a soft palette of 4–5 tints, pill controls, rounded media, a condensed serif, and spec tiles.

### Fabric (Horizon family, free)

| Token | Value |
| --- | --- |
| Fonts | **Geist** 400/500/600 only |
| Body | 14px/19.6px, `rgba(3,3,2,.76)` |
| Type scale | 12 (price labels, uppercase, weight 600) / 14 / 24 / 32 (section and product title) / 72 (collection h1) |
| Colors | White, warm grey block `rgb(237,235,231)`. No accent |
| Buttons | 52px, **radius 2px**, near-black `rgb(3,3,2)` |
| Inputs | Underline, **32px** placeholder text (newsletter) |

- **Header:** transparent over a **full-screen video hero** (100vh) with a giant bold wordmark (image) and a small "Shop now" text link. Nav at the left (Womenswear, Menswear, Home), icons at the right.
- **Home:** a text block at the left next to a horizontally scrolling rail of 3:4 portrait images, **edge-to-edge 3-up category images with tiny white label tags** at the bottom left ("Home", "Menswear"), a scrolling text marquee, and a full-width video.
- **Product card:** 4:5, **grid gap 0 horizontally** (images touch), 16px row gap, text inset 16px. 5 columns edge to edge (`gridLeft: 0`).
- **Product page:** an edge-to-edge 2-column image grid on the left (the page starts at the viewport top), info on the right. The title is an h2 at 32px (no h1 on the page, M). Square size boxes, a full-width black Add to cart, and accordions (Product details, Fabric care, Size & fit).
- **Signature:** a gallery or zine feel: zero-gap image grids, label tags on images, video, and oversized input type.

### Prestige (Maestrooo, $400, Allure preset)

| Token | Value |
| --- | --- |
| Fonts | Headings **Instrument Sans 400 UPPERCASE, `--heading-letter-spacing: 0.18em`**. Body Nunito 400 |
| Body | 14px/23.1px (1.65), `#1c1c1c` |
| Type scale | 12 (eyebrow, uppercase, 0.18em) / 14 / 22 (product h1) / 28 (h2) / 32 (h2 large) / 64 (marquee); m: 20 h2, 18 product h1. `--text-heading-size-factor: 1` |
| Colors | **Page background `#efefef`** (light grey, not white), text `#1c1c1c`, dark announcement bar `#1c1c1c`. Monochrome with no accent |
| Container | Tokens `--container-xs: 42.5rem` up to `--container-xl: 85rem`, gutter 1.25rem. Content blocks max out at 1150px and 980px |
| Section rhythm | `--section-vertical-spacing: 3rem`, measured inset **80–105px** on desktop, 48–73px on mobile |
| Buttons | 44px, padding 10.4px 28px, radius 0, **13px uppercase, tracking 0.18em (2.34px)**. Hover is a fill sweep: `background-size .45s cubic-bezier(.785,.135,.15,.86)` |
| Inputs | 46px, radius 0, 1px border |

- **Header:** a 68px announcement bar with a **countdown timer** (days, hours, minutes, seconds), then a 75px header, sticky, **transparent over a 100vh hero**. Nav at the left in 12px uppercase tracked 0.18em, image logo centered (130×21), currency, account, search and cart at the right. Nav gap 40px.
- **Hero:** a 900px (100vh) slideshow with a centered eyebrow (12px caps) plus a 28px tracked-caps title and two small square buttons (Women / Men). A scroll-down chevron in a circle.
- **Home:** best sellers with Women/Men **text tabs** (the underlined tab is active), an asymmetric collage (one big image and two stacked), **two scrolling marquee rows of 64px tracked caps with inline product thumbnails**, a video with a play button, "shop the look", split promos, a color chooser, a blog grid, a "product of the week" block, press quotes, and an Instagram grid.
- **Product card:** 1:1, `object-fit: contain` over the grey page background (products are cut out, so the card has no visible box). Title 12px uppercase tracked 0.18em, **centered**. Price centered. **Very airy grid: 60px column gap, 64px row gap** at 4 columns. A secondary image appears on hover, and an "Add to cart" link at the top right of the image on hover.
- **Collection:** a full-bleed banner with a centered caps title. The toolbar is a full-width bordered strip: grid-density toggles (2, 3 or list) at the left, the product count centered, Sort and Filter at the right, split by vertical rules.
- **Product page:** **vertical thumbnails at the far left**, the main image 631px square in the center, the info column 29% sticky at `top: 95px`. Order: h1 22px tracked caps, price 18px tracked, stars at the right, divider, color label with **square image swatches** (34px), description, outline Add to cart, solid Buy it now, **feature chips with icons** (Business bags, Full Grain Leather, Handmade in Italy), then a "More information" accordion.
- **Motion:** `zoom-image` images scale over **8s** `cubic-bezier(.25,.46,.45,.94)` (a slow Ken Burns zoom on hover and in the hero). Link hover uses `link-faded`. Animated plus and icons. Most UI transitions are 0.2s `ease-in-out`.
- **Signature:** tracked uppercase everywhere, a grey page background with cut-out products, a very airy grid, the button fill sweep, the 8s image zoom, and marquee text with thumbnails.

### Symmetry (Clean Canvas, Chantilly preset)

| Token | Value |
| --- | --- |
| Fonts | Montserrat: **headings weight 200** with **tracking −0.04em**, body 300, eyebrow 500. Logo Jost 700 |
| Body | 14px/22.4px weight 300, `#232323` |
| Type scale | 11 (vendor) / 14 / 26.8 / 34 / 48 / 60 (hero, 1.3); m: 27 / 34 / 40 |
| Colors | White, `#232323`, light grey `#f7f7f7` and `#efefef` media backgrounds, dark announcement bar. An orange accent only for "Pre-order" |
| Container | `--page-container-width: 1600px`, `--reading-container-width: 720px`, gutters 20px desktop, 16px mobile, 30px large |
| Section rhythm | Tokens `--section-padding: 50px`, `--larger-section-padding: 80px`, `--largest-section-padding: 110px` |
| Buttons | 41–48px, padding 14.4px 25px, radius 0, **12–14px weight 300 uppercase, tracking 0.08em** |
| Inputs | 48px, radius 0, 1px `#c8c8c8` border |

- **Header:** a 36px announcement bar with an inline countdown, then a 65px header, sticky, transparent over the hero. Uppercase 11–13px nav at the left, a **letter-spaced wordmark** centered ("S Y M M E T R Y"), icons at the right.
- **Hero:** 864px, with left-aligned **ultra-light 60px** text ("Come find your best fit…") over a darkened photo, an eyebrow in 11px caps, and a small white square button.
- **Home:** a centered quote in 34px weight 200, 4 tall 2:3 category tiles with centered labels and white buttons, a **flash-sale strip with a countdown**, a product carousel, a large image with text overlay, and a UGC grid with no gaps.
- **Product card:** a **2:3 tall** image, `contain` on `#efefef`. Vendor 11px, title 14px, price 14px weight 300, stars and review count, color dots with "+3 more". A "New arrival" text badge at the top right. 4 columns next to a 320px sidebar filter, gap 30px by 61px.
- **Product page:** main image 603×905 (2:3), then 2-up images below. Info 34% sticky at `top: 95px`. h1 34px weight 200, **circular color swatches of 40px (radius 50%)**, square size boxes, a **fit guide slider** (Small ↔ True to size ↔ Large), a quantity stepper, outline "Sold out" and solid "Buy it now" buttons, then 3 icon USPs in a row.
- **Motion:** a `cc-animate-in` fade-up on 51 elements (`--aos-animate-duration: .6s`), marquee image strips, a hotspot pulse at 3.5s, a clock pulse at 2s. Durations 0.1–0.35s.
- **Signature:** an ultra-light 200-weight sans with negative tracking (a soft glam look), tall 2:3 imagery, and a letter-spaced wordmark.

### Impact (Maestrooo, $400, Sound preset)

| Token | Value |
| --- | --- |
| Fonts | **Barlow 700** for headings with **tracking −0.025em** (−1.2px at 48px, −5.4px at 216px). Barlow 400 body |
| Body | 16px/25.6px, `#1a1a1a` |
| Type scale | 12 / 16 / 32 / 48 / 80 (collection h1) / **216** (h2 "MW08", line height 1.0); m: 32 / 48 / 65. The display is 13.5× the body size |
| Colors | **Page background `#f0f0f0`**, white cards, `#1a1a1a`. **Purple accent `rgb(128,60,238)`** for "New" badges, lavender `rgb(157,161,220)` for disabled and info tints, a dark hero |
| Container | Blocks at 1000px, 1100px and 1300px; the page gutter is 48px desktop, 20px mobile. A spacing scale from `--spacing-0-5` (2px) to `--spacing-52` (13rem) |
| Section rhythm | **96px** insets on desktop, **48px** on mobile, very consistent (M) |
| Buttons | **60px tall, pill (radius 60px)**, padding 17.2px 40px, 16px weight 700, no uppercase. Transition 0.15s ease-in-out |
| Inputs | 60px, **radius 8px**, 1px border at 12% opacity, floating label |
| Media radius | 6px on cards, **12px** on image blocks and gallery images |

- **Header:** a **scrolling marquee announcement** (48px, dark), then a 94px header, **transparent over an inset, rounded hero card** (E: the hero sits 24px from the edges with rounded corners). Image logo at the left, **bold 16px weight 700 nav centered** (gap 40px), locale and icons at the right. Sticky on inner pages.
- **Home:** a category row of 5 **white rounded tiles** (icon image plus label), a **giant scrolling marquee headline** ("…ending exploration", olive color, about 100px, E), 3 image cards with bottom-left 24px bold titles, a best-sellers carousel of white cards, a **216px product-name statement** ("MW08") in light grey behind a product shot, and an asymmetric mosaic (1 large and 3 small, rounded 12px).
- **Product card:** a **white card, radius 6px**, on the `#f0f0f0` page. 1:1 image, `contain`, top corners rounded to match. Text inset 32px: title 16px weight 700 with the **rating inline at the right** (4.7★), then swatch dots. A "New" badge as a purple pill (radius 60px, 12px weight 700). 4 columns, gap 24px by 48px.
- **Product page:** the whole buy box sits in a **large white rounded panel** on the grey page (E, radius about 24px). Vertical thumbnails at the left, main image 608px at radius 12px, info 33% sticky at `top: 114px`. Order: "New" badge, vendor, **h1 48px weight 700 with tight tracking**, price plus a "Sold out" pill with the rating at the right, divider, **color swatches as 60×60 image tiles** (radius 4px), a pill Add to cart of 60px at full width, and a **tinted lavender info box** ("Fast shipping").
- **Motion:** image hover zoom over **1.5s `cubic-bezier(.22,1,.36,1)`** (a slow expo-out), `reveal-invisible` text reveals, `animated-arrow`, a timeline slider, and marquees. UI transitions are 0.15–0.2s ease-in-out.
- **Signature:** a huge, tightly tracked bold grotesk, white rounded cards on grey, pill CTAs, and a big marquee headline.

### Focal (Maestrooo, Carbon preset)

| Token | Value |
| --- | --- |
| Fonts | Display **Tomorrow 700 UPPERCASE** (a techno square sans), tracking −0.9 to −1px. Body Rubik 400/600 |
| Body | 15px/26px, `#282828` |
| Type scale | 12 (badges) / 14 (eyebrow h2, weight 600, uppercase, tracking 1px) / 15 / 26 / 40 / 54 / 62 / 72 (hero) |
| Colors | White, a **near-black header and bands**, `#f5f5f5` panels, **primary blue `#405de6`** and **acid yellow `#f3ff34`**, sale red `#e00000` |
| Container | 1600px and 1000px |
| Section rhythm | 80px desktop, 48px mobile |
| Buttons | 52px, padding 0 35px, **radius 0, 13px weight 600 uppercase, tracking 2px**. Hover sweeps `background-position .3s cubic-bezier(.215,.61,.355,1)` |
| Inputs | 52px, radius 0, 1px border at 15% opacity |

- **Header:** an acid-yellow announcement bar with prev/next arrows, then an **80px dark header** (not transparent) with a sticky wrapper: bold logo at the left, nav centered (15px), icons at the right with a **count badge on the cart**.
- **Home:** a slideshow with a **progress-bar indicator** and a boxed nav chip ("DEFINE YOUR STYLE 1/2"), a centered 54px caps "EXPLORE" with tabs, product cards with **stacked square badges** (BEST SELLER blue, COLLAB or BACK IN STOCK yellow), an image offset over a **solid acid-yellow block** (color-block collage), a blog in a 1-large plus 3-list layout, a blue text panel overlapping an image, and collaboration tiles.
- **Product card:** 1:1, text centered, square color swatches. 3 columns next to a **sticky 265px filter sidebar**, gap 24px. Badges are square 12px uppercase weight 600 with 0 5px padding.
- **Product page:** image about 560px square, **horizontal thumbnails below**, a zoom button inside the image. Info 37%: h1 40px Tomorrow caps, price, stars and SKU, square swatches, quantity, **Add to cart in acid yellow and Buy it now in blue**, both 52px at full width, then share icons.
- **Motion:** slideshow progress bars (`slideshowProgressBarAnimation`), a `sweep` slide, animated underline text (0.6s), a play-button ripple, image zoom 1.03. Mostly 0.2–0.25s ease-in-out (130 rules).
- **Signature:** color blocking with two saturated accents, a techno caps display font, a dark header, and square badges.

### Motion (Archetype Themes, Adventure preset)

| Token | Value |
| --- | --- |
| Fonts | Instrument Sans 400/500/700 only. **Headings UPPERCASE with negative tracking −0.05em** (`--typeHeaderSpacing`), body −0.025em |
| Body | **13px**/18.2px |
| Type scale | 11.7 (price) / 13 / 15.3 (card title) / 18.7 / 22 (h1) / 40 (hero) / 80 ("INTO THE WILD"); m: 40 hero, 17.6 product h1 |
| Colors | Off-white `#f8f8f6`, `#1a1a1a`, **electric blue `rgb(62,113,234)`** buttons, **safety orange `rgb(251,68,1)`** announcement bar, `#111` dark bands |
| Container | 1300px and 1200px, plus 2150–2688px for full-bleed media |
| Buttons | 44–50px, padding 11px 20px, radius 0, **16px uppercase, tracking −0.8px**. Hover transition `padding-right .3s` (an arrow slides in) |
| Inputs | 44px, radius 0, 1px `#e8e8e1` border |

- **Header:** logo at the left, nav right after it (13px), icons at the right, **transparent over the hero**, orange announcement bar.
- **Home:** hero text at the bottom left, a 2-up product highlight with big 2:3 images, a text marquee ("Free shipping and returns"), Wear/Carry tabs, a black video band with a **blue countdown strip** (days, hours, minutes, seconds), a 5-tile mosaic with uppercase labels, and an **overlapping stacked-photo collage** (3 images layered).
- **Product card:** 2:3 on `#f4f4f4`, title 15.3px, price 11.7px, square color chips. 4 columns, gap 30px by 66px.
- **Product page:** vertical thumbnails at the left, main image 620×930 (2:3) in a carousel, info 35% (not sticky). Order: h1 22px uppercase with tight tracking, price, color label "— Blue" with square chips, size boxes, USP lines with icons (free shipping, in stock), outline Add to cart, **blue solid** Buy it now.
- **Motion (the richest of all 15):** AOS on 105–113 elements: **`rise-up` 1s `cubic-bezier(.165,.84,.44,1)`**, section backgrounds `zoom-fade` (2.5s), **`kenburns`**, `paint-across` wipe reveals, page transitions (`page-fade-in-up`, `page-slide-reveal-across`, `page-slide-reveal-down`), and parallax images. Set with theme variables `--animateSectionsBackgroundStyle: zoom-fade` and `--animateSectionsTextStyle: rise-up`.
- **Signature:** tight-tracked uppercase at every size, two sporty accents, and heavy but tasteful reveal choreography.

### Impulse (Archetype Themes, Fashion preset)

| Token | Value |
| --- | --- |
| Fonts | Headings Host Grotesk 500, body Fustat 400/600 |
| Body | 16px/22.4px, tracking 0.025em, slate `rgb(42,55,67)` |
| Type scale | 12 / 13 (uppercase, 0.2em) / 16 / 27 / 36 / 43 / 60; m: 31 h1 |
| Colors | White, **slate navy `#2a3743`** for text and buttons, beige `#edebe7` for secondary buttons |
| Container | 1500px and 1200px |
| Buttons | 42–46px, padding 11px 20px, **pill (50px)**, **13px weight 700 uppercase, tracking 0.2em** |
| Inputs | 42px, radius 0 |

- **Header:** **three tiers**: an 18px announcement bar, a utility row (text links at the left; social icons and locale at the right), then the main row with search at the left, a **split nav around a centered logo** (New · Clothing · Sale | IMPULSE | The Lookbook · Journal · Theme Features), and account and cart at the right. Transparent over a 960px (107vh) **shoppable hero** with **"+" hotspots** on the photo.
- **Home:** 4 category images with small captions below, a 5-column product rail, a 2-up image promo grid with centered titles and pill buttons, a text-and-image split with an **arched image mask** (E), and a video.
- **Product card:** 2:3, title 16px, price 14px, left aligned. 4 columns, gap 22px by 30px.
- **Product page:** vertical thumbnails, a 574×861 (2:3) slider with the next image peeking in, info 48% (not sticky). Order: h1 36px, price, size boxes, USP lines, a dark pill "Pre-order" button at full width, description with bullets, then "Shipping information" and "Ask a question" rows.
- **Motion:** AOS on 65 elements, the same Archetype engine as Motion (`rise-up` 1s, `zoom-fade` 2.5s), plus parallax.
- **Signature:** a split nav with a centered logo, a shoppable hotspot hero, and tracked uppercase pill CTAs.

### Warehouse (Maestrooo, Metal preset)

| Token | Value |
| --- | --- |
| Fonts | Barlow 400/500/600 |
| Body | 16px/29.9px (1.87), grey `rgb(103,114,121)` |
| Type scale | **flat**: 13 / 14 / 15 / 16 / 22 / 29 (the largest heading). m: 25. Display is only 1.8× the body size |
| Colors | White cards on a light-grey `#f3f5f6` page, **navy `#1e2d7d`** for headings, header and Buy it now, **cyan `#00badb`** for primary CTAs and prices, saturated promo tiles (magenta `#fc2a68`, violet `#6f42ef`, teal, red), green stock and "New" `rgb(0,138,0)` |
| Container | 1480–1500px |
| Buttons | 48px, padding 0 30px, **radius 2px**, 16px weight 600, no uppercase |
| Inputs | 48px, radius 2px, floating label |

- **Header:** a **search-first navy bar**: logo, a **455px search field with an "All categories" dropdown** and a submit button, then Country/region, Login/Signup, and Cart with a count. A second light-grey row holds the category nav with dropdowns. A navy announcement bar with a "Subscribe & Save" chip. Sticky.
- **Home:** a hero slideshow at 48vh, 3 colored promo tiles, USP boxes with icons, circular category images, a featured collection strip in bordered white cells, brand logo cells, a dark "New TVs" panel next to products, and a **featured-product module** (a full buy box on the home page).
- **Product card:** a **white cell with 20px padding**, cells joined by 1px lines (gap 0). 1:1 image, `contain`. Order: vendor 13px uppercase grey, title 15px weight 600 navy, stars, price in cyan, **stock line "In stock, 148 units"** in green with a dot. "New" as a green flag badge (radius 0 3px 3px 0). 4 columns next to a sidebar with Collections and Filters.
- **Product page:** **two white cards** on grey: gallery with vertical thumbnails inside the card, and info (sticky at `top: 189px`). Info reads like a table: "Color:", "Price:", "Stock:" labels at the left, then a **stock progress bar**, quantity, and **Add to cart (cyan) next to Buy it now (navy)**, 48px, radius 2px. Vendor, SKU, stars and share icons sit under the title.
- **Motion:** almost none: `drift` zoom on product images, skeleton shimmer, 0.2–0.25s ease-in-out.
- **Signature:** density and data (stock counts, SKUs, vendors), search as the main tool, and navy plus cyan.

### Palo Alto (Presidio)

| Token | Value |
| --- | --- |
| Fonts | Headings Rubik 500/600, body Work Sans 400/500, **Space Mono** for announcement, eyebrow and badge labels, **Pacifico** (script) as a decorative accent |
| Body | 16px/25px, `#0b0b0b` |
| Type scale | 8.4 (ticker badge) / 11.2 (eyebrow, mono, uppercase) / 12.8 (nav, uppercase) / 16 / 21 / 32 / 38 / 43 / 46 / 64 (h2) / 66 (promo) |
| Colors | White, `#0b0b0b`, **blush `rgb(255,247,242)` and `rgb(255,241,232)`** section backgrounds, sale red `rgb(208,46,46)` |
| Container | 1440px and 1320px, 60px side gutters (collection) |
| Buttons | 46–51px, padding 13.5px 19.8px, **radius 8px**, 14.4px weight 500 uppercase, tracking 0.075em. Solid black or 1px black outline |
| Media radius | About 16px on hero bottom, promo tiles and lookbook images (E) |

- **Header:** a monospace uppercase announcement bar with arrows, a 60px header with uppercase nav at the left (Sale carries a red "15% OFF" chip), logo centered, About, Theme features and icons at the right, then a **social-proof sub-bar** ("Loved by over 10,000+ customers since 2016", monospace).
- **Home:** a hero whose bottom is **rounded into the next section** (the blush band curves over it, E), a **hand-drawn circle** around a word in the hero title, a **countdown band** (61px numerals), a category grid with overlay labels, rounded promo tiles, a trending rail, a lookbook split with rounded images and large statements (43px Rubik 500), and a "10,000+ 5-star reviews" block.
- **Product card:** about 0.77 aspect (≈10:13), cover. **A marquee badge ticker runs across the top of the image** ("SAVE UP TO 10%", Space Mono 8.4px on red). Centered title 16px, price, a small material line ("Recycled materials"), a color count. 3 columns next to a 300px sidebar with **color swatch grids**. Gap 20px. "Quick Buy" on mobile.
- **Product page:** a 2-column image grid (369×461, 4:5) at the left, info 35% sticky at `top: 30px`. Order: h1 32px, price, an **in-stock dot line**, color swatches, size pills (radius 8px) with a size guide, quantity, **"ADD TO CART • $150.00"** (price inside the button), outline Buy it now, a **"Limited time offer" countdown card**, then 9 accordions.
- **Motion:** about 5,400 CSS rules; AOS on 80 elements, `ticker`, clip-path wipes (`clipPathFromLeft`), `image-in--zoom-out`, a compact header on scroll (`showCompactHeader`), hover second image with fade-in. The main easing is **`cubic-bezier(.19,1,.22,1)`** (expo-out), mostly at 0.3s.
- **Signature:** conversion widgets built into the design (tickers, countdowns, social proof), monospace micro-type, blush tints, and rounded 8px corners.

### Broadcast (Presidio)

| Token | Value |
| --- | --- |
| Fonts | Headings **Bricolage Grotesque 700/800 UPPERCASE**, body DM Sans 400/500 (plus italic), buttons and eyebrows **Karla** uppercase, tracking 0.025em |
| Body | 16px, `#212121` |
| Type scale | 12 / 14 / 16 / 20 (product h1, uppercase) / 36 / 48 (`--FONT-HEADING-*` tokens: mini 12, x-small 16, small 20, medium 36, large 48); m: 24 / 32 |
| Colors | **Warm off-white `#fcfbf9`**, `#212121`, **gold accent `#ab8c52`** (hover `#806430`, light `#e8d4ae`), sand `#f5f2ec`, mint announcement `rgb(174,207,184)`, black ticker band |
| Buttons | **pill (`--RADIUS: 300px`)**, 39px hero or 53px collection, padding 9–16px by 16–22px, Karla 14px uppercase |
| Inputs | Underline style, pill selects (`--RADIUS-SELECT: 22px`) |

- **Header:** **two rows**, 125px, **absolute and transparent** over the hero. A utility row (Theme features, Blog, FAQ at the left; social, gift card, language, currency at the right), then the main row with nav at the left, logo centered, icons at the right. A mint announcement bar with arrows.
- **Home:** a slideshow hero with centered 48px caps and a white pill button, a **"text with products" headline where product images sit inline between words** ("MODERN ◯ HEIRLOOMS ◯ ELEGANT TREASURES"), a 3-column editorial card row with titles in caps, an asymmetric split with a small inset image, a black **ticker band**, a product rail with a **promo tile as the first card**, a video, press logos, and parallax.
- **Product card:** about 5:6 (0.83), cover. Title and price centered, price in grey `#636262`, swatch dots, a "Pre-order" or "New" pill badge (dark or grey pill). A hover "Add to cart" pill. The collection grid also mixes in **promo tiles**. Gap 32px desktop, 16px mobile.
- **Collection:** a caps h1 with a superscript count ("RINGS ¹⁴"), a row of **pill quick-links** (New arrivals, Best sellers, Sale, …) on sand, and a thin filter bar.
- **Product page:** images stacked 670×893 (3:4) at the left, info 47% sticky at `top: 30px`. Badges above the title, h1 20px caps, price, "Hurry! Low inventory", round swatches, 6 accordions.
- **Motion:** `data-aos` plus `data-parallax-speed`, `heroFadeIn`, ticker, `imageFadeIn` on hover second image. The main easing is `cubic-bezier(.215,.61,.355,1)` at 0.3–0.5s.
- **Signature:** product images inline in the headline, a warm off-white with gold, uppercase grotesk headlines, pill buttons, and promo tiles mixed into product grids.

---

## Cross-theme comparison

### Typography (desktop, M)

| Theme | Heading font / weight / case / tracking | Body | Largest display | Display ÷ body |
| --- | --- | --- | --- | --- |
| Dawn | Assistant 400, sentence case, +0.6px | Assistant 16/1.8 | 52 | 3.3 |
| Horizon | Bricolage 700 hero, Inter 700 | Inter 14/1.6 | 56 | 4.0 |
| Fabric | Geist 400 | Geist 14/1.4 | 72 | 5.1 |
| Atelier | Newsreader **200** | Red Hat Text **12**/1.6 | **120** | **10** |
| Dwell | Newsreader 300 + italic | Newsreader 14 (serif body) | 72 | 5.1 |
| Tinker | Instrument Serif 400 | Instrument Sans 14 | 48 | 3.4 |
| Prestige | Instrument Sans 400 **UPPERCASE +0.18em** | Nunito 14/1.65 | 64 | 4.6 |
| Symmetry | Montserrat **200**, **−0.04em** | Montserrat 300 14 | 60 | 4.3 |
| Impact | Barlow **700**, **−0.025em** | Barlow 16/1.6 | **216** | **13.5** |
| Focal | Tomorrow 700 **UPPERCASE** −0.015em | Rubik 15/1.73 | 72 | 4.8 |
| Motion | Instrument Sans 400 **UPPERCASE −0.05em** | Instrument Sans 13 | 80 | 6.2 |
| Impulse | Host Grotesk 500 | Fustat 16, +0.025em | 60 | 3.8 |
| Warehouse | Barlow 500 | Barlow 16/1.87 | **29** | **1.8** |
| Palo Alto | Rubik 500 (+ Space Mono, Pacifico) | Work Sans 16 | 66 | 4.1 |
| Broadcast | Bricolage 700 **UPPERCASE** | DM Sans 16 | 48 | 3.0 |

Patterns:

- **Tracking follows weight and case.** Light or regular uppercase gets wide positive tracking (Prestige +0.18em). Bold or large gets negative tracking (Impact −0.025em, Motion −0.05em even in caps, Symmetry −0.04em at weight 200). Sentence-case body text is 0 to +0.04em.
- **Premium themes use a small body size** (12–14px: Atelier, Prestige, Horizon, Motion) with a large display, so the contrast is high. Catalog themes use a 16px body with a flat scale.
- **Mobile display scaling varies a lot:** Dawn 52→40 (×0.77), Atelier 120→72 (×0.6), Impact 216→65 (×0.3), Motion keeps 40→40. Big-display themes shrink hard with `clamp`/`vw`. The product h1 barely changes (Horizon 32→32, Dwell 40→40).
- **Line height:** display 1.0–1.1 (Impact, Atelier, Horizon: 1.0); body 1.4–1.87.

### Buttons (M)

| Theme | Height | Radius | Case / tracking | Weight / size | Style |
| --- | --- | --- | --- | --- | --- |
| Dawn | 47 | 0 | none / 1px | 400 / 15 | solid or outline |
| Horizon | 52 | 14px | none | 400 / 14 | solid black |
| Atelier | 52 | 0 | UPPER | 400 / 12 | solid black, paired side by side |
| Dwell | 52 | 0 | none, serif label | 400 / 14 | solid black |
| Tinker | 52 | pill | none | 400 / 14 | sage fill, black text |
| Fabric | 52 | 2px | none | 400 / 14 | solid near-black |
| Prestige | 44 | 0 | UPPER / 0.18em | 400 / 13 | outline or solid, fill sweep 0.45s |
| Symmetry | 41–48 | 0 | UPPER / 0.08em | **300** / 12–14 | outline or solid |
| Impact | **60** | pill | none | **700** / 16 | solid |
| Focal | 52 | 0 | UPPER / 2px | 600 / 13 | acid yellow and blue, position sweep |
| Motion | 44–50 | 0 | UPPER / **−0.05em** | 400 / 16 | blue solid, arrow slides in on hover |
| Impulse | 42–46 | pill | UPPER / 0.2em | 700 / 13 | slate solid, beige secondary |
| Warehouse | 48 | 2px | none | 600 / 16 | cyan and navy |
| Palo Alto | 46–51 | 8px | UPPER / 0.075em | 500 / 14.4 | black solid or outline, price in label |
| Broadcast | 39–53 | pill | UPPER (Karla) / 0.025em | 400 / 14 | white or black pill |

Two families stand out. Square buttons with **uppercase, tracked, light** labels read as luxury and editorial. **Pill** buttons with **bold, sentence-case** labels read as tech and DTC. Tinker and Horizon sit between: soft radius or pill with a regular-weight sentence-case label.

### Product cards (M)

| Theme | Image ratio | Image background / fit | Card box | Text align | Grid gap (col × row) | Extras |
| --- | --- | --- | --- | --- | --- | --- |
| Dawn | 1:1 | `#f3f3f3` cover | none | left | 8 × 8 | pill badge |
| Horizon | 4:5 | none, cover | none | left | 16 × 24 | hover swatches, quick add |
| Fabric | 4:5 | none | none, **0 gap** | left, 16px inset | **0** × 16 | edge to edge |
| Atelier | 4:5 | `#f2f2f2` | none | left, **12px caps** | 16 × 16 | swatches inline right |
| Dwell | 4:5 | white | none | left, serif title | 16 × 16 | sans uppercase price |
| Tinker | 1:1 | `#f7f7f7` | **card radius 10** | left, 24px inset | 16 × 16 | |
| Prestige | 1:1 | page grey, **contain** | none | **center**, caps 0.18em | **60 × 64** | hover second image and "Add to cart" |
| Symmetry | **2:3** | `#efefef` contain | none | left | 30 × 61 | vendor, stars, color dots |
| Impact | 1:1 | white contain | **white card radius 6** on grey | left, 32px inset | 24 × 48 | rating inline, purple pill |
| Focal | 1:1 | light grey | none | center | 24 × — | square caps badges |
| Motion | **2:3** | `#f4f4f4` | none | left | 30 × 66 | square color chips |
| Impulse | **2:3** | none | none | left | 22 × 30 | |
| Warehouse | 1:1 | white contain | **cell, padding 20**, 1px dividers | left | 0 × 0 | vendor, SKU, stock count, stars |
| Palo Alto | ≈10:13 | none | none | center | 20 × 20 | **marquee badge**, material line |
| Broadcast | 5:6 | none | none | center | 32 × 32 | promo tiles in grid, hover pill |

Portrait (4:5 and 2:3) is the fashion default. 1:1 with `contain` goes with cut-out products (bags, electronics). Columns: 5 for the Horizon family, 4 for most, 3 when a sidebar filter is shown.

### Product page layout (M)

| Theme | Gallery | Thumbnails | Info column width | Sticky info |
| --- | --- | --- | --- | --- |
| Dawn | first large, then 2-up | none | 27% | top 30px |
| Horizon | 2-col grid, **edge to edge** | none | 32% | top 0 |
| Fabric | 2-col grid, edge to edge | none | ≈35% (E) | E |
| Atelier | **1 column, full bleed, stacked** | none | 47% (content centered) | top 0 |
| Dwell | carousel of one large image | **vertical, between image and info** | 31% | top 0 |
| Tinker | large image radius 20, then 2-up, then a band | none | 31% | top 0 |
| Prestige | one centered image | **vertical, far left** | 29% | top 95px |
| Symmetry | large 2:3, then 2-up | none | 34% | top 95px |
| Impact | in a rounded white panel | vertical, left | 33% | top 114px |
| Focal | one image | **horizontal, below** | 37% | not sticky |
| Motion | 2:3 carousel | vertical, left | 35% | not sticky |
| Impulse | 2:3 slider with the next image peeking | vertical, left | 48% | not sticky |
| Warehouse | inside a white card | vertical, inside the card | 46% | top 189px (card) |
| Palo Alto | 2-col grid 4:5 | none | 35% | top 30px |
| Broadcast | stacked 3:4 | none | 47% | top 30px |

On mobile (390, M), every theme turns the gallery into a **full-bleed swipe carousel** (images 390px wide, side by side off screen) with the title at about y=550–570px.

Common info order: (badge) → (vendor) → **title** → **price** (+ rating) → divider → variant pickers → quantity → primary CTA → secondary CTA or accelerated checkout → trust or USP lines → description → accordions. Variations worth copying: the price inside the CTA (Palo Alto), feature chips with icons (Prestige), spec tiles (Tinker), a fit slider (Symmetry), a stock bar (Warehouse), a tinted info box (Impact).

### Section rhythm (M, content inset from the section edge)

| Theme | Desktop | Mobile |
| --- | --- | --- |
| Warehouse | ≈30 | ≈21 |
| Dawn | 36–44 | 27–36 |
| Horizon, Fabric, Tinker | 48 (top) / 48–80 | 34 |
| Palo Alto | 30–50 | 12–30 |
| Dwell | 48–80 | 34–56 |
| Focal | 80 | 48 |
| Atelier | ≈82 | ≈57 |
| Prestige | **80–105** | 48–73 |
| Impact | **96** | 48 |
| Broadcast | 62–100 | 57–68 |

Mobile spacing is 0.5–0.7× desktop. Premium and editorial themes sit at 80–105px, dense catalog themes at 30–40px.

### Headers (M+E)

| Pattern | Themes |
| --- | --- |
| Logo left, nav inline after it, icons right | Dawn, Horizon, Motion |
| Nav left, **logo centered**, icons right | Prestige, Symmetry, Atelier, Palo Alto, Fabric |
| **Split nav around a centered logo** | Impulse |
| Two rows with a centered logo | Dwell (nav below the logo), Broadcast (utility row above) |
| Logo left, **nav centered**, icons right | Impact, Focal, Tinker |
| **Search bar first**, second row of categories | Warehouse |
| **Transparent over the hero** | Prestige, Symmetry, Atelier, Impact, Impulse, Motion, Tinker, Fabric, Broadcast |
| Solid header | Focal and Warehouse (dark), Dawn, Horizon, Dwell and Palo Alto (white) |

Header heights: 60–66px (Horizon family), 75–94px (Maestrooo), 125px (Broadcast, two rows). Announcement bars are 33–68px. Countdowns appear in them in Prestige and Symmetry, and marquees in Impact and Broadcast.

### Motion (M, from stylesheets and classes)

| Theme | Scroll reveal | Hover on images | Main easing / duration |
| --- | --- | --- | --- |
| Dawn | slide-in 2rem + fade, 0.6s | scale 1.03 | `cubic-bezier(0,0,.3,1)`; 0.1–0.75s token scale |
| Horizon family | none by default; view transitions | scale 1.03 over 0.25s | `cubic-bezier(.4,0,.2,1)`, ease-out 0.2–0.3s |
| Prestige | text reveal, marquee | **8s slow zoom** | `cubic-bezier(.785,.135,.15,.86)` 0.45s (buttons) |
| Impact | `reveal-invisible`, marquee | **1.5s zoom** `cubic-bezier(.22,1,.36,1)` | ease-in-out 0.15–0.2s |
| Symmetry | fade-up 0.6s | secondary image | 0.1–0.35s mixed |
| Motion, Impulse | **AOS rise-up 1s `cubic-bezier(.165,.84,.44,1)`**, zoom-fade 2.5s, Ken Burns, paint-across, page transitions | secondary image | expo-like ease-out |
| Focal | progress bars, underline draw 0.6s | scale 1.03 | ease-in-out 0.2–0.25s |
| Palo Alto, Broadcast | AOS, clip-path wipes, parallax, tickers | fade-in second image 0.5s | `cubic-bezier(.19,1,.22,1)` or `(.215,.61,.355,1)` 0.3s |
| Warehouse | none | drift zoom on the product page | ease-in-out 0.2s |

Rules of thumb: UI feedback takes 0.15–0.3s. Reveals take 0.6–1s with a strong ease-out (expo or quart). Ambient image motion is slow (1.5–8s). All themes ship `prefers-reduced-motion` handling (Dawn's `motion-reduce`, Impact's `motion-reduce:hidden`).

---

## What makes these themes feel premium, not generic

1. **One committed typographic move**: tracked caps (Prestige), an ultra-light serif at 120px (Atelier), weight 200 with negative tracking (Symmetry), 216px bold with tight tracking (Impact), or uppercase with negative tracking (Motion). Dawn has no such move, so it reads as a template.
2. **A high contrast between display and body** (a ratio of 4–13) plus a small body size (12–14px). Flat scales read as utilitarian (Warehouse at 1.8).
3. **A page background that is not white** when products are cut out: `#efefef` (Prestige), `#f0f0f0` (Impact), `#f8f8f6` (Motion), `#fcfbf9` (Broadcast). Cards then have no box, or become white "islands".
4. **One radius language applied everywhere**: 0 (Prestige, Atelier, Focal, Motion), 2px (Warehouse, Fabric), 8px (Palo Alto), 6/12px with pill buttons (Impact), 10/20px with pills (Tinker), 14px (Horizon). Every control, card and image uses the same family.
5. **Generous, consistent section rhythm** (80–105px on desktop, about ×0.5 on mobile) and **airy grids** (Prestige 60×64 gaps). Or, the opposite, a deliberate zero-gap gallery (Fabric, Warehouse cells).
6. **Asymmetric compositions** on the home page: a large image with two small ones (Prestige, Dawn collage), a 1+3 blog, an image offset over a color block (Focal), an overlapping photo stack (Motion), a 2:1 then 1:2 mosaic (Tinker), a text-list index next to an image (Atelier).
7. **Signature modules** that stock sections lack: a marquee headline with inline thumbnails (Prestige), product images inside the headline (Broadcast), a giant product name behind a product (Impact), shop-the-look hotspots (Dwell, Impulse), a before/after slider (Atelier), a badge ticker on cards (Palo Alto), a wordmark footer (Atelier, Dwell).
8. **Motion with a clear character**: slow (8s zoom, 1.5s expo) for luxury and tech, snappy reveals (1s rise-up) for sport. Never default linear fades.
9. **Transparent header over a full-bleed hero** of 80–100vh, with the logo centered for luxury and editorial.
10. **Enriched product pages**: feature chips, spec tiles, fit sliders, stock bars, price in the CTA. Each one fits the archetype (spec tiles for crafted goods, stock counts for a catalog).

---

## Design archetypes: token sets for "design directions"

Each archetype below is a coherent set of tokens that can drive a theme's `settings_data`, CSS custom properties and section variants.

### 1. Quiet Minimal (Dawn, Horizon, Fabric, Impulse)

- Type: one neo-grotesk (Inter, Geist, Assistant), headings 400–700, sentence case, tracking 0. Body 14–16px, line height 1.5–1.8. Display 48–72px.
- Color: white, text black at 76–81% opacity, black buttons, no accent (or one muted tone such as Impulse's slate `#2a3743`).
- Shape: radius 0–2px, or Horizon-style 14px on controls with pill inputs.
- Layout: logo at the left, inline nav, 1200–1368px container, 4:5 cards in 4–5 columns with 16px gaps, edge-to-edge 2-column product gallery with a sticky 32% info column.
- Motion: hover scale 1.03 over 0.25s, optional fade-up of 2rem over 0.6s.

### 2. Editorial Serif (Atelier, Dwell)

- Type: display serif at weight 200–300 (Newsreader), 72–120px, line height 1.0–1.1, with italic. UI in a small sans (12px, uppercase for nav and prices). Dwell even sets body text in the serif.
- Color: white plus one earthy block color (brown `#7d5449`, sand `#e9e4e0`), or pure black and white.
- Shape: radius 0, underline-only inputs with large placeholder text.
- Layout: transparent header with a centered logo (or two rows centered), a full-bleed stacked 4:5 gallery, a centered narrow buy column, a text-list category index, a wordmark footer.
- Motion: minimal; image hover 1.03.

### 3. Maison Luxe (Prestige, Symmetry)

- Type: uppercase sans at weight 400, **tracking 0.18em** (Prestige), or ultra-light sans at weight 200 with −0.04em (Symmetry). Body 14px, line height 1.6. Eyebrows 11–12px caps.
- Color: light-grey page `#efefef` with cut-out products, or white with `#efefef` media. Near-black `#1c1c1c`. No accent.
- Shape: radius 0. Buttons 44px, 13px caps, tracking 0.18em, outline or solid pairs.
- Layout: announcement bar with a countdown, transparent sticky header with a centered logo, a 100vh hero, centered caps card text, **gaps of 60×64**, vertical thumbnails, a 29% sticky info column, feature chips.
- Motion: an 8s slow zoom, a 0.45s fill sweep on buttons `cubic-bezier(.785,.135,.15,.86)`, marquee rows.

### 4. Warm Crafted (Tinker)

- Type: condensed serif display (Instrument Serif) at 32–48px with italic accents, plus a humanist sans at 14px.
- Color: 4–5 soft tints: cream `#faf9f1`, sage `#c3cca6`, sea green `#adc4c2`, beige `#f1ede7`, a sunny announcement `#fdc656`.
- Shape: pill buttons and inputs (100px), cards at radius 10px, media at 20px.
- Layout: hero text at the bottom left, a 50/50 split with a product on cream, a 2:1 / 1:2 mosaic, 1:1 products in tinted rounded cards, spec tiles on the product page.

### 5. Bold Showcase (Impact, Focal)

- Type: heavy grotesk or techno sans at weight 700, **tracking −0.025em**, giant display (72–216px, line height 1.0). Focal uses uppercase. Body 15–16px.
- Color: Impact uses a soft-grey page `#f0f0f0` with white cards and one vivid accent (purple `#803cee`). Focal uses white plus near-black with **two saturated accents** (blue `#405de6`, acid yellow `#f3ff34`) in color blocks.
- Shape: Impact uses pill buttons of 60px, cards at radius 6px and media at 12px. Focal uses radius 0 with square caps badges.
- Layout: logo at the left, bold nav centered, a marquee headline, a giant product-name statement, category tiles, a rating inline on cards, the buy box in a rounded panel.
- Motion: a 1.5s expo image zoom `cubic-bezier(.22,1,.36,1)`, text reveals, slideshow progress bars.

### 6. Technical Sport (Motion)

- Type: one sans, **uppercase with −0.05em tracking at every size**. Body 13px. Display 40–80px.
- Color: off-white `#f8f8f6`, `#1a1a1a`, electric blue `#3e71ea` CTAs, safety orange `#fb4401` announcement, black bands.
- Shape: radius 0, 2:3 cards on `#f4f4f4`, square color chips.
- Layout: transparent header, hero text at the bottom left, countdown strips, an overlapping photo stack, tabbed rails.
- Motion: the richest set: rise-up 1s `cubic-bezier(.165,.84,.44,1)`, zoom-fade 2.5s, Ken Burns, paint-across, page transitions, an arrow that slides into buttons.

### 7. Catalog Superstore (Warehouse)

- Type: one sans (Barlow), **flat scale** 13–29px, body 16px with line height 1.87, grey body text.
- Color: light-grey page `#f3f5f6`, white cells, navy `#1e2d7d`, cyan CTA `#00badb`, green stock, saturated promo tiles.
- Shape: radius 2px, 1px cell dividers, 48px controls.
- Layout: a search-first header with a category dropdown, a second nav row, sidebar filters, white cards with vendor, SKU, stars and a stock count, a table-like product info card with a stock bar, and side-by-side CTAs.
- Motion: essentially none.

### 8. Lively DTC (Palo Alto, Broadcast)

- Type: a friendly bold sans for headings (Rubik 500, or Bricolage 700 in caps), a neutral body sans at 16px, **plus a monospace micro font** (Space Mono) or a pill caps label font (Karla), and an optional script accent.
- Color: white or warm off-white `#fcfbf9`, blush `#fff7f2` / `#fff1e8` or sand `#f5f2ec` section tints, black, one accent (gold `#ab8c52`, or sale red `#d02e2e`), a mint or black ticker.
- Shape: 8px radius (Palo Alto) or pill buttons (Broadcast), rounded images.
- Layout: announcement plus a social-proof bar, countdown bands, a marquee badge on cards, products inline in headlines, promo tiles inside product grids, pill quick-links on collections, the price inside the CTA, and a limited-offer card on the product page.
- Motion: AOS reveals, clip-path wipes, tickers, parallax, expo-out 0.3s.

### How this maps to the builder

A design direction should be **one token file plus variant choices**, not a separate theme:

- **Fonts:** heading and body families, heading weight, case, tracking, and a display scale factor (for example 1.0 for Catalog up to 4.0 for Showcase).
- **Colors:** background, surface, text, text opacity, primary and secondary CTA, accent, and 1–3 tint blocks.
- **Shape:** one radius family, used for buttons, inputs, cards, media and badges.
- **Spacing:** section inset (desktop and mobile) and grid gap.
- **Imagery:** card aspect ratio, image fit, and card box (none, tinted, white island, cell).
- **Motion profile:** none, subtle, editorial or kinetic, as durations plus easing.
- **Layout variants:** header layout, product-page gallery mode, card text alignment.

Most per-direction value comes from **2–3 signature sections**. Examples: a marquee with thumbnails for Luxe, a text-list index for Editorial, a giant statement for Showcase, spec tiles for Crafted, a countdown band for DTC.

## Sources

- Theme Store listings: https://themes.shopify.com/themes/dawn, …/horizon, …/atelier, …/dwell, …/tinker, …/fabric, …/prestige, …/impact, …/symmetry, …/broadcast, …/impulse, …/motion, …/focal, …/warehouse, …/palo-alto (demo links and preset names pulled on 2026-09-23).
- Demo stores: the URLs in the table above. Pages inspected per theme:
  - Dawn `/collections/bags`, `/products/small-naomi-gummy`
  - Horizon `/collections/front-page`, `/products/test-alex-merino-wool-open-placket-polo-324`
  - Atelier `/collections/sera-mia-1`, `/products/sera-mia-black`
  - Dwell `/collections/sale`, `/products/vintage-linen-bed-cover`
  - Tinker `/collections/objects`, `/products/gather-magsafe-phone-stand-black-walnut`
  - Fabric `/collections/womenswear-children-only`, `/products/womens-essential-sweatpant-in-black`
  - Prestige `/collections/sale`, `/products/le-nouveau-cartable-navy`
  - Impact `/collections/accessories`, `/products/mg20-galactic-white`
  - Symmetry `/collections/new-in`, `/products/swim-systems-momir-t545-ahoy-halter`
  - Broadcast `/collections/rings`, `/products/ilona-ring-in-gold`
  - Impulse `/collections/2026-new`, `/products/the-wren-coat`
  - Motion `/collections/new-in`, `/products/merino-wool-quarter-zip`
  - Focal `/collections/iphone-cases`, `/products/belt-watch`
  - Warehouse `/collections/new-arrivals`, `/products/jbl-charge-3-portable-bluetooth-speaker`
  - Palo Alto `/collections/tops`, `/products/exclesa-dress-scacchi-black-ivory`
- Measurement scripts (`measure.js`, `card.js`, `product.js`, `header.js`, `motion.js`) and the raw JSON are in the session scratchpad (`…/scratchpad/`, `…/scratchpad/pass2/`), next to the screenshots.
