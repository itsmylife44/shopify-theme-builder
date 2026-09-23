import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const script = `${projectDir}.claude/hooks/skill-gate.mjs`

function runHook(event: Record<string, unknown>) {
  const result = spawnSync('node', [script], {
    input: JSON.stringify({ cwd: projectDir, ...event }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
  })
  return { code: result.status, stderr: result.stderr }
}

const edit = (session_id: string, file: string, tool_name = 'Edit') =>
  runHook({
    session_id,
    hook_event_name: 'PreToolUse',
    tool_name,
    tool_input: { file_path: `${projectDir}${file}` },
  })

const loadSkill = (session_id: string, skill: string) =>
  runHook({
    session_id,
    hook_event_name: 'PostToolUse',
    tool_name: 'Skill',
    tool_input: { skill },
  })

describe('skill gate hook', () => {
  it('blocks a Liquid edit when the skill was not loaded, naming the skill', () => {
    const result = edit(randomUUID(), 'catalog/sections/hero.liquid')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('shopify-liquid')
  })

  it('blocks Write as well as Edit', () => {
    expect(edit(randomUUID(), 'catalog/sections/hero.liquid', 'Write').code).toBe(2)
  })

  it('allows a Liquid edit once both Liquid skills were loaded this session', () => {
    const session = randomUUID()
    expect(loadSkill(session, 'shopify-liquid').code).toBe(0)
    expect(loadSkill(session, 'theme-tooling').code).toBe(0)
    expect(edit(session, 'catalog/sections/hero.liquid').code).toBe(0)
  })

  it('blocks a Liquid edit until theme-tooling is loaded too, naming it', () => {
    const session = randomUUID()
    loadSkill(session, 'shopify-liquid')
    const blocked = edit(session, 'catalog/sections/hero.liquid')
    expect(blocked.code).toBe(2)
    expect(blocked.stderr).toContain('theme-tooling')
    expect(blocked.stderr).not.toContain('`shopify-liquid`')
  })

  it('does not carry loaded skills over to another session', () => {
    loadSkill(randomUUID(), 'shopify-liquid')
    expect(edit(randomUUID(), 'catalog/sections/hero.liquid').code).toBe(2)
  })

  it('accepts a plugin-namespaced skill name', () => {
    const session = randomUUID()
    loadSkill(session, 'shopify-ai-toolkit:shopify-liquid')
    loadSkill(session, 'theme-tooling')
    expect(edit(session, 'catalog/sections/hero.liquid').code).toBe(0)
  })

  it('records a skill the user invoked with a slash command', () => {
    const session = randomUUID()
    runHook({
      session_id: session,
      hook_event_name: 'UserPromptExpansion',
      expansion_type: 'skill',
      command_name: 'shopify-liquid',
    })
    loadSkill(session, 'theme-tooling')
    expect(edit(session, 'catalog/sections/hero.liquid').code).toBe(0)
  })

  it('blocks Studio UI code until its skill is loaded', () => {
    const session = randomUUID()
    const blocked = edit(session, 'studio/src/App.tsx')
    expect(blocked.code).toBe(2)
    expect(blocked.stderr).toContain('vercel-react-best-practices')

    loadSkill(session, 'vercel-react-best-practices')
    expect(edit(session, 'studio/src/App.tsx').code).toBe(0)
  })

  it('allows a file no rule maps', () => {
    expect(edit(randomUUID(), 'package.json').code).toBe(0)
  })
})

describe('skill table', () => {
  // The rows of the "File area | Skill to load" table, from the header to the first line that isn't a row.
  const table = (file: string) =>
    readFileSync(`${projectDir}${file}`, 'utf8').match(/^\| File area \| Skill to load \|\n(?:\|.*\n)+/m)?.[0]

  it('is the same in CONTRIBUTING.md as in CLAUDE.md', () => {
    expect(table('CLAUDE.md')).toBeDefined()
    expect(table('CONTRIBUTING.md')).toBe(table('CLAUDE.md'))
  })
})
