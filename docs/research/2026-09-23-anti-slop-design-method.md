# Research: an anti-slop design method for the Theme

Date: 2026-09-23. Goal: find out what makes agent-built web design read as "AI slop", what designers and existing agent skills do against it, and what a design step in this skill should adopt so every Theme gets a distinctive, crafted Brand.

Sources: web articles from 2025-2026 (URLs inline), the public repos `anthropics/skills` (frontend-design, 4 commits, latest 41bbe19 on 2026-09-03), `pbakaus/impeccable` (v4.3.1), `Leonxlnx/taste-skill`, `vercel-labs/web-interface-guidelines`, `google-labs-code/design.md`, and the local skills listed in Part 3. Claims marked **(observation)** are this author's inference, not a source's.

## TL;DR

1. **Slop is the statistical center of the training data, not a style.** Anthropic calls it "distributional convergence": safe choices dominate web data, so an unguided model samples the middle ([Anthropic, 2025-11-12](https://claude.com/blog/improving-frontend-design-through-skills)). One traced cause: Tailwind's `bg-indigo-500` default, copied into thousands of tutorials, became "modern = purple" ([prg.sh, 2025-10-26](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)).
2. **Banning the first-order tells creates second-order tells.** Anthropic's 2025 skill pushed "bold" choices, grain overlays and distinctive serifs. By 2026 its own skill lists the results as new tells: cream `#F4F1EA` with a serif display and a terracotta accent, near-black with one acid accent, broadsheet hairlines, eyebrow labels, middle-dot meta strings. taste-skill bans the warm beige + brass + espresso palette for "premium consumer" briefs, which is exactly the Shopify DTC space. A fixed ban list only moves the center. The method has to make the agent **derive** choices from the brand's world and **check them against the category default**.
3. **For a Shopify theme, colors and fonts alone cannot make a design distinctive.** Shopify's Theme Store rules say it outright: "spacing tweaks, color or typography swaps, gradients, shape dividers, background effects or blurs, animation or transition tweaks" are "insufficient". A theme needs "clear systems for header and navigation, product cards, media treatments, and page structure" ([Theme Store requirements](https://shopify.dev/docs/storefronts/themes/store/requirements)). Today the Brand is color schemes, two fonts and a logo, and the hero has no layout options. That is the swap Shopify calls cosmetic.
4. **The existing skills share one method.** (a) Ground the design in the subject's world. (b) Write a short direction plan before building: named colors, typefaces with roles, a layout concept, one signature element. (c) Review the plan against "what would I produce for any similar brief?" (d) Build to a quality floor. (e) Review screenshots against the plan with a hard pass/hold gate. (f) Record the direction in a durable file with named rules and do/don'ts.
5. **Adopt:** a Design Direction step between Brand capture and composing pages, a written Direction contract, a Shopify-specific tell list (fonts mapped to Shopify font handles), a screenshot review gate, and more design levers in the Brand and Section Catalog than colors and fonts.

---

## Part 1: The tells

Grouped by area. Each tell names the sources that list it.

### Color

| Tell | Sources |
|---|---|
| Purple/indigo-to-blue gradient in the hero, on buttons and accents; "VibeCode purple" lavender | [925studios](https://www.925studios.co/blog/ai-slop-web-design-guide), [Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui), [Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it), [Mania](https://www.mania.design/blog/spot-the-slop-a-ui-designers-guide-to-fixing-ai-defaults/), Anthropic skill 2025 |
| Several competing neon colors at full saturation, no hierarchy; one hue shade-stacked (cyan icon in a sky-blue box in a blue card) | Fountain Institute; [isthatvibecoded summary via search](https://isthatvibecoded.com/) |
| Permanent dark mode with decorative glows, radial gradients, glowing text; near-black `#0D1117` + neon | Fountain Institute, Developers Digest, `swiftui-design-skill/references/anti-ai-slop.md` rule 6 |
| Cream/paper ground + high-contrast serif + terracotta/clay accent (near `#D97757`) | [anthropics/skills frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) (2026), impeccable `new-work.md` |
| "Premium consumer" palette: beige/bone backgrounds (`#f5f1ea`, `#efeae0`…), brass/clay/oxblood/ochre accents, espresso near-black text | [taste-skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md) §4.2 |
| Gray text on colored backgrounds; low-contrast body text on dark | impeccable, Developers Digest |
| Pure `#000` or a stand-in tinted near-black `#0B0B0B`/`#111` used by reflex | taste-skill §9.A, Anthropic 2026 (both directions are named as defaults) |
| Light or dark picked by category rather than by the use scene | impeccable `craft-floor.md` |

### Typography

| Tell | Sources |
|---|---|
| Inter (or Roboto, Open Sans, Lato, system) everywhere, in every weight | [Anthropic blog](https://claude.com/blog/improving-frontend-design-through-skills), 925studios, Mania, Developers Digest |
| The "escape" fonts that became the new defaults: Space Grotesk, Instrument Serif, Geist, Fraunces, Playfair Display, Cormorant, Lora, Crimson, Newsreader, Syne, Space Mono, IBM Plex, DM Sans/DM Serif, Outfit, Plus Jakarta Sans, Instrument Sans | Developers Digest; taste-skill §4.1 (Fraunces, Instrument Serif); impeccable `new-work.md` §4 (the full list: "these training-data defaults mean you stopped looking") |
| A single word in the headline accented in italic serif, bold or a second color | Anthropic 2026, Developers Digest |
| Tracked-out ALL-CAPS eyebrow label above every heading; monospace for small labels as a "technical" costume | Anthropic 2026, impeccable (eyebrows are "a ban, not a default"), taste-skill §4.7 (at most 1 eyebrow per 3 sections) |
| Timid hierarchy: 400 vs 600 weights, 1.5x size steps | Anthropic blog ("100/200 weight vs 800/900… size jumps of 3x+") |
| Meta strings joined with middle dots (`A · B · C`), `WORD — fragment` labels, `→` appended to every link, em dashes in copy | Anthropic 2026, taste-skill §9.F-G |
| "Creative brief = serif" reflex | taste-skill §4.1 ("the single most-tested AI tell") |

### Layout and structure

| Tell | Sources |
|---|---|
| Centered hero over a gradient: headline, subline, one button | Developers Digest, taste-skill §4.3, swiftui rule 4 |
| Three (or four) identical feature cards with an icon on top, a heading and two lines of text | all web sources; taste-skill §9.C; swiftui rule 7 |
| Hero-metric template: big number, small label, supporting stats, gradient accent; stat banner rows | Anthropic 2026, impeccable, Developers Digest |
| Numbered 01 / 02 / 03 markers on content that is not a sequence | Anthropic 2026, impeccable, taste-skill |
| Formula page order: hero → features → testimonials → CTA | [Hallmark](https://dev.to/rams901/hallmark-stop-ai-generated-ui-slop-in-one-command-in-2026-3p9n) |
| Everything symmetric, same padding, same radius, same card height ("uniform everything") | 925studios ("same 16px border radius and 24px padding"), Mania |
| The same layout family repeated down the page; zig-zag image/text three times in a row | taste-skill §4.7 |
| Everything visible at once, no progressive disclosure | Mania |

### Surfaces and decoration

| Tell | Sources |
|---|---|
| SaaS-card kit: identical rounded cards, one radius for everything, the same soft `rgba(0,0,0,.1)` shadow | Anthropic 2026 |
| Cards nested in cards | Fountain Institute, impeccable |
| Colored `border-left`/top accent bars on cards, cycling colors | Fountain Institute, Developers Digest, impeccable, swiftui rule 3 |
| Glassmorphism and backdrop blur as decoration | isthatvibecoded, impeccable |
| Gradient text in headlines | impeccable, taste-skill |
| Grain/noise overlays, `feTurbulence`, stripes and grid overlays with no canvas under them | impeccable `craft-floor.md` (note: the 2025 Anthropic skill *recommended* grain and custom cursors) |
| Decorative status dots everywhere | Fountain Institute, taste-skill |

### Imagery and icons

| Tell | Sources |
|---|---|
| Emoji as icons, bullets or nav items (sparkles, rockets) | Fountain Institute, isthatvibecoded, swiftui rule 2, ui-ux-pro-max |
| Stock "diverse team at a laptop", abstract 3D blobs, AI-drawn SVG illustrations (unDraw/Humaaans look) | 925studios, swiftui rule 8, impeccable ("real illustration or none") |
| Div-built fake product screenshots | taste-skill §9.E |
| Rounded icon tile above every heading | impeccable |

### Copy

| Tell | Sources |
|---|---|
| Vague headlines: "Build the future of work", "Your all-in-one platform", "Scale without limits" | 925studios, Mania |
| Filler verbs: elevate, seamless, unleash, next-gen, revolutionize; "Welcome to [brand]" | taste-skill §9.D, landing-page-design |
| Fake names and numbers: John Doe, Acme, `99.99%` | taste-skill §9.D |
| Poetic performative labels: "Field notes", "Quietly trusted by", "On our desks" | taste-skill §9.F |
| Duplicate CTA intent: "Shop now", "Discover", "Explore the collection" on one page | taste-skill §4.5 (one label per intent) |

### Motion

| Tell | Sources |
|---|---|
| The same fade-and-slide-up on every section, hover lift on every card | Anthropic 2026, impeccable |
| Or no states at all: hover does nothing, buttons snap | 925studios, Mania |
| Bounce on hover, infinite micro-loops | isthatvibecoded summary, taste-skill §0.D |

### Craft and state tells

Only the happy path ships: no empty, loading or error states ([Mania](https://www.mania.design/blog/spot-the-slop-a-ui-designers-guide-to-fixing-ai-defaults/)). Browser defaults stay unstyled: selection color, caret, focus ring, underline offset, numerals ("the cheapest signal that a page was built rather than assembled", impeccable `craft-floor.md`). Straight quotes and `...` instead of `“ ”` and `…`, no `text-wrap: balance` on headings, no `tabular-nums` in price columns ([Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)). Layouts that break at sizes nobody prompted for, missing alt text, unlabelled buttons (search summary of [isthatvibecoded](https://isthatvibecoded.com/), [Sinton](https://www.sinton.agency/blog/how-to-spot-a-vibe-coded-website)).

### E-commerce and Shopify specifics

- **Template monoculture.** Dawn is installed by default, which gives "941,678 live websites" the same layout architecture (search summary of [appwrk](https://appwrk.com/insights/why-does-my-shopify-store-look-like-every-other-store)). "over 34% of Shopify stores run on three themes". Default section order stays "hero, featured collection, text block, another collection". Themes are "designed around compromise" because they must serve every category. "Generic trust signals" means default badges instead of brand-specific claims ([Insiteful](https://www.insiteful.com.au/why-shopify-themes-look-the-same-stand-out/)).
- **DTC "blanding".** Sans-serif logo, product floating on white with a soft shadow, pastel accent, bright minimal backgrounds, "hands and blown-out lighting" in photos ([Marketing Dive, 2020](https://www.marketingdive.com/news/is-the-dtc-brand-aesthetic-bad-for-business/589113/); [Shutterstock search summary](https://www.shutterstock.com/blog/minimalism-direct-to-consumer-brands)). Marketing Dive also records the counter-argument: familiar patterns set expectations and deviating costs attention. So conventions for **navigation, cart and product buying** stay. The Brand expression is where you deviate.
- **(observation)** The Shopify version of "three feature cards" is the multicolumn row "Free shipping / Easy returns / Secure checkout" with a line icon each. The Shopify version of the centered gradient hero is a full-bleed lifestyle image with a centered "New collection" heading and a "Shop now" button. Next come a 4-up featured collection grid, a testimonial carousel with five stars, and a newsletter "Join the club, get 10% off". Every item is legitimate. The tell is getting all of them, in that order, whatever the brand.

---

## Part 2: The counter-rules

Distilled from all sources. Every one is a rule an agent can check.

**Grounding**
1. Name the subject, the audience and the page's job first. "The subject's industry, subject matter, materials, and vernacular are where distinctive visual choices come from" (Anthropic 2026).
2. Derive the look from the brand's cultural world, not from its category. List concrete artifacts, places and rituals the audience knows, spread across at least three material families. Rule out both "the page this category always ships" and its "predictable opposite" (impeccable `new-work.md` §3).
3. The brief wins. A look the Creator pinned is followed exactly, even when it is on the tell list (Anthropic, impeccable, taste-skill all say this).

**Color**
4. Pick a color *strategy* before colors: Restrained (neutrals + one accent), Committed (one saturated color on 30-60% of the surface), Full palette (3-4 named roles), Drenched (the surface is the color). Commit at page scale: color owns whole regions, not scattered accents (impeccable §4).
5. One dominant color, one accent, one neutral, and give each color a job. Name colors by role, not "gradient-start" (Fountain Institute, Mania, 925studios).
6. Choose light or dark from a one-sentence physical scene (who, where, under what light), never from the category (impeccable).
7. One accent, locked for the whole page (taste-skill "color consistency lock").

**Type**
8. Pick the typeface first ("Change the font before you change anything else", Mania). Choose it like an object from the subject's world, and justify any face on the default list with a reason no other face satisfies. "A subject association is never that reason": books do not earn a serif, tech does not earn a mono (impeccable).
9. Use one family or two, and when two, make them clearly different. Build a real scale with jumps of 3x or more and extreme weight contrasts (Anthropic 2026 and blog).
10. Emphasis comes from weight or size, never gradient text, and not a single accented word (impeccable, Anthropic).
11. Body measure 65-75ch (under 80), balanced headings, curly quotes, real ellipsis, tabular numbers for prices (impeccable, Anthropic, Vercel).

**Layout**
12. Spend boldness in one place: "Let one element be the memorable thing, keep everything around it quiet" (Anthropic). The swiftui skill phrases it as "one signature detail at 120% effort per screen".
13. Structure is information. Borders, numbers, eyebrows and dividers must encode something true about the content (Anthropic).
14. Cards only for independently actionable items. Group with space, proximity and type. Never nest cards (Fountain Institute, impeccable, taste-skill).
15. Vary layout families down a page and cap zig-zag repeats (taste-skill). Section order follows the brand story, not the default order (Insiteful).
16. One radius system, one elevation system. Declare depth once, border *or* shadow (taste-skill "shape consistency lock", impeccable).

**Imagery, icons, copy, motion**
17. Real imagery or an honest placeholder, never AI clip-art. One icon family, one stroke weight, no emoji (all sources).
18. Write in the brand's own voice: "Would our CEO actually say this?" (925studios). Name controls by their action and keep one label per intent (Anthropic, taste-skill).
19. One orchestrated motion moment rather than scattered entrances. Motion that answers a user action is welcome. Respect reduced motion (Anthropic, impeccable).

**Craft floor**
20. Contrast 4.5:1 for body text, visible focus, states (hover, disabled, empty, error, loading), responsive down to 375px, browser surfaces themed (selection, focus ring). Check these on the rendered result, not as intentions (impeccable `craft-floor.md`, Vercel guidelines).

---

## Part 3: How existing skills do it

### 3.1 Anthropic `frontend-design`

Files: [anthropics/skills `skills/frontend-design/SKILL.md`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md). It is identical to the local copy at `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` and to the `anthropics/claude-code` plugin.

**How it evolved (the key lesson).** The 2025 version (commit 0075614) was about 400 words of *encouragement*: "commit to a BOLD aesthetic direction", "pick an extreme", avoid "Inter, Roboto, Arial", "purple gradients on white", "NEVER converge on common choices (Space Grotesk)", and use "gradient meshes, noise textures… custom cursors, and grain overlays". The 2026 rewrite (41bbe19, 2026-09-03) replaced exhortation with **calibration**. It names five clusters that AI design *now* lands in. Several were the old skill's own advice: cream + serif + terracotta, near-black + acid accent, broadsheet hairlines, the SaaS-card kit, and template chrome (eyebrows, middle dots, em-dash labels, mono labels, `→`). It also adds a process:

- **Ground** in subject, audience and primary job. Propose them when the brief is missing them.
- **Plan in two passes.** First "a compact token system": color as "4-6 named hex values", type with roles, a layout concept as "one-sentence prose descriptions and ASCII wireframes", alignment, principles.
- **Review the plan against the brief.** "if any part of it reads like the generic default you would produce for any similar page (work through a similar prompt to see if you arrive somewhere similar)… revise that part, say what you changed and why."
- **Restraint.** "Spend your boldness in one place." Chanel's rule: remove one accessory.
- **Self-critique with screenshots**, and keep notes of what you tried so later passes do something new.
- A copywriting section: user vocabulary, active voice, errors that say how to recover.

### 3.2 Impeccable (Paul Bakaus)

Repo [pbakaus/impeccable](https://github.com/pbakaus/impeccable), v4.3.1. It extends Anthropic's skill with 23 commands and a deterministic detector ([abduzeedo](https://abduzeedo.com/impeccable-open-source-ai-design-skill-better-ui), [paddo.dev](https://paddo.dev/blog/impeccable-design-vocabulary/)). Files read: `SKILL.md`, `reference/new-work.md`, `shape.md`, `craft-floor.md`, `critique.md`, `document.md`, `init.md`.

- **Context files.** `PRODUCT.md` holds product truth: users, purpose, positioning, brand commitments, evidence on hand. `DESIGN.md` holds durable visual decisions in the [Google Labs DESIGN.md format](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md): YAML tokens followed by eight fixed sections, Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts. The Overview opens with a **"Creative North Star"**, a named metaphor. Each section may carry **Named Rules**, like "The One Voice Rule. The primary accent is used on ≤10% of any given screen. Its rarity is the point." DESIGN.md is written *after* the build, from what was built, so the rulebook describes reality instead of being defended against it.
- **Modes.** Persuade, Operate, Read or Experience, picked per surface. A shop's home page is Persuade. Product and cart are closer to Operate.
- **Direction derivation** (`new-work.md` §3). Write the product's unique mechanism, the audience's scene and its cultural home. Name "the page this category always ships and its predictable opposite" and keep both off the list. List **seven concrete visual systems, artifacts, places or rituals** from the audience's world across three or more material families. Turn them into full directions.
- **Randomness against the rut.** `impeccable concept-seed` rolls dice to pick the direction to build and deals "challenger" directions, because otherwise "every run converg[es] on the category default". Each challenger either wins, stays as an alternate, or "donates" a discipline to raise the chosen direction. The user always has a quiet "category standard" exit, executed at full craft if taken.
- **Direction contract** (§5), about 150 words in six blocks: THESIS (the idea plus the category default it refuses), OWN-WORLD (palette and component language "recognizable with all content removed"), STORY, FIRST VIEWPORT (exact composition and where the primary action sits), FORM, FINISH. "If a block reads like a mood, the direction is not decided yet."
- **Color strategy and font discipline** as in Part 2, rules 4, 6 and 8.
- **Craft floor** (`craft-floor.md`), loaded just before any UI edit, in two halves. *Verify*: contrast, depth, spacing, type, motion, states, browser surfaces, copy, coverage. *Refuse*: the defaults list. Verification runs in "bounded passes, not a loop": one batched desktop+mobile inspection, one fix batch, at most one confirming round.
- **Critique** (`critique.md`). Two *isolated* sub-agents: an LLM design review that must judge "design specificity" (could an unrelated product use this unchanged?) before it sees detector output, and a deterministic detector with browser evidence. Nielsen heuristics are scored out of 40, issues are rated P0-P3, and persona walkthroughs follow. A single-context run must print a DEGRADED banner.
- **Vocabulary.** Bakaus's point is that adjectives like "bolder" and "quieter" become defined operations, and he rejects one-shot design: "There is no auto, and there will be no auto" ([Latent Space, 2026-07-02](https://www.latent.space/p/skill-engineering-design)).

### 3.3 taste-skill (Leonxlnx)

[`skills/taste-skill/SKILL.md`](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md), about 87 KB, plus a `brandkit` skill.

- **Design Read first.** One line before any code: "Reading this as: <page kind> for <audience>, with a <vibe> language, leaning toward <design system or aesthetic family>." Ask exactly one question only when the reading truly diverges.
- **Three dials.** DESIGN_VARIANCE, MOTION_INTENSITY and VISUAL_DENSITY, each 1-10, inferred from the brief with presets. "Premium consumer" is 7/6/3, "trust-first" is 3/2/5. Rules are gated on dials: the centered hero is avoided when variance is above 4.
- **Palette rotation.** "if the previous premium-consumer project you generated used the beige+brass family, this one MUST use a different family". It names alternatives: Cold Luxury, Forest, Black and Tan, Cobalt + Cream, Terracotta + Slate, Olive + Brick + Paper, monochrome + one pop.
- **Mechanical checks.** Eyebrow count ≤ ceil(sections / 3). No layout family twice on a page. At most two zig-zags in a row. Zero em dashes. Hero ≤ 2 headline lines and ≤ 20 words of subtext. One label per CTA intent. A **Final Pre-Flight Check** of about 50 boxes: "If a single checkbox cannot be honestly ticked, the page is not done."
- `brandkit` starts with "Brand strategy first": category, audience, emotional promise, cultural position, trust level, visual world, symbolic metaphor and "what the brand should avoid". Its rule: "Do not pick symbols randomly."

### 3.4 Other open-source design skills

- **Hallmark** ([dev.to](https://dev.to/rams901/hallmark-stop-ai-generated-ui-slop-in-one-command-in-2026-3p9n)) has four verbs. Build picks one of 22 themes and a macrostructure. Audit scores against 65 binary anti-pattern checks. Redesign keeps content and throws out structure. Study extracts "design DNA" (macrostructure, type pairing, color anchor) from a reference into a portable markdown file and refuses pixel clones. It ends with a pre-emit self-critique.
- **Vercel Web Interface Guidelines** ([command.md](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md), wrapped locally by `~/.agents/skills/web-design-guidelines/SKILL.md`). This is not about taste. It is a craft-floor checklist that is fetched fresh each review and reported as terse `file:line` findings: typography details, focus states, forms, image dimensions, reduced motion, i18n formats, plus an anti-pattern list (`transition: all`, `outline-none` without replacement, zoom disabled). It fits as the mechanical half of a review.

### 3.5 Local skills and agents on this machine

| Skill / agent | Path | Method worth taking | Weakness |
|---|---|---|---|
| **ui-finish-gate-reviewer** | `~/.claude/agents/ui-finish-gate-reviewer.md` | Writes a **Design Contract** before critiquing: user + job, first-read object, primary action, density decision, hierarchy, interaction model, responsive priority, 3-5 reference patterns ("pattern → lesson, not a copied visual"), **forbidden defaults** for this product, finish evidence. Returns **PASS or HOLD** and never softens a hold. Every finding maps to a concrete change plus a verification viewport or state. "Say 'this screen could belong to any SaaS' only when you can name the interchangeable pattern and a product-specific replacement." | Aimed at product UI, not brand sites |
| **swiftui-design-skill** | `~/.agents/skills/swiftui-design-skill/` (`SKILL.md`, `references/anti-ai-slop.md`, `references/design-review.md`, `templates/brand-spec.md`) | Offers **2-3 directions from different "schools"** (Information, Editorial, Expressive, Functional, Warm Minimal), each with 3-5 hex colors, a type pairing, density and a signature detail. Applies a **5-dimension review** (Philosophy, Hierarchy, Craft, Functionality, Originality, 1-10 each, ship at ≥7 everywhere). Its self-check: "Could you swap the brand name and it would still look the same?" "Placeholder > bad implementation." | Its "instead" advice (warm accent on neutral + serif display) is now itself the cream/serif tell. This shows how a fixed recommendation turns into slop |
| **ui-ux-pro-max** | `~/.agents/skills/ui-ux-pro-max/` | Priority-ordered rule table (accessibility first). Persists `design-system/MASTER.md` plus per-page overrides. Optional variance/motion/density dials | Running `search.py "artisan coffee roaster ecommerce shop" --design-system` returned stock Tailwind emerald `#059669`/`#10B981` + orange `#EA580C`, Rubik + Nunito Sans, "Feature grid/cards (4-6)" and hover transitions on everything. **A lookup database reproduces the category average**, which is the problem we are solving |
| **use-style** | `~/.agents/skills/use-style/` | Treats a named style file as **hard constraints**, and each style file has an anti-patterns section and exact tokens. Good as a format for a committed direction | It copies existing brands (Stripe, Linear), which the Theme must not do |
| **landing-page-design** | `~/.agents/skills/landing-page-design/SKILL.md` | CTA copy formulas, mobile rules | It *prescribes* the slop: the fixed hero formula, "3 key features", "happy professional team" stock prompts, and a `#667eea→#764ba2` purple gradient in its OG image example. A counter-example |
| **brand-ideation** | `~/.claude/skills/brand-ideation/SKILL.md` (Stage 3) | Mood directions *before* design. Each has 3-5 mood adjectives, color territory (not hex yet), type territory, imagery direction, 3-5 reference brands and **"what this rejects"**. "A bad mood direction is 'Modern and clean.'" | Upstream of visuals only |
| **brand-identity** | `~/.claude/skills/brand-identity/SKILL.md` | Five elements (logo system, color, type, imagery, motion). Per color: contrast, allowed/disallowed pairings, usage. **Stress-test the system on 3-5 mock applications** before sign-off. Neutrals are "80 percent of the surface area". Document dos/don'ts per element | Generic, not web-specific |

### 3.6 Patterns across all of them

| Pattern | Who uses it | Adopt? |
|---|---|---|
| Ground in the subject's world before choosing visuals | Anthropic, impeccable, taste brandkit, brand-ideation | Yes, it is the core |
| Written direction plan before building (named hex, type roles, layout concept, principles) | Anthropic, impeccable contract, finish-gate contract, swiftui directions | Yes |
| "Would I produce this for any similar brief?" self-check on the plan | Anthropic, swiftui ("swap the brand name"), finish-gate, impeccable specificity verdict | Yes, as a hard step |
| Name what the direction rejects / forbidden defaults | brand-ideation, finish-gate, impeccable THESIS | Yes |
| Several directions, the human picks | swiftui (2-3), brand-ideation (2-4), designers (3), impeccable (assigned + challengers) | Yes, 2-3 cheap directions |
| Randomization against convergence | impeccable concept-seed, taste palette rotation | Lightweight version (see Part 5) |
| One signature element, the rest quiet | Anthropic, swiftui | Yes |
| Deterministic checks | impeccable detector, Hallmark 65 checks, taste pre-flight, Vercel | Yes, a small script on the built Theme |
| Screenshot review with a pass/hold gate, bounded rounds | Anthropic, impeccable, finish-gate | Yes |
| Durable direction document with named rules + do/don't | impeccable DESIGN.md, use-style, brand-identity | Yes |
| Fixed lookup presets or fixed "do this instead" palettes | ui-ux-pro-max, swiftui, landing-page-design | **No**, they recreate the average |

---

## Part 4: How professional designers go from brief to direction

1. **Brief.** Positioning, audience, three emotions, key messages ([search summary of Think Bold / Milanote guides](https://milanote.com/guide/create-better-moodboards)). brand-ideation adds positioning "territories", each with what it rejects.
2. **Moodboard.** It usually covers seven layers: color, typography (and "the feeling each choice carries"), photography (subject, lighting, treatment, crop), graphic language, texture and material, sample lines of voice, and **competitive context: "where the category already sits and where this brand deliberately does not"** (search summary of [ebaqdesign](https://www.ebaqdesign.com/blog/brand-mood-board) and similar). Designers "start with 5 or more ideas" and narrow to "three distinct yet consistent directions", and the client picks one.
3. **Style tile** (Samantha Warren, [styletil.es](https://styletil.es/)): fonts, colors and interface elements, "for when a moodboard is too vague and a comp is too literal". This is the right fidelity for a Theme direction. The Studio can already render one live.
4. **Typographic voice.** Start from tone ("playful or polished, luxe or grassroots") and the three emotions, then pick the display face, which carries the most personality ([search summary](https://brandsthatpunch.com/blogs/typography-the-voice-you-can-see)). Butterick: "All system fonts are overexposed… please don't adopt the slogan 'A Design Firm Unlike Any Other' and then set it in Helvetica" ([Practical Typography](https://practicaltypography.com/system-fonts.html)).
5. **Color strategy.** Neutrals first, since they cover most of the surface. Then one signature color, contrast-tested, with allowed and forbidden pairings (brand-identity skill). Then a strategy for how much surface the color owns (impeccable's four strategies).
6. **Layout principles and signature details.** A grid and rhythm, a density decision, and one memorable device, stress-tested on 3-5 real applications (brand-identity workflow step 4).
7. **Documentation others can apply.**
   - **Tokens**: the W3C Design Tokens Community Group format reached its first stable version, 2025.10, on 2025-10-28 ([announcement](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)). DESIGN.md embeds a subset as YAML.
   - **Prose rationale + named rules**: DESIGN.md's Creative North Star and Named Rules. use-style's anti-pattern section per style.
   - **Do/don't pairs, shown side by side, written as directives**: stretch, recolor and busy-background misuse for logos; "do not create new colors by mixing approved colors" for color ([search summary of Frontify et al.](https://www.frontify.com/en/guide/brand-guidelines-examples)).

---

## Part 5: What this means for the Shopify theme design skill

### 5.1 Constraints in this repo today

- The Brand is `color_schemes` (four hex each: background, text, button, button_label), `type_heading_font` + `type_body_font` from Shopify's font library, a logo, and one `input_corner_radius`. Layout settings are page width and margins (`base-theme/config/settings_schema.json`). The base defaults are Work Sans for both fonts and `#FFFFFF`/`#333333`.
- `SKILL.md` step 2 records "Style (like minimal, bold, playful, luxurious)" as one adjective. This is the "Modern and clean" mood that brand-ideation calls bad. Step 4 picks "4 to 6 sections that fit the style… Start with `hero`" and alternates schemes, which produces the Part 1 e-commerce formula by default.
- `catalog/sections/hero.liquid` has no layout options (color scheme, image, video, heading, text, button only). The Studio therefore cannot express a first-viewport composition.
- The Shopify font library (`studio/server/shopify-fonts.json`, 261 families) contains almost every face on the tell lists: Inter, Roboto, Open Sans, Lato, Space Grotesk, Space Mono, Syne, Geist, Instrument Sans/Serif, Fraunces, Playfair Display, Cormorant, Lora, Crimson Pro/Text, Newsreader, DM Sans/Serif, Outfit, Plus Jakarta Sans, IBM Plex, Bricolage Grotesque (recommended by Anthropic's 2025 blog, so likely a newer default) **(observation)**. It also has good, less-used faces a direction can pull from, such as Bodoni Moda, Gloock, Young Serif, Besley, Hepta Slab, Big Shoulders, Anybody, Funnel Display, Unbounded, Tilt Warp, Schibsted Grotesk, Sofia Sans (Condensed/Extra Condensed), Libre Caslon Text, Faculty Glyphic and Imbue. None of these is safe forever. The rule is "justify the choice from the brand's world", not a new allowlist.
- Shopify's own bar: color and type swaps are cosmetic, and distinctiveness lives in "header and navigation, product cards, media treatments, and page structure".

### 5.2 Recommended method (to decide in a ticket, not built here)

1. **Brand brief** (extends step 2). Keep the seven values and add: what the shop sells and its materials; the customer and their scene; three emotions; 3-5 reference brands *outside* the category; **what the Brand rejects**; one sentence on why a shopper would pick this shop.
2. **Direction derivation.** List about seven concrete artifacts, places or rituals from the brand's world (impeccable). Name the category-default Theme and its predictable opposite, and keep both out. Draft **2-3 directions**, each a mini style tile: color strategy + 4-6 named hex values mapped to schemes, heading/body font handles with a one-line reason each, a first-viewport sketch (ASCII), a section order, a signature element, and "rejects". Run the Anthropic self-check on each ("would I produce this for any similar shop?"), revise, then let the Creator pick. The Studio can preview directions live, which makes this a style tile.
3. **Direction contract**, a short file the agent reloads each session, following impeccable's blocks and the finish-gate template. Proposed fields: *North Star* (named metaphor), *Thesis + refused default*, *Palette* (roles, strategy, named rules), *Type* (faces, scale, emphasis rule), *First viewport*, *Page rhythm* (section order and scheme alternation, as a pattern rather than "alternate"), *Signature element*, *Imagery direction* (subject, light, crop, treatment, what to reject), *Voice* (three sample lines, banned words), *Forbidden defaults* for this Brand. Close with do/don't pairs. The DESIGN.md format is a good fit, but this repo's glossary says to avoid "design tokens" and "style guide" as names for the Brand, so pick a term in CONTEXT.md first.
4. **Compose against the contract**, with bounded checks:
   - Mechanical, scriptable over the Theme's JSON templates and settings: fonts not on the tell list without a written reason; the same section type at most once per page unless the contract says so; no three image-with-text sections in a row; one CTA label per intent; no em dashes, "Elevate/Seamless/Unleash", "Welcome to" or placeholder names in copy; contrast ≥ 4.5:1 (already partly there via Lighthouse).
   - Visual: screenshot home, product and collection at 1440px and 390px. Review with the finish-gate format (PASS/HOLD, each finding tied to a viewport) and the "swap the shop name" test. At most one fix round and one confirming round (impeccable's bounded passes).
5. **Grow the levers** so a direction can be more than a swap (Shopify's bar). Candidate Brand-level settings: corner-radius scale (sharp/soft/pill), button shape and style, heading case and tracking, density (spacing scale), image treatment (aspect ratio, crop, frame), divider style. Candidate section variants in the catalog: hero compositions (split, offset, type-led, full-bleed with bottom-left text, product-led), product-card styles, header layouts. Each should be a setting on existing sections rather than new files, where possible.

### 5.3 Rules to write into the skill (short form)

- Derive, don't default: every font, color strategy and section order carries a one-line reason from the brand brief.
- The brief wins: a look the Creator names is followed exactly.
- Know the tells (Part 1, with the Shopify font handles), and treat them as defaults that need a reason, not absolute bans. The exceptions that act as bans are eyebrows above every heading, emoji icons, gradient text and nested cards.
- One signature element per page and quiet everywhere else.
- Buying stays conventional: navigation, product form, cart and checkout paths follow shopper expectations (Marketing Dive's counter-argument). The Brand is expressed through type, color fields, imagery, composition and rhythm.
- Real content or honest placeholders: never invent reviews, claims, prices or stock counters.
- Review is part of the work: screenshots, PASS/HOLD, bounded rounds.

### 5.4 Open questions

- Should the agent roll dice (impeccable) or rotate (taste-skill) to avoid converging across different Creators' Themes? The skill has no memory of other Themes, so a seeded pick from the derived list is the only option. It may be overkill when the Creator picks from 2-3 directions anyway.
- Where does the Direction contract live: in the Theme repo (committed, travels with the Theme) or in the Studio state?
- How many new Brand settings and section variants can be added before the Merchant's Theme Editor gets cluttered?
