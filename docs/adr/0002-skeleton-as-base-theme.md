# Skeleton is the Base Theme; the repo carries two licenses

Every Theme starts from Shopify's Skeleton theme, with our Section Catalog written on top. Skeleton is Shopify's official starting point (`shopify theme init` clones it) and is minimal, whereas Horizon's license forbids redistributing derivatives and the Theme Store rejects themes derived from Dawn or Horizon. The cost: vendored Skeleton files keep Shopify's custom license (modify and redistribute, Shopify-only use), so they live in their own folder with that LICENSE, while the rest of the repo is MIT.

## Considered Options

- **Horizon**: rejected; license (since v2.1.2) bans redistributing derived themes.
- **Dawn**: rejected; heavy, same Shopify-only license, and rejected by the Theme Store.
- **Write everything from scratch**: rejected for now; cleaner MIT-only licensing, but reimplements what Skeleton already gives.

See `docs/research/2026-09-22-reference-repo-and-shopify-themes.md`.
