# Contributing

Issues and plans live in [GitHub Issues](https://github.com/itsmylife44/shopify-theme-builder/issues). Everything in the repo (code, `SKILL.md`, docs) is written in English, using the terms defined in [`CONTEXT.md`](CONTEXT.md) (Creator, Merchant, Theme, Brand, Section Catalog, Studio …). Decisions are recorded in [`docs/adr/`](docs/adr), and the research behind them is in [`docs/research/`](docs/research).

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report a security problem privately, as [`SECURITY.md`](SECURITY.md) explains, never in a public issue.

## Layout

| Path | What it is |
| --- | --- |
| `skills/shopify-theme-builder/` | The product skill, the only folder `npx skills add` installs: everything below, plus its own `package.json` with the Studio's runtime dependencies |
| `…/SKILL.md` | The instructions a Creator's agent follows end to end |
| `…/base-theme/` | Shopify's Skeleton theme, vendored as the Base Theme (Shopify's license, see the [README](README.md#license)) |
| `…/catalog/sections/` | The Section Catalog |
| `…/studio/` | The Studio: a Vite + React UI (`src/`), its Node file API and `theme dev` runner (`server/`), and the `studio` and `create-theme` commands (`bin/`) |
| `test/` | Vitest tests for the Studio, the `create-theme` command, the Section Catalog, the skill-gate hook and the release version |
| `scripts/check-theme.mjs` | Runs Theme Check on the Base Theme with every catalog section |
| `test/`, `scripts/`, `docs/`, `.claude/` | Development only: never installed for a Creator |

## Setup

You need Node.js 22.12 or newer. For the live preview, also the Shopify CLI 4.8.0 or newer and a store (a free development store works: `shopify store create dev --demo-data`).

```sh
npm ci                # also installs the skill's runtime dependencies, in skills/shopify-theme-builder
npm run typecheck     # TypeScript over the tests, scripts, hooks and the Studio
npm run check:theme   # Theme Check on the Base Theme plus the whole Section Catalog
npm test              # Vitest
```

CI runs these same three checks on every pull request and every push to `main`.

A dependency the Studio needs at runtime goes in `skills/shopify-theme-builder/package.json` (`npm install <pkg> --prefix skills/shopify-theme-builder`); a development tool goes in the root `package.json`. Keep the runtime list small: every Creator installs it.

To try the Studio on a Theme folder:

```sh
npm run studio -- --theme <dir> --store <shop>.myshopify.com [--store-password <password>]
```

## Development skills

The skills an agent should follow while working on this repo are committed in `.claude/skills/` and pinned in `skills-lock.json`. Only MIT or compatibly licensed third-party skills are committed, each with its license file. `theme-tooling` is the repo's own skill, under the repo's MIT license, covering Theme Check, `theme dev` and the Section Catalog conventions.

To add or update one, install it project-scoped (no `-g`) and commit the files and the lock file:

```sh
npx skills add <owner/repo> --skill <name>
```

Every skill in `.claude/skills/` must be listed in `skills-lock.json`: `npx skills add` skips listed ones, which keeps them out of a Creator's install. `npx skills add` lists the skills it installs itself; add a skill written here, like `theme-tooling`, to the lock by hand. A test checks this.

`.claude/settings.json` sets `OPT_OUT_INSTRUMENTATION=true`, which turns off the `shopify-liquid` skill's telemetry (it would otherwise send your prompts to Shopify). On an agent that doesn't read that file, create `~/.config/shopify-ai-toolkit/opt-out` instead.

### Enforcement in Claude Code

`.claude/hooks/skill-gate.mjs`, wired in `.claude/settings.json`, blocks an edit to a mapped file until the matching skill was loaded in the session. In an interactive session, hooks run only after you trust the folder. The rules live in that script; when you change them, update the table below and the one in [`CLAUDE.md`](CLAUDE.md).

### Other agents

Other agents don't run the hook: before editing a file area, read the matching `.claude/skills/<name>/SKILL.md` yourself.

| File area | Skill to load |
| --- | --- |
| `**/*.liquid` | `shopify-liquid`, `theme-tooling` |
| `skills/shopify-theme-builder/studio/src/**/*.tsx` | `vercel-react-best-practices` (ignore its `server-*` rules: the Studio is a Vite SPA) |
| `skills/shopify-theme-builder/studio/src/components/ui/**` | `shadcn` |
| `skills/shopify-theme-builder/studio/src/**/*.css` | `tailwind-design-system` |

Also available, not enforced: `vite` (Vite config and the Studio's server plugin), `vitest` (tests), `typescript-advanced-types`.

### Optional: Liquid reference skills

[`benjaminsehl/liquid-skills`](https://github.com/benjaminsehl/liquid-skills) has good Liquid reference skills, but its repo has no license, so it must never be committed here. Install it for yourself only, globally:

```sh
npx skills add benjaminsehl/liquid-skills --skill shopify-liquid-themes -g
```

## Releasing

The skill follows [Semantic Versioning](https://semver.org): a patch for fixes, a minor version for new features, a major version for changes that break an existing Theme or the way a Creator works with the skill (while it is `0.x`, breaking changes bump the minor version). Every change a Creator would notice gets a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md), in the same commit.

To release version `X.Y.Z`:

1. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a new empty `## [Unreleased]` above it, and update the compare links at the bottom.
2. Set `X.Y.Z` in both `package.json` files and their lock files (`npm version X.Y.Z --no-git-tag-version`, once at the root and once with `--prefix skills/shopify-theme-builder`) and in the `metadata.version` of `skills/shopify-theme-builder/SKILL.md`. A test checks that all of them and the changelog agree.
3. Commit (`Release vX.Y.Z`), push to `main` and wait for CI to pass.
4. Tag that commit and publish the release, with the version's changelog section as its notes:

   ```sh
   git tag -a vX.Y.Z -m vX.Y.Z
   git push origin vX.Y.Z
   awk '/^## \[X.Y.Z\]/{f=1; next} /^## \[|^\[/{f=0} f' CHANGELOG.md | gh release create vX.Y.Z --title vX.Y.Z --notes-file -
   ```

## Licensing of contributions

A contribution takes the license of the files it changes, per the [README's license table](README.md#license): MIT for the repo's own code, Shopify's license for `skills/shopify-theme-builder/base-theme/`.
