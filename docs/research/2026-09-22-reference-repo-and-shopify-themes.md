# Research: reference repo (app-store-screenshots) and Shopify themes today

Date: 2026-09-22. Primary sources only; anything not confirmed in a primary source is marked **unverified**. Repo snapshots read: `ParthJadhav/app-store-screenshots@18951dd` (2026-09-05), `Shopify/horizon@main` (Horizon 4.2.0), `Shopify/dawn@main` (Dawn 16.0.0), `Shopify/skeleton-theme@main`, `Shopify/theme-tools@main` (theme-check 3.29.0), `Shopify/Shopify-AI-Toolkit@main`, `vercel-labs/skills` README (v1.7.0).

## TL;DR (decision-relevant facts)

1. **The reference repo is an agent skill that ships a whole app template.** `SKILL.md` + `template/` (a Next.js 15 editor). The agent copies the template, installs deps, seeds a JSON project file, starts `next dev`, and the human finishes the work in a browser editor. It is not a CLI and not a hosted web app. Distributed via `npx skills add` (vercel-labs/skills, 75+ agents). MIT license, ~6.9k stars in about 6 months ([repo](https://github.com/ParthJadhav/app-store-screenshots)).
2. **Horizon's license rules it out as a base for a redistributable theme.** Since v2.1.2 (2025-08-21) it bans distributing any "Derived Theme" through any channel, including your own website. The only allowed use is delivery to merchants during a services engagement, for their own store ([horizon/LICENSE.md](https://github.com/Shopify/horizon/blob/main/LICENSE.md)).
3. **Dawn and Skeleton share a "Shopify-only" license, which is not MIT.** It allows copying, modifying, distributing and selling, but only to build themes that interoperate with Shopify ([dawn/LICENSE.md](https://github.com/Shopify/dawn/blob/main/LICENSE.md), [skeleton-theme/LICENSE.md](https://github.com/Shopify/skeleton-theme/blob/main/LICENSE.md)). Skeleton's README shows an "MIT" badge, but its LICENSE text is this custom license. A repo that vendors this code cannot be plainly MIT for those files.
4. **Skeleton is the only codebase Shopify officially endorses as a starting point.** `shopify theme init` clones it by default ([theme init](https://shopify.dev/docs/api/shopify-cli/theme/theme-init)). The Theme Store rejects themes "built on or derived from Dawn or Horizon" ([requirements](https://shopify.dev/docs/storefronts/themes/store/requirements)).
5. **The minimum valid theme is tiny.** Only `layout/theme.liquid` is required for upload ([architecture](https://shopify.dev/docs/storefronts/themes/architecture)), and the layout must contain `content_for_header` and `content_for_layout` or the CLI and code editor refuse to save it ([layouts](https://shopify.dev/docs/storefronts/themes/architecture/layouts)). Hard limits: 50 MB zip, 25 sections per template, 50 blocks per section, 8 levels of block nesting, 300 block files, 256 KB per Liquid file ([limits](https://shopify.dev/docs/storefronts/themes/architecture/limits)).
6. **Getting a Theme into a shop needs no Partner account**, only the right store permissions. Three paths:
   - Merchant uploads a zip in the admin.
   - Shopify CLI `theme push`, using a staff or collaborator login, a Theme Access password, or a custom-app token with `read_themes`/`write_themes` ([CLI for themes](https://shopify.dev/docs/storefronts/themes/tools/cli)).
   - GitHub integration. This needs the default theme folder structure at the branch root and no build step ([GitHub integration](https://shopify.dev/docs/storefronts/themes/tools/github)).
7. **Programmatic upload via the Admin API is gated for App Store apps.** `themeCreate` (zip URL) and `themeFilesUpsert` (max 50 files per call) need `write_themes` plus a Shopify exemption ([themeCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeCreate), [themeFilesUpsert](https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeFilesUpsert)). The Asset-resource docs say the exemption applies to apps "distributed through the Shopify App Store" ([Asset REST](https://shopify.dev/docs/api/admin-rest/latest/resources/asset)), so custom or merchant apps are likely exempt, but that is inferred and not stated. A hosted web builder that pushes themes to arbitrary shops runs into this gate.
8. **Validation is scriptable.** Theme Check is published as MIT npm packages: `@shopify/theme-check-node` (`check(root)`, `checkAndAutofix`), `-common` and `-browser` (runs in the browser), all at 3.29.0 (2026-08-27). The CLI has `shopify theme check` with `--output json`, and there is a GitHub Action `shopify/theme-check-action@v2` ([theme-tools](https://github.com/Shopify/theme-tools/tree/main/packages)).
9. **Shopify ships its own agent tooling, which is both adjacent competition and a dependency option.** The Shopify AI Toolkit (MIT, created 2026-04-01) is a plugin for Claude Code, Codex, Cursor, VS Code and others. Its `shopify-liquid` skill makes the agent search the docs and validate every Liquid file. Its validator sends code and prompts to Shopify by default; an opt-out exists ([Shopify-AI-Toolkit](https://github.com/Shopify/Shopify-AI-Toolkit)). The Shopify admin itself can "generate up to 3 free personalized themes" with AI ([Help Center](https://help.shopify.com/en/manual/online-store/themes/adding-themes)).
10. **Tooling baseline and recent churn.**
    - Shopify CLI 4.8.0 (2026-09-09) requires Node ≥ 22.12 and Git ≥ 2.28 ([Shopify CLI](https://shopify.dev/docs/api/shopify-cli), npm `@shopify/cli` engines).
    - Recent changes: Dawn 16 removed the legacy customer account templates; checkout.liquid script tags sunset for non-Plus stores on 2026-08-26; new template types `agents.md`, `llms.txt` and `llms-full.txt` appeared ([JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates)).

---

## Part 1: ParthJadhav/app-store-screenshots

### What it is

- An **agent skill** that scaffolds a local Next.js screenshot editor. From the README: "A skill for AI coding agents that scaffolds a production-ready Next.js editor for App Store and Google Play marketing screenshots" ([README](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/README.md)).
- Metadata via `gh repo view`: MIT; 6,947 stars and 513 forks as of 2026-09-22; created 2026-03-07; last push 2026-09-05. Topics include `skills`, `skills-sh`, `claude` and `cursor`. It has a product/showcase homepage at parthjadhav.com.
- Proof point: the README links an App Store app whose screenshots were made with the skill.
- History: 29 commits. The first commit was on 2026-03-07. The skill was restructured "for npx skills compatibility" early (commit `23ee03b`). The big shift came with "Codex/cross screen canvas (#24)" (`98302f1`), which moved it from an all-in-one `page.tsx` generator to a full editor. Evidence: SKILL.md's migration section detects "a previous all-in-one generator (`html-to-image`, `toPng`, `EXPORT_SIZES` ...)" ([SKILL.md L57-62](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/skills/app-store-screenshots/SKILL.md#L57-L62)).

### Directory structure (key files)

```
README.md  CONTRIBUTING.md  LICENSE (MIT)  example.png  .github/ (issue/PR templates, FUNDING)
skills/app-store-screenshots/
  SKILL.md                 # 700 lines; the agent's instructions
  style-prompts.md         # index of named visual styles
  style-prompts/_QUALITY_BAR.md, 01-…06-*.md   # deep per-style specs (quantitative rules)
  mockup.png
  template/                # full Next.js app copied verbatim into the user's cwd
    package.json, bun.lock, next.config.mjs, tailwind.config.ts, components.json (shadcn)
    app-store-screenshots.json          # starter project state
    src/app/{layout,page}.tsx, src/app/api/project/route.ts, src/app/api/upload/route.ts
    src/components/editor/*.tsx         # screenshot-editor (728 lines), slide-canvas (1312), inspector, toolbar, sidebar, device-frames, …
    src/components/ui/*.tsx             # shadcn primitives
    src/lib/{types,constants,defaults,storage,image-cache,locale,elements,utils}.ts
    public/mockup.png, public/screenshots/{apple,android}/…/.gitkeep
```

Sources: the file tree of the clone and the [README "What Gets Scaffolded"](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/README.md) section. There is no `.claude-plugin/` manifest, so there is no plugin-marketplace distribution.

### Installation and distribution

- `npx skills add ParthJadhav/app-store-screenshots`, with `-g` for a global install and `-a claude-code` to target one agent. The README says it "works with Claude Code, Cursor, Windsurf, OpenCode, Codex, and other agents supported by `skills`". Manual install is `git clone … ~/.claude/skills/app-store-screenshots` ([README](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/README.md)).
- How `npx skills` (vercel-labs/skills v1.7.0, MIT, ~32k stars) works, per its [README](https://github.com/vercel-labs/skills/blob/main/README.md):
  - A skill is a directory containing a `SKILL.md` with YAML frontmatter. Required fields are `name` (lowercase, hyphens) and `description`. The optional `metadata.internal` hides a skill.
  - Discovery looks at the repo root, `skills/`, `skills/<category>/<name>/`, `.claude/skills/`, `.agents/skills/`, and similar paths. It also reads `.claude-plugin/marketplace.json` and `plugin.json` if present.
  - It installs to a per-agent directory, for example `.claude/skills/` for Claude Code or `.agents/skills/` for Codex, Cursor and Gemini CLI. Project scope is the default; `-g` installs globally.
  - Downloads are capped at 10 MiB and extracted content at 25 MiB (1000 files) by default. That is fine for a template directory, but it is a ceiling to keep in mind if a Theme skill bundles a Section Catalog with images.
- The skill's frontmatter is just `name` and a trigger-keyword-heavy `description` ("Triggers on app store, play store, screenshots, … html-to-image, phone mockup …") ([SKILL.md L1-4](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/skills/app-store-screenshots/SKILL.md#L1-L4)).

### What it scaffolds (stack)

- `template/package.json` pins:
  - `next` 15.0.3 and React/ReactDOM `19.0.0-rc-66855b96-20241106`. That is a React 19 **release candidate**, which is dated as of 2026-09.
  - Tailwind 3.4, shadcn/Radix and `lucide-react`.
  - `html-to-image` ^1.11 (PNG render) and `jszip` (bundle download).
  - `@dnd-kit/*` (reorder), `react-rnd` (drag and resize) and `sonner` (toasts).
  
  Source: [template/package.json](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/skills/app-store-screenshots/template/package.json).
- Export: `toPng` from `html-to-image` plus `JSZip`, in `src/components/editor/screenshot-editor.tsx` (L3-4 imports, zip at L418).
- Persistence: `/api/project` GETs and POSTs `app-store-screenshots.json` in `process.cwd()` ([route.ts](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/skills/app-store-screenshots/template/src/app/api/project/route.ts)). `/api/upload` hashes uploads with `node:crypto` into `public/screenshots/uploaded/<hash>.png`. `localStorage` mirrors state for instant paint. This means the editor is **local-dev-only by design**: it writes to the filesystem, and the git-trackable JSON is the source of truth ([template/README](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/skills/app-store-screenshots/template/README.md)).
- Requirements: Node 18+ and one of bun, pnpm, yarn or npm ([README](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/README.md)).

### User flow: from install to exported output

Line numbers refer to [SKILL.md](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/skills/app-store-screenshots/SKILL.md).

0. **Probe the working directory** for an existing or older project using `rg`/`find` probes. If one is found, ask exactly one question, whether to migrate, and then follow a scripted backup-and-migrate path that coerces the JSON with a Node script ("Do not regex-edit JSON") (L44-160).
1. **Gather input.** Required: screenshots, icon, app name, prioritized features, and style (pick a named deep-spec style or describe a custom one). Optional: stores, tablets, feature graphic, locales (L312-340).
2. **Scaffold.** Detect the package manager (bun > pnpm > yarn > npm), run `cp -R "<SKILL_DIR>/template/." "$PWD/"`, install, place assets into the fixed `public/screenshots/...` layout, optionally seed `app-store-screenshots.json`, and run `bun dev` (L343-405). The skill states explicitly: "You should NOT write `page.tsx`, device frames, or export logic by hand. They live in the template." (L42)
3. **Coach on copy.** "Iron Rules" (one idea per headline, 3-5 words per line), narrative arc and layout variation (L408-485), followed by 10 numbered visual design principles (L487-556).
4. **Localization.** Always confirm the locale list (L558+).
5. **Export** happens in the browser via "Export bundle", which produces a zip organized as `<platform>/<device>/<WxH>/<locale>/NN-<layout>.png`, with troubleshooting notes for blank exports (L575-588).
6. **Final QA gate** checklist (L590-610), then the "Common Mistakes" table (L612+).
7. **Hand-off.** Quote the real dev URL, give the two-command restart recipe, list the seeded decks and mismatched files, invite iteration, and always include a "Showcase callout" linking the author's site (L684-700).

### Why it works well as an agent skill (observations tied to source)

- **Deterministic core, generative edges.** Hard parts such as frames, export and persistence are prebuilt, known-good code the agent copies and must not rewrite (L36-42; Common Mistakes: "Edited `page.tsx` instead of using the editor → Roll back"). The agent's creative work is limited to data (the JSON) and copy. This maps directly onto this project's **Section Catalog** vs **Custom Section** split (see `CONTEXT.md`).
- **A single JSON file is the project state.** It is git-trackable and resumable, and it has a `schemaVersion` and migrations. The agent edits it with JSON tooling, never regex.
- **A human-in-the-loop visual editor** takes over after scaffolding, so the agent does not need to iterate pixel by pixel.
- **Opinionated, quantitative design guidance** (`_QUALITY_BAR.md`: "Phone must occupy 68–82% of the canvas vertical height …") plus named style specs that the agent must read before generating. This is progressive disclosure: the style files are loaded only when a style is chosen ([style-prompts.md](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/skills/app-store-screenshots/style-prompts.md)).
- **Explicit questioning protocol**, with required vs optional questions and "ask exactly one question" for migration. It also has an explicit QA gate and hand-off script.
- CONTRIBUTING frames `SKILL.md` as "how coding agents actually behave" and discourages verbosity that doesn't improve outcomes ([CONTRIBUTING.md](https://github.com/ParthJadhav/app-store-screenshots/blob/18951dd/CONTRIBUTING.md)).

---

## Part 2: Shopify themes today

### Online Store 2.0 architecture

- **Directories.** `assets`, `blocks`, `config`, `layout`, `locales`, `sections`, `snippets` and `templates` (with `templates/customers` and `templates/metaobject`). "Subdirectories, other than the ones listed, aren't supported." Only `layout/theme.liquid` is required for upload ([architecture](https://shopify.dev/docs/storefronts/themes/architecture)).
- **Layouts.** They must output `{{ content_for_header }}` in `<head>` and `{{ content_for_layout }}` in `<body>`: "If references to these objects aren't included, then you can't save or update the file using the code editor or tools like Shopify CLI." checkout.liquid is effectively gone: script tags were "sunset for non-Plus stores on August 26, 2026" ([layouts](https://shopify.dev/docs/storefronts/themes/architecture/layouts)).
- **JSON templates.**
  - Root keys are `sections` (required), `order` (required), `layout` (string or `false`) and `wrapper`.
  - Limits: "up to 25 sections, and each section can have up to 50 blocks", and "up to 1,000 JSON templates".
  - These can't be JSON: `gift_card`, `robots.txt`, and the newer `agents.md`, `llms.txt` and `llms-full.txt`.
  - Alternate templates are named `product.<suffix>.json`, and a template can't exist as both JSON and Liquid.
  - "Section files must define presets in their schema to support being added to JSON templates using the theme editor."
  
  Source: [JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates).
- **Section groups.** These are JSON files in `sections/` with `type` (`header`, `footer`, `aside` or `custom.<name>`), `name`, `sections` and `order`. They are rendered with `{% sections 'header-group' %}` and hold up to 25 sections ([section groups](https://shopify.dev/docs/storefronts/themes/architecture/section-groups)). A theme can have at most 20 section groups ([limits](https://shopify.dev/docs/storefronts/themes/architecture/limits)).
  - Note: Shopify's own JSON/section-group files begin with a `/* … auto-generated … */` comment, and Skeleton's `header-group.json` has a trailing comma ([skeleton-theme/sections/header-group.json](https://github.com/Shopify/skeleton-theme/blob/main/sections/header-group.json)). Shopify's "JSON" is lenient JSONC, so generators and parsers must tolerate that (theme-tools ships `lang-jsonc`).
- **Theme blocks (`blocks/`).**
  - They are reusable across sections, unlike blocks defined inside a single section.
  - A section opts in with `"blocks": [{"type":"@theme"},{"type":"@app"}]` and renders them with `{% content_for 'blocks' %}`. "Sections can either define blocks locally or opt-in to supporting theme blocks, but they can't support both simultaneously" ([theme blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks)).
  - Nesting goes up to 8 levels ([block schema](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/schema)).
  - **Static blocks** use `{% content_for "block", type: "…", id: "…" %}`. Merchants can't reorder, remove or duplicate them ([static blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks)).
  - An underscore prefix such as `_slide` marks private or nested-only blocks. This convention appears in examples but its semantics are **not formally specified on the page I read (unverified)**.
  - Horizon has 95 files in `blocks/` plus a `sections/_blocks.liquid` wrapper, so it is built heavily around theme blocks ([Shopify/horizon](https://github.com/Shopify/horizon/tree/main/blocks)).
- **AI-generated theme blocks.** Merchants can generate blocks in the theme editor inside sections that accept `@theme`. The platform wraps them in a `_blocks.liquid`-style wrapper section, which needs `@theme` + `@app`, presets, `{% content_for 'blocks' %}` and no `templates` attribute ([AI generated theme blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/ai-generated-theme-blocks)). This means a generated Theme gets Shopify's native AI block generation "for free" if its sections accept `@theme`.
- **App blocks.** Add `{"type":"@app"}` to the section or block schema and render with `{% content_for 'blocks' %}` or `{% render block %}`. "If your section is part of a JSON template, then you should support blocks of type `@app`." Page-level app blocks are wrapped in an `apps.liquid` section ([app blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks)).

### Config, schema and presets

- **`config/settings_schema.json`.** An array of `{name, settings[]}` categories. The first entry is `theme_info`, with `theme_name`, `theme_author`, `theme_version`, `theme_documentation_url` and exactly one of `theme_support_email` / `theme_support_url` ([settings_schema.json](https://shopify.dev/docs/storefronts/themes/architecture/config/settings-schema-json)). Max 512 KB. `theme_name` and `theme_version` drive the `theme package` zip filename.
- **`config/settings_data.json`.**
  - Contains `current`, `presets` and `platform_customizations`. It is written by the theme editor.
  - Switching preset updates only "presentational settings" (color, font_picker, range, select, …).
  - Limits: "can't exceed 1.5MB", and "A theme can't contain more than five presets".
  
  Source: [settings_data.json](https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json).
- **Section `{% schema %}`.**
  - Attributes: `name`, `tag`, `class`, `limit`, `settings`, `blocks`, `max_blocks`, `presets`, `default`, `locales`, `enabled_on` and `disabled_on`.
  - One schema tag per file, valid JSON only, not nested in Liquid, and no Liquid inside it. There is a 50-block limit.
  - `presets` are what make a section addable in the editor.
  
  Source: [section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema).
- **Theme block schema.** `name`, `settings`, `blocks`, `presets`, `tag` and `class`. With `"tag": null`, the root element must output `{{ block.shopify_attributes }}` ([block schema](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/schema)).
- **Other limits** ([limits](https://shopify.dev/docs/storefronts/themes/architecture/limits)): 1,250 blocks per template or group; 300 theme block files; 512 KB per JSON template; 256 KB per other Liquid file; 50 KB per `liquid` setting; 250 MB total code; 100,000 files; theme name ≤ 50 chars; schema `name` ≤ 25 chars.
- **Locales.** `*.json` (storefront) and `*.schema.json` (editor labels, referenced as `t:` keys in schemas). Exactly one `*.default.json` of each type. Max 3,400 translations per file and 1,000 characters per value ([locales](https://shopify.dev/docs/storefronts/themes/architecture/locales)).

### Liquid essentials for generating a theme (from Skeleton, the minimal reference)

- **Skeleton's full file list** is 49 files, mostly one per page type. It is small enough to read or vendor entirely ([Shopify/skeleton-theme](https://github.com/Shopify/skeleton-theme)).
  - `layout/theme.liquid`, `layout/password.liquid`
  - `templates/*.json` (404, article, blog, cart, collection, index, list-collections, page, password, product, search), plus `gift_card.liquid`
  - `sections/*.liquid` (one per template, plus header/footer and their `-group.json`), `blocks/group.liquid` and `blocks/text.liquid`
  - `snippets/{css-variables,image,meta-tags}.liquid`, `assets/critical.css`, `config/settings_{schema,data}.json`, `locales/en.default{,.schema}.json`
  - `.theme-check.yml` (`extends: theme-check:recommended`), a CI workflow using `shopify/theme-check-action@v2`, and `.shopifyignore`
- **Idioms visible in Skeleton:**
  - `{% doc %}` headers with `@example`
  - per-file `{% stylesheet %}` tags
  - `{{ block.shopify_attributes }}` on the block wrapper
  - `t:` translation keys in schema labels
  - `{{ 'file.svg' | asset_url }}`
  
  Source: [blocks/text.liquid](https://github.com/Shopify/skeleton-theme/blob/main/blocks/text.liquid), [sections/hello-world.liquid](https://github.com/Shopify/skeleton-theme/blob/main/sections/hello-world.liquid).
- The Theme Store's "required templates" list is a practical completeness checklist even outside the store. It adds `page.contact.json` to Skeleton's set ([requirements](https://shopify.dev/docs/storefronts/themes/store/requirements)).

### Reference themes: status and license

| | Skeleton | Dawn | Horizon |
|---|---|---|---|
| Status | v1.0.0 (2025-05-20); main pushed 2026-07-23; **default for `shopify theme init`**; "suggested foundation" in [Create a theme](https://shopify.dev/docs/storefronts/themes/getting-started/create) | v16.0.0 (2026-08-10), still maintained. v16 removed the legacy customer account templates ([release](https://github.com/Shopify/dawn/releases/tag/v16.0.0)) | 4.2.0 on main (pushed 2026-09-21); "flagship of a new generation"; uses theme blocks heavily ([README](https://github.com/Shopify/horizon/blob/main/README.md)) |
| Uses `blocks/` | yes (2 blocks) | no `blocks/` dir (sections-local blocks) | yes (95 blocks) |
| License (LICENSE.md) | Shopify custom: modify, distribute and sell, but only "to develop themes that integrate or interoperate with Shopify … and, if applicable, … via the Shopify Theme Store". **Not MIT**, despite the README badge | Same text as Skeleton ([LICENSE.md](https://github.com/Shopify/dawn/blob/main/LICENSE.md)) | Shopify custom **with a redistribution ban**: "you may not submit, list, market, sell, distribute, or otherwise make available any theme that is based on, derived from, or incorporates any portion of the Software … via the Shopify Theme Store, any other Shopify-operated channel, or any off-platform channel (including your own website or third-party marketplaces)." Exception: "deliver a Derived Theme directly to merchants as part of services engagements, solely for those merchants' own use" ([LICENSE.md](https://github.com/Shopify/horizon/blob/main/LICENSE.md)) |
| Theme Store base? | Yes, the only approved base | No ("substantively different" was the old rule; now explicitly banned) | No ("not eligible"; README says use Skeleton) |

- **Horizon license history.** The v2.0.3 LICENSE (2025-07-30) had the Dawn-style text. The ban was added in the v2.1.2 commit (2025-08-21) (`gh api repos/Shopify/horizon/commits?path=LICENSE.md`).
- **Implication.**
  - A public repo that ships Horizon-derived Sections, or generates Themes from them, would be distributing Derived Themes. That is disallowed except in the services-engagement case, and "Shopify may determine, in its sole discretion, whether a theme is a Derived Theme."
  - Skeleton- or Dawn-derived code may be redistributed for Shopify use, but the vendored files carry the Shopify license, not MIT. Whether that is compatible with an open-source license for the rest of the repo is a legal question (see open questions).

### Shopify CLI (themes)

- **Install and requirements.** `npm install -g @shopify/cli@latest` or Homebrew. Node "22.12 or higher", Git "2.28.0 or higher" ([Shopify CLI](https://shopify.dev/docs/api/shopify-cli)). The latest is 4.8.0 (2026-09-09, [releases](https://github.com/Shopify/cli/releases/tag/4.8.0)). The npm engines field is `node >=22.12.0`. Note the Node floor is higher than the reference repo's "Node 18+".
- **Theme commands** in source (`packages/theme/src/cli/commands/theme/`): check, console, delete, dev, duplicate, info, init, language-server, list, metafields, open, package, preview, profile, publish, pull, push, rename, share ([Shopify/cli](https://github.com/Shopify/cli/tree/main/packages/theme/src/cli/commands/theme)).
  - `theme init`: "Clones a Git repository … Defaults to Shopify's Skeleton theme". Flags: `--clone-url`, `--latest`, `--path` ([theme init](https://shopify.dev/docs/api/shopify-cli/theme/theme-init)).
  - `theme dev`: uploads to a hidden **development theme** and serves `http://127.0.0.1:9292` with hot reload. `--theme-editor-sync` pulls editor changes back to local files. Requires store auth (`--store`, `--password`) ([theme dev](https://shopify.dev/docs/api/shopify-cli/theme/theme-dev)). Development themes "don't count toward your theme limit, and are deleted from the store after seven days of inactivity" ([CLI for themes](https://shopify.dev/docs/storefronts/themes/tools/cli)).
  - `theme push`: flags `--unpublished`, `--development`, `--live` (plus `--allow-live` when non-interactive), `--theme`, `--nodelete`, `--only`/`--ignore`, `--json`, `--publish`, and `--strict` ("Require theme check to pass without errors before pushing") ([theme push](https://shopify.dev/docs/api/shopify-cli/theme/theme-push)).
  - `theme package`: zips only the standard folders (plus `listings/` if present) as `theme_name-theme_version.zip` from `settings_schema.json` ([theme package](https://shopify.dev/docs/api/shopify-cli/theme/theme-package)).
  - `theme check`: flags `-a/--auto-correct`, `-o/--output`, `--fail-level`, `-C/--config`, `--init`, `--list`, `--path` ([theme check](https://shopify.dev/docs/api/shopify-cli/theme/theme-check)).
- **Auth** ([CLI for themes](https://shopify.dev/docs/storefronts/themes/tools/cli)). Accepted credentials:
  - the store owner account
  - a staff account with **Themes** permission
  - a collaborator account with **Manage themes**
  - a **Theme Access password**
  - a custom app access token with `read_themes` and `write_themes`

  "To use a dev store with Shopify CLI, you need to be the store owner, or have a staff account on the store."
  - **Theme Access app.** Store owners or permitted staff create passwords that grant only `write_themes`. The link expires after 7 days or after one view. Used via `--password` or the `SHOPIFY_CLI_THEME_TOKEN` env var ([theme access](https://shopify.dev/docs/storefronts/themes/tools/theme-access)).
  - **CI.** Uses `SHOPIFY_CLI_THEME_TOKEN`, `SHOPIFY_FLAG_STORE` and `SHOPIFY_FLAG_FORCE`. The GitHub Actions example uses Node 20 ([CI/CD](https://shopify.dev/docs/storefronts/themes/tools/cli/ci-cd)). That Node version is below the CLI's stated 22.12 floor, and the docs are inconsistent on this.
- **Partner account.** Not required to push to a store you have staff or collaborator access to (per the auth list above). Dev stores are now created in the **Dev Dashboard** or with `shopify store create dev`. Dev stores are "not transferable to a merchant"; "client transfer stores" are a separate type ([dev stores](https://shopify.dev/docs/storefronts/themes/tools/development-stores), [Dev Dashboard stores](https://shopify.dev/docs/apps/build/dev-dashboard/stores)). Whether a non-Partner merchant account can create dev stores is **unverified**: the docs say access "depends on your role and permissions in your organization".

### Theme Check / theme-tools

- `Shopify/theme-tools` (MIT) is a monorepo containing:
  - `theme-check-common` (runtime-agnostic), `theme-check-node` and `theme-check-browser`
  - `theme-language-server-*`, `prettier-plugin-liquid`, `liquid-html-parser`, `lang-jsonc`, `theme-graph`, `codemirror-language-client` and the VS Code extension
  
  All theme-check packages are at 3.29.0, and npm was modified 2026-08-27 ([packages](https://github.com/Shopify/theme-tools/tree/main/packages)).
- **Programmatic use.**
  - Node: `import { check } from '@shopify/theme-check-node'; await check(root)` returns offenses. `checkAndAutofix(root)` also exists.
  - Browser: `simpleCheck(themeDesc, config, deps)` runs over an in-memory `{path: source}` map with injected dependencies ([theme-check-common README](https://github.com/Shopify/theme-tools/blob/main/packages/theme-check-common/README.md), [theme-check-node/src/index.ts L67-72](https://github.com/Shopify/theme-tools/blob/main/packages/theme-check-node/src/index.ts)).
  - Configs: `recommended.yml`, `all.yml`, `nothing.yml`, `theme-app-extension.yml`.
- **What it checks.** The docs list syntax errors, missing templates, unused variables and snippets, unknown and deprecated tags, and performance issues ([theme check](https://shopify.dev/docs/storefronts/themes/tools/theme-check)). The source check list (`theme-check-common/src/checks/index.ts`) includes:
  - `ValidSchema`, `ValidJSON`, `JSONMissingSection`, `JSONMissingBlock`, `MissingTemplate`, `RequiredLayoutThemeObject`, `UniqueSettingIds`, `ValidBlockTarget`, `ValidStaticBlockType`, `UniqueStaticBlockId`, `SchemaPresetsStaticBlocks`, `ValidLocalBlocks`, `LiquidHTMLSyntaxError`, `UnknownFilter`, `UndefinedObject`, `MatchingTranslations`, `TranslationKeyExists`
  - asset-size and performance checks (`AssetSizeCSS`, `ParserBlockingScript`, `RemoteAsset`, `ImgWidthAndHeight`)
  - `MaxFileSize`, `LiquidNestingDepth`, `ExcessiveSettingsCount`
  
  This is effectively a machine-checkable definition of "known-valid" for a Section Catalog or for agent-generated Custom Sections.
- **CI.** `shopify/theme-check-action` v2.2.0 (2025-10-17) is used by Skeleton's CI ([skeleton ci.yml](https://github.com/Shopify/skeleton-theme/blob/main/.github/workflows/ci.yml)).

### How a merchant gets a theme into their shop

1. **Zip upload.** Online Store → Draft themes → Import theme → Upload zip file ([upload theme](https://help.shopify.com/en/manual/online-store/themes/adding-themes/upload-theme)).
   - The compressed package limit is 50 MB ([limits](https://shopify.dev/docs/storefronts/themes/architecture/limits)).
   - Folders must be at the zip root in the standard structure. This is implied by `theme package` output and the architecture doc; the Help Center page does not state root placement, so that detail is **unverified**.
   - Theme library caps: Basic/Grow/Advanced "up to 20 themes", Plus "up to 100", and the Starter plan gets only Spotlight ([adding themes](https://help.shopify.com/en/manual/online-store/themes/adding-themes)). Note the plan name "Grow" is quoted from that page.
2. **Shopify CLI.** `theme push --unpublished`, then `theme publish` ([create a theme](https://shopify.dev/docs/storefronts/themes/getting-started/create)).
3. **GitHub integration.** Online Store → Themes → Add theme → Connect from GitHub ([GitHub integration](https://shopify.dev/docs/storefronts/themes/tools/github)).
   - Sync is two-way: editor changes are committed back, batched over about 10 seconds.
   - The branch must match "the default Shopify theme folder structure … a buildless theme, or a theme that has already gone through any necessary file transformations". Non-matching folders are ignored.
   - Restrictions: outside collaborators can't connect; a branch can't be reconnected after disconnecting; personal repos where you're only a collaborator aren't visible.
   - This implies that if this project keeps sources plus a build step, the connected branch must hold the built output. Whether a theme can live in a subfolder is not documented, so subfolder support is **unverified** and likely unsupported.

### Theme Store submission (brief)

From [requirements](https://shopify.dev/docs/storefronts/themes/store/requirements):

- The theme must be original. It cannot be "built on or derived from Dawn or Horizon"; Skeleton is allowed.
- Required templates: the JSON set listed above plus `gift_card.liquid`. A Custom Liquid section must be available everywhere, and `@app` blocks are required in the main-product and featured-product sections.
- Lighthouse averages of performance ≥ 60 and accessibility ≥ 90 across home, product and collection pages.
- Required features: faceted filtering, accelerated checkout buttons, product recommendations, currency and language selectors, and more.
- Demo stores are required. Theme names must be 1-2 words and under 30 characters. Multiple presets go in `listings/`.
- Merchant support replies are required within 2 business days.

A Partner account is implied but not re-verified here. Selling through the Theme Store is a heavyweight path; it is only relevant if Creators want to sell Themes they built.

### Official APIs to create or upload themes programmatically

- **GraphQL Admin (2026-07).**
  - `themeCreate(source: URL!, name, role)` takes a public zip URL or a `stagedUploadsCreate` URL. Role is `UNPUBLISHED` or `DEVELOPMENT` only, and it needs `write_themes`. "The user needs write_themes and an exemption from Shopify to modify themes" ([themeCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeCreate)).
  - `themeFilesUpsert(themeId, files[])` accepts at most 50 files per request, with bodies as TEXT, BASE64 or URL. It is asynchronous (returns `job`) and needs the same exemption ([themeFilesUpsert](https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeFilesUpsert)).
  - Also available: `themeFilesCopy`, `themeFilesDelete`, `themePublish`.
- **REST Asset resource.** It is legacy: "The REST Admin API is a legacy API as of October 1, 2024", and new public apps must use GraphQL from 2025-04-01. The exemption wording there is: "Starting with Admin API 2023-04, if an app distributed through the Shopify App Store uses the Asset resource to create, edit or delete a theme's asset, you need to request the required protected access scope" ([Asset](https://shopify.dev/docs/api/admin-rest/latest/resources/asset)).
- **Practical reading.**
  - A merchant's own custom app token, or a Theme Access password through the CLI, can write themes. The CLI docs accept "Custom App Access Token … `read_themes` and `write_themes`".
  - A multi-tenant public web app that uploads Themes to arbitrary shops would need Shopify's exemption. The eligible exemption categories listed in secondary search snippets (backup/restore, SEO, developer tooling, …) are **unverified** from a primary page.

### Adjacent official tooling (relevant to the "agent skill" shape)

- **Shopify AI Toolkit** ([repo](https://github.com/Shopify/Shopify-AI-Toolkit), [docs](https://shopify.dev/docs/apps/build/ai-toolkit)). MIT, created 2026-04-01, 565 stars.
  - It installs as a plugin: `claude plugin install shopify-ai-toolkit@claude-plugins-official`, a Codex plugin, `/add-plugin shopify` in Cursor, and VS Code agent plugins.
  - It bundles about 20 skills, including `shopify-liquid` (v1.16.0) and `shopify-use-shopify-cli`.
  - `shopify-liquid/SKILL.md` requires the agent to run `scripts/search_docs.mjs` before writing code and `scripts/validate.mjs --theme-path … --files …` afterwards, with up to 3 retries.
  - Its privacy notice says the validator reports "the validated code … and … the verbatim user prompt" to Shopify unless you opt out (`~/.config/shopify-ai-toolkit/opt-out` or `OPT_OUT_INSTRUMENTATION=true`) ([shopify-liquid/SKILL.md L364](https://github.com/Shopify/Shopify-AI-Toolkit/blob/main/skills/shopify-liquid/SKILL.md)).
  - The skill's key principle is "focus on generating snippets, blocks, and sections; users may create templates using the theme editor".
- **Shopify admin AI theme generation** ("generate up to 3 free personalized themes") and AI-generated theme blocks in the editor ([adding themes](https://help.shopify.com/en/manual/online-store/themes/adding-themes), [AI blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/ai-generated-theme-blocks)). Whether the generated themes are Horizon-based is **unverified**.

---

## Open questions / unverified

- **License compatibility.**
  - Can an MIT or Apache repo vendor Skeleton- or Dawn-derived files under their Shopify license? This needs a legal read; the files would at least have to keep the Shopify notice and field-of-use restriction.
  - Does Horizon's "services engagements" exception cover a Creator who is a freelancer running this skill for a client? It probably does not cover this project distributing Horizon-derived Sections.
- **Admin API exemption for custom apps.** Docs only say App Store apps need the exemption for Asset writes, and `themeCreate`/`themeFilesUpsert` say "the user needs … an exemption" without distinguishing app type. Needs a test with a custom-app token on a dev store.
- **Zip upload root structure** (folders at the zip root vs. a single top-level folder) and upload error behavior: not stated on the Help Center page.
- **GitHub integration subfolder support:** not documented.
- **Dev store creation without a Partner account** (merchant accounts in the Dev Dashboard): unclear from docs.
- **Underscore-prefixed (private) theme block semantics:** seen in examples, not formally specified on the pages read.
- **Theme Store write-exemption eligibility categories:** only seen in search snippets.
- **Whether admin AI-generated themes are Horizon-based.**
- **CI docs example uses Node 20 while the CLI requires ≥ 22.12:** a docs inconsistency to check in practice.
- **The reference repo pins a React 19 RC and Next 15.0.3.** If this project copies the "ship a Next.js editor template" pattern, expect to pick current versions rather than inherit those.

## Sources

Reference repo and skills tooling
- https://github.com/ParthJadhav/app-store-screenshots (README, CONTRIBUTING, LICENSE, `skills/app-store-screenshots/SKILL.md`, `style-prompts*`, `template/**`; commit 18951dd)
- https://github.com/vercel-labs/skills (README: SKILL.md format, discovery paths, supported agents, limits)

Shopify repos
- https://github.com/Shopify/skeleton-theme (LICENSE.md, README, full tree, `.theme-check.yml`, `.github/workflows/ci.yml`)
- https://github.com/Shopify/dawn (LICENSE.md, README, releases/tag/v16.0.0)
- https://github.com/Shopify/horizon (LICENSE.md and its commit history, README, `blocks/`, `sections/`, release-notes.md)
- https://github.com/Shopify/theme-tools (packages, theme-check-common README and checks index, theme-check-node src)
- https://github.com/Shopify/theme-check-action
- https://github.com/Shopify/cli (releases/tag/4.8.0; `packages/theme/src/cli/commands/theme/`)
- https://github.com/Shopify/Shopify-AI-Toolkit (README, `skills/shopify-liquid/SKILL.md`)

shopify.dev
- https://shopify.dev/docs/storefronts/themes/architecture
- https://shopify.dev/docs/storefronts/themes/architecture/limits
- https://shopify.dev/docs/storefronts/themes/architecture/layouts
- https://shopify.dev/docs/storefronts/themes/architecture/locales
- https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates
- https://shopify.dev/docs/storefronts/themes/architecture/section-groups
- https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema
- https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks
- https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/schema
- https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks
- https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks
- https://shopify.dev/docs/storefronts/themes/architecture/blocks/ai-generated-theme-blocks
- https://shopify.dev/docs/storefronts/themes/architecture/config/settings-schema-json
- https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json
- https://shopify.dev/docs/storefronts/themes/getting-started/create
- https://shopify.dev/docs/storefronts/themes/tools/cli
- https://shopify.dev/docs/storefronts/themes/tools/cli/ci-cd
- https://shopify.dev/docs/storefronts/themes/tools/theme-access
- https://shopify.dev/docs/storefronts/themes/tools/theme-check
- https://shopify.dev/docs/storefronts/themes/tools/github
- https://shopify.dev/docs/storefronts/themes/tools/development-stores
- https://shopify.dev/docs/storefronts/themes/store/requirements
- https://shopify.dev/docs/api/shopify-cli
- https://shopify.dev/docs/api/shopify-cli/theme/theme-init
- https://shopify.dev/docs/api/shopify-cli/theme/theme-dev
- https://shopify.dev/docs/api/shopify-cli/theme/theme-push
- https://shopify.dev/docs/api/shopify-cli/theme/theme-package
- https://shopify.dev/docs/api/shopify-cli/theme/theme-check
- https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeCreate
- https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeFilesUpsert
- https://shopify.dev/docs/api/admin-rest/latest/resources/asset
- https://shopify.dev/docs/apps/build/dev-dashboard/stores
- https://shopify.dev/docs/apps/build/ai-toolkit

Shopify Help Center
- https://help.shopify.com/en/manual/online-store/themes/adding-themes
- https://help.shopify.com/en/manual/online-store/themes/adding-themes/upload-theme

npm registry (via `npm view`): `@shopify/cli` (4.8.0, engines node >=22.12.0), `@shopify/theme-check-node` (3.29.0).
