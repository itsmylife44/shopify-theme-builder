# Security policy

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub's [private vulnerability reporting](https://github.com/itsmylife44/shopify-theme-builder/security/advisories/new) (the repo's **Security** tab, then **Report a vulnerability**). Include the version (`metadata.version` in `skills/shopify-theme-builder/SKILL.md`), the steps to reproduce and what an attacker gains.

You should get a first answer within a week. Once a fix is released, the advisory is published with credit to you, unless you'd rather stay anonymous.

## Supported versions

Only the latest release gets security fixes. `npx skills update` installs it.

## Scope

The skill runs on the Creator's machine. What matters most:

- **The Studio's local server.** It listens on `127.0.0.1` only, reads and writes the files of the Theme folder it was started on, and refuses writes from any page but its own. A way for another website, another local user, or a script in the store preview to read or change files, or to reach outside the Theme folder, is in scope.
- **The `theme dev` runner and the preview proxy**, including anything that leaks the store password or the Shopify CLI session.
- **The skill's instructions** (`SKILL.md`), if following them would make an agent run something the Creator didn't ask for.

Out of scope: Shopify itself, the Shopify CLI, and the storefront a Merchant publishes (report those to [Shopify's bug bounty](https://hackerone.com/shopify)), and vulnerabilities in dependencies that the skill doesn't reach.
