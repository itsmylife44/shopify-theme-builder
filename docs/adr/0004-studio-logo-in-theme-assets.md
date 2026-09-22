# The Studio's logo lives in the Theme's assets, behind a Theme Editor override

The Brand lives in native theme settings, but a logo picked with Shopify's `image_picker` must already be in the shop's Files, and only the Admin API can add it there. The Studio has no API key or account (PRD story 45), so it stores the logo the Creator uploads as `assets/logo.<ext>` in the Theme and names it in a `logo_asset` text setting. The header shows the Theme Editor's logo (`settings.logo`) when set, else that asset, else the shop name. The Merchant can still replace the logo from the Theme Editor after delivery; the cost is one extra text setting visible there, and an `<img>` without width and height (the header fixes its height, so it can't shift the page).

## Considered Options

- **Type the file name of an image already in the shop's Files**: what #5 shipped; rejected because it sends the Creator to the Shopify admin for a basic step.
- **Upload through the Admin API**: rejected; needs an app, a token and an account, which the Studio avoids.
- **Asset without a setting**: rejected; Liquid can't tell whether an asset exists, so the header needs the setting to know.
