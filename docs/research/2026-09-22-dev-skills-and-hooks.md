# Agent skills and hooks for developing this repo

Date: 2026-09-22. Scope: which existing agent skills (SKILL.md format) would help agents work on this repo cleanly (Liquid Theme, Studio on Vite + React + TS + Tailwind + shadcn, tests, the repo's own SKILL.md). Also covers how skills get installed and shared, and what Claude Code hooks can enforce. This doc lists facts and verdicts. Nothing was installed. Search was done with `npx skills find` (skills CLI 1.7.0) [S1]. Star counts and last-push dates come from the GitHub API on 2026-09-22 [S34]. Install counts are what skills.sh reported on the same day [S1].

## TL;DR

- **Liquid: use Shopify's `shopify-liquid`, but know about its telemetry.** It is the most-installed Liquid skill (12.6K installs, MIT). It runs `search_docs.mjs` before writing code and a local `themeCheckRun` validator after [S1][S3][S4]. Telemetry is **on by default**, and the skill tells the agent to send the user's last message verbatim, base64-encoded, with each validation. Opt out with `~/.config/shopify-ai-toolkit/opt-out` or `OPT_OUT_INSTRUMENTATION=true` [S2][S3]. It pins theme-check `3.24.0`, while this project uses `3.29.0` [S4].
- **The best Liquid reference content has no license.** `benjaminsehl/liquid-skills` (`shopify-liquid-themes`, `liquid-theme-standards`, `liquid-theme-a11y`, 2.6K to 3.4K installs) is by Shopify's Director of Product, Storefronts. It is good, tightly scoped content, but the repo has no LICENSE, so we must not vendor it into our MIT repo [S8][S9][S32].
- **No skill covers Theme Check or theme CLI work.** `shopify-use-shopify-cli` is about apps and store commands, not `shopify theme dev` or `theme check` [S5]. A "theme check" search found nothing about Shopify [S1]. The validator inside `shopify-liquid` is the closest thing.
- **Frontend: the skills that are already installed mostly cover it.** `shadcn` (official, 271.7K installs) [S17], `tailwind-design-system` (Tailwind v4 `@theme`) [S14], `vercel-react-best-practices` (735K installs, but Next.js/server-heavy) [S12] and `typescript-advanced-types` [S14]. Worth adding: `antfu/skills@vite` and `antfu/skills@vitest` (36–37K installs, MIT, generated from the official docs) [S11].
- **Skill authoring is covered twice already.** `mattpocock-skills:writing-for-agents` (plugin, MIT) and `anthropic-skills:skill-creator` (Apache-2.0, has evals) are both available in this session [S20][S21][S33]. The locally installed `skill-manager` is a copy of someone else's dotfiles with hardcoded `/Users/melvynx/...` paths [S33].
- **`npx skills add` without `-g` writes to the project and to `skills-lock.json`.** It installs the files into `.agents/skills/<name>`, symlinks `.claude/skills/<name>` for Claude Code, and records the skill in a committable `skills-lock.json`. `npx skills experimental_install` restores from that lockfile, but only into `.agents/skills/`. The lock stores a ref and a content hash, not a commit SHA, and restoring doesn't check the hash [S24][S25].
- **Hooks can enforce "load skill X before editing Y".** A committed `.claude/settings.json` can hold a `PreToolUse` hook on `Edit|Write` that reads `tool_input.file_path`, plus a `PostToolUse` hook on `Skill` that writes a marker. The first hook can deny with exit 2 until the marker exists. Advisory `additionalContext` from `PreToolUse` shows up next to the tool result, which means after the edit has already run [S26]. Hooks only run in Claude Code, and only after the folder is trusted in interactive sessions [S26].
- **A lighter native option exists.** A skill's `paths:` frontmatter, or a `.claude/rules/*.md` file with `paths:`, loads guidance automatically when Claude touches matching files. No hook is needed [S27][S28].

## Already installed

Sources are the global skills lockfile `~/.agents/.skill-lock.json`, `~/.claude/plugins/installed_plugins.json` and `~/.claude/settings.json` `enabledPlugins` [S33]. Stars, license and last push are from the GitHub API [S34].

| Skill | Source (owner/repo, path) | Install date / updated | Repo license, ★, last push | Relevance and verdict |
|---|---|---|---|---|
| `shadcn` | shadcn-ui/ui `skills/shadcn` (lock says `shadcn/ui`, which redirects) | 2026-08-07 / 2026-09-11 | MIT, ★124k, 2026-09-21 | **Keep.** Official. Uses OKLCH tokens and has a `--template vite` init. Running the skill executes `npx shadcn@latest info --json` as dynamic context [S17] |
| `tailwind-design-system` | wshobson/agents `plugins/frontend-mobile-development/...` | 2026-08-07 | MIT, ★39.9k, 2026-09-21 | **Keep.** Written for Tailwind v4 (maps `tailwind.config.ts` → `@theme` in CSS) [S14] |
| `tailwindcss-advanced-layouts` | JosiahSiegel/claude-plugin-marketplace | 2026-03-03 / 2026-07-21 | MIT, ★55, 2026-06-18 | Low value. Niche grid/flex patterns, small repo |
| `vercel-react-best-practices` | vercel-labs/agent-skills `skills/react-best-practices` | 2026-08-07 | README says MIT (no LICENSE file), ★31.5k, 2026-08-28 | **Keep, with a caveat.** 70 rules, of which 10 `server-*` and several `async-*` rules target Next.js/RSC and don't apply to a Vite SPA [S12] |
| `typescript-advanced-types` | wshobson/agents `plugins/javascript-typescript/...` | 2026-02-23 / 2026-07-21 | MIT | OK. Generic type-level TypeScript (generics, conditional/mapped types) [S14] |
| `javascript-testing-patterns` | wshobson/agents `plugins/javascript-typescript/...` | 2026-08-07 | MIT | OK. Generic Jest/Vitest/Testing Library. `antfu/vitest` is more current for Vitest [S14][S11] |
| `playwright-best-practices` | currents-dev/playwright-best-practices-skill | 2026-08-07 | MIT, ★383, 2026-07-21 | OK if the Studio gets E2E tests (85.1K installs) [S1][S19] |
| `zod-4` | prowler-cloud/prowler `skills/zod-4` | 2026-02-23 | Apache-2.0 | Only relevant if the file API validates payloads with Zod. It's a skill from inside the Prowler app repo |
| `react-doctor` | millionco/react-doctor | 2026-03-03 / 2026-08-19 | **"Modified MIT"**, ★14.9k, 2026-09-22 | Useful as a React lint/triage tool. It runs `npx react-doctor@latest` and `curl`s its playbook from `react.doctor`. The license needs written permission for uses such as "input to any automated pipeline for training or improving any … AI system", so don't vendor it [S23] |
| `web-design-guidelines` | vercel-labs/agent-skills | 2026-02-22 / 2026-09-22 | as above | OK for Studio UI review. It fetches its rules at runtime from `raw.githubusercontent.com/vercel-labs/web-interface-guidelines` [S33] |
| `accessibility` | addyosmani/web-quality-skills | 2026-08-07 / 2026-09-11 | MIT, ★2.8k, 2026-08-24 | OK. Generic WCAG 2.2. For Liquid sections, `liquid-theme-a11y` fits better [S8] |
| `mattpocock-skills:writing-for-agents` | plugin `mattpocock-skills@mattpocock` v1.2.3 (mattpocock/skills `skills/productivity/writing-for-agents`) | plugin installed 2026-09-03 | MIT, ★268k, 2026-09-18 | **Keep. The best fit for writing our SKILL.md.** Covers context pointers, description wording and `SKILL-MECHANICS.md` (81 lines) [S21] |
| `anthropic-skills:skill-creator` | synced from claude.ai (anthropics/skills `skills/skill-creator`) | — | Apache-2.0 (per-skill `LICENSE.txt`), ★178k | **Keep.** Authoring plus an eval loop and description optimization (485 lines) [S20] |
| `skill-manager` | copied into `~/.agents/skills/` on 2026-07-11, not in the lockfile. Its SKILL.md names `Melvynx/agents-config` as its canonical repo | 2026-07-11 | unknown | **Low quality for us.** Hardcodes `/Users/melvynx/.agents/skills/find-docs/...` and other paths that don't exist on this machine [S33] |
| `superpowers:writing-skills` | plugin `superpowers@claude-plugins-official` 6.4.1 (obra/superpowers) | installed, **disabled** in `enabledPlugins` | MIT, ★290k | TDD-for-skills method (pressure-test with subagents). Depends on `superpowers:test-driven-development` [S22] |
| `typescript-lsp` | plugin `typescript-lsp@claude-plugins-official` | enabled | — | Not a skill. It gives real TS diagnostics, which helps the Studio |

The project itself has no `.claude/` or `.agents/` directory yet, so no project-scoped skills exist.

## Candidates per area

★ and last push are for the repo. Installs are from skills.sh. "Install" shows the skills CLI form, project scope (no `-g`).

| Area | Skill | Source | Install | Covers | Popularity | License | Verdict |
|---|---|---|---|---|---|---|---|
| Liquid | `shopify-liquid` v1.16.0 | Shopify/Shopify-AI-Toolkit | `npx skills add Shopify/shopify-ai-toolkit --skill shopify-liquid` [S7], or the plugin `claude plugin install shopify-ai-toolkit@claude-plugins-official` [S2] | OS 2.0 architecture, schema, LiquidDoc, translations. Required loop: search docs → write → `validate.mjs` (local `themeCheckRun` with the theme's `.theme-check.yml`), up to 3 retries [S3][S4] | 12.6K installs; ★565, push 2026-09-18 | MIT | **Recommended, with caution.** Official and validating. Its focus ("snippets, blocks, and sections; users may create templates using the theme editor") fits our Section Catalog [S3]. Downsides: telemetry is on by default, the prompt capture instructions are aimed at the agent, a `PostToolUse` `Skill` hook is baked into the frontmatter, theme-check is pinned at 3.24.0, and the repo accepts no PRs [S2][S3][S4] |
| Liquid | `shopify-liquid-themes` (plus `liquid-theme-standards`, `liquid-theme-a11y`) | benjaminsehl/liquid-skills | `npx skills add benjaminsehl/liquid-skills --skill shopify-liquid-themes` (the README's `claude skill install --plugin …` form is unverified) | Liquid gotchas (no parens or ternary, `render` not `include`, `{% stylesheet %}` doesn't render Liquid), 152 filters, 137 objects, schema settings. Standards: BEM in `{% stylesheet %}`, design tokens, Web Components. a11y: WCAG 2.2 commerce components [S8] | 3.4K / 2.7K / 2.6K installs; ★119, push 2026-07-16 | **None** (no LICENSE file) | **Best content, but only for local or global use.** The author is Shopify's Director of Product, Storefronts [S9]. It makes no network calls. It can't be committed into our repo [S32] |
| Liquid | `shopify-theme-development-guidelines` | Mindrally/skills | — | Generic 104-line text | 872 installs; ★261 | Apache-2.0 | **Avoid.** Lists `include` as a valid tag and uses `layouts/` for the directory name. Reads like converted cursor rules [S10] |
| Shopify CLI / Theme Check | `shopify-use-shopify-cli` | Shopify/Shopify-AI-Toolkit | `npx skills add Shopify/shopify-ai-toolkit --skill shopify-use-shopify-cli` | App TOML validation, `shopify store auth/execute`, store reads/writes. Requires confirmation before commands with side effects. Every use calls `log_skill_use.mjs` with the prompt [S5] | 10.8K installs | MIT | **Poor fit.** Not about `theme dev`, `theme check` or `theme push`. Skip it |
| Shopify CLI / Theme Check | none found | — | — | A "theme check" search returned only Drupal, WordPress and Halo theme skills [S1] | — | — | Gap. Use `shopify-liquid`'s validator, or write our own small repo skill or script around `@shopify/theme-check-node` |
| Vite | `vite` (2026.1.31) | antfu/skills | `npx skills add antfu/skills --skill vite` | Config, `import.meta.glob`, the Plugin API (including `configureServer`, which our file-API plugin needs), SSR, Environment API, Rolldown migration [S11] | 36.2K installs; ★5.9k, push 2026-06-23 | MIT | **Recommended.** Generated from the vitejs/vite docs. Caveat: it says "Based on Vite 8 beta", and the README calls the collection a proof of concept that is "not fully tested" [S11] |
| React 19 | `vercel-react-best-practices` (installed) | vercel-labs/agent-skills | `npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices` | Re-render, bundle and rendering performance rules [S12] | 735.3K installs | MIT (README) | Keep. Tell agents to ignore the `server-*` rules |
| React 19 | `react-vite-best-practices` | AsyrafHussin/agent-skills | `npx skills add asyrafhussin/agent-skills --skill react-vite-best-practices` | 23 build/splitting/env/asset rules [S13] | 2.6K installs; ★80 | MIT | Optional. Only about performance, from a small repo. Low priority for a local tool |
| React 19 | `github/awesome-copilot@react19-*` (3 skills), `grafana/skills@react-19-plugin-migration` | — | — | Named after React 19 migration/patterns [S1] | 1.0–3.3K | not checked | **Not reviewed.** Mostly about migration, and we start on 19 |
| TypeScript | `typescript-advanced-types` (installed) | wshobson/agents | `npx skills add wshobson/agents --skill typescript-advanced-types` | Type-level TypeScript [S14] | 78.5K installs | MIT | Keep. Nothing better found. `typescript-lsp` diagnostics matter more |
| Tailwind v4 | `tailwind-design-system` (installed) | wshobson/agents | `npx skills add wshobson/agents --skill tailwind-design-system` | v4 `@theme`, tokens, component variants [S14] | 65.1K installs | MIT | **Keep.** With `shadcn`, this is enough |
| Tailwind v4 | `tailwind-4-docs` | Lombiq/Tailwind-Agent-Skills | `npx skills add lombiq/tailwind-agent-skills --skill tailwind-4-docs` | A local snapshot of the official v4 docs plus gotchas [S15] | 14.9K installs; ★72, push 2026-04-09 | BSD-3-Clause (the docs snapshot itself is source-available, and the user must accept its license) | Optional. Friction: it needs git and Python and tells the agent to stop until the snapshot exists and is less than a week old [S15] |
| Tailwind v4 + shadcn | `tailwind-v4-shadcn` | secondsky/claude-skills (fork of jezweb) | — | Vite + Tailwind v4 + shadcn setup, dark mode [S16] | 7.7K installs; ★219 | MIT | **Avoid.** It says "Last Updated: 2025-12-04" and teaches `hsl()` tokens while current shadcn uses OKLCH [S16][S17]. Its description starts with a stray `|` (malformed YAML) |
| shadcn/ui | `shadcn` (installed) | shadcn-ui/ui | `npx skills add shadcn/ui --skill shadcn` | CLI, registries, composition/styling rules, forms, Base vs Radix [S17] | 271.7K installs | MIT | **Keep. It is the canonical one** |
| Vitest | `vitest` (2026.6.22) | antfu/skills | `npx skills add antfu/skills --skill vitest` | Config, mocking, snapshots, coverage, projects, type testing. Based on Vitest 5 beta [S11] | 37K installs | MIT | **Recommended** |
| Playwright | `playwright-cli` | microsoft/playwright-cli | `npm i -g @playwright/cli@latest && playwright-cli install --skills` [S18] | Driving a browser from the agent (snapshot refs, click/type), plus tests | 162.6K installs; ★13.5k | Apache-2.0 | Only if agents need to drive the Studio UI. Otherwise YAGNI |
| Playwright | `playwright-best-practices` (installed) | currents-dev | — | Writing and debugging tests [S19] | 85.1K | MIT | Already present |
| Skill authoring | `writing-for-agents` (installed) | mattpocock/skills | `claude plugins install mattpocock-skills` or `npx skills add mattpocock/skills --skill writing-for-agents` [S21] | Wording of pointers and descriptions, context vs cognitive load, skill mechanics | 301.4K installs | MIT | **Recommended (primary).** Note: skills.sh still lists `writing-great-skills` (323.9K installs), which was renamed to `writing-for-agents` in PR #763, so that entry is stale [S1][S21] |
| Skill authoring | `skill-creator` (available) | anthropics/skills | `npx skills add anthropics/skills --skill skill-creator` | Authoring plus evals and description tuning [S20] | 388.1K installs | Apache-2.0 | **Recommended (for evals)** |
| Skill authoring | `grafana/skills@skill-authoring` | grafana/skills | — | — | 3K | Apache-2.0 | Not reviewed. Probably specific to Grafana |

## Install mechanics

- **Project vs global.** Project scope is the default: `./<agent>/skills/`, "Committed with your project, shared with team". `-g` installs to `~/<agent>/skills/` [S24].
- **Where project files land.** Canonical files go to `.agents/skills/<name>`. For each selected agent, the CLI symlinks the agent's own directory to them (Claude Code: `.claude/skills/<name>`). `--copy` makes copies instead [S24][S25 `installer.ts`]. For project installs, the CLI skips the symlink for agents whose project directory is missing. Claude Code is exempt from this skip (`createProjectSkillsDirByDefault: true`), so `.claude/skills/` gets created [S25 `installer.ts`, `agents.ts`].
- **Which agents a project install serves.** Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode, Cline, Warp, Amp and others read `.agents/skills/`. Claude Code reads `.claude/skills/` [S24]. Claude Code's docs list only `.claude/skills/` for project skills and say symlinked skill folders are followed [S27].
- **Lockfile.** Project installs write `skills-lock.json` in the repo root. It is "meant to be checked into version control" and stores `source`, `sourceUrl`, `ref`, `skillPath` and `computedHash`, sorted and without timestamps [S25 `local-lock.ts`, `add.ts`]. Restoring uses `npx skills experimental_install` [S25 `cli.ts`]. Restore limits:
  - It installs only into `.agents/skills/` ("Does not install to agent-specific directories") [S25 `install.ts`].
  - It doesn't check the hash.
  - It pins nothing below `ref`, so you get the current HEAD of the branch.

  Global installs use a separate `~/.agents/.skill-lock.json` [S25 `skill-lock.ts`].
- **Updates and telemetry.** `npx skills update -p` updates project skills [S24]. The CLI sends anonymous install telemetry. `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1` turns it off [S24].
- **Plugins are a separate channel.** A committed `.claude/settings.json` can declare `extraKnownMarketplaces` and `enabledPlugins`. Since v2.1.195, plugins from external sources still need each teammate to install them, and these keys apply only after the folder is trusted [S29][S30]. Both the Shopify toolkit and mattpocock's skills ship as Claude Code plugins [S2][S21].
- **Licensing of committed third-party skills.** Our repo is MIT outside the Skeleton folder (ADR 0002).
  - MIT (antfu, wshobson, mattpocock, shadcn, Shopify toolkit): the copyright and permission notice must stay with the copied files.
  - Apache-2.0 (anthropics skill-creator, microsoft playwright-cli, prowler, grafana): also keep the LICENSE and NOTICE, and mark changed files. This is standard Apache-2.0 §4, not checked per file here.
  - No license (benjaminsehl/liquid-skills): "no one may reproduce, distribute, or create derivative works", so it must not be committed [S32].
  - react-doctor's "Modified MIT" adds restrictions on AI-pipeline use and on hosted resale [S23].
  - vercel-labs/agent-skills says MIT in its README and frontmatter but has no LICENSE file with a copyright line [S12].
  - Lombiq's Tailwind docs snapshot is source-available and must stay local [S15].

  Committing only `skills-lock.json`, and not the vendored files, avoids redistributing anything.

## Hooks facts

All from the Claude Code hooks reference [S26] unless noted.

- **Committed project hooks.** `.claude/settings.json` is "Single project … Yes, can be committed to the repo". `.claude/settings.local.json` is the uncommitted variant. Hooks from different levels merge rather than replace each other.
- **PreToolUse on `Edit|Write` can see the target path.**
  - The matcher `Edit|Write` is an exact list of tool names.
  - The hook receives JSON on stdin with `tool_name`, and `tool_input.file_path` for Write and Edit.
  - It also gets `session_id` and `cwd`, and `${CLAUDE_PROJECT_DIR}` is available for script paths.
- **Injecting "load skill X".** `hookSpecificOutput.additionalContext` is added "next to the tool result" for PreToolUse and PostToolUse. For an allowed edit, the reminder therefore arrives after the edit has run. Docs advise wording it as fact ("This file is a Liquid section; the `shopify-liquid` skill covers it"), because imperative, system-style text "can trigger Claude's prompt-injection defenses". Values over 10,000 characters are moved to a file.
- **Blocking until a marker exists.** On PreToolUse, exit code 2 blocks the tool call and stderr becomes the reason Claude sees. `permissionDecision: "deny"` blocks too, with `permissionDecisionReason` shown to Claude. Precedence across hooks is `deny` > `defer` > `ask` > `allow`, and exit 2 can't be overridden by a JSON "allow". So a script can check for a marker file (for example keyed by `session_id`) and deny with a reason like "load skill X first".
- **Recording which skill was loaded.** PostToolUse matchers filter on tool name, so `"matcher": "Skill"` works. Shopify's toolkit ships exactly this: a `PostToolUse` hook with matcher `Skill|Read` [S6]. The field is `tool_input.skill` according to Shopify's hook script [S6], and it matches this session's Skill tool schema (`skill` parameter). The hooks reference doesn't document the Skill input fields.
  - Gap: a user typing `/skillname` "bypasses `PreToolUse`" for the Skill tool. Use `UserPromptExpansion` (matcher = command name) for that path.
- **Hooks inside skills.** SKILL.md frontmatter can declare `hooks:`. They register when the skill is invoked and stay for the rest of the session, and `once: true` makes a hook run a single time. A project skill of ours could therefore install its own guard on first use.
- **Trust and scope.** In interactive sessions, settings-file hooks are held back until the workspace trust dialog is accepted. `-p`/SDK sessions treat the folder as trusted. Hooks from settings files also run inside subagents. Hooks are a Claude Code feature. The docs here are Claude Code's, and nothing in them says other agents read `.claude/settings.json`, so Codex, Cursor and others won't enforce them (inference).
- **Native alternative to hooks.** Skills accept a `paths:` glob field: "Claude loads the skill automatically only when working with files matching the patterns" [S27]. `.claude/rules/*.md` with `paths:` works the same way for rules, and they trigger "when Claude reads files matching the pattern" [S28]. After compaction, skills are re-attached, capped at 5,000 tokens each and 25,000 in total. Docs point to hooks when a skill's influence fades [S27].

## Open questions

1. Is Shopify's default telemetry acceptable for contributors? Its SKILL.md tells the agent to pass the verbatim prompt. Our options are the per-user opt-out file, or `env: {"OPT_OUT_INSTRUMENTATION":"true"}` in `.claude/settings.json`. The README warns that env vars don't reach every surface, and settings `env` applies only after trust [S2][S29].
2. Does a skill auto-loaded through `paths:` go through the `Skill` tool, so that a PostToolUse `Skill` marker hook sees it? Undocumented. Test it.
3. What is `tool_input.skill` for plugin skills: `mattpocock-skills:writing-for-agents` or the bare name? Test it.
4. After `experimental_install` (which writes only `.agents/skills/`), do committed `.claude/skills/<name>` symlinks resolve for Claude Code users? It is plausible from the code but untested [S25].
5. Should `shopify-liquid`'s theme-check 3.24.0 validator be trusted, given the project standardises on 3.29.0? Its results may differ from the Studio's [S4].
6. The Vite and Vitest skills were generated from beta docs (Vite 8 beta, Vitest 5 beta). Do they match the versions the Studio pins [S11]?
7. Could benjaminsehl/liquid-skills get a license? If so, it could be vendored. Otherwise recommend a per-developer install.

## Sources

- S1: `npx skills find <query>` (skills CLI 1.7.0), run 2026-09-22 with queries: shopify liquid, shopify theme, theme check, shopify cli, vite, react, react 19, react best practices, typescript, typescript best practices, tailwind, tailwind v4, shadcn, vitest, playwright, skill authoring, writing skills, skill creator. https://skills.sh/
- S2: Shopify/Shopify-AI-Toolkit README (Install, Telemetry, Opting out), main@2026-09-18. https://github.com/Shopify/Shopify-AI-Toolkit
- S3: `skills/shopify-liquid/SKILL.md` v1.16.0 (frontmatter hooks, "Required Tool Calls", privacy notices L360–368). https://github.com/Shopify/Shopify-AI-Toolkit/blob/main/skills/shopify-liquid/SKILL.md
- S4: `skills/shopify-liquid/package.json` (theme-check-* 3.24.0) and `scripts/validate.mjs` (imports `themeCheckRun` from `@shopify/theme-check-node`, reads `.theme-check.yml`). Same repo.
- S5: `skills/shopify-use-shopify-cli/SKILL.md`. Same repo.
- S6: `hooks/hooks.json` (PostToolUse `Skill|Read`, UserPromptSubmit) and `hooks/scripts/track-telemetry.sh` L348–359 (`tool_input.skill`, `tool_input.file_path`). Same repo.
- S7: Shopify AI Toolkit docs (`npx skills add Shopify/shopify-ai-toolkit [--skill …]`). https://shopify.dev/docs/apps/build/ai-toolkit
- S8: benjaminsehl/liquid-skills README and the three SKILL.md files (no LICENSE file). https://github.com/benjaminsehl/liquid-skills
- S9: GitHub profile of benjaminsehl ("Director, Product, Storefronts @Shopify"). https://github.com/benjaminsehl
- S10: Mindrally/skills `shopify-theme-development-guidelines/SKILL.md`. https://github.com/Mindrally/skills
- S11: antfu/skills README, `skills/vite/SKILL.md`, `skills/vite/references/core-plugin-api.md`, `skills/vitest/SKILL.md`. https://github.com/antfu/skills
- S12: vercel-labs/agent-skills `skills/react-best-practices/` (SKILL.md, 72 rule files) and README "License: MIT". https://github.com/vercel-labs/agent-skills
- S13: AsyrafHussin/agent-skills `skills/react-vite-best-practices/SKILL.md`. https://github.com/AsyrafHussin/agent-skills
- S14: wshobson/agents: `typescript-advanced-types`, `tailwind-design-system`, `javascript-testing-patterns` (local copies read from `~/.claude/skills/`). https://github.com/wshobson/agents
- S15: Lombiq/Tailwind-Agent-Skills README and `skills/tailwind-4-docs/SKILL.md`. https://github.com/Lombiq/Tailwind-Agent-Skills
- S16: secondsky/claude-skills `plugins/tailwind-v4-shadcn/skills/tailwind-v4-shadcn/SKILL.md`. https://github.com/secondsky/claude-skills
- S17: shadcn-ui/ui `skills/shadcn` (SKILL.md, `customization.md` OKLCH), as installed locally. https://github.com/shadcn-ui/ui
- S18: microsoft/playwright-cli README and `skills/playwright-cli/SKILL.md`. https://github.com/microsoft/playwright-cli
- S19: currents-dev/playwright-best-practices-skill. https://github.com/currents-dev/playwright-best-practices-skill
- S20: anthropics/skills `skills/skill-creator/` (SKILL.md, LICENSE.txt Apache-2.0). https://github.com/anthropics/skills
- S21: mattpocock/skills README (install), `skills/productivity/writing-for-agents/SKILL.md`, CHANGELOG (#763 rename). https://github.com/mattpocock/skills
- S22: obra/superpowers `skills/writing-skills/SKILL.md` (local plugin cache 6.4.1). https://github.com/obra/superpowers
- S23: millionco/react-doctor LICENSE ("Modified MIT License"). https://github.com/millionco/react-doctor/blob/main/LICENSE
- S24: vercel-labs/skills README (Installation Scope, Supported Agents, update, Telemetry), v1.7.0. https://github.com/vercel-labs/skills
- S25: vercel-labs/skills source at main@2026-09-17: `src/local-lock.ts`, `src/install.ts`, `src/installer.ts`, `src/agents.ts`, `src/add.ts`, `src/cli.ts`, `src/skill-lock.ts`. https://github.com/vercel-labs/skills/tree/main/src
- S26: Claude Code hooks reference (Hook locations, Matcher patterns, Hooks in skills and agents, Exit code 2, Add context for Claude, PreToolUse input/decision control, UserPromptExpansion, Workspace trust). https://code.claude.com/docs/en/hooks
- S27: Claude Code skills docs (Choose where skills load, Frontmatter reference `paths`, Skill content lifecycle). https://code.claude.com/docs/en/skills
- S28: Claude Code memory docs, "Path-specific rules". https://code.claude.com/docs/en/memory
- S29: Claude Code settings docs (shared project settings, trust-gated keys). https://code.claude.com/docs/en/settings
- S30: Claude Code "Configure team marketplaces". https://code.claude.com/docs/en/discover-plugins
- S31: Claude Code tools reference (`Skill` tool). https://code.claude.com/docs/en/tools-reference
- S32: GitHub Docs, "Licensing a repository" ("without a license, the default copyright laws apply…"). https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
- S33: Local environment, observed 2026-09-22: `~/.agents/.skill-lock.json`, `~/.claude/skills/` (symlinks), `~/.claude/plugins/installed_plugins.json`, `~/.claude/plugins/known_marketplaces.json`, `~/.claude/settings.json` `enabledPlugins`, `~/.agents/skills/skill-manager/SKILL.md` L51–52, L108.
- S34: GitHub REST API `repos/<owner>/<repo>` (stars, `pushed_at`, `license.spdx_id`), queried 2026-09-22.
