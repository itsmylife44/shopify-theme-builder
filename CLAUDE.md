# shopify-theme-builder

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `itsmylife44/shopify-theme-builder`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Development skills

The development skills live in `.claude/skills/` (installed with `npx skills add`, pinned in `skills-lock.json`), next to the repo's own `theme-tooling` skill (Theme Check, `theme dev`, Section Catalog conventions). Load the matching skill before editing a file area:

| File area | Skill to load |
| --- | --- |
| `**/*.liquid` | `shopify-liquid`, `theme-tooling` |
| `studio/src/**/*.tsx` | `vercel-react-best-practices` (ignore its `server-*` rules: the Studio is a Vite SPA) |
| `studio/src/components/ui/**` | `shadcn` |
| `studio/src/**/*.css` | `tailwind-design-system` |

Also available, not enforced: `vite` (Vite config and the Studio's server plugin), `vitest` (tests), `typescript-advanced-types`.

In Claude Code, `.claude/hooks/skill-gate.mjs` enforces this table: an edit to a mapped file is blocked until the skill was loaded in the session. The rules live in that script; keep this table, and its copy in `CONTRIBUTING.md`, in sync. On other agents, read `.claude/skills/<name>/SKILL.md` yourself before editing.

`.claude/settings.json` sets `OPT_OUT_INSTRUMENTATION=true`, which turns off the `shopify-liquid` skill's telemetry (it would otherwise send your prompts to Shopify). On another agent, create `~/.config/shopify-ai-toolkit/opt-out` instead.
