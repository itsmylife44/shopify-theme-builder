# The Studio embeds the `theme dev` preview through a proxy

The Studio shows the preview in an iframe between the section list and the selected section's settings, like Shopify's Theme Editor. This replaces ADR-0003's separate Chrome window; ADR-0003's main decision stands, and Shopify still renders the Theme through `shopify theme dev`. theme dev answers `x-frame-options: DENY`, so the Studio runs a proxy on its own port of 127.0.0.1 (`studio/server/frame.mjs`). The proxy drops that header and the CSP's `frame-ancestors`, turns redirects to theme dev's address into relative ones, and adds a script to each HTML page. The script reports the section the Creator clicks and outlines the one the Studio selects. The theme's relative links and theme dev's hot reload go through the proxy unchanged. This was checked with Shopify CLI 4.8.0 on a development store, prototype on branch `prototype/studio-editor`.

The costs:
- A click in the preview selects a section instead of following a link, so the Creator switches pages with the Studio's page tabs. The preview's own link opens the page in a tab where it navigates normally.
- The store's scripts run on the proxy's origin, next to the Studio. So the Studio's API refuses writes whose `Origin` isn't the Studio's own, and Vite's CORS is off.

## Considered Options

- **Separate Chrome window** (ADR-0003): replaced. The Creator switched windows for every change and couldn't point at a section.
- **Proxy under the Studio's own origin** (a path like `/preview/`): rejected. theme dev's pages and hot reload use root-relative paths, which would hit the Studio instead.
