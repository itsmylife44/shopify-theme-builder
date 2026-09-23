# Themes get a Direction, chosen from three the agent writes

A Theme's design goes beyond the Brand. A **Direction** is the design decisions on top of the Brand's colors, fonts and logo:
- the type system
- shape
- spacing
- card and media treatment
- motion
- layout variants
- two or three signature sections

A Direction is stored in two ways. The first is Shopify's own mechanisms: a preset in `settings_data.json` of about 30 global style settings, with its home template in `listings/<preset>/`. The Merchant keeps editing that in the Theme Editor. The second is a written contract, `DIRECTION.md` in the Theme, which gives the reason for each choice.

The agent never picks a Direction from a list of skins. From a brief (the brand's world, the shopper's scene, three emotions, references from outside the category, what the brand rejects), it writes three Directions that differ on at least three axes. Each must pass the swap test: put another shop's name on it and it no longer works. The Creator previews the three live in the Studio and picks one. Before hand-off, a checker script and a screenshot review gate the result against the slop tells and the UX quality floor.

Why: in the 2026-09-23 dogfood, "an elegant olive-oil shop" came out as cream, a serif and a gold accent, which is a known AI tell. Our only levers were colors and fonts, which the Theme Store calls a cosmetic swap. Top themes differ by settings plus templates on shared code (measured on 15 themes). The research and the proposal are in `docs/research/2026-09-23-*.md`.

## Considered Options

- **A fixed set of style presets to pick from**: rejected. Presets converge on the category average, and the tested lookup skill returned exactly that.
- **One Direction plus tweaks**: rejected. With a single option the Creator doesn't see an alternative until the Theme is built.
- **Remembering past choices across Creators to force variety**: not now. The brief and the swap test should give variety without state outside the Theme.
