# Shopify Theme Builder

An agent skill that builds your own Shopify theme by talking to your coding agent, without writing Liquid by hand.

You describe your brand (or point at your website, a screenshot or a moodboard). The agent starts from Shopify's Skeleton theme, adds prebuilt sections, and writes your colors, fonts and logo into the theme's native settings, so the Merchant (the shop's owner) can keep editing everything in Shopify's Theme Editor. A local **Studio** opens next to it: adjust the brand and compose the home, product and collection pages while `shopify theme dev` shows the real rendered theme.

There is no hosted service and no AI inside the Studio. All generation happens in your own agent, and the theme is a plain folder you own.

> This project is not affiliated with, endorsed by, or sponsored by Shopify Inc. "Shopify" is a trademark of Shopify Inc., used here only to say what the skill works with.

## Install

```sh
npx skills add itsmylife44/shopify-theme-builder
```

This installs the skill into the current project for the agents the [skills CLI](https://github.com/vercel-labs/skills) detects (Claude Code, Codex, Cursor and others). Add `-g` to install it for every project.

To update it, run `npx skills update -p` in that project (or `npx skills update -g` for a global install). The update replaces the skill's folder, so the agent reinstalls the Studio's dependencies the next time it runs.

## Prerequisites

- **Node.js 22.12** or newer, and **Git 2.28** or newer.
- **Shopify CLI 4.8.0** or newer: `npm install -g @shopify/cli@latest`.
- **A store** where you are the owner, or have a staff or collaborator account with theme permissions. No store yet? The agent can create a free development store for you. Give each theme its own store: the Shopify CLI keeps one development theme per store per machine.

The agent checks all of these first, plus the Studio's dependencies in the skill's folder (`npm ci --omit=dev`), and tells you how to fix what's missing.

## Walkthrough

1. Ask your agent: *"Build me a Shopify theme for my shop. Here's my website: https://…"*
2. The agent checks the prerequisites and asks for your store's `<shop>.myshopify.com` address, or creates a development store for you. The first time, log in to the Shopify CLI with `shopify auth login` in your own terminal.
3. It reads your brand from the reference and asks only about what's left: colors, fonts, logo, style, the shop's language, the shop name and the theme's author.
4. It creates the theme in a new folder with its own Git history, writes the brand, composes the pages and opens the Studio. A development store also needs its storefront password for the preview.
5. Open the preview link in Chrome to see the real theme on your store. Adjust colors, fonts, the logo and page sections in the Studio, or ask the agent; the Studio runs Theme Check after every change.
6. Need a section the catalog doesn't have? Ask for one; the agent writes it with the same conventions and validates it.
7. When you're done, ask to deliver: the agent uploads the theme to the store **unpublished**, or packages it as a zip, or explains the GitHub integration. It never publishes: making a theme live is the Merchant's decision.

## License

| Files | License |
| --- | --- |
| Everything not listed below | MIT, see [`LICENSE`](LICENSE) |
| [`base-theme/`](base-theme) | Shopify's Skeleton theme license, see [`base-theme/LICENSE.md`](base-theme/LICENSE.md). It allows use only for themes that work with Shopify. Source and version: [`base-theme/PROVENANCE.md`](base-theme/PROVENANCE.md). |
| `.claude/skills/<name>/`, except `theme-tooling` | Third-party development skills, each under its own license file in its folder (all MIT), pinned in [`skills-lock.json`](skills-lock.json) |

A theme you build with this skill contains Base Theme files, so those files stay under Shopify's license: the theme can be used only with Shopify. The catalog sections copied into it remain MIT.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).
