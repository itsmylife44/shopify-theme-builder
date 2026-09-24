import { defineConfig } from 'vitest/config'

// Only the repo's own tests: agent worktrees under .claude/worktrees hold full copies of the repo.
// Test files run in parallel, one per worker, so a poll on a spawned process (the fake Shopify CLI) gets more than the 1 second default.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], expect: { poll: { timeout: 3000 } } },
})
