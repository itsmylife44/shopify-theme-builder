#!/usr/bin/env node
// Usage: wait-for-choice [--port 5173] [--timeout 3600] [--interval 2]
// Waits until the Creator presses Choose in the Studio on <port>: polls GET /api/theme every <interval> seconds and prints the
// chosen Direction's name. Exits 1 with a message after <timeout> seconds, or when the Studio stops.
// Run it in the background after handing the choice over (SKILL.md step 4.4), so the agent carries on once it ends.
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { port: { type: 'string', default: '5173' }, timeout: { type: 'string', default: '3600' }, interval: { type: 'string', default: '2' } } })
const url = `http://localhost:${values.port}/api/theme`
const deadline = Date.now() + Number(values.timeout) * 1000

while (true) {
  /** @type {{ directions?: { name: string, chosen: boolean }[] }} */
  let state
  try {
    state = await (await fetch(url)).json()
  } catch {
    console.error(`No Studio answers on port ${values.port}: it stopped, or runs on another port. Start it again (SKILL.md step 4.1), then wait again.`)
    process.exit(1)
  }
  const chosen = state.directions?.find((direction) => direction.chosen)
  if (chosen) {
    console.log(chosen.name)
    process.exit(0)
  }
  if (Date.now() >= deadline) {
    console.error(`No Direction chosen after ${values.timeout} seconds. Ask the Creator whether they chose one, then wait again.`)
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, Number(values.interval) * 1000))
}
