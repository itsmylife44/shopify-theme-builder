// Claude Code hook: blocks edits to mapped file areas until the matching
// skill was loaded in the current session. Wired in .claude/settings.json:
//   PreToolUse (Edit|Write|MultiEdit)  -> exit 2 with a reason if a skill is missing
//   PostToolUse (Skill)                -> records the skill the agent loaded
//   UserPromptExpansion                -> records a skill the user typed as /skill
// Keep the table in CLAUDE.md in sync with RULES.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** Paths are relative to the project root, with forward slashes. */
const RULES = [
  { area: 'a Liquid file', pattern: /\.liquid$/, skills: ['shopify-liquid', 'theme-tooling'] },
  { area: 'Studio UI code', pattern: /^studio\/src\/.*\.tsx$/, skills: ['vercel-react-best-practices'] },
  { area: 'a shadcn UI component', pattern: /^studio\/src\/components\/ui\//, skills: ['shadcn'] },
  { area: 'a Studio stylesheet', pattern: /^studio\/src\/.*\.css$/, skills: ['tailwind-design-system'] },
]

const event = JSON.parse(readFileSync(0, 'utf8'))
const stateDir = path.join(tmpdir(), 'shopify-theme-builder-skill-gate')
const stateFile = path.join(stateDir, `${String(event.session_id).replace(/[^\w-]/g, '_')}.txt`)

/** @param {string} name */
function recordSkill(name) {
  mkdirSync(stateDir, { recursive: true })
  // Plugin skills arrive as "plugin:skill".
  appendFileSync(stateFile, `${name.split(':').pop()}\n`)
}

function loadedSkills() {
  try {
    return new Set(readFileSync(stateFile, 'utf8').split('\n'))
  } catch {
    return new Set()
  }
}

switch (event.hook_event_name) {
  case 'PostToolUse':
    if (event.tool_name === 'Skill' && event.tool_input?.skill) recordSkill(event.tool_input.skill)
    break
  case 'UserPromptExpansion':
    if (event.expansion_type === 'skill' && event.command_name) recordSkill(event.command_name)
    break
  case 'PreToolUse': {
    const filePath = event.tool_input?.file_path
    if (!filePath) break
    const projectDir = process.env.CLAUDE_PROJECT_DIR ?? event.cwd
    const rel = path.relative(projectDir, path.resolve(projectDir, filePath)).split(path.sep).join('/')
    const loaded = loadedSkills()
    const missing = RULES.filter((rule) => rule.pattern.test(rel)).flatMap((rule) =>
      rule.skills.filter((skill) => !loaded.has(skill)).map((skill) => ({ area: rule.area, skill })),
    )
    if (missing.length === 0) break
    const reasons = missing.map(({ area, skill }) => `${rel} is ${area}; the \`${skill}\` skill covers it.`)
    const skills = [...new Set(missing.map((m) => m.skill))].join(', ')
    process.stderr.write(
      `${reasons.join('\n')}\nThis repo requires loading it before editing: invoke the Skill tool with: ${skills}. ` +
        'Then retry the edit. See the skill table in CLAUDE.md.\n',
    )
    process.exit(2)
  }
}
