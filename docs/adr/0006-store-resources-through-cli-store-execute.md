# The Studio lists the store's collections, products and menus through `shopify store execute`

The Studio's inspector picks a section's `collection`, `product`, `collection_list`, `product_list` and `link_list` settings from the store, so it needs the store's collections, products and menus. It runs `shopify store execute --store <shop> --query … --json`, an Admin API query with the auth the Shopify CLI stored after `shopify store auth --store <shop> --scopes read_products,read_online_store_navigation` (`studio/server/studio.mjs`, `GET /api/store`). The Studio never holds a token, and without `--allow-mutations` the CLI refuses anything but a query. One query reads the first 250 of each, and the answer is kept for a minute. This was checked against Shopify CLI 4.8.0's `store execute`, which prints the query's data as JSON with `--json`.

The costs:
- The Creator runs `shopify store auth` once per store, a second login next to the one `theme dev` asks for. Until then `GET /api/store` answers 409 with that command, and the inspector takes handles typed by hand. The agent can always `PATCH` a handle without the list.
- A shop with more than 250 collections or products shows only the first 250, sorted by title.

## Considered Options

- **The storefront's JSON through `theme dev`** (`/collections.json`, `/products.json`, as `pagePaths` does): rejected. No login is needed, but menus have no such endpoint, so `link_list` settings would still need another path.
- **Storefront API**: rejected. The Creator would create a Storefront access token (a headless channel or an app) and hand it to the Studio, and the Storefront API has no list of menus either.
- **The token `theme dev` uses**: rejected. The CLI stores it in its own private config, and it has theme scopes only.
