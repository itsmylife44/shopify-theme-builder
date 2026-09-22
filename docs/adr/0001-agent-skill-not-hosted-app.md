# The product is an agent skill, not a hosted web app

The Creator builds their Theme by running this repo as a skill inside their own coding agent (any agent that reads `SKILL.md`), not through a hosted web builder. The agent does the generating: this repo ships instructions, the Section Catalog and a local editor, not a theme generator engine. We chose this because the target Creator already uses a coding agent, and it avoids running hosting, accounts and a deterministic generator that a hosted app for non-technical merchants would require.

## Considered Options

- **Hosted web app for non-technical merchants**: rejected for the MVP; needs accounts, hosting, and a full generator we'd maintain.
- **Deterministic generator with optional AI**: rejected; most of the maintenance cost for little gain when the Creator already has an agent.
