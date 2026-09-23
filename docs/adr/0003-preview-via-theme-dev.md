# The Studio does not render the Theme; preview is `shopify theme dev`

The Studio is a control panel (Brand, section composition, Theme Check errors) that writes the Theme's files; the preview is `shopify theme dev` open in a separate Chrome window, rendered by Shopify. There is no official local Shopify renderer, and LiquidJS lacks most Shopify filters and tags, so local rendering would be a large fidelity-limited subsystem that breaks on Custom Sections. The cost: the Creator needs access to a store (dev store or the real one) from the first minute.

## Considered Options

- **React mockups of each section**: rejected; every section written twice, and Custom Sections would have no preview.
- **Local LiquidJS rendering with Shopify stand-ins + mock.shop data**: rejected for the MVP; much code to maintain, still not faithful. Revisit only if "try without a store" matters.
- **Embedding theme dev in an iframe**: deferred; stores commonly send `X-Frame-Options: DENY`, would need a proxy. Prototype first if wanted. Done in ADR-0005, which replaces the separate window.

See `docs/research/2026-09-22-local-theme-preview.md`.
