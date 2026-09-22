# Local theme preview options for the Creator's editor

Date: 2026-09-22. Scope: how our own local editor (a local web app) can show a preview of the Theme while the Creator picks Brand and composes sections. General theme architecture and CLI are out of scope (another agent is covering them). This doc lists facts, options and constraints. It does not recommend a design.

Versions checked on 2026-09-22: Shopify CLI `4.8.0` (released 2026-09-09) [S1]; `liquidjs` `10.29.0` (npm, modified 2026-08-11) [S2]; `@shopify/theme-check-node` `3.29.0`, `@shopify/liquid-html-parser` `2.10.0`, `@shopify/theme-graph` `0.3.2` [S3]; Admin GraphQL `2026-07` [S4]. Repo HEADs: Shopify/cli `ae83e94` (2026-09-22), Shopify/theme-tools `8bc5e03` (2026-09-21), harttle/liquidjs `a2cdfb8` (2026-09-20), Shopify/theme-liquid-docs (2026-09-10).

## TL;DR

- **Shopify does not publish a local renderer for themes.** Every official preview path (`shopify theme dev`, `shopify theme preview`, `shopify theme share`, preview links, theme editor) renders on Shopify's servers and needs a store [S5][S6][S7][S8]. Shopify's theme-tools monorepo covers parsing, linting, the language server and formatting. None of its packages renders a theme [S3].
- **`shopify theme dev` is a local proxy, and Shopify does the rendering.** Local changes to templates, sections and locales are POSTed as `replace_templates[...]` form fields to the real storefront, together with `preview_theme_id` and a session cookie. The files are also synced to a hidden development theme. The CLI watches files with chokidar and pushes updates to the page over SSE hot reload, so if our editor writes files to disk, the running dev server picks them up [S9 code].
- **Embedding theme dev in an iframe is probably blocked, but we haven't tested it.** The CLI proxy strips `Content-Security-Policy` but not `X-Frame-Options`. Real storefronts we checked send `X-Frame-Options: DENY` plus `frame-ancestors 'none'`, although one demo store sent `frame-ancestors *`. The dev server also rejects any `Host` header except its own host:port, and only grants CORS to `127.0.0.1:<port>`, the store origin and `online-store-web.shopifyapps.com`. To embed it, our app would likely need its own reverse proxy that keeps the `Host` header and strips XFO [S9 code][S10 observed]. Shopify's docs also say the theme dev preview is "only available in Google Chrome" [S11].
- **New since 2026-03: `shopify theme preview --overrides file.json`.** It POSTs JSON overrides to `/theme_preview.json?preview_theme_id=…` and returns a shareable preview URL plus an ID you can reuse to update it. It still needs a store and a remote theme. The overrides format isn't documented. The only example we found is a test fixture: `{"templates": {"index.liquid": "..."}}` [S6][S12 code].
- **LiquidJS covers core Liquid but not Shopify's platform layer.** Of the 154 filters in Shopify's own docs data, 93 are missing from LiquidJS `10.29.0`. Among them are `image_url`, `asset_url`, `money*`, `t`, `font_face`, `font_url`, `color_*` and `stylesheet_tag`. The missing tags include `section`, `sections`, `content_for`, `schema`, `style`, `stylesheet`, `javascript`, `form` and `paginate`. JSON templates and section groups also need custom code. LiquidJS says these belong in plugins, and the listed plugins have been idle since 2022 [S13][S14][S15 computed].
- **There is precedent for local rendering: `@bosun-ai/snapify` (MIT, v0.3.0, last push 2025-12).** It renders OS 2.0 JSON and Liquid templates in memory with LiquidJS plus shims for about 40 tags and filters (`section`, `sections`, `content_for`, `schema`, `image_url`, `t`, `money`…) and uses placeholder images. It's small (3★) and built for snapshot testing, not editing [S16].
- **`mock.shop` gives free sample product data with no store or token.** It's a Storefront API GraphQL endpoint at `https://mock.shop/api` with CORS `*`, run by Shopify. It returns Storefront API shapes, not Liquid objects, so we would have to map them (for example, prices come back as decimal strings in CAD) [S17][S18 observed].
- **Dev stores are free but need an organization.** You create them in the Dev Dashboard (dev.shopify.com) or, since CLI 4.8 on 2026-09-09, with `shopify store create dev`. You need a Partner account or a merchant store with developer permissions. Limits: 250 per org, any plan including Plus, the password page can't be removed, and the store can't be transferred to a client. Using a dev store with the CLI requires being its owner or staff [S19][S20][S21][S11].

## Q1. Can a Theme be rendered fully locally without a Shopify store?

**Shopify's own tools can't do it.**
- Shopify/theme-tools (MIT, active 2026-09-21) contains: `liquid-html-parser`, `prettier-plugin-liquid`, `theme-check-{common,browser,node}`, `theme-language-server-*`, `theme-graph`, `codemirror-language-client` and `vscode-extension`. None of these renders [S3 README]. The pieces that could help an editor are the parser, `theme-check-common/src/to-schema.ts` (it extracts section and block `{% schema %}`), and theme-check for validation [S3 code].
- Shopify/theme-liquid-docs (MIT) holds machine-readable `data/filters.json` (154), `tags.json`, `objects.json` (142) and JSON Schemas for `section.json`, `theme_block.json`, `settings.json`, `theme_settings.json`, `setting.json`, `preset.json` and others. theme-check downloads these from `raw.githubusercontent.com/Shopify/theme-liquid-docs/main` [S15][S3 `packages/theme-check-docs-updater/src/themeLiquidDocsDownloader.ts`]. That's enough to build settings forms and object stubs, but it doesn't render anything.
- The Shopify CLI does depend on `liquidjs` (`packages/cli-kit/package.json`, `10.27.0`), but only for scaffolding templates (`cli-kit/src/public/node/liquid.ts` `renderLiquidTemplate`). Theme rendering never uses it [S9 code].
- Shopify/liquid (Ruby, MIT) is the core language only. It has no Shopify storefront tags or filters (LiquidJS's docs make the same point) [S13].
- Our search of npm and GitHub (2026-09-22) turned up no official "liquid preview" or "theme preview" package that renders offline. `npm search "shopify theme preview"` only returns theme-check, the language server, the parser, the CLI and `vite-plugin-shopify` [S2 search].

**LiquidJS (MIT, `10.29.0`)**
- It aims to match Ruby Liquid. Its docs say that "business-logic specific tags/filters typically defined by Shopify platform… should be maintained as plugins" [S13 `docs/source/tutorials/differences.md`].
- Built-in tags: assign, break, capture, case, comment, continue, cycle, decrement, echo, for, if, include, increment, liquid, raw, render, tablerow, unless, plus the LiquidJS-specific `layout`/`block` [S14 `src/tags/`]. Shopify's `layout` is a different thing (`{% layout 'x' %}` / `none`) from LiquidJS's Jekyll-style `layout` + `block`.
- Diffing Shopify's docs data against `new Liquid().filters` in `10.29.0` (our script, 2026-09-22) gives these gaps [S15][S2]:
  - **Missing tags:** `section`, `sections`, `content_for`, `schema` (not in the docs data but required), `style`, `stylesheet`, `javascript`, `form`, `paginate`, `doc`.
  - **Missing filters (93 of 154):** URL and asset filters (`asset_url`, `image_url`, `img_url`, `file_url`, `shopify_asset_url`, `global_asset_url`, `stylesheet_tag`, `script_tag`, `preload_tag`, `image_tag`, `placeholder_svg_tag`, `inline_asset_content`), money (`money`, `money_with_currency`, …), `t`/`translate`, fonts (`font_face`, `font_url`, `font_modify`), the color family (`color_mix`, `color_to_rgb`, `color_contrast`, `color_modify`, `hex_to_rgba`, …), media (`video_tag`, `external_video_tag`, `model_viewer_tag`, `media_tag`), metafields (`metafield_tag`, `metafield_text`), plus `handleize`, `pluralize`, `structured_data`, `payment_button`, `default_pagination`, `format_address`, `weight_with_unit`, `time_tag`, `sort_by`, `within`, and others.
- Other semantic differences: truthiness (Ruby Liquid treats only `nil` and `false` as falsy), no int/float distinction, `size` on numbers, object iteration order, and stricter filter-argument parsing [S13].
- Plugins listed by LiquidJS: `harttle/liquidjs-section-tags` (MIT, marked "WIP", last push 2022-12-22) and `harttle/liquidjs-color-filters` (MIT, last push 2022-12-22) [S14 `docs/source/tutorials/plugins.md`]. `edlaver/liquidjs-shopify-compat` (MIT, last push 2024-02) only implements the `money*` filters [S22].

**What a local renderer would have to reimplement (fidelity gaps)**
- **Composition.** JSON templates use `{layout, wrapper, sections, order}`, where each section has `{type, disabled, settings, blocks, block_order}`. The limit is 25 sections per template and 50 blocks per section [S23]. Section groups use `{type: header|footer|aside|custom.<name>, name, sections, order}` and are rendered with `{% sections 'header-group' %}` [S24]. Theme blocks use `{% content_for "blocks" %}` and `{% content_for "block", type:, id: %}` [S25]. Shopify renders all of these server side, "with no markup between the sections" [S23][S24]. The section wrapper `<div id="shopify-section-…" class="shopify-section">` isn't specified in the sources we checked, so an emulator would have to match it (unverified).
- **Settings.** `settings_schema.json` drives global settings, which Liquid reads as `settings.<id>` [S26]. `font_picker` values come from "the Shopify font library" (system fonts plus a selection of Google Fonts) and are used through filters. `image_picker` returns an image object from admin Files. `color_scheme_group` / `color_scheme` produce scheme objects [S27]. A local renderer needs stand-ins for font objects, `font_face`/`font_url` (it would have to map to Google Fonts or local files, which is unverified), image objects and scheme objects.
- **Data.** There are 142 global and resource objects (`product`, `collection`, `cart`, `shop`, `request`, `routes`, `localization`, …) [S15], and all of them need fixtures. Dev-store "generated test data" (16 snowboard products, 3 collections, customers, orders, metafields…) only exists inside a store [S28]. `mock.shop` is store-less but returns Storefront API GraphQL shapes [S17][S18].
- **Platform-only behavior.** Cart, forms (`{% form %}`), predictive search, the Section Rendering API (`?section_id=` / `?sections=`, up to 5) [S29], app blocks, checkout, and editor JS events like `shopify:section:load` and `Shopify.designMode` [S30]. None of this runs locally without emulation.

## Q2. How does `shopify theme dev` work?

- **Documented behavior.** It "uploads your local theme to a store as a development theme." It serves `http://127.0.0.1:9292` (configurable with `--host` and `--port`). `--live-reload` can be `hot-reload` (the default), `full-page` or `off`. Other flags: `--only`, `--ignore`, `--nodelete`, `--notify <file|webhook>`, `--open`, `--theme-editor-sync`, `--error-overlay`, `--allow-live`, `--store-password` (needed for password-protected storefronts). Checkout can't be previewed. Dev themes are deleted on `shopify auth logout` [S5]. They are "hidden", "don't count toward your theme limit", and are "deleted… after seven days of inactivity" [S11]. The preview is "only available in Google Chrome" [S31].
- **What the code actually does** (Shopify/cli `packages/theme/src/cli/utilities/theme-environment/`, [S9]):
  - `storefront-renderer.ts`: for each page it `fetch`es `https://<store>.myshopify.com<path>?_fd=0&pb=0&…` with `Authorization: Bearer <storefrontToken>` and session cookies. When local files have changed but aren't synced yet, it sends a POST whose body is `replace_templates[<fileKey>]=<content>` (`storefront-utils.ts`). With a Theme Access token (`shptka_…`), requests go through `https://theme-kit-access.shopifyapps.com/cli/sfr` (`cli-kit/src/private/node/constants.ts`). So Shopify does the rendering, using the local content.
  - `storefront-session.ts`: sets up the session by requesting `?preview_theme_id=<id>&_fd=0&pb=0` and keeping the `_shopify_essential` cookie. It also handles the storefront password.
  - `hot-reload/server.ts`: `getInMemoryTemplates` sends only unsynced `.liquid`/`.json`/locale files that affect the current route. SSE is served on any request with `Accept: text/event-stream`, and a script is injected into the HTML (`handleHotReloadScriptInjection`). Section-level hot reload re-renders sections through the Section Rendering API (`section_id`).
  - `theme-fs.ts`: `chokidar` (`3.6.0`) watches the theme directory. **Any process that writes files to that directory, including our editor, triggers upload and hot reload.** We read this from the code but haven't tested it with an external writer.
  - `theme-environment.ts`: CORS is allowed only for `http://<host>:<port>`, `https://<storeFqdn>` and `https://online-store-web.shopifyapps.com`, which is labeled "Required for HMR with the theme editor". `host-validation.ts` returns 400 for any `Host` header that isn't the configured host:port or a localhost alias (DNS-rebinding protection).
  - `proxy.ts` `patchProxiedResponseHeaders`: deletes `content-security-policy` and the upstream CORS headers. It **doesn't** delete `x-frame-options`.
- **Framing (tested 2026-09-22 with `curl -D -`)** [S10]: `allbirds.com` sends `x-frame-options: DENY` and `content-security-policy: …frame-ancestors 'none'…`. `horizon-theme-demo.myshopify.com` sends the same. `theme-dawn-demo.myshopify.com` sends `frame-ancestors *` and no XFO. What makes stores differ isn't documented in the sources we checked (unverified). Implications:
  - An `<iframe src="http://127.0.0.1:9292">` inside our editor, which runs on a different port and so a different origin, will probably fail wherever Shopify sends XFO DENY.
  - The workaround is a same-origin reverse proxy in our editor that strips XFO and forwards `Host: 127.0.0.1:9292`. It isn't documented and we haven't tested it.
  - `fetch()` from the editor origin gets no CORS headers.
- **Requirements.** A store; login, a Theme Access password, or a custom app token with `read_themes`/`write_themes` [S11]; and being the store owner, staff with Themes permission, or a collaborator with "Manage themes". "To use a dev store with Shopify CLI, you need to be the store owner, or have a staff account on the store" [S11][S31]. Theme Access: store owner, staff or collaborator can install it; the password only grants `write_themes`; the email link expires after 7 days or on first view [S32]. Dev stores always show a password page [S20], so `--store-password` or the interactive prompt (`storefront-password-prompt.ts`) will come up.

## Q3. Official ways to preview an unpublished theme from a local app

- **Admin preview and share links.**
  - Visitor preview links look like `https://<token>-<shop_id>.shopifypreview.com`. No login is needed and they expire after 2 days.
  - Merchant previews use the primary domain plus a token, need admin auth, and expire after 30 days.
  - A `preview_theme_id` in the URL selects the theme. A password-protected store still shows the password page [S33].
  - We didn't test whether `shopifypreview.com` can be framed (unverified).
- **`shopify theme share`** uploads the theme as a new unpublished theme with a random name and prints a shareable preview link [S7].
- **`shopify theme preview`** (added 2026-03-18, commit "Add theme preview command…", with a `--json` flag the same day) [S6][S12]:
  - Flags: `-t/--theme` (required), `--overrides <json>` (required), `--preview-id` to update in place, `--open`, `--json`.
  - Under the hood: `POST <store>/theme_preview.json?preview_theme_id=<id>[&preview_identifier=…]` returns `{url, preview_identifier}` (`utilities/theme-previews/preview.ts`).
  - The changelog says it lets you "preview overrides on a live theme" (`packages/theme/CHANGELOG.md`). The test fixture uses `{"templates":{"index.liquid":"<h1>Hello</h1>"}}` and returns a `*.shopifypreview.com` URL (`preview.test.ts`).
  - The full overrides schema (whether it can override sections, `settings_data.json` or assets) isn't documented (unverified). `theme_preview.json` is not a documented public API.
- **Admin GraphQL `2026-07`.**
  - `OnlineStoreTheme` has roles `MAIN`, `UNPUBLISHED`, `DEMO` and `DEVELOPMENT`, with the mutations `themeCreate`, `themeDuplicate`, `themePublish` and `themeUpdate` [S4].
  - `themeFilesUpsert` handles up to 50 files per call, but needs `write_themes` **plus an exemption granted by Shopify** for apps [S34].
  - None of these returns a preview URL (per the docs we checked). The practical route is a preview link or `?preview_theme_id=`.
- **Section Rendering API.** `?section_id=` returns HTML and `?sections=a,b` (up to 5) returns JSON. It works on any page path. "You can't specify section setting values" through it, and it only renders the theme selected by the session or `preview_theme_id` [S29].
- **Storefront API** (and `mock.shop`) returns commerce data only. It never renders Liquid [S17].

## Q4. Approximation approach and existing open-source projects

In this approach the editor renders Brand tokens and section mockups in React/HTML rather than real Liquid. A local web editor of this kind has precedent: ParthJadhav/app-store-screenshots is an MIT-licensed Next.js scaffold with ★6.9k, last pushed 2026-09-05 [S35]. We found no Shopify-published offline renderer or editor.

| Project | What it is | License | Activity (2026-09-22) | Relevance |
|---|---|---|---|---|
| bosun-ai/snapify (`@bosun-ai/snapify` 0.3.0) | Renders OS 2.0 JSON and Liquid templates in memory with LiquidJS plus Shopify shims (`section`, `sections`, `content_for`, `schema`, `style`, `javascript`, `form`, `paginate`, `asset_url`, `image_url`, `t`, `money*`, …), placeholder SVGs for `shopify://shop_images`, and Playwright snapshots [S16] | MIT | ★3, last push 2025-12-12 | Closest precedent for a real-Liquid local preview |
| Fasttify/fasttify | Multi-tenant SaaS "Shopify-compatible" Liquid engine (`packages/liquid-forge`, built on liquidjs ^10.25) with a theme converter. Needs AWS Amplify [S36] | Apache-2.0 (README badge). GitHub reports NOASSERTION, and the LICENSE includes Polaris-derived MIT portions | ★12, last push 2026-08-20 | Shim ideas. It's a heavy SaaS, not a library |
| contentstack/shopify-live-preview-sdk | Sets up a LiquidJS engine for Contentstack live preview [S37] | MIT | ★0, last push 2026-09-08 | Minor |
| harttle/liquidjs-section-tags | `section`/`schema`/`javascript`/`stylesheet` for LiquidJS, marked WIP [S14] | MIT | last push 2022-12 | Stale |
| edlaver/liquidjs-shopify-compat | `money*` filters only [S22] | MIT | last push 2024-02 | Stale |
| kirchner-trevor/vscode-shopify-liquid-preview | VS Code live preview of a `.liquid` file with fake JSON data [S38] | README says MIT; GitHub reports none | ★22, last push 2022-12 | Stale |
| altanddot/engine-liquid-shopify | Pattern Lab engine with "dummy Shopify tags & filters" [S39] | MIT | last push 2021-08 | Stale |
| moVictor99/shopify-theme-builder | Agent skill that generates OS 2.0 themes. Its README describes validation through CLI theme-check and no local preview [S40] | MIT | ★5, last push 2026-07-11 | Direct analog to this project (no preview) |
| nebulab/shopify_theme_builder | Ruby gem that compiles a components folder into theme files. No preview [S41] | MIT | ★3, last push 2026-03-30 | Build tooling only |
| Weaverse/weaverse | SDKs for a visual builder. It targets Hydrogen/React, not Liquid. The Studio editor is hosted [S42] | MIT (SDKs) | ★194, active 2026-09-22 | Reference UX, different stack |
| puckeditor/puck | Generic React visual editor [S43] | MIT | ★13.3k, active 2026-09-21 | Candidate editor shell for the approximation approach |
| GrapesJS/grapesjs | Generic HTML web-builder framework [S44] | BSD-3-Clause (LICENSE text; GitHub reports NOASSERTION) | ★26k, active 2026-09-21 | Candidate editor shell |
| prevwong/craft.js | React drag-and-drop page editor framework [S45] | MIT | ★8.7k, last push 2025-02-14 | Candidate editor shell |
| Shopify/slate | Old theme toolkit, archived [S46] | MIT | archived, 2021 | None |

## Q5. Dev store availability (2025–2026)

- **2025-09-03 ("Next-Gen developer platform GA").** Dev stores can now be created "with any plan," including Plus. Partner-org apps were migrated to the new Dev Dashboard [S47].
- **2026-09-09 (CLI 4.8).** Adds `shopify store create dev | delete | list | info`, along with a new **limit of 250 dev stores per organization** (client-transfer and collaborator stores don't count; existing orgs over the limit got extended limits) [S21].
  - `store create dev` flags: `--name`, `--organization-id`, `--plan` (all three required when non-interactive), `--demo-data`, `--feature-preview`, `--country`, `--json` [S48][S9 `packages/store/src/cli/commands/store/create/dev.ts`].
  - Some doc pages say `--with-demo-data`, but the CLI source uses `--demo-data` [S31][S28].
- **Who can create one.** "A Shopify Partner account or a merchant store with developer permissions" plus permission to create dev stores in the org [S20]. Via the Dev Dashboard: Stores → Create store → Dev [S19]. The Help Center says dev stores "are created using the Dev Dashboard" [S49]. Whether Partner sign-up is free isn't stated on the Help Center page we fetched (unverified there). The dev-store pages do say dev stores are free.
- **Cost and limits.** Free, on any of Basic, Grow, Advanced or Plus. Unlimited test orders and products. Up to 10 custom apps. Password page can't be removed. No real transactions (Bogus gateway or test mode only). Not transferable (use a client transfer store instead). Stores with generated test data can't be transferred. Custom domains aren't available with feature previews [S19][S20][S28].
- **CLI access.** You must be the owner or staff of the dev store [S11].

## Options for the local editor preview

| Option | Fidelity | Requirements | Complexity / constraints |
|---|---|---|---|
| A. React/HTML approximation (Brand tokens become CSS vars, hand-built section mockups) | Low to medium. Looks similar but isn't the real Liquid output, so it can drift from the generated sections | None (offline) | Low. Every catalog section needs two implementations (mockup and Liquid). Editor frameworks: Puck (MIT), GrapesJS (BSD-3), Craft.js (MIT) |
| B. Local LiquidJS render of the real Theme files + shims + fixtures (the snapify pattern) | Medium to high for markup and CSS from our own catalog. Low for platform features (cart, forms, apps, search, real media, `font_face`, Section Rendering) | None (offline). Optionally `mock.shop` for sample products (public, CORS `*`) | Medium to high. Needs shims for about 90 filters and about 10 tags, plus JSON template and section group composition, settings/schema defaults, a font-library mapping, and Liquid-shaped fixtures. Fidelity risk from semantic differences (truthiness, numbers). Can reuse `@shopify/liquid-html-parser`, `theme-check`, and the theme-liquid-docs data and schemas |
| C. Run `shopify theme dev` and embed or link it | Exact (Shopify renders it with real store data) | A store (free dev store), CLI login or a Theme Access token, owner/staff access, storefront password, Chrome. Our editor writes files to disk and the CLI's chokidar picks them up | Medium. Embedding probably needs our own reverse proxy that strips XFO and keeps `Host` (untested). Otherwise open it in a separate tab. Latency is a network round-trip. Dev theme is deleted after 7 days of inactivity |
| D. `shopify theme preview --overrides` / `theme share` / `?preview_theme_id=` link | Exact | A store and a remote theme | Low to medium. Gives a URL per change, not live hot reload. The overrides format isn't documented. Framing of `shopifypreview.com` is untested |
| E. Hybrid: A or B while editing, then C or D for final verification | Mixed | Store only for the verify step | Two paths to maintain |

## Open questions / unverified

1. Does the SFR response behind `127.0.0.1:9292` actually include `X-Frame-Options: DENY` for dev-theme renders? What decides `frame-ancestors *` vs `'none'` per store? Can `*.shopifypreview.com` be framed? Testing this needs a dev store.
2. Does a same-origin reverse proxy in front of the theme dev server keep hot reload (SSE) and session cookies working? Does it break `patchBaseUrlAttributes` or `injectCdnProxy` URL rewriting (`proxy.ts`)?
3. What is the full JSON schema of `shopify theme preview --overrides`? Can it carry `sections/*.liquid`, `templates/*.json`, `config/settings_data.json` and assets? And is `theme_preview.json` stable, or internal?
4. Does chokidar reliably detect atomic writes and rename-based saves from an external process on macOS? The CLI pins chokidar `3.6.0`.
5. What exact wrapper markup does Shopify emit for sections, section groups and `content_for` blocks? This is needed for a faithful local emulator.
6. Can `font_picker` handles be mapped offline? The Shopify font library list and `font_face` output aren't available as a public dataset in the sources we checked.
7. Is signing up for a Partner or Dev Dashboard account free in every country, and is there any KYC step? Not stated on the fetched pages.
8. snapify's shim coverage and correctness (for example `content_for "blocks"` and section groups) haven't been evaluated beyond grepping its source.

## Sources

- S1 Shopify CLI releases: https://github.com/Shopify/cli/releases (`gh release list`: 4.8.0 on 2026-09-09)
- S2 liquidjs on npm: https://www.npmjs.com/package/liquidjs
- S3 Shopify/theme-tools: https://github.com/Shopify/theme-tools (README; `packages/theme-check-common/src/to-schema.ts`; `packages/theme-check-docs-updater/src/themeLiquidDocsDownloader.ts`; LICENSE.md MIT)
- S4 OnlineStoreTheme (2026-07): https://shopify.dev/docs/api/admin-graphql/latest/objects/OnlineStoreTheme
- S5 `theme dev`: https://shopify.dev/docs/api/shopify-cli/theme/theme-dev
- S6 `theme preview`: https://shopify.dev/docs/api/shopify-cli/theme/theme-preview
- S7 `theme share`: https://shopify.dev/docs/api/shopify-cli/theme/theme-share
- S8 Theme editor integration: https://shopify.dev/docs/storefronts/themes/best-practices/editor/integrate-sections-and-blocks
- S9 Shopify/cli source (HEAD `ae83e94`, 2026-09-22), https://github.com/Shopify/cli: `packages/theme/src/cli/utilities/theme-environment/{storefront-renderer.ts,storefront-utils.ts,storefront-session.ts,html.ts,proxy.ts,theme-environment.ts,host-validation.ts,hot-reload/server.ts}`, `packages/theme/src/cli/utilities/theme-fs.ts`, `packages/theme/package.json`, `packages/cli-kit/src/public/node/liquid.ts`, `packages/cli-kit/src/private/node/constants.ts`, `packages/store/src/cli/commands/store/create/dev.ts`
- S10 Observed response headers (curl, 2026-09-22): https://www.allbirds.com/, https://theme-dawn-demo.myshopify.com/, https://horizon-theme-demo.myshopify.com/
- S11 Shopify CLI for themes: https://shopify.dev/docs/storefronts/themes/tools/cli
- S12 `theme preview` implementation: https://github.com/Shopify/cli/blob/main/packages/theme/src/cli/commands/theme/preview.ts, `.../utilities/theme-previews/preview.ts`, `preview.test.ts`, `.../services/dev-override.ts`, `packages/theme/CHANGELOG.md` (entries 962e932, f0db25b; commits 2026-03-18)
- S13 LiquidJS vs Shopify/liquid differences: https://liquidjs.com/tutorials/differences.html (repo `docs/source/tutorials/differences.md`)
- S14 LiquidJS repo: https://github.com/harttle/liquidjs (`src/tags/`, `docs/source/tutorials/plugins.md`); https://github.com/harttle/liquidjs-section-tags; https://github.com/harttle/liquidjs-color-filters
- S15 Shopify/theme-liquid-docs: https://github.com/Shopify/theme-liquid-docs (`data/filters.json`, `tags.json`, `objects.json`, `schemas/theme/*`). Filter and tag diff computed locally against liquidjs 10.29.0
- S16 snapify: https://github.com/bosun-ai/snapify (README; `src/core/templateAssembler.ts`); https://www.npmjs.com/package/@bosun-ai/snapify
- S17 mock.shop: https://mock.shop/ (redirects to https://demostore.hydrogen.mock.shop/); changelog listing https://shopify.dev/changelog/introducing-mock-shop-api-for-prototyping-storefronts (returned 404 on fetch; its description was seen only in search results)
- S18 Observed: `POST https://mock.shop/api` returned products with no auth; `access-control-allow-origin: *` (2026-09-22)
- S19 Dev stores (themes): https://shopify.dev/docs/storefronts/themes/tools/development-stores
- S20 Dev stores (apps): https://shopify.dev/docs/apps/build/stores/development-stores and https://shopify.dev/docs/apps/build/dev-dashboard/development-stores
- S21 Changelog 2026-09-09: https://shopify.dev/changelog/create-and-delete-dev-stores-in-shopify-cli
- S22 https://github.com/edlaver/liquidjs-shopify-compat
- S23 JSON templates: https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates
- S24 Section groups: https://shopify.dev/docs/storefronts/themes/architecture/section-groups
- S25 `content_for`: https://shopify.dev/docs/api/liquid/tags/content_for
- S26 Settings: https://shopify.dev/docs/storefronts/themes/architecture/settings
- S27 Input settings: https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings
- S28 Generated test data: https://shopify.dev/docs/api/development-stores/generated-test-data
- S29 Section Rendering API: https://shopify.dev/docs/api/section-rendering
- S30 = S8
- S31 Create a theme (getting started): https://shopify.dev/docs/storefronts/themes/getting-started/create
- S32 Theme Access: https://shopify.dev/docs/storefronts/themes/tools/theme-access
- S33 Preview themes (Help Center): https://help.shopify.com/en/manual/online-store/themes/adding-themes/preview-themes
- S34 `themeFilesUpsert`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeFilesUpsert
- S35 https://github.com/ParthJadhav/app-store-screenshots
- S36 https://github.com/Fasttify/fasttify (README, LICENSE, package.json)
- S37 https://github.com/contentstack/shopify-live-preview-sdk
- S38 https://github.com/kirchner-trevor/vscode-shopify-liquid-preview
- S39 https://github.com/altanddot/engine-liquid-shopify
- S40 https://github.com/moVictor99/shopify-theme-builder
- S41 https://github.com/nebulab/shopify_theme_builder
- S42 https://github.com/Weaverse/weaverse
- S43 https://github.com/puckeditor/puck
- S44 https://github.com/GrapesJS/grapesjs (LICENSE)
- S45 https://github.com/prevwong/craft.js
- S46 https://github.com/Shopify/slate
- S47 Changelog 2025-09-03: https://shopify.dev/changelog/next-gen-dev-platform-ga
- S48 `store create dev`: https://shopify.dev/docs/api/shopify-cli/store/store-create-dev
- S49 Partner program getting started: https://help.shopify.com/en/partners/partner-program/getting-started
